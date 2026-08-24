begin;

create type public.schedule_version_status as enum ('draft', 'published', 'superseded');

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9_-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  status public.organization_status not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table public.shift_segments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  shift_id uuid not null,
  segment_order smallint not null check (segment_order > 0),
  start_minute integer not null check (start_minute >= 0 and start_minute < 1440),
  end_minute integer not null check (
    end_minute > start_minute
    and end_minute <= 2880
    and end_minute - start_minute <= 1440
  ),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (shift_id, segment_order),
  foreign key (tenant_id, shift_id) references public.shifts(tenant_id, id) on delete cascade
);

create table public.schedule_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  version integer not null check (version > 0),
  status public.schedule_version_status not null default 'draft',
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (
    (status = 'published' and published_at is not null and published_by is not null)
    or status <> 'published'
  ),
  unique (tenant_id, id),
  unique (tenant_id, period_start, period_end, version)
);

create unique index schedule_versions_one_published_period_idx
  on public.schedule_versions (tenant_id, period_start, period_end)
  where status = 'published';

create table public.schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  schedule_version_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  shift_id uuid not null,
  notes text check (notes is null or char_length(notes) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (schedule_version_id, employee_id, work_date),
  foreign key (tenant_id, schedule_version_id)
    references public.schedule_versions(tenant_id, id) on delete cascade,
  foreign key (tenant_id, employee_id)
    references public.employees(tenant_id, id) on delete restrict,
  foreign key (tenant_id, shift_id)
    references public.shifts(tenant_id, id) on delete restrict
);

create index shifts_tenant_status_idx on public.shifts (tenant_id, status, code);
create index shift_segments_tenant_shift_idx on public.shift_segments (tenant_id, shift_id, segment_order);
create index schedule_versions_tenant_period_idx
  on public.schedule_versions (tenant_id, period_start, period_end, status);
create index schedule_assignments_tenant_date_idx
  on public.schedule_assignments (tenant_id, work_date, employee_id);

insert into public.permissions (code, description)
values ('schedule.manage', '建立、編輯及發布班表')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'platform_admin'
  and p.code = 'schedule.manage'
on conflict (role_id, permission_id) do nothing;

alter table public.shifts enable row level security;
alter table public.shift_segments enable row level security;
alter table public.schedule_versions enable row level security;
alter table public.schedule_assignments enable row level security;

create policy shifts_select_same_tenant on public.shifts for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy shift_segments_select_same_tenant on public.shift_segments for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy schedule_versions_select_same_tenant on public.schedule_versions for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy schedule_assignments_select_same_tenant on public.schedule_assignments for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

revoke all privileges on table public.shifts from anon, authenticated;
revoke all privileges on table public.shift_segments from anon, authenticated;
revoke all privileges on table public.schedule_versions from anon, authenticated;
revoke all privileges on table public.schedule_assignments from anon, authenticated;
grant select on table public.shifts to authenticated;
grant select on table public.shift_segments to authenticated;
grant select on table public.schedule_versions to authenticated;
grant select on table public.schedule_assignments to authenticated;

create or replace function public.guard_published_schedule_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule_version_id uuid := coalesce(new.schedule_version_id, old.schedule_version_id);
begin
  if exists (
    select 1
    from public.schedule_versions sv
    where sv.id = v_schedule_version_id and sv.status <> 'draft'
  ) then
    raise exception 'published or superseded schedules are immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger schedule_assignments_draft_only
before insert or update or delete on public.schedule_assignments
for each row execute function public.guard_published_schedule_assignment();

create or replace function public.guard_published_shift_segment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift_id uuid := coalesce(new.shift_id, old.shift_id);
begin
  if exists (
    select 1
    from public.schedule_assignments sa
    join public.schedule_versions sv
      on sv.tenant_id = sa.tenant_id and sv.id = sa.schedule_version_id
    where sa.shift_id = v_shift_id and sv.status in ('published', 'superseded')
  ) then
    raise exception 'shift segments used by published schedules are immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger shift_segments_published_schedule_guard
before insert or update or delete on public.shift_segments
for each row execute function public.guard_published_shift_segment();

create or replace function public.upsert_shift_template(
  p_tenant_id uuid,
  p_code text,
  p_name text,
  p_segments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.current_user_has_permission(p_tenant_id, 'schedule.manage') then
    raise exception 'schedule.manage permission required' using errcode = '42501';
  end if;
  if upper(trim(p_code)) !~ '^[A-Z0-9_-]{1,40}$' then
    raise exception 'invalid shift code' using errcode = '22023';
  end if;
  if char_length(trim(p_name)) not between 1 and 80 then
    raise exception 'invalid shift name' using errcode = '22023';
  end if;
  if jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) = 0 then
    raise exception 'at least one shift segment is required' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_segments) as source(item)
    where jsonb_typeof(item->'start_minute') <> 'number'
       or jsonb_typeof(item->'end_minute') <> 'number'
       or (item->>'start_minute')::numeric <> trunc((item->>'start_minute')::numeric)
       or (item->>'end_minute')::numeric <> trunc((item->>'end_minute')::numeric)
       or (item->>'start_minute')::integer < 0
       or (item->>'start_minute')::integer >= 1440
       or (item->>'end_minute')::integer <= (item->>'start_minute')::integer
       or (item->>'end_minute')::integer > 2880
       or (item->>'end_minute')::integer - (item->>'start_minute')::integer > 1440
  ) then
    raise exception 'invalid shift segment range' using errcode = '22023';
  end if;
  if exists (
    with segments as (
      select ordinality,
        (item->>'start_minute')::integer as start_minute,
        (item->>'end_minute')::integer as end_minute
      from jsonb_array_elements(p_segments) with ordinality as source(item, ordinality)
    )
    select 1 from segments a join segments b on a.ordinality < b.ordinality
    where a.start_minute < b.end_minute and b.start_minute < a.end_minute
  ) then
    raise exception 'shift segments overlap' using errcode = '22023';
  end if;

  select s.id,
    jsonb_build_object(
      'shift', to_jsonb(s),
      'segments', coalesce((
        select jsonb_agg(to_jsonb(ss) order by ss.segment_order)
        from public.shift_segments ss
        where ss.tenant_id = s.tenant_id and ss.shift_id = s.id
      ), '[]'::jsonb)
    )
  into v_shift_id, v_before
  from public.shifts s
  where s.tenant_id = p_tenant_id and s.code = upper(trim(p_code))
  for update;

  if v_shift_id is null then
    insert into public.shifts (tenant_id, code, name, created_by)
    values (p_tenant_id, upper(trim(p_code)), trim(p_name), (select auth.uid()))
    returning id into v_shift_id;
  else
    update public.shifts
    set name = trim(p_name), status = 'active', updated_at = now()
    where tenant_id = p_tenant_id and id = v_shift_id;
    delete from public.shift_segments
    where tenant_id = p_tenant_id and shift_id = v_shift_id;
  end if;

  insert into public.shift_segments (
    tenant_id, shift_id, segment_order, start_minute, end_minute
  )
  select p_tenant_id, v_shift_id, ordinality::smallint,
    (item->>'start_minute')::integer,
    (item->>'end_minute')::integer
  from jsonb_array_elements(p_segments) with ordinality as source(item, ordinality)
  order by ordinality;

  select jsonb_build_object(
    'shift', to_jsonb(s),
    'segments', coalesce((
      select jsonb_agg(to_jsonb(ss) order by ss.segment_order)
      from public.shift_segments ss
      where ss.tenant_id = s.tenant_id and ss.shift_id = s.id
    ), '[]'::jsonb)
  ) into v_after
  from public.shifts s
  where s.tenant_id = p_tenant_id and s.id = v_shift_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_tenant_id, (select auth.uid()),
    case when v_before is null then 'shift.created' else 'shift.updated' end,
    'shift', v_shift_id::text, v_before, v_after
  );

  return v_shift_id;
end;
$$;

create or replace function public.create_schedule_draft(
  p_tenant_id uuid,
  p_period_start date,
  p_period_end date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule_version_id uuid;
  v_version integer;
begin
  if not public.current_user_has_permission(p_tenant_id, 'schedule.manage') then
    raise exception 'schedule.manage permission required' using errcode = '42501';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'invalid schedule period' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':' || p_period_start::text || ':' || p_period_end::text, 0)
  );
  select coalesce(max(version), 0) + 1 into v_version
  from public.schedule_versions
  where tenant_id = p_tenant_id
    and period_start = p_period_start
    and period_end = p_period_end;

  insert into public.schedule_versions (
    tenant_id, period_start, period_end, version, status, created_by
  ) values (
    p_tenant_id, p_period_start, p_period_end, v_version, 'draft', (select auth.uid())
  ) returning id into v_schedule_version_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_tenant_id, (select auth.uid()), 'schedule.draft_created', 'schedule_version',
    v_schedule_version_id::text,
    jsonb_build_object('period_start', p_period_start, 'period_end', p_period_end, 'version', v_version)
  );

  return v_schedule_version_id;
end;
$$;

create or replace function public.assign_schedule_shift(
  p_tenant_id uuid,
  p_schedule_version_id uuid,
  p_employee_id uuid,
  p_work_date date,
  p_shift_id uuid,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.schedule_versions%rowtype;
  v_assignment_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.current_user_has_permission(p_tenant_id, 'schedule.manage') then
    raise exception 'schedule.manage permission required' using errcode = '42501';
  end if;

  select * into v_schedule
  from public.schedule_versions
  where tenant_id = p_tenant_id and id = p_schedule_version_id
  for update;
  if v_schedule.id is null then raise exception 'schedule version not found' using errcode = 'P0002'; end if;
  if v_schedule.status <> 'draft' then
    raise exception 'only draft schedules can be changed' using errcode = '55000';
  end if;
  if p_work_date < v_schedule.period_start or p_work_date > v_schedule.period_end then
    raise exception 'work date is outside the schedule period' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.employees e
    where e.tenant_id = p_tenant_id and e.id = p_employee_id
  ) then raise exception 'employee not found' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.shifts s
    where s.tenant_id = p_tenant_id and s.id = p_shift_id and s.status = 'active'
  ) then raise exception 'active shift not found' using errcode = 'P0002'; end if;

  select to_jsonb(sa) into v_before
  from public.schedule_assignments sa
  where sa.schedule_version_id = p_schedule_version_id
    and sa.employee_id = p_employee_id
    and sa.work_date = p_work_date
  for update;

  insert into public.schedule_assignments (
    tenant_id, schedule_version_id, employee_id, work_date, shift_id, notes, created_by
  ) values (
    p_tenant_id, p_schedule_version_id, p_employee_id, p_work_date, p_shift_id,
    nullif(trim(p_notes), ''), (select auth.uid())
  )
  on conflict (schedule_version_id, employee_id, work_date) do update set
    shift_id = excluded.shift_id,
    notes = excluded.notes,
    updated_at = now()
  returning id into v_assignment_id;

  select to_jsonb(sa) into v_after
  from public.schedule_assignments sa where sa.id = v_assignment_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_tenant_id, (select auth.uid()),
    case when v_before is null then 'schedule.assignment_created' else 'schedule.assignment_updated' end,
    'schedule_assignment', v_assignment_id::text, v_before, v_after
  );

  return v_assignment_id;
end;
$$;

create or replace function public.publish_schedule(
  p_tenant_id uuid,
  p_schedule_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.schedule_versions%rowtype;
begin
  if not public.current_user_has_permission(p_tenant_id, 'schedule.manage') then
    raise exception 'schedule.manage permission required' using errcode = '42501';
  end if;

  select * into v_schedule
  from public.schedule_versions
  where tenant_id = p_tenant_id and id = p_schedule_version_id
  for update;
  if v_schedule.id is null then raise exception 'schedule version not found' using errcode = 'P0002'; end if;
  if v_schedule.status <> 'draft' then
    raise exception 'only draft schedules can be published' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.schedule_assignments sa
    where sa.tenant_id = p_tenant_id and sa.schedule_version_id = p_schedule_version_id
  ) then raise exception 'cannot publish an empty schedule' using errcode = '22023'; end if;

  update public.schedule_versions
  set status = 'superseded', updated_at = now()
  where tenant_id = p_tenant_id
    and period_start = v_schedule.period_start
    and period_end = v_schedule.period_end
    and status = 'published';

  update public.schedule_versions
  set status = 'published', published_at = now(), published_by = (select auth.uid()), updated_at = now()
  where tenant_id = p_tenant_id and id = p_schedule_version_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_tenant_id, (select auth.uid()), 'schedule.published', 'schedule_version',
    p_schedule_version_id::text, to_jsonb(v_schedule),
    (select to_jsonb(sv) from public.schedule_versions sv where sv.id = p_schedule_version_id)
  );
end;
$$;

revoke all on function public.guard_published_schedule_assignment() from public;
revoke all on function public.guard_published_shift_segment() from public;
revoke all on function public.upsert_shift_template(uuid, text, text, jsonb) from public;
revoke all on function public.create_schedule_draft(uuid, date, date) from public;
revoke all on function public.assign_schedule_shift(uuid, uuid, uuid, date, uuid, text) from public;
revoke all on function public.publish_schedule(uuid, uuid) from public;
grant execute on function public.upsert_shift_template(uuid, text, text, jsonb) to authenticated;
grant execute on function public.create_schedule_draft(uuid, date, date) to authenticated;
grant execute on function public.assign_schedule_shift(uuid, uuid, uuid, date, uuid, text) to authenticated;
grant execute on function public.publish_schedule(uuid, uuid) to authenticated;

commit;
