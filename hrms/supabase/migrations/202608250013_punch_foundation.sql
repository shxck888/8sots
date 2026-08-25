begin;

create type public.punch_event_type as enum ('clock_in', 'clock_out');
create type public.punch_source as enum ('web_gps', 'qr');
create type public.punch_location_verification as enum (
  'not_configured', 'inside_geofence', 'outside_geofence', 'unavailable'
);

create table public.punch_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null,
  work_date date not null,
  event_type public.punch_event_type not null,
  occurred_at timestamptz not null default statement_timestamp(),
  client_occurred_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 64),
  source public.punch_source not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  accuracy_m numeric(8,2),
  location_id uuid,
  location_verification public.punch_location_verification not null default 'not_configured',
  location_consent_at timestamptz,
  idempotency_key uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, idempotency_key),
  foreign key (tenant_id, employee_id)
    references public.employees(tenant_id, id) on delete restrict,
  foreign key (tenant_id, location_id)
    references public.locations(tenant_id, id) on delete restrict,
  check (
    (source = 'web_gps'
      and latitude is not null
      and longitude is not null
      and accuracy_m is not null
      and location_consent_at is not null)
    or source <> 'web_gps'
  ),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  check (accuracy_m is null or accuracy_m > 0)
);

create index punch_records_tenant_employee_time_idx
  on public.punch_records (tenant_id, employee_id, occurred_at desc);
create index punch_records_tenant_work_date_idx
  on public.punch_records (tenant_id, work_date, occurred_at desc);

insert into public.permissions (code, description)
values ('attendance.manage', '檢視原始打卡與管理考勤')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'platform_admin'
  and p.code = 'attendance.manage'
on conflict (role_id, permission_id) do nothing;

alter table public.punch_records enable row level security;

create policy punch_records_select_manager_or_self
on public.punch_records for select to authenticated
using (
  tenant_id in (select public.current_user_tenant_ids())
  and (
    public.current_user_has_permission(tenant_id, 'attendance.manage')
    or employee_id in (
      select e.id
      from public.employees e
      where e.tenant_id = punch_records.tenant_id
        and e.auth_user_id = (select auth.uid())
    )
  )
);

revoke all privileges on table public.punch_records from anon, authenticated;
grant select on table public.punch_records to authenticated;

create or replace function public.prevent_punch_record_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'raw punch records are append-only' using errcode = '55000';
end;
$$;

create trigger punch_records_append_only
before update or delete on public.punch_records
for each row execute function public.prevent_punch_record_mutation();

create or replace function public.record_gps_punch(
  p_tenant_id uuid,
  p_idempotency_key uuid,
  p_client_occurred_at timestamptz,
  p_timezone text,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_m numeric,
  p_location_consent boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
  v_punch_id uuid;
  v_event_type public.punch_event_type;
  v_work_date date;
  v_tenant_timezone text;
begin
  select e.id, t.timezone
  into v_employee_id, v_tenant_timezone
  from public.employees e
  join public.tenants t on t.id = e.tenant_id
  where e.tenant_id = p_tenant_id
    and e.auth_user_id = (select auth.uid())
    and e.status = 'active'
    and exists (
      select 1
      from public.tenant_memberships tm
      where tm.tenant_id = e.tenant_id
        and tm.user_id = (select auth.uid())
        and tm.status = 'active'
    )
  limit 1;

  if v_employee_id is null then
    raise exception 'active linked employee required' using errcode = '42501';
  end if;
  if p_location_consent is not true then
    raise exception 'location consent required' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;
  if p_client_occurred_at < statement_timestamp() - interval '10 minutes'
     or p_client_occurred_at > statement_timestamp() + interval '5 minutes' then
    raise exception 'client timestamp outside allowed window' using errcode = '22023';
  end if;
  if char_length(trim(p_timezone)) not between 1 and 64
     or trim(p_timezone) !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$' then
    raise exception 'invalid timezone' using errcode = '22023';
  end if;
  if p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180
     or p_accuracy_m is null or p_accuracy_m <= 0 or p_accuracy_m > 1000 then
    raise exception 'invalid GPS evidence' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':' || v_employee_id::text, 0)
  );

  select pr.id into v_punch_id
  from public.punch_records pr
  where pr.tenant_id = p_tenant_id
    and pr.employee_id = v_employee_id
    and pr.idempotency_key = p_idempotency_key;
  if v_punch_id is not null then return v_punch_id; end if;

  v_work_date := (statement_timestamp() at time zone v_tenant_timezone)::date;

  select case when pr.event_type = 'clock_in'
    then 'clock_out'::public.punch_event_type
    else 'clock_in'::public.punch_event_type end
  into v_event_type
  from public.punch_records pr
  where pr.tenant_id = p_tenant_id
    and pr.employee_id = v_employee_id
    and pr.work_date = v_work_date
  order by pr.occurred_at desc, pr.created_at desc
  limit 1;
  v_event_type := coalesce(v_event_type, 'clock_in'::public.punch_event_type);

  insert into public.punch_records (
    tenant_id, employee_id, work_date, event_type,
    client_occurred_at, timezone, source,
    latitude, longitude, accuracy_m,
    location_verification, location_consent_at,
    idempotency_key, created_by
  ) values (
    p_tenant_id, v_employee_id, v_work_date, v_event_type,
    p_client_occurred_at, trim(p_timezone), 'web_gps',
    p_latitude, p_longitude, p_accuracy_m,
    'not_configured', statement_timestamp(),
    p_idempotency_key, (select auth.uid())
  ) returning id into v_punch_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_tenant_id, (select auth.uid()), 'punch.recorded', 'punch_record',
    v_punch_id::text,
    jsonb_build_object(
      'employee_id', v_employee_id,
      'work_date', v_work_date,
      'event_type', v_event_type,
      'source', 'web_gps',
      'location_verification', 'not_configured'
    )
  );

  return v_punch_id;
end;
$$;

revoke all on function public.record_gps_punch(
  uuid, uuid, timestamptz, text, numeric, numeric, numeric, boolean
) from public;
grant execute on function public.record_gps_punch(
  uuid, uuid, timestamptz, text, numeric, numeric, numeric, boolean
) to authenticated;

commit;
