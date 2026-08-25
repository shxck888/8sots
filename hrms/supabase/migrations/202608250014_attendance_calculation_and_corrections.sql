begin;

create type public.attendance_day_status as enum ('complete', 'exception', 'unscheduled');
create type public.attendance_exception_type as enum (
  'missing_clock_in', 'missing_clock_out', 'late', 'early_leave',
  'unmatched_punch', 'unscheduled_punch'
);
create type public.punch_correction_decision_type as enum ('approved', 'rejected');

create table public.attendance_rule_sets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  version integer not null check (version > 0),
  late_grace_minutes integer not null default 0 check (late_grace_minutes between 0 and 120),
  early_leave_grace_minutes integer not null default 0 check (early_leave_grace_minutes between 0 and 120),
  effective_from date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, version)
);

create table public.attendance_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  rule_set_id uuid not null,
  date_from date not null,
  date_to date not null,
  calculated_by uuid not null references auth.users(id) on delete restrict,
  calculated_at timestamptz not null default statement_timestamp(),
  check (date_to >= date_from and date_to - date_from <= 31),
  unique (tenant_id, id),
  foreign key (tenant_id, rule_set_id)
    references public.attendance_rule_sets(tenant_id, id) on delete restrict
);

create table public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  calculation_run_id uuid not null,
  employee_id uuid not null,
  work_date date not null,
  schedule_assignment_id uuid,
  status public.attendance_day_status not null,
  scheduled_minutes integer not null default 0 check (scheduled_minutes >= 0),
  actual_minutes integer not null default 0 check (actual_minutes >= 0),
  exception_count integer not null default 0 check (exception_count >= 0),
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  unique (calculation_run_id, employee_id, work_date),
  foreign key (tenant_id, calculation_run_id)
    references public.attendance_calculation_runs(tenant_id, id) on delete restrict,
  foreign key (tenant_id, employee_id)
    references public.employees(tenant_id, id) on delete restrict,
  foreign key (tenant_id, schedule_assignment_id)
    references public.schedule_assignments(tenant_id, id) on delete restrict
);

create table public.attendance_segments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  attendance_day_id uuid not null,
  segment_order smallint not null check (segment_order > 0),
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  clock_in_punch_id uuid,
  clock_out_punch_id uuid,
  clock_in_correction_id uuid,
  clock_out_correction_id uuid,
  effective_clock_in_at timestamptz,
  effective_clock_out_at timestamptz,
  actual_minutes integer not null default 0 check (actual_minutes >= 0),
  late_minutes integer not null default 0 check (late_minutes >= 0),
  early_leave_minutes integer not null default 0 check (early_leave_minutes >= 0),
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  unique (attendance_day_id, segment_order),
  foreign key (tenant_id, attendance_day_id)
    references public.attendance_days(tenant_id, id) on delete restrict,
  foreign key (tenant_id, clock_in_punch_id)
    references public.punch_records(tenant_id, id) on delete restrict,
  foreign key (tenant_id, clock_out_punch_id)
    references public.punch_records(tenant_id, id) on delete restrict,
  check ((clock_in_punch_id is null) <> (clock_in_correction_id is null) or effective_clock_in_at is null),
  check ((clock_out_punch_id is null) <> (clock_out_correction_id is null) or effective_clock_out_at is null)
);

create table public.attendance_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  attendance_day_id uuid not null,
  attendance_segment_id uuid,
  exception_type public.attendance_exception_type not null,
  minutes integer check (minutes is null or minutes >= 0),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, attendance_day_id)
    references public.attendance_days(tenant_id, id) on delete restrict,
  foreign key (tenant_id, attendance_segment_id)
    references public.attendance_segments(tenant_id, id) on delete restrict
);

create table public.punch_correction_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null,
  work_date date not null,
  proposed_event_type public.punch_event_type not null,
  proposed_occurred_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 64),
  reason text not null check (char_length(reason) between 10 and 500),
  idempotency_key uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, idempotency_key),
  foreign key (tenant_id, employee_id)
    references public.employees(tenant_id, id) on delete restrict
);

create table public.punch_correction_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  correction_request_id uuid not null,
  decision public.punch_correction_decision_type not null,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  unique (correction_request_id),
  foreign key (tenant_id, correction_request_id)
    references public.punch_correction_requests(tenant_id, id) on delete restrict
);

alter table public.attendance_segments
  add foreign key (tenant_id, clock_in_correction_id)
    references public.punch_correction_requests(tenant_id, id) on delete restrict,
  add foreign key (tenant_id, clock_out_correction_id)
    references public.punch_correction_requests(tenant_id, id) on delete restrict;

create index attendance_runs_tenant_dates_idx
  on public.attendance_calculation_runs (tenant_id, date_from, date_to, calculated_at desc);
create index attendance_days_tenant_date_idx
  on public.attendance_days (tenant_id, work_date, employee_id);
create index attendance_exceptions_tenant_type_idx
  on public.attendance_exceptions (tenant_id, exception_type, created_at desc);
create index correction_requests_tenant_date_idx
  on public.punch_correction_requests (tenant_id, work_date, requested_at desc);

insert into public.attendance_rule_sets (
  tenant_id, version, late_grace_minutes, early_leave_grace_minutes, effective_from
)
select t.id, 1, 0, 0, date '2026-01-01'
from public.tenants t
on conflict (tenant_id, version) do nothing;

alter table public.attendance_rule_sets enable row level security;
alter table public.attendance_calculation_runs enable row level security;
alter table public.attendance_days enable row level security;
alter table public.attendance_segments enable row level security;
alter table public.attendance_exceptions enable row level security;
alter table public.punch_correction_requests enable row level security;
alter table public.punch_correction_decisions enable row level security;

create policy attendance_rule_sets_manager_read on public.attendance_rule_sets for select to authenticated
  using (public.current_user_has_permission(tenant_id, 'attendance.manage'));
create policy attendance_runs_manager_read on public.attendance_calculation_runs for select to authenticated
  using (public.current_user_has_permission(tenant_id, 'attendance.manage'));
create policy attendance_days_manager_or_self on public.attendance_days for select to authenticated
  using (
    public.current_user_has_permission(tenant_id, 'attendance.manage')
    or employee_id in (
      select e.id from public.employees e
      where e.tenant_id = attendance_days.tenant_id and e.auth_user_id = (select auth.uid())
    )
  );
create policy attendance_segments_manager_or_self on public.attendance_segments for select to authenticated
  using (attendance_day_id in (select ad.id from public.attendance_days ad));
create policy attendance_exceptions_manager_or_self on public.attendance_exceptions for select to authenticated
  using (attendance_day_id in (select ad.id from public.attendance_days ad));
create policy correction_requests_manager_or_self on public.punch_correction_requests for select to authenticated
  using (
    public.current_user_has_permission(tenant_id, 'attendance.manage')
    or employee_id in (
      select e.id from public.employees e
      where e.tenant_id = punch_correction_requests.tenant_id and e.auth_user_id = (select auth.uid())
    )
  );
create policy correction_decisions_manager_or_self on public.punch_correction_decisions for select to authenticated
  using (correction_request_id in (select pcr.id from public.punch_correction_requests pcr));

revoke all privileges on table public.attendance_rule_sets from anon, authenticated;
revoke all privileges on table public.attendance_calculation_runs from anon, authenticated;
revoke all privileges on table public.attendance_days from anon, authenticated;
revoke all privileges on table public.attendance_segments from anon, authenticated;
revoke all privileges on table public.attendance_exceptions from anon, authenticated;
revoke all privileges on table public.punch_correction_requests from anon, authenticated;
revoke all privileges on table public.punch_correction_decisions from anon, authenticated;
grant select on table public.attendance_rule_sets, public.attendance_calculation_runs,
  public.attendance_days, public.attendance_segments, public.attendance_exceptions,
  public.punch_correction_requests, public.punch_correction_decisions to authenticated;

create or replace function public.request_punch_correction(
  p_tenant_id uuid,
  p_work_date date,
  p_event_type public.punch_event_type,
  p_proposed_occurred_at timestamptz,
  p_timezone text,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
  v_request_id uuid;
  v_tenant_timezone text;
  v_local_time timestamp;
begin
  select e.id, t.timezone into v_employee_id, v_tenant_timezone
  from public.employees e join public.tenants t on t.id = e.tenant_id
  where e.tenant_id = p_tenant_id and e.auth_user_id = (select auth.uid())
    and e.status = 'active'
    and exists (select 1 from public.tenant_memberships tm
      where tm.tenant_id = e.tenant_id and tm.user_id = (select auth.uid()) and tm.status = 'active')
  limit 1;
  if v_employee_id is null then
    raise exception 'active linked employee required' using errcode = '42501';
  end if;
  if p_work_date is null or p_event_type is null or p_proposed_occurred_at is null
     or p_idempotency_key is null then
    raise exception 'correction fields required' using errcode = '22023';
  end if;
  if char_length(trim(p_reason)) not between 10 and 500 then
    raise exception 'correction reason must be 10 to 500 characters' using errcode = '22023';
  end if;
  if char_length(trim(p_timezone)) not between 1 and 64
     or trim(p_timezone) !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$' then
    raise exception 'invalid timezone' using errcode = '22023';
  end if;
  if p_work_date < ((statement_timestamp() at time zone v_tenant_timezone)::date - 62)
     or p_work_date > (statement_timestamp() at time zone v_tenant_timezone)::date then
    raise exception 'correction work date outside allowed window' using errcode = '22023';
  end if;
  v_local_time := p_proposed_occurred_at at time zone v_tenant_timezone;
  if v_local_time < p_work_date::timestamp
     or v_local_time >= p_work_date::timestamp + interval '2 days' then
    raise exception 'correction time outside work date window' using errcode = '22023';
  end if;

  select id into v_request_id from public.punch_correction_requests
  where tenant_id = p_tenant_id and employee_id = v_employee_id
    and idempotency_key = p_idempotency_key;
  if v_request_id is not null then return v_request_id; end if;

  insert into public.punch_correction_requests (
    tenant_id, employee_id, work_date, proposed_event_type, proposed_occurred_at,
    timezone, reason, idempotency_key, requested_by
  ) values (
    p_tenant_id, v_employee_id, p_work_date, p_event_type, p_proposed_occurred_at,
    trim(p_timezone), trim(p_reason), p_idempotency_key, (select auth.uid())
  ) returning id into v_request_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_tenant_id, (select auth.uid()), 'punch_correction.requested', 'punch_correction_request',
    v_request_id::text, jsonb_build_object('employee_id', v_employee_id, 'work_date', p_work_date,
      'event_type', p_event_type, 'proposed_occurred_at', p_proposed_occurred_at));
  return v_request_id;
end;
$$;

create or replace function public.decide_punch_correction(
  p_tenant_id uuid,
  p_request_id uuid,
  p_decision public.punch_correction_decision_type,
  p_review_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_decision_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id, 'attendance.manage') then
    raise exception 'attendance.manage permission required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.punch_correction_requests
    where tenant_id = p_tenant_id and id = p_request_id) then
    raise exception 'correction request not found' using errcode = 'P0002';
  end if;
  if p_review_note is not null and char_length(trim(p_review_note)) > 500 then
    raise exception 'review note too long' using errcode = '22023';
  end if;
  insert into public.punch_correction_decisions (
    tenant_id, correction_request_id, decision, review_note, decided_by
  ) values (
    p_tenant_id, p_request_id, p_decision, nullif(trim(p_review_note), ''), (select auth.uid())
  ) returning id into v_decision_id;
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_tenant_id, (select auth.uid()), 'punch_correction.' || p_decision::text,
    'punch_correction_request', p_request_id::text,
    jsonb_build_object('decision_id', v_decision_id, 'decision', p_decision));
  return v_decision_id;
exception when unique_violation then
  raise exception 'correction request already decided' using errcode = '55000';
end;
$$;

create or replace function public.calculate_attendance(
  p_tenant_id uuid,
  p_date_from date,
  p_date_to date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_rule public.attendance_rule_sets%rowtype;
  v_timezone text;
  v_item record;
  v_segment record;
  v_day_id uuid;
  v_segment_id uuid;
  v_scheduled_start timestamptz;
  v_scheduled_end timestamptz;
  v_in_at timestamptz;
  v_out_at timestamptz;
  v_in_punch uuid;
  v_out_punch uuid;
  v_in_correction uuid;
  v_out_correction uuid;
  v_actual integer;
  v_late integer;
  v_early integer;
  v_total_actual integer;
  v_exception_count integer;
  v_segment_count integer;
begin
  if not public.current_user_has_permission(p_tenant_id, 'attendance.manage') then
    raise exception 'attendance.manage permission required' using errcode = '42501';
  end if;
  if p_date_from is null or p_date_to is null or p_date_to < p_date_from
     or p_date_to - p_date_from > 31 then
    raise exception 'attendance range must be 1 to 32 days' using errcode = '22023';
  end if;
  select timezone into v_timezone from public.tenants where id = p_tenant_id;
  select * into v_rule from public.attendance_rule_sets
  where tenant_id = p_tenant_id and effective_from <= p_date_to
  order by effective_from desc, version desc limit 1;
  if v_rule.id is null then raise exception 'attendance rule set not found' using errcode = 'P0002'; end if;

  insert into public.attendance_calculation_runs (
    tenant_id, rule_set_id, date_from, date_to, calculated_by
  ) values (p_tenant_id, v_rule.id, p_date_from, p_date_to, (select auth.uid()))
  returning id into v_run_id;

  for v_item in
    with work_items as (
      select sa.employee_id, sa.work_date, sa.id as assignment_id, sa.shift_id,
        row_number() over (partition by sa.employee_id, sa.work_date
          order by sv.published_at desc, sv.version desc) as choice
      from public.schedule_assignments sa
      join public.schedule_versions sv on sv.tenant_id = sa.tenant_id and sv.id = sa.schedule_version_id
      where sa.tenant_id = p_tenant_id and sa.work_date between p_date_from and p_date_to
        and sv.status = 'published'
    ), event_days as (
      select employee_id, work_date from public.punch_records
      where tenant_id = p_tenant_id and work_date between p_date_from and p_date_to
      union
      select r.employee_id, r.work_date from public.punch_correction_requests r
      join public.punch_correction_decisions d
        on d.tenant_id = r.tenant_id and d.correction_request_id = r.id and d.decision = 'approved'
      where r.tenant_id = p_tenant_id and r.work_date between p_date_from and p_date_to
    )
    select coalesce(w.employee_id, e.employee_id) as employee_id,
      coalesce(w.work_date, e.work_date) as work_date,
      w.assignment_id, w.shift_id
    from (select * from work_items where choice = 1) w
    full join event_days e on e.employee_id = w.employee_id and e.work_date = w.work_date
    order by coalesce(w.work_date, e.work_date), coalesce(w.employee_id, e.employee_id)
  loop
    if v_item.assignment_id is null then
      insert into public.attendance_days (
        tenant_id, calculation_run_id, employee_id, work_date, status, exception_count
      ) values (p_tenant_id, v_run_id, v_item.employee_id, v_item.work_date, 'unscheduled', 1)
      returning id into v_day_id;
      insert into public.attendance_exceptions (
        tenant_id, attendance_day_id, exception_type, detail
      ) values (p_tenant_id, v_day_id, 'unscheduled_punch', jsonb_build_object('message', '未排班但存在打卡或已核准更正'));
      continue;
    end if;

    select count(*), coalesce(sum(end_minute - start_minute), 0)
    into v_segment_count, v_actual
    from public.shift_segments where tenant_id = p_tenant_id and shift_id = v_item.shift_id;
    insert into public.attendance_days (
      tenant_id, calculation_run_id, employee_id, work_date, schedule_assignment_id,
      status, scheduled_minutes
    ) values (p_tenant_id, v_run_id, v_item.employee_id, v_item.work_date,
      v_item.assignment_id, 'complete', v_actual)
    returning id into v_day_id;
    v_total_actual := 0;
    v_exception_count := 0;

    for v_segment in select segment_order, start_minute, end_minute
      from public.shift_segments where tenant_id = p_tenant_id and shift_id = v_item.shift_id
      order by segment_order
    loop
      v_scheduled_start := (v_item.work_date::timestamp + make_interval(mins => v_segment.start_minute)) at time zone v_timezone;
      v_scheduled_end := (v_item.work_date::timestamp + make_interval(mins => v_segment.end_minute)) at time zone v_timezone;
      v_in_at := null; v_out_at := null; v_in_punch := null; v_out_punch := null;
      v_in_correction := null; v_out_correction := null;

      with events as (
        select pr.id, null::uuid as correction_id, pr.event_type, pr.occurred_at
        from public.punch_records pr where pr.tenant_id = p_tenant_id
          and pr.employee_id = v_item.employee_id and pr.work_date = v_item.work_date
        union all
        select null::uuid, r.id, r.proposed_event_type, r.proposed_occurred_at
        from public.punch_correction_requests r join public.punch_correction_decisions d
          on d.tenant_id = r.tenant_id and d.correction_request_id = r.id and d.decision = 'approved'
        where r.tenant_id = p_tenant_id and r.employee_id = v_item.employee_id and r.work_date = v_item.work_date
      ), ranked as (
        select *, row_number() over (partition by event_type order by occurred_at, coalesce(id, correction_id)) as rn from events
      )
      select occurred_at, id, correction_id into v_in_at, v_in_punch, v_in_correction
      from ranked where event_type = 'clock_in' and rn = v_segment.segment_order;

      with events as (
        select pr.id, null::uuid as correction_id, pr.event_type, pr.occurred_at
        from public.punch_records pr where pr.tenant_id = p_tenant_id
          and pr.employee_id = v_item.employee_id and pr.work_date = v_item.work_date
        union all
        select null::uuid, r.id, r.proposed_event_type, r.proposed_occurred_at
        from public.punch_correction_requests r join public.punch_correction_decisions d
          on d.tenant_id = r.tenant_id and d.correction_request_id = r.id and d.decision = 'approved'
        where r.tenant_id = p_tenant_id and r.employee_id = v_item.employee_id and r.work_date = v_item.work_date
      ), ranked as (
        select *, row_number() over (partition by event_type order by occurred_at, coalesce(id, correction_id)) as rn from events
      )
      select occurred_at, id, correction_id into v_out_at, v_out_punch, v_out_correction
      from ranked where event_type = 'clock_out' and rn = v_segment.segment_order;

      v_actual := case when v_in_at is not null and v_out_at is not null and v_out_at >= v_in_at
        then floor(extract(epoch from (v_out_at - v_in_at)) / 60)::integer else 0 end;
      v_late := case when v_in_at > v_scheduled_start + make_interval(mins => v_rule.late_grace_minutes)
        then floor(extract(epoch from (v_in_at - v_scheduled_start)) / 60)::integer else 0 end;
      v_early := case when v_out_at < v_scheduled_end - make_interval(mins => v_rule.early_leave_grace_minutes)
        then floor(extract(epoch from (v_scheduled_end - v_out_at)) / 60)::integer else 0 end;

      insert into public.attendance_segments (
        tenant_id, attendance_day_id, segment_order, scheduled_start_at, scheduled_end_at,
        clock_in_punch_id, clock_out_punch_id, clock_in_correction_id, clock_out_correction_id,
        effective_clock_in_at, effective_clock_out_at, actual_minutes, late_minutes, early_leave_minutes
      ) values (
        p_tenant_id, v_day_id, v_segment.segment_order, v_scheduled_start, v_scheduled_end,
        v_in_punch, v_out_punch, v_in_correction, v_out_correction,
        v_in_at, v_out_at, v_actual, v_late, v_early
      ) returning id into v_segment_id;
      v_total_actual := v_total_actual + v_actual;

      if v_in_at is null then
        insert into public.attendance_exceptions (tenant_id, attendance_day_id, attendance_segment_id, exception_type)
        values (p_tenant_id, v_day_id, v_segment_id, 'missing_clock_in');
        v_exception_count := v_exception_count + 1;
      end if;
      if v_out_at is null then
        insert into public.attendance_exceptions (tenant_id, attendance_day_id, attendance_segment_id, exception_type)
        values (p_tenant_id, v_day_id, v_segment_id, 'missing_clock_out');
        v_exception_count := v_exception_count + 1;
      end if;
      if v_late > 0 then
        insert into public.attendance_exceptions (tenant_id, attendance_day_id, attendance_segment_id, exception_type, minutes)
        values (p_tenant_id, v_day_id, v_segment_id, 'late', v_late);
        v_exception_count := v_exception_count + 1;
      end if;
      if v_early > 0 then
        insert into public.attendance_exceptions (tenant_id, attendance_day_id, attendance_segment_id, exception_type, minutes)
        values (p_tenant_id, v_day_id, v_segment_id, 'early_leave', v_early);
        v_exception_count := v_exception_count + 1;
      end if;
    end loop;

    if (
      (select count(*) from public.punch_records pr where pr.tenant_id = p_tenant_id
        and pr.employee_id = v_item.employee_id and pr.work_date = v_item.work_date)
      + (select count(*) from public.punch_correction_requests r
        join public.punch_correction_decisions d on d.tenant_id = r.tenant_id
          and d.correction_request_id = r.id and d.decision = 'approved'
        where r.tenant_id = p_tenant_id and r.employee_id = v_item.employee_id
          and r.work_date = v_item.work_date)
    ) > v_segment_count * 2 then
      insert into public.attendance_exceptions (tenant_id, attendance_day_id, exception_type, detail)
      values (p_tenant_id, v_day_id, 'unmatched_punch', jsonb_build_object('message', '打卡筆數超過排班班段可配對數'));
      v_exception_count := v_exception_count + 1;
    end if;
    update public.attendance_days set actual_minutes = v_total_actual,
      exception_count = v_exception_count,
      status = case when v_exception_count > 0 then 'exception'::public.attendance_day_status else 'complete'::public.attendance_day_status end
    where id = v_day_id;
  end loop;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_tenant_id, (select auth.uid()), 'attendance.calculated', 'attendance_calculation_run',
    v_run_id::text, jsonb_build_object('date_from', p_date_from, 'date_to', p_date_to,
      'rule_set_version', v_rule.version));
  return v_run_id;
end;
$$;

revoke all on function public.request_punch_correction(uuid, date, public.punch_event_type, timestamptz, text, text, uuid) from public;
revoke all on function public.decide_punch_correction(uuid, uuid, public.punch_correction_decision_type, text) from public;
revoke all on function public.calculate_attendance(uuid, date, date) from public;
grant execute on function public.request_punch_correction(uuid, date, public.punch_event_type, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.decide_punch_correction(uuid, uuid, public.punch_correction_decision_type, text) to authenticated;
grant execute on function public.calculate_attendance(uuid, date, date) to authenticated;

commit;
