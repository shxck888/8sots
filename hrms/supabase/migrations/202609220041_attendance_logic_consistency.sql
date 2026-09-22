begin;

-- A punch after midnight still belongs to the previous work date while an
-- overnight published shift is in progress and its last event is clock-in.
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
  v_local_date date;
  v_tenant_timezone text;
begin
  select e.id, t.timezone into v_employee_id, v_tenant_timezone
  from public.employees e
  join public.tenants t on t.id = e.tenant_id
  where e.tenant_id = p_tenant_id
    and e.auth_user_id = auth.uid()
    and e.status = 'active'
    and exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = e.tenant_id and tm.user_id = auth.uid() and tm.status = 'active'
    )
  limit 1;

  if v_employee_id is null then raise exception 'active linked employee required' using errcode = '42501'; end if;
  if p_location_consent is not true then raise exception 'location consent required' using errcode = '22023'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key required' using errcode = '22023'; end if;
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

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_employee_id::text, 0));
  select pr.id into v_punch_id from public.punch_records pr
  where pr.tenant_id = p_tenant_id and pr.employee_id = v_employee_id
    and pr.idempotency_key = p_idempotency_key;
  if v_punch_id is not null then return v_punch_id; end if;

  if exists (
    select 1 from public.punch_records pr
    where pr.tenant_id = p_tenant_id and pr.employee_id = v_employee_id
      and pr.occurred_at > statement_timestamp() - interval '30 seconds'
  ) then raise exception 'punch cooldown active' using errcode = '55000'; end if;

  v_local_date := (statement_timestamp() at time zone v_tenant_timezone)::date;
  v_work_date := v_local_date;
  if exists (
    select 1
    from public.schedule_assignments sa
    join public.schedule_versions sv
      on sv.tenant_id = sa.tenant_id and sv.id = sa.schedule_version_id and sv.status = 'published'
    join public.shift_segments ss on ss.tenant_id = sa.tenant_id and ss.shift_id = sa.shift_id
    where sa.tenant_id = p_tenant_id and sa.employee_id = v_employee_id
      and sa.work_date = v_local_date - 1 and ss.end_minute > 1440
      and statement_timestamp() <= ((sa.work_date::timestamp + make_interval(mins => ss.end_minute)) at time zone v_tenant_timezone)
      and (
        select pr.event_type from public.punch_records pr
        where pr.tenant_id = p_tenant_id and pr.employee_id = v_employee_id and pr.work_date = sa.work_date
        order by pr.occurred_at desc, pr.created_at desc limit 1
      ) = 'clock_in'
  ) then
    v_work_date := v_local_date - 1;
  end if;

  select case when pr.event_type = 'clock_in'
    then 'clock_out'::public.punch_event_type else 'clock_in'::public.punch_event_type end
  into v_event_type
  from public.punch_records pr
  where pr.tenant_id = p_tenant_id and pr.employee_id = v_employee_id and pr.work_date = v_work_date
  order by pr.occurred_at desc, pr.created_at desc limit 1;
  v_event_type := coalesce(v_event_type, 'clock_in'::public.punch_event_type);

  insert into public.punch_records (
    tenant_id, employee_id, work_date, event_type, client_occurred_at, timezone, source,
    latitude, longitude, accuracy_m, location_verification, location_consent_at,
    idempotency_key, created_by
  ) values (
    p_tenant_id, v_employee_id, v_work_date, v_event_type, p_client_occurred_at,
    trim(p_timezone), 'web_gps', p_latitude, p_longitude, p_accuracy_m,
    'not_configured', statement_timestamp(), p_idempotency_key, auth.uid()
  ) returning id into v_punch_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    p_tenant_id, auth.uid(), 'punch.recorded', 'punch_record', v_punch_id::text,
    jsonb_build_object(
      'employee_id', v_employee_id, 'work_date', v_work_date, 'event_type', v_event_type,
      'source', 'web_gps', 'location_verification',
      (select pr.location_verification from public.punch_records pr where pr.id = v_punch_id)
    )
  );
  return v_punch_id;
end;
$$;

-- Record the exact rule version used by every attendance day. A calculation
-- run may span a rule change, so the run-level rule is only the terminal rule.
alter table public.attendance_days add column rule_set_id uuid;
update public.attendance_days ad set rule_set_id = cr.rule_set_id
from public.attendance_calculation_runs cr where cr.id = ad.calculation_run_id;
alter table public.attendance_days alter column rule_set_id set not null;
alter table public.attendance_days add constraint attendance_days_rule_set_fk
  foreign key (tenant_id, rule_set_id) references public.attendance_rule_sets(tenant_id, id) on delete restrict;

create or replace function public.calculate_attendance_v1(p_tenant_id uuid, p_date_from date, p_date_to date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_run_id uuid; v_rule public.attendance_rule_sets%rowtype; v_timezone text; v_item record; v_segment record;
  v_day_id uuid; v_segment_id uuid; v_scheduled_start timestamptz; v_scheduled_end timestamptz;
  v_in_at timestamptz; v_out_at timestamptz; v_in_punch uuid; v_out_punch uuid;
  v_in_correction uuid; v_out_correction uuid; v_actual integer; v_late integer; v_early integer;
  v_total_actual integer; v_exception_count integer; v_segment_count integer;
begin
  if not public.current_user_has_permission(p_tenant_id, 'attendance.manage') then
    raise exception 'attendance.manage permission required' using errcode = '42501';
  end if;
  if p_date_from is null or p_date_to is null or p_date_to < p_date_from or p_date_to - p_date_from > 31 then
    raise exception 'attendance range must be 1 to 32 days' using errcode = '22023';
  end if;
  select timezone into v_timezone from public.tenants where id = p_tenant_id;
  select * into v_rule from public.attendance_rule_sets
  where tenant_id = p_tenant_id and effective_from <= p_date_to
  order by effective_from desc, version desc limit 1;
  if v_rule.id is null then raise exception 'attendance rule set not found' using errcode = 'P0002'; end if;
  insert into public.attendance_calculation_runs(tenant_id,rule_set_id,date_from,date_to,calculated_by)
  values(p_tenant_id,v_rule.id,p_date_from,p_date_to,auth.uid()) returning id into v_run_id;

  for v_item in
    with work_items as (
      select sa.employee_id,sa.work_date,sa.id assignment_id,sa.shift_id,
        row_number() over(partition by sa.employee_id,sa.work_date order by sv.published_at desc,sv.version desc) choice
      from public.schedule_assignments sa join public.schedule_versions sv
        on sv.tenant_id=sa.tenant_id and sv.id=sa.schedule_version_id
      where sa.tenant_id=p_tenant_id and sa.work_date between p_date_from and p_date_to and sv.status='published'
    ), event_days as (
      select employee_id,work_date from public.punch_records
      where tenant_id=p_tenant_id and work_date between p_date_from and p_date_to
      union
      select r.employee_id,r.work_date from public.punch_correction_requests r
      join public.punch_correction_decisions d on d.tenant_id=r.tenant_id
        and d.correction_request_id=r.id and d.decision='approved'
      where r.tenant_id=p_tenant_id and r.work_date between p_date_from and p_date_to
    )
    select coalesce(w.employee_id,e.employee_id) employee_id,coalesce(w.work_date,e.work_date) work_date,
      w.assignment_id,w.shift_id from (select * from work_items where choice=1) w
    full join event_days e on e.employee_id=w.employee_id and e.work_date=w.work_date
    order by coalesce(w.work_date,e.work_date),coalesce(w.employee_id,e.employee_id)
  loop
    select * into v_rule from public.attendance_rule_sets
    where tenant_id=p_tenant_id and effective_from<=v_item.work_date
    order by effective_from desc,version desc limit 1;
    if v_rule.id is null then raise exception 'attendance rule set not found for work date' using errcode='P0002'; end if;

    if v_item.assignment_id is null then
      insert into public.attendance_days(
        tenant_id,calculation_run_id,rule_set_id,employee_id,work_date,status,exception_count
      ) values(p_tenant_id,v_run_id,v_rule.id,v_item.employee_id,v_item.work_date,'unscheduled',1)
      returning id into v_day_id;
      insert into public.attendance_exceptions(tenant_id,attendance_day_id,exception_type,detail)
      values(p_tenant_id,v_day_id,'unscheduled_punch',jsonb_build_object('message','未排班但存在打卡或已核准更正'));
      continue;
    end if;

    select count(*),coalesce(sum(end_minute-start_minute),0) into v_segment_count,v_actual
    from public.shift_segments where tenant_id=p_tenant_id and shift_id=v_item.shift_id;
    insert into public.attendance_days(
      tenant_id,calculation_run_id,rule_set_id,employee_id,work_date,schedule_assignment_id,status,scheduled_minutes
    ) values(p_tenant_id,v_run_id,v_rule.id,v_item.employee_id,v_item.work_date,v_item.assignment_id,'complete',v_actual)
    returning id into v_day_id;
    v_total_actual:=0; v_exception_count:=0;

    for v_segment in select segment_order,start_minute,end_minute from public.shift_segments
      where tenant_id=p_tenant_id and shift_id=v_item.shift_id order by segment_order
    loop
      v_scheduled_start:=(v_item.work_date::timestamp+make_interval(mins=>v_segment.start_minute)) at time zone v_timezone;
      v_scheduled_end:=(v_item.work_date::timestamp+make_interval(mins=>v_segment.end_minute)) at time zone v_timezone;
      v_in_at:=null; v_out_at:=null; v_in_punch:=null; v_out_punch:=null;
      v_in_correction:=null; v_out_correction:=null;

      with events as (
        select pr.id,null::uuid correction_id,pr.event_type,pr.occurred_at from public.punch_records pr
        where pr.tenant_id=p_tenant_id and pr.employee_id=v_item.employee_id and pr.work_date=v_item.work_date
        union all
        select null::uuid,r.id,r.proposed_event_type,r.proposed_occurred_at from public.punch_correction_requests r
        join public.punch_correction_decisions d on d.tenant_id=r.tenant_id
          and d.correction_request_id=r.id and d.decision='approved'
        where r.tenant_id=p_tenant_id and r.employee_id=v_item.employee_id and r.work_date=v_item.work_date
          and (select count(*) from public.punch_records pr where pr.tenant_id=p_tenant_id
            and pr.employee_id=v_item.employee_id and pr.work_date=v_item.work_date
            and pr.event_type=r.proposed_event_type)<v_segment_count
      ), ranked as (
        select *,row_number() over(partition by event_type order by occurred_at,coalesce(id,correction_id)) rn from events
      ) select occurred_at,id,correction_id into v_in_at,v_in_punch,v_in_correction from ranked
        where event_type='clock_in' and rn=v_segment.segment_order;

      with events as (
        select pr.id,null::uuid correction_id,pr.event_type,pr.occurred_at from public.punch_records pr
        where pr.tenant_id=p_tenant_id and pr.employee_id=v_item.employee_id and pr.work_date=v_item.work_date
        union all
        select null::uuid,r.id,r.proposed_event_type,r.proposed_occurred_at from public.punch_correction_requests r
        join public.punch_correction_decisions d on d.tenant_id=r.tenant_id
          and d.correction_request_id=r.id and d.decision='approved'
        where r.tenant_id=p_tenant_id and r.employee_id=v_item.employee_id and r.work_date=v_item.work_date
          and (select count(*) from public.punch_records pr where pr.tenant_id=p_tenant_id
            and pr.employee_id=v_item.employee_id and pr.work_date=v_item.work_date
            and pr.event_type=r.proposed_event_type)<v_segment_count
      ), ranked as (
        select *,row_number() over(partition by event_type order by occurred_at,coalesce(id,correction_id)) rn from events
      ) select occurred_at,id,correction_id into v_out_at,v_out_punch,v_out_correction from ranked
        where event_type='clock_out' and rn=v_segment.segment_order;

      v_actual:=case when v_in_at is not null and v_out_at is not null and v_out_at>=v_in_at
        then greatest(0,floor(extract(epoch from (least(v_out_at,v_scheduled_end)-greatest(v_in_at,v_scheduled_start)))/60)::integer)
        else 0 end;
      v_late:=case when v_in_at>v_scheduled_start+make_interval(mins=>v_rule.late_grace_minutes)
        then floor(extract(epoch from(v_in_at-v_scheduled_start))/60)::integer else 0 end;
      v_early:=case when v_out_at<v_scheduled_end-make_interval(mins=>v_rule.early_leave_grace_minutes)
        then floor(extract(epoch from(v_scheduled_end-v_out_at))/60)::integer else 0 end;
      insert into public.attendance_segments(
        tenant_id,attendance_day_id,segment_order,scheduled_start_at,scheduled_end_at,
        clock_in_punch_id,clock_out_punch_id,clock_in_correction_id,clock_out_correction_id,
        effective_clock_in_at,effective_clock_out_at,actual_minutes,late_minutes,early_leave_minutes
      ) values(
        p_tenant_id,v_day_id,v_segment.segment_order,v_scheduled_start,v_scheduled_end,
        v_in_punch,v_out_punch,v_in_correction,v_out_correction,v_in_at,v_out_at,v_actual,v_late,v_early
      ) returning id into v_segment_id;
      v_total_actual:=v_total_actual+v_actual;
      if v_in_at is null then insert into public.attendance_exceptions(tenant_id,attendance_day_id,attendance_segment_id,exception_type)
        values(p_tenant_id,v_day_id,v_segment_id,'missing_clock_in'); v_exception_count:=v_exception_count+1; end if;
      if v_out_at is null then insert into public.attendance_exceptions(tenant_id,attendance_day_id,attendance_segment_id,exception_type)
        values(p_tenant_id,v_day_id,v_segment_id,'missing_clock_out'); v_exception_count:=v_exception_count+1; end if;
      if v_late>0 then insert into public.attendance_exceptions(tenant_id,attendance_day_id,attendance_segment_id,exception_type,minutes)
        values(p_tenant_id,v_day_id,v_segment_id,'late',v_late); v_exception_count:=v_exception_count+1; end if;
      if v_early>0 then insert into public.attendance_exceptions(tenant_id,attendance_day_id,attendance_segment_id,exception_type,minutes)
        values(p_tenant_id,v_day_id,v_segment_id,'early_leave',v_early); v_exception_count:=v_exception_count+1; end if;
    end loop;

    if ((select count(*) from public.punch_records pr where pr.tenant_id=p_tenant_id
          and pr.employee_id=v_item.employee_id and pr.work_date=v_item.work_date)
      +(select count(*) from public.punch_correction_requests r join public.punch_correction_decisions d
          on d.tenant_id=r.tenant_id and d.correction_request_id=r.id and d.decision='approved'
        where r.tenant_id=p_tenant_id and r.employee_id=v_item.employee_id and r.work_date=v_item.work_date)
      )>v_segment_count*2 then
      insert into public.attendance_exceptions(tenant_id,attendance_day_id,exception_type,detail)
      values(p_tenant_id,v_day_id,'unmatched_punch',jsonb_build_object('message','打卡與補卡筆數超過排班班段可配對數'));
      v_exception_count:=v_exception_count+1;
    end if;
    update public.attendance_days set actual_minutes=v_total_actual,exception_count=v_exception_count,
      status=case when v_exception_count>0 then 'exception'::public.attendance_day_status else 'complete'::public.attendance_day_status end
    where id=v_day_id;
  end loop;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'attendance.calculated','attendance_calculation_run',v_run_id::text,
    jsonb_build_object('date_from',p_date_from,'date_to',p_date_to,'terminal_rule_set_version',v_rule.version,'rule_selected_per_work_date',true));
  return v_run_id;
end;
$$;

-- Keep the restaurant's normal Tue-Fri policy, but permit leave on any special
-- date where the employee actually has a published assignment. Company closure
-- dates remain unavailable because they cannot be assigned.
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
  if p_request_type='overtime' and v_requested_minutes>480 then raise exception 'overtime duration must not exceed 480 minutes' using errcode='22023'; end if;
  if p_request_type='leave' and p_starts_local::date<>(p_ends_local-interval '1 microsecond')::date then
    raise exception 'leave request must cover one local date' using errcode='22023'; end if;
  if p_request_type='leave' and not (
    not exists(select 1 from public.holiday_calendar_entries h where h.tenant_id=p_tenant_id
      and h.holiday_date=p_starts_local::date and h.kind='company')
    and (
      (
        extract(isodow from p_starts_local::date) between 2 and 5
        and not exists(select 1 from public.holiday_calendar_entries h where h.tenant_id=p_tenant_id
          and h.holiday_date=p_starts_local::date and h.kind='national')
      ) or exists(
        select 1 from public.schedule_assignments sa join public.schedule_versions sv
          on sv.tenant_id=sa.tenant_id and sv.id=sa.schedule_version_id and sv.status='published'
        where sa.tenant_id=p_tenant_id and sa.employee_id=v_employee_id and sa.work_date=p_starts_local::date
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

-- An hourly payroll cannot be reviewed or locked while any scheduled/punched
-- work date is absent from the attendance snapshot used for calculation.
do $migration$
declare v_sql text; v_anchor text; v_replacement text;
begin
  select pg_get_functiondef('public.set_payroll_period_status(uuid,uuid,public.payroll_period_status)'::regprocedure) into v_sql;
  v_anchor := '  if p_status in (''reviewed'',''locked'') then';
  v_replacement := $body$  if p_status in ('reviewed','locked') and exists (
    select 1 from public.payroll_entries pe
    join public.employee_compensation_versions cv on cv.id=pe.compensation_version_id and cv.pay_basis='hourly'
    where pe.tenant_id=p_tenant_id and pe.payroll_period_id=p_period_id and exists (
      select 1 from (
        select sa.work_date from public.schedule_assignments sa join public.schedule_versions sv
          on sv.tenant_id=sa.tenant_id and sv.id=sa.schedule_version_id and sv.status='published'
        where sa.tenant_id=p_tenant_id and sa.employee_id=pe.employee_id
          and sa.work_date between v_period.period_start and v_period.period_end
        union
        select pr.work_date from public.punch_records pr where pr.tenant_id=p_tenant_id
          and pr.employee_id=pe.employee_id and pr.work_date between v_period.period_start and v_period.period_end
      ) expected
      where not exists (
        select 1 from jsonb_array_elements(coalesce(pe.source_snapshot->'attendance'->'days','[]'::jsonb)) day
        where (day->>'work_date')::date=expected.work_date
      )
    )
  ) then raise exception 'hourly payroll missing attendance calculations' using errcode='23514'; end if;
  if p_status in ('reviewed','locked') then$body$;
  if position(v_anchor in v_sql)=0 then raise exception 'payroll attendance guard insertion point not found'; end if;
  execute replace(v_sql,v_anchor,v_replacement);
end;
$migration$;

revoke all on function public.record_gps_punch(uuid,uuid,timestamptz,text,numeric,numeric,numeric,boolean),
  public.calculate_attendance_v1(uuid,date,date),
  public.create_work_request(uuid,public.work_request_type,uuid,timestamp,timestamp,text,uuid)
from public,anon,authenticated;
grant execute on function public.record_gps_punch(uuid,uuid,timestamptz,text,numeric,numeric,numeric,boolean),
  public.create_work_request(uuid,public.work_request_type,uuid,timestamp,timestamp,text,uuid)
to authenticated;

commit;
