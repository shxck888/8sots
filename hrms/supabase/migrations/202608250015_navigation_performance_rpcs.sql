begin;

create or replace function public.get_current_workspace_context()
returns table (
  user_id uuid,
  email text,
  user_metadata jsonb,
  tenant_id uuid,
  tenant_name text,
  employee_id uuid,
  can_manage_employee boolean,
  can_manage_schedule boolean,
  can_manage_attendance boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    coalesce(u.email, ''),
    coalesce(u.raw_user_meta_data, '{}'::jsonb),
    membership.tenant_id,
    membership.tenant_name,
    employee.id,
    coalesce(public.current_user_has_permission(membership.tenant_id, 'employee.manage'), false),
    coalesce(public.current_user_has_permission(membership.tenant_id, 'schedule.manage'), false),
    coalesce(public.current_user_has_permission(membership.tenant_id, 'attendance.manage'), false)
  from auth.users u
  left join lateral (
    select tm.tenant_id, t.name as tenant_name
    from public.tenant_memberships tm
    join public.tenants t on t.id = tm.tenant_id
    where tm.user_id = u.id and tm.status = 'active'
    order by tm.created_at, tm.id
    limit 1
  ) membership on true
  left join lateral (
    select e.id
    from public.employees e
    where e.tenant_id = membership.tenant_id
      and e.auth_user_id = u.id
      and e.status = 'active'
    order by e.created_at, e.id
    limit 1
  ) employee on true
  where u.id = (select auth.uid());
$$;

create or replace function public.get_my_published_schedule(
  p_date_from date,
  p_date_to date
)
returns table (
  employee_id uuid,
  work_date date,
  shift_id uuid,
  shift_code text,
  shift_name text,
  segment_order smallint,
  start_minute integer,
  end_minute integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with linked_employee as (
    select e.id, e.tenant_id
    from public.employees e
    join public.tenant_memberships tm
      on tm.tenant_id = e.tenant_id
      and tm.user_id = (select auth.uid())
      and tm.status = 'active'
    where e.auth_user_id = (select auth.uid())
      and e.status = 'active'
    order by e.created_at, e.id
    limit 1
  ), latest_assignment as (
    select distinct on (sa.work_date)
      le.id as employee_id,
      le.tenant_id,
      sa.work_date,
      sa.shift_id
    from linked_employee le
    join public.schedule_assignments sa
      on sa.tenant_id = le.tenant_id and sa.employee_id = le.id
    join public.schedule_versions sv
      on sv.tenant_id = sa.tenant_id
      and sv.id = sa.schedule_version_id
      and sv.status = 'published'
    where sa.work_date between p_date_from and p_date_to
    order by sa.work_date, sv.published_at desc nulls last, sv.version desc, sv.id desc
  )
  select
    la.employee_id,
    la.work_date,
    s.id,
    s.code,
    s.name,
    ss.segment_order,
    ss.start_minute,
    ss.end_minute
  from latest_assignment la
  join public.shifts s on s.tenant_id = la.tenant_id and s.id = la.shift_id
  join public.shift_segments ss on ss.tenant_id = s.tenant_id and ss.shift_id = s.id
  order by la.work_date, ss.segment_order;
$$;

create or replace function public.get_my_attendance_overview(
  p_punch_limit integer default 60,
  p_day_limit integer default 31,
  p_request_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with linked_employee as (
    select e.id, e.tenant_id
    from public.employees e
    join public.tenant_memberships tm
      on tm.tenant_id = e.tenant_id
      and tm.user_id = (select auth.uid())
      and tm.status = 'active'
    where e.auth_user_id = (select auth.uid())
      and e.status = 'active'
    order by e.created_at, e.id
    limit 1
  )
  select jsonb_build_object(
    'punches', coalesce((
      select jsonb_agg(to_jsonb(punch_row) order by punch_row.occurred_at desc)
      from (
        select pr.*
        from public.punch_records pr
        join linked_employee le on le.tenant_id = pr.tenant_id and le.id = pr.employee_id
        order by pr.occurred_at desc
        limit least(greatest(p_punch_limit, 1), 200)
      ) punch_row
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(to_jsonb(day_row) order by day_row.created_at desc)
      from (
        select ad.*
        from public.attendance_days ad
        join linked_employee le on le.tenant_id = ad.tenant_id and le.id = ad.employee_id
        order by ad.created_at desc
        limit least(greatest(p_day_limit, 1), 100)
      ) day_row
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(
        to_jsonb(request_row) || jsonb_build_object('decision', request_row.decision)
        order by request_row.requested_at desc
      )
      from (
        select pcr.*, pcd.decision
        from public.punch_correction_requests pcr
        join linked_employee le on le.tenant_id = pcr.tenant_id and le.id = pcr.employee_id
        left join public.punch_correction_decisions pcd
          on pcd.tenant_id = pcr.tenant_id and pcd.correction_request_id = pcr.id
        order by pcr.requested_at desc
        limit least(greatest(p_request_limit, 1), 100)
      ) request_row
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_current_workspace_context() from public, anon;
revoke all on function public.get_my_published_schedule(date, date) from public, anon;
revoke all on function public.get_my_attendance_overview(integer, integer, integer) from public, anon;
grant execute on function public.get_current_workspace_context() to authenticated;
grant execute on function public.get_my_published_schedule(date, date) to authenticated;
grant execute on function public.get_my_attendance_overview(integer, integer, integer) to authenticated;

commit;
