begin;

-- A missing assignment remains 未排班. An explicit row with no shift is 休假.
alter table public.schedule_assignments alter column shift_id drop not null;
alter table public.schedule_assignments
  add column is_day_off boolean not null default false;
alter table public.schedule_assignments
  add constraint schedule_assignment_shift_or_day_off check (
    (is_day_off and shift_id is null) or (not is_day_off and shift_id is not null)
  );

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
  v_source_version_id uuid;
  v_version integer;
  v_copied integer := 0;
  v_defaulted integer := 0;
begin
  if not public.current_user_has_permission(p_tenant_id, 'schedule.manage') then
    raise exception 'schedule.manage permission required' using errcode = '42501';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'invalid schedule period' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.shifts
    where tenant_id = p_tenant_id and code = 'WEEKDAY_SPLIT' and status = 'active'
  ) or not exists (
    select 1 from public.shifts
    where tenant_id = p_tenant_id and code = 'HOLIDAY_CONTINUOUS' and status = 'active'
  ) then
    raise exception 'default active shifts not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':' || p_period_start::text || ':' || p_period_end::text, 0)
  );
  if exists (
    select 1 from public.schedule_versions
    where tenant_id = p_tenant_id and period_start = p_period_start
      and period_end = p_period_end and status = 'draft'
  ) then raise exception 'a draft already exists for this period' using errcode = '23505'; end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.schedule_versions
  where tenant_id = p_tenant_id and period_start = p_period_start and period_end = p_period_end;
  select id into v_source_version_id
  from public.schedule_versions
  where tenant_id = p_tenant_id and period_start = p_period_start
    and period_end = p_period_end and status = 'published';

  insert into public.schedule_versions (
    tenant_id, period_start, period_end, version, status, created_by
  ) values (
    p_tenant_id, p_period_start, p_period_end, v_version, 'draft', (select auth.uid())
  ) returning id into v_schedule_version_id;

  if v_source_version_id is not null then
    insert into public.schedule_assignments (
      tenant_id, schedule_version_id, employee_id, work_date, shift_id, is_day_off, notes, created_by
    )
    select tenant_id, v_schedule_version_id, employee_id, work_date, shift_id, is_day_off, notes, (select auth.uid())
    from public.schedule_assignments
    where tenant_id = p_tenant_id and schedule_version_id = v_source_version_id;
    get diagnostics v_copied = row_count;
  else
    insert into public.schedule_assignments (
      tenant_id, schedule_version_id, employee_id, work_date, shift_id, created_by
    )
    select
      p_tenant_id,
      v_schedule_version_id,
      e.id,
      day.work_date::date,
      s.id,
      (select auth.uid())
    from public.employees e
    cross join generate_series(p_period_start, p_period_end, interval '1 day') as day(work_date)
    left join public.holiday_calendar_entries h
      on h.tenant_id = p_tenant_id and h.holiday_date = day.work_date::date
    cross join lateral (
      select case
        when h.kind = 'company' then null
        when h.kind = 'makeup_workday' then 'WEEKDAY_SPLIT'
        when h.kind = 'national' then 'HOLIDAY_CONTINUOUS'
        when extract(isodow from day.work_date) = 1 then null
        when extract(isodow from day.work_date) in (6, 7) then 'HOLIDAY_CONTINUOUS'
        else 'WEEKDAY_SPLIT'
      end as shift_code
    ) expected
    join public.shifts s
      on s.tenant_id = p_tenant_id and s.code = expected.shift_code and s.status = 'active'
    where e.tenant_id = p_tenant_id and e.status = 'active';
    get diagnostics v_defaulted = row_count;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_tenant_id, (select auth.uid()), 'schedule.draft_created', 'schedule_version',
    v_schedule_version_id::text,
    jsonb_build_object(
      'period_start', p_period_start, 'period_end', p_period_end, 'version', v_version,
      'source_version_id', v_source_version_id, 'copied_assignments', v_copied,
      'defaulted_assignments', v_defaulted
    )
  );

  return v_schedule_version_id;
end;
$$;

create or replace function public.save_schedule_assignments(
  p_tenant_id uuid,
  p_schedule_version_id uuid,
  p_assignments jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.schedule_versions%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_item record;
  v_count integer;
begin
  if not public.current_user_has_permission(p_tenant_id, 'schedule.manage') then
    raise exception 'schedule.manage permission required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'assignments must be a JSON array' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_assignments);
  if v_count > 5000 then raise exception 'assignment batch is too large' using errcode = '22023'; end if;

  select * into v_schedule
  from public.schedule_versions
  where tenant_id = p_tenant_id and id = p_schedule_version_id
  for update;
  if v_schedule.id is null then raise exception 'schedule version not found' using errcode = 'P0002'; end if;
  if v_schedule.status <> 'draft' then
    raise exception 'only draft schedules can be changed' using errcode = '55000';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as item(employee_id uuid, work_date date, shift_id uuid)
    group by employee_id, work_date having count(*) > 1
  ) then raise exception 'duplicate employee work date assignment' using errcode = '22023'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as item(employee_id uuid, work_date date, shift_id uuid)
    where employee_id is null or work_date is null
      or work_date < v_schedule.period_start or work_date > v_schedule.period_end
  ) then raise exception 'invalid assignment employee or work date' using errcode = '22023'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as item(employee_id uuid, work_date date, shift_id uuid)
    left join public.employees e on e.tenant_id = p_tenant_id and e.id = item.employee_id
    where e.id is null
  ) then raise exception 'employee not found' using errcode = 'P0002'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as item(employee_id uuid, work_date date, shift_id uuid)
    left join public.shifts s
      on s.tenant_id = p_tenant_id and s.id = item.shift_id and s.status = 'active'
    where item.shift_id is not null and s.id is null
  ) then raise exception 'active shift not found' using errcode = 'P0002'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as item(employee_id uuid, work_date date, shift_id uuid)
    join public.shifts s on s.tenant_id = p_tenant_id and s.id = item.shift_id
    left join public.holiday_calendar_entries h
      on h.tenant_id = p_tenant_id and h.holiday_date = item.work_date
    cross join lateral (
      select case
        when h.kind = 'company' then null
        when h.kind = 'makeup_workday' then 'WEEKDAY_SPLIT'
        when h.kind = 'national' then 'HOLIDAY_CONTINUOUS'
        when extract(isodow from item.work_date) = 1 then null
        when extract(isodow from item.work_date) in (6, 7) then 'HOLIDAY_CONTINUOUS'
        else 'WEEKDAY_SPLIT'
      end as shift_code
    ) expected
    where item.shift_id is not null
      and (expected.shift_code is null or s.code <> expected.shift_code)
  ) then raise exception 'shift does not match date default' using errcode = '22023'; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_assignments)
      as item(employee_id uuid, work_date date, shift_id uuid, is_day_off boolean)
    where coalesce(is_day_off, false) and shift_id is not null
  ) then raise exception 'day off cannot have a shift' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(to_jsonb(sa) order by sa.work_date, sa.employee_id), '[]'::jsonb)
  into v_before
  from public.schedule_assignments sa
  where sa.tenant_id = p_tenant_id and sa.schedule_version_id = p_schedule_version_id;

  for v_item in
    select employee_id, work_date, shift_id, coalesce(is_day_off, false) as is_day_off
    from jsonb_to_recordset(p_assignments) as item(employee_id uuid, work_date date, shift_id uuid, is_day_off boolean)
  loop
    if v_item.shift_id is null and not v_item.is_day_off then
      delete from public.schedule_assignments
      where tenant_id = p_tenant_id and schedule_version_id = p_schedule_version_id
        and employee_id = v_item.employee_id and work_date = v_item.work_date;
    else
      insert into public.schedule_assignments (
        tenant_id, schedule_version_id, employee_id, work_date, shift_id, is_day_off, created_by
      ) values (
        p_tenant_id, p_schedule_version_id, v_item.employee_id,
        v_item.work_date, v_item.shift_id, v_item.is_day_off, (select auth.uid())
      )
      on conflict (schedule_version_id, employee_id, work_date) do update set
        shift_id = excluded.shift_id, is_day_off = excluded.is_day_off, updated_at = now();
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(sa) order by sa.work_date, sa.employee_id), '[]'::jsonb)
  into v_after
  from public.schedule_assignments sa
  where sa.tenant_id = p_tenant_id and sa.schedule_version_id = p_schedule_version_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_tenant_id, (select auth.uid()), 'schedule.assignments_saved', 'schedule_version',
    p_schedule_version_id::text, v_before, v_after
  );

  return v_count;
end;
$$;

-- Keep a published day off visible only to its linked employee.
create function public.get_my_published_days_off(p_date_from date, p_date_to date)
returns table (work_date date)
language sql stable security definer set search_path = '' as $$
  with linked_employee as (
    select e.id, e.tenant_id from public.employees e
    join public.tenant_memberships tm on tm.tenant_id = e.tenant_id
      and tm.user_id = (select auth.uid()) and tm.status = 'active'
    where e.auth_user_id = (select auth.uid()) and e.status = 'active'
    order by e.created_at, e.id limit 1
  ), latest_assignment as (
    select distinct on (sa.work_date) sa.work_date, sa.is_day_off
    from linked_employee le
    join public.schedule_assignments sa on sa.tenant_id = le.tenant_id and sa.employee_id = le.id
    join public.schedule_versions sv on sv.tenant_id = sa.tenant_id
      and sv.id = sa.schedule_version_id and sv.status = 'published'
    where sa.work_date between p_date_from and p_date_to
    order by sa.work_date, sv.published_at desc nulls last, sv.version desc, sv.id desc
  )
  select la.work_date from latest_assignment la where la.is_day_off order by la.work_date;
$$;
revoke all on function public.get_my_published_days_off(date,date) from public, anon, authenticated;
grant execute on function public.get_my_published_days_off(date,date) to authenticated;

-- Off rows do not create work obligations or payroll attendance requirements.
do $migration$
declare v_sql text; v_anchor text;
begin
  select pg_get_functiondef('public.calculate_attendance_v1(uuid,date,date)'::regprocedure) into v_sql;
  v_anchor := 'from (select * from work_items where choice=1) w';
  if position(v_anchor in v_sql) = 0 then raise exception 'attendance work-item anchor not found'; end if;
  execute replace(v_sql, v_anchor, 'from (select * from work_items where choice=1 and shift_id is not null) w');

  select pg_get_functiondef('public.set_payroll_period_status(uuid,uuid,public.payroll_period_status)'::regprocedure) into v_sql;
  v_anchor := 'and sa.work_date between v_period.period_start and v_period.period_end';
  if position(v_anchor in v_sql) = 0 then raise exception 'payroll expected-day anchor not found'; end if;
  execute replace(v_sql, v_anchor, v_anchor || ' and sa.shift_id is not null');
end;
$migration$;

create or replace function public.create_work_request(
  p_tenant_id uuid,p_request_type public.work_request_type,p_leave_type_id uuid,
  p_starts_local timestamp,p_ends_local timestamp,p_reason text,p_idempotency_key uuid
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_employee_id uuid; v_request_id uuid; v_timezone text; v_starts_at timestamptz;
  v_ends_at timestamptz; v_requested_minutes integer;
begin
  select e.id,t.timezone into v_employee_id,v_timezone from public.employees e
  join public.tenants t on t.id=e.tenant_id and t.status='active'
  where e.tenant_id=p_tenant_id and e.auth_user_id=auth.uid() and e.status='active'
    and exists(select 1 from public.tenant_memberships tm where tm.tenant_id=e.tenant_id
      and tm.user_id=auth.uid() and tm.status='active') limit 1;
  if v_employee_id is null then raise exception 'active linked employee required' using errcode='42501'; end if;
  if p_request_type is null or p_starts_local is null or p_ends_local is null or p_idempotency_key is null then
    raise exception 'request fields required' using errcode='22023'; end if;
  if char_length(trim(p_reason)) not between 5 and 500 then raise exception 'request reason must be 5 to 500 characters' using errcode='22023'; end if;
  if p_request_type='leave' then
    if p_leave_type_id is null or not exists(select 1 from public.leave_types lt
      where lt.tenant_id=p_tenant_id and lt.id=p_leave_type_id and lt.is_active) then
      raise exception 'active leave type required' using errcode='22023'; end if;
  elsif p_leave_type_id is not null then raise exception 'overtime request cannot have leave type' using errcode='22023'; end if;

  v_starts_at:=p_starts_local at time zone v_timezone;
  v_ends_at:=p_ends_local at time zone v_timezone;
  v_requested_minutes:=floor(extract(epoch from(v_ends_at-v_starts_at))/60)::integer;
  if p_request_type='leave' and p_starts_local=p_starts_local::date::timestamp
    and p_ends_local=p_starts_local+interval '1 day' then
    select p.standard_day_minutes into v_requested_minutes
    from public.annual_leave_policy_versions p
    where p.tenant_id=p_tenant_id and p.effective_from<=p_starts_local::date
    order by p.effective_from desc,p.created_at desc,p.id desc limit 1;
    v_requested_minutes:=coalesce(v_requested_minutes,480);
  end if;
  if p_request_type='overtime' and v_requested_minutes>480 then raise exception 'overtime duration must not exceed 480 minutes' using errcode='22023'; end if;
  if p_request_type='leave' and p_starts_local::date<>(p_ends_local-interval '1 microsecond')::date then
    raise exception 'leave request must cover one local date' using errcode='22023'; end if;
  if p_request_type='leave' and not (
    not exists(select 1 from public.holiday_calendar_entries h where h.tenant_id=p_tenant_id
      and h.holiday_date=p_starts_local::date and h.kind='company')
    and not exists(
      select 1 from public.schedule_assignments sa join public.schedule_versions sv
        on sv.tenant_id=sa.tenant_id and sv.id=sa.schedule_version_id and sv.status='published'
      where sa.tenant_id=p_tenant_id and sa.employee_id=v_employee_id
        and sa.work_date=p_starts_local::date and sa.is_day_off
    )
    and (
      (
        extract(isodow from p_starts_local::date) between 2 and 5
        and not exists(select 1 from public.holiday_calendar_entries h where h.tenant_id=p_tenant_id
          and h.holiday_date=p_starts_local::date and h.kind='national')
      ) or exists(
        select 1 from public.schedule_assignments sa join public.schedule_versions sv
          on sv.tenant_id=sa.tenant_id and sv.id=sa.schedule_version_id and sv.status='published'
        where sa.tenant_id=p_tenant_id and sa.employee_id=v_employee_id and sa.work_date=p_starts_local::date and sa.shift_id is not null
      )
    )
  ) then raise exception 'leave date requires a regular leave day or published assignment' using errcode='22023'; end if;
  if v_requested_minutes not between 1 and 44640 then raise exception 'request duration must be between 1 minute and 31 days' using errcode='22023'; end if;
  if p_starts_local::date<((statement_timestamp() at time zone v_timezone)::date-62)
    or p_starts_local::date>((statement_timestamp() at time zone v_timezone)::date+366) then
    raise exception 'request date outside allowed window' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||v_employee_id::text||':work-request',0));
  select id into v_request_id from public.work_requests where tenant_id=p_tenant_id
    and employee_id=v_employee_id and idempotency_key=p_idempotency_key;
  if v_request_id is not null then return v_request_id; end if;
  if exists(select 1 from public.work_requests existing where existing.tenant_id=p_tenant_id
    and existing.employee_id=v_employee_id and existing.starts_at<v_ends_at and existing.ends_at>v_starts_at
    and not exists(select 1 from public.work_request_withdrawals w where w.tenant_id=existing.tenant_id and w.work_request_id=existing.id)
    and not exists(select 1 from public.work_request_decisions d where d.tenant_id=existing.tenant_id
      and d.work_request_id=existing.id and d.decision='rejected')) then
    raise exception 'work request overlaps an active request' using errcode='23P01'; end if;
  insert into public.work_requests(tenant_id,employee_id,request_type,leave_type_id,starts_at,ends_at,
    timezone,requested_minutes,reason,idempotency_key,requested_by)
  values(p_tenant_id,v_employee_id,p_request_type,case when p_request_type='leave' then p_leave_type_id end,
    v_starts_at,v_ends_at,v_timezone,v_requested_minutes,trim(p_reason),p_idempotency_key,auth.uid())
  returning id into v_request_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'work_request.requested','work_request',v_request_id::text,
    jsonb_build_object('employee_id',v_employee_id,'request_type',p_request_type,'starts_at',v_starts_at,
      'ends_at',v_ends_at,'requested_minutes',v_requested_minutes));
  return v_request_id;
end;
$$;

commit;
