begin;

-- A calendar-day leave covers the whole work date, but consumes one standard
-- workday rather than the 24 elapsed hours used to express its coverage.
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

-- A shift may continue after midnight. Full-day leave still covers every
-- scheduled segment belonging to its selected work date.
create or replace function public.calculate_attendance(p_tenant_id uuid, p_date_from date, p_date_to date)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_run_id uuid;
begin
  v_run_id := public.calculate_attendance_v1(p_tenant_id, p_date_from, p_date_to);
  update public.attendance_days ad set
    approved_leave_minutes = (
      select coalesce(sum(case
        when wr.starts_at = (ad.work_date::timestamp at time zone wr.timezone)
          and wr.ends_at = ((ad.work_date+1)::timestamp at time zone wr.timezone)
        then floor(extract(epoch from (aseg.scheduled_end_at-aseg.scheduled_start_at))/60)::integer
        else greatest(0, floor(extract(epoch from (
          least(wr.ends_at,aseg.scheduled_end_at)-greatest(wr.starts_at,aseg.scheduled_start_at)
        ))/60)::integer)
      end),0)
      from public.attendance_segments aseg
      join public.work_requests wr on wr.tenant_id=ad.tenant_id and wr.employee_id=ad.employee_id
        and wr.request_type='leave'
        and (
          (wr.starts_at = (ad.work_date::timestamp at time zone wr.timezone)
            and wr.ends_at = ((ad.work_date+1)::timestamp at time zone wr.timezone))
          or (wr.starts_at<aseg.scheduled_end_at and wr.ends_at>aseg.scheduled_start_at)
        )
        and exists(select 1 from public.work_request_decisions d
          where d.work_request_id=wr.id and d.decision='approved')
        and not exists(select 1 from public.work_request_withdrawals w where w.work_request_id=wr.id)
      where aseg.attendance_day_id=ad.id
    ),
    approved_overtime_minutes = (
      select coalesce(sum(greatest(0,floor(extract(epoch from (
        least(wr.ends_at,((ad.work_date+1)::timestamp at time zone wr.timezone))-
        greatest(wr.starts_at,(ad.work_date::timestamp at time zone wr.timezone))
      ))/60)::integer)),0)
      from public.work_requests wr
      where wr.tenant_id=ad.tenant_id and wr.employee_id=ad.employee_id
        and wr.request_type='overtime'
        and wr.starts_at<((ad.work_date+1)::timestamp at time zone wr.timezone)
        and wr.ends_at>(ad.work_date::timestamp at time zone wr.timezone)
        and exists(select 1 from public.work_request_decisions d
          where d.work_request_id=wr.id and d.decision='approved')
        and not exists(select 1 from public.work_request_withdrawals w where w.work_request_id=wr.id)
    )
  where ad.calculation_run_id=v_run_id;

  delete from public.attendance_exceptions ae using public.attendance_days ad
  where ae.attendance_day_id=ad.id and ad.calculation_run_id=v_run_id
    and ad.scheduled_minutes>0 and ad.approved_leave_minutes>=ad.scheduled_minutes
    and ae.exception_type in ('missing_clock_in','missing_clock_out','late','early_leave');
  update public.attendance_days ad set status='leave',
    exception_count=(select count(*) from public.attendance_exceptions ae where ae.attendance_day_id=ad.id)
  where ad.calculation_run_id=v_run_id and ad.scheduled_minutes>0
    and ad.approved_leave_minutes>=ad.scheduled_minutes;
  return v_run_id;
end;
$$;

commit;
