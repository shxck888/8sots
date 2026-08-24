begin;

create unique index schedule_versions_one_draft_period_idx
  on public.schedule_versions (tenant_id, period_start, period_end)
  where status = 'draft';

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
  if exists (
    select 1 from public.schedule_versions
    where tenant_id = p_tenant_id and period_start = p_period_start
      and period_end = p_period_end and status = 'draft'
  ) then raise exception 'a draft already exists for this period' using errcode = '23505'; end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.schedule_versions
  where tenant_id = p_tenant_id
    and period_start = p_period_start
    and period_end = p_period_end;
  select id into v_source_version_id
  from public.schedule_versions
  where tenant_id = p_tenant_id
    and period_start = p_period_start
    and period_end = p_period_end
    and status = 'published';

  insert into public.schedule_versions (
    tenant_id, period_start, period_end, version, status, created_by
  ) values (
    p_tenant_id, p_period_start, p_period_end, v_version, 'draft', (select auth.uid())
  ) returning id into v_schedule_version_id;

  if v_source_version_id is not null then
    insert into public.schedule_assignments (
      tenant_id, schedule_version_id, employee_id, work_date, shift_id, notes, created_by
    )
    select tenant_id, v_schedule_version_id, employee_id, work_date, shift_id, notes, (select auth.uid())
    from public.schedule_assignments
    where tenant_id = p_tenant_id and schedule_version_id = v_source_version_id;
    get diagnostics v_copied = row_count;
  end if;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_tenant_id, (select auth.uid()), 'schedule.draft_created', 'schedule_version',
    v_schedule_version_id::text,
    jsonb_build_object(
      'period_start', p_period_start, 'period_end', p_period_end, 'version', v_version,
      'source_version_id', v_source_version_id, 'copied_assignments', v_copied
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
  if v_count > 5000 then
    raise exception 'assignment batch is too large' using errcode = '22023';
  end if;

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
    group by employee_id, work_date
    having count(*) > 1
  ) then raise exception 'duplicate employee work date assignment' using errcode = '22023'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as item(employee_id uuid, work_date date, shift_id uuid)
    where employee_id is null
       or work_date is null
       or work_date < v_schedule.period_start
       or work_date > v_schedule.period_end
  ) then raise exception 'invalid assignment employee or work date' using errcode = '22023'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as item(employee_id uuid, work_date date, shift_id uuid)
    left join public.employees e
      on e.tenant_id = p_tenant_id and e.id = item.employee_id
    where e.id is null
  ) then raise exception 'employee not found' using errcode = 'P0002'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assignments) as item(employee_id uuid, work_date date, shift_id uuid)
    left join public.shifts s
      on s.tenant_id = p_tenant_id and s.id = item.shift_id and s.status = 'active'
    where item.shift_id is not null and s.id is null
  ) then raise exception 'active shift not found' using errcode = 'P0002'; end if;

  select coalesce(jsonb_agg(to_jsonb(sa) order by sa.work_date, sa.employee_id), '[]'::jsonb)
  into v_before
  from public.schedule_assignments sa
  where sa.tenant_id = p_tenant_id and sa.schedule_version_id = p_schedule_version_id;

  for v_item in
    select employee_id, work_date, shift_id
    from jsonb_to_recordset(p_assignments) as item(employee_id uuid, work_date date, shift_id uuid)
  loop
    if v_item.shift_id is null then
      delete from public.schedule_assignments
      where tenant_id = p_tenant_id
        and schedule_version_id = p_schedule_version_id
        and employee_id = v_item.employee_id
        and work_date = v_item.work_date;
    else
      insert into public.schedule_assignments (
        tenant_id, schedule_version_id, employee_id, work_date, shift_id, created_by
      ) values (
        p_tenant_id, p_schedule_version_id, v_item.employee_id,
        v_item.work_date, v_item.shift_id, (select auth.uid())
      )
      on conflict (schedule_version_id, employee_id, work_date) do update set
        shift_id = excluded.shift_id,
        updated_at = now();
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

revoke all on function public.save_schedule_assignments(uuid, uuid, jsonb) from public;
revoke all on function public.create_schedule_draft(uuid, date, date) from public;
grant execute on function public.save_schedule_assignments(uuid, uuid, jsonb) to authenticated;
grant execute on function public.create_schedule_draft(uuid, date, date) to authenticated;

commit;
