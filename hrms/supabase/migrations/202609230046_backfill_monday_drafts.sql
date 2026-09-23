begin;

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

  end if;

  -- A copied published version may have no Monday row; default the new draft
  -- to store closure without changing any explicit shift, leave, or closure.
  insert into public.schedule_assignments (
    tenant_id, schedule_version_id, employee_id, work_date,
    shift_id, is_store_closed, created_by
  )
  select p_tenant_id, v_schedule_version_id, e.id, day.work_date::date,
    null, true, (select auth.uid())
  from public.employees e
  cross join generate_series(p_period_start, p_period_end, interval '1 day') as day(work_date)
  where e.tenant_id = p_tenant_id and e.status = 'active'
    and extract(isodow from day.work_date) = 1
  on conflict (schedule_version_id, employee_id, work_date) do nothing;
  get diagnostics v_store_closed = row_count;

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

-- Upgrade existing drafts only. Published versions remain immutable; existing
-- Monday shifts, leave, and store closure rows remain untouched.
with backfilled as (
  insert into public.schedule_assignments (
    tenant_id, schedule_version_id, employee_id, work_date,
    shift_id, is_store_closed, created_by
  )
  select sv.tenant_id, sv.id, e.id, day.work_date::date,
    null, true, null
  from public.schedule_versions sv
  join public.employees e on e.tenant_id = sv.tenant_id and e.status = 'active'
  cross join lateral generate_series(sv.period_start, sv.period_end, interval '1 day') as day(work_date)
  where sv.status = 'draft' and extract(isodow from day.work_date) = 1
  on conflict (schedule_version_id, employee_id, work_date) do nothing
  returning tenant_id, schedule_version_id
)
insert into public.audit_logs (
  tenant_id, actor_user_id, action, entity_type, entity_id, after_data
)
select tenant_id, null, 'schedule.monday_store_closure_backfilled',
  'schedule_version', schedule_version_id::text,
  jsonb_build_object('assignments', count(*), 'migration', '202609230046')
from backfilled
 group by tenant_id, schedule_version_id;

commit;
