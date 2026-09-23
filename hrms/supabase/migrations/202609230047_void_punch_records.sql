begin;

-- Preserve original evidence and snapshots while allowing an authorized
-- administrator to remove erroneous punches from active attendance flows.
alter table public.punch_records
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users(id) on delete restrict,
  add column void_reason text,
  add constraint punch_records_void_metadata_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null
      and char_length(void_reason) between 5 and 500)
  );

create index punch_records_voided_date_idx
  on public.punch_records (tenant_id, work_date, voided_at)
  where voided_at is not null;

insert into public.permissions(code, description)
values ('attendance.punch_delete', '作廢原始打卡紀錄')
on conflict(code) do update set description = excluded.description;
insert into public.role_permissions(tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from public.roles r cross join public.permissions p
where r.code = 'platform_admin' and p.code = 'attendance.punch_delete'
on conflict(role_id, permission_id) do nothing;

-- Employees cannot read voided punches. Attendance managers may inspect them
-- through the data layer and audit logs, but normal UI lists only active rows.
drop policy punch_records_select_manager_or_self on public.punch_records;
create policy punch_records_select_manager_or_self
on public.punch_records for select to authenticated
using (
  tenant_id in (select public.current_user_tenant_ids())
  and (
    public.current_user_has_permission(tenant_id, 'attendance.manage')
    or (voided_at is null and employee_id in (
      select e.id from public.employees e
      where e.tenant_id = punch_records.tenant_id
        and e.auth_user_id = (select auth.uid())
    ))
  )
);

-- The only permitted mutation changes void metadata; every original field
-- (time, event, employee, GPS, and idempotency key) remains immutable.
create or replace function public.prevent_punch_record_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
    and old.voided_at is null and new.voided_at is not null
    and new.voided_by = (select auth.uid())
    and public.current_user_has_permission(old.tenant_id, 'attendance.punch_delete')
    and to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason'
      = to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason'
  then return new; end if;
  raise exception 'raw punch records are append-only' using errcode = '55000';
end;
$$;

create or replace function public.void_punch_records(
  p_tenant_id uuid, p_punch_ids uuid[], p_reason text
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_updated integer;
  v_before jsonb;
  v_dates jsonb;
begin
  if not public.current_user_has_permission(p_tenant_id, 'attendance.punch_delete') then
    raise exception 'attendance.punch_delete permission required' using errcode = '42501';
  end if;
  if p_punch_ids is null or cardinality(p_punch_ids) not between 1 and 200
    or exists(select 1 from unnest(p_punch_ids) as ids(id) where ids.id is null)
    or (select count(distinct ids.id) from unnest(p_punch_ids) as ids(id)) <> cardinality(p_punch_ids)
  then raise exception 'select 1 to 200 distinct punch records' using errcode = '22023'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then
    raise exception 'deletion reason must be 5 to 500 characters' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':punch-void', 0));
  select count(*),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.id, 'employee_id', pr.employee_id, 'work_date', pr.work_date,
      'event_type', pr.event_type, 'occurred_at', pr.occurred_at
    ) order by pr.occurred_at, pr.id), '[]'::jsonb),
    coalesce(jsonb_agg(distinct to_jsonb(pr.work_date)), '[]'::jsonb)
  into v_count, v_before, v_dates
  from public.punch_records pr
  where pr.tenant_id = p_tenant_id and pr.id = any(p_punch_ids)
    and pr.voided_at is null;
  if v_count <> cardinality(p_punch_ids) then
    raise exception 'punch records missing or already deleted' using errcode = 'P0002';
  end if;

  update public.punch_records
  set voided_at = clock_timestamp(), voided_by = (select auth.uid()),
    void_reason = trim(p_reason)
  where tenant_id = p_tenant_id and id = any(p_punch_ids) and voided_at is null;
  get diagnostics v_updated = row_count;
  if v_updated <> v_count then
    raise exception 'punch deletion conflicted with another change' using errcode = '40001';
  end if;

  insert into public.audit_logs(
    tenant_id, actor_user_id, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    p_tenant_id, (select auth.uid()), 'punch.records_voided', 'punch_record_batch',
    null, v_before,
    jsonb_build_object('count', v_updated, 'reason', trim(p_reason),
      'work_dates', v_dates, 'punch_ids', to_jsonb(p_punch_ids))
  );
  return v_updated;
end;
$$;
revoke all on function public.void_punch_records(uuid,uuid[],text) from public, anon, authenticated;
grant execute on function public.void_punch_records(uuid,uuid[],text) to authenticated;

-- Privileged calculation and punch RPCs bypass table RLS, so direct every
-- operational read through a view that excludes voided evidence.
create view public.active_punch_records as
select * from public.punch_records where voided_at is null;
revoke all on public.active_punch_records from public, anon, authenticated;

do $migration$
declare
  v_definition text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.record_gps_punch(uuid,uuid,timestamptz,text,numeric,numeric,numeric,boolean)',
    'public.calculate_attendance_v1(uuid,date,date)',
    'public.get_my_attendance_overview(integer,integer,integer)',
    'public.set_payroll_period_status(uuid,uuid,public.payroll_period_status)'
  ] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_definition;
    if position('from public.punch_records' in lower(v_definition)) = 0 then
      raise exception 'punch read not found in %', v_signature;
    end if;
    execute replace(v_definition,
      'from public.punch_records', 'from public.active_punch_records');
  end loop;
end;
$migration$;

create function public.get_stale_voided_punch_dates(p_tenant_id uuid)
returns table(work_date date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.current_user_has_permission(p_tenant_id, 'attendance.manage') then
    raise exception 'attendance.manage permission required' using errcode = '42501';
  end if;
  return query
  select distinct pr.work_date
  from public.punch_records pr
  where pr.tenant_id = p_tenant_id and pr.voided_at is not null
    and exists (
      select 1 from public.attendance_calculation_runs run
      where run.tenant_id = p_tenant_id
        and pr.work_date between run.date_from and run.date_to
        and run.calculated_at < pr.voided_at
    )
    and not exists (
      select 1 from public.attendance_calculation_runs run
      where run.tenant_id = p_tenant_id
        and pr.work_date between run.date_from and run.date_to
        and run.calculated_at >= pr.voided_at
    )
  order by pr.work_date desc limit 200;
end;
$$;
revoke all on function public.get_stale_voided_punch_dates(uuid) from public, anon, authenticated;
grant execute on function public.get_stale_voided_punch_dates(uuid) to authenticated;

commit;
