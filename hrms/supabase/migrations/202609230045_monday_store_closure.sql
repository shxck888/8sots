begin;

-- Store closure is a distinct, explicit Monday schedule state.
alter table public.schedule_assignments
  add column is_store_closed boolean not null default false;
alter table public.schedule_assignments
  drop constraint schedule_assignment_shift_or_day_off;
alter table public.schedule_assignments
  add constraint schedule_assignment_shift_or_day_off check (
    (is_store_closed and not is_day_off and shift_id is null)
    or (is_day_off and not is_store_closed and shift_id is null)
    or (not is_day_off and not is_store_closed and shift_id is not null)
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
  v_store_closed integer := 0;
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
      tenant_id, schedule_version_id, employee_id, work_date, shift_id, is_day_off, is_store_closed, notes, created_by
    )
    select tenant_id, v_schedule_version_id, employee_id, work_date, shift_id, is_day_off, is_store_closed, notes, (select auth.uid())
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
        when extract(isodow from day.work_date) = 1 then null
        when h.kind = 'makeup_workday' then 'WEEKDAY_SPLIT'
        when h.kind = 'national' then 'HOLIDAY_CONTINUOUS'
        when extract(isodow from day.work_date) in (6, 7) then 'HOLIDAY_CONTINUOUS'
        else 'WEEKDAY_SPLIT'
      end as shift_code
    ) expected
    join public.shifts s
      on s.tenant_id = p_tenant_id and s.code = expected.shift_code and s.status = 'active'
    where e.tenant_id = p_tenant_id and e.status = 'active';
    get diagnostics v_defaulted = row_count;

    insert into public.schedule_assignments (
      tenant_id, schedule_version_id, employee_id, work_date,
      shift_id, is_store_closed, created_by
    )
    select p_tenant_id, v_schedule_version_id, e.id, day.work_date::date,
      null, true, (select auth.uid())
    from public.employees e
    cross join generate_series(p_period_start, p_period_end, interval '1 day') as day(work_date)
    where e.tenant_id = p_tenant_id and e.status = 'active'
      and extract(isodow from day.work_date) = 1;
    get diagnostics v_store_closed = row_count;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_tenant_id, (select auth.uid()), 'schedule.draft_created', 'schedule_version',
    v_schedule_version_id::text,
    jsonb_build_object(
      'period_start', p_period_start, 'period_end', p_period_end, 'version', v_version,
      'source_version_id', v_source_version_id, 'copied_assignments', v_copied,
      'defaulted_assignments', v_defaulted, 'store_closed_assignments', v_store_closed
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
        when extract(isodow from item.work_date) = 1 then 'WEEKDAY_SPLIT'
        when h.kind = 'makeup_workday' then 'WEEKDAY_SPLIT'
        when h.kind = 'national' then 'HOLIDAY_CONTINUOUS'
        when extract(isodow from item.work_date) in (6, 7) then 'HOLIDAY_CONTINUOUS'
        else 'WEEKDAY_SPLIT'
      end as shift_code
    ) expected
    where item.shift_id is not null
      and (expected.shift_code is null or (
        s.code <> expected.shift_code and not (
          extract(isodow from item.work_date) = 1
          and h.kind = 'national' and s.code = 'HOLIDAY_CONTINUOUS'
        )
      ))
  ) then raise exception 'shift does not match date default' using errcode = '22023'; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_assignments)
      as item(employee_id uuid, work_date date, shift_id uuid, is_day_off boolean)
    where coalesce(is_day_off, false) and shift_id is not null
  ) then raise exception 'day off cannot have a shift' using errcode = '22023'; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_assignments)
      as item(employee_id uuid, work_date date, shift_id uuid,
        is_day_off boolean, is_store_closed boolean)
    where coalesce(is_store_closed, false) and (
      shift_id is not null or coalesce(is_day_off, false)
      or extract(isodow from work_date) <> 1
    )
  ) then raise exception 'store closure must be a Monday without a shift or day off' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(to_jsonb(sa) order by sa.work_date, sa.employee_id), '[]'::jsonb)
  into v_before
  from public.schedule_assignments sa
  where sa.tenant_id = p_tenant_id and sa.schedule_version_id = p_schedule_version_id;

  for v_item in
    select employee_id, work_date, shift_id, coalesce(is_day_off, false) as is_day_off,
      coalesce(is_store_closed, false) as is_store_closed
    from jsonb_to_recordset(p_assignments) as item(employee_id uuid, work_date date, shift_id uuid, is_day_off boolean, is_store_closed boolean)
  loop
    if v_item.shift_id is null and not v_item.is_day_off and not v_item.is_store_closed then
      delete from public.schedule_assignments
      where tenant_id = p_tenant_id and schedule_version_id = p_schedule_version_id
        and employee_id = v_item.employee_id and work_date = v_item.work_date;
    else
      insert into public.schedule_assignments (
        tenant_id, schedule_version_id, employee_id, work_date, shift_id, is_day_off, is_store_closed, created_by
      ) values (
        p_tenant_id, p_schedule_version_id, v_item.employee_id,
        v_item.work_date, v_item.shift_id, v_item.is_day_off, v_item.is_store_closed, (select auth.uid())
      )
      on conflict (schedule_version_id, employee_id, work_date) do update set
        shift_id = excluded.shift_id, is_day_off = excluded.is_day_off,
        is_store_closed = excluded.is_store_closed, updated_at = now();
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

create function public.get_my_published_store_closed(p_date_from date, p_date_to date)
returns table (work_date date)
language sql stable security definer set search_path = '' as $$
  with linked_employee as (
    select e.id, e.tenant_id from public.employees e
    join public.tenant_memberships tm on tm.tenant_id = e.tenant_id
      and tm.user_id = (select auth.uid()) and tm.status = 'active'
    where e.auth_user_id = (select auth.uid()) and e.status = 'active'
    order by e.created_at, e.id limit 1
  ), latest_assignment as (
    select distinct on (sa.work_date) sa.work_date, sa.is_store_closed
    from linked_employee le
    join public.schedule_assignments sa on sa.tenant_id = le.tenant_id and sa.employee_id = le.id
    join public.schedule_versions sv on sv.tenant_id = sa.tenant_id
      and sv.id = sa.schedule_version_id and sv.status = 'published'
    where sa.work_date between p_date_from and p_date_to
    order by sa.work_date, sv.published_at desc nulls last, sv.version desc, sv.id desc
  )
  select la.work_date from latest_assignment la where la.is_store_closed order by la.work_date;
$$;
revoke all on function public.get_my_published_store_closed(date,date) from public, anon, authenticated;
grant execute on function public.get_my_published_store_closed(date,date) to authenticated;

commit;
