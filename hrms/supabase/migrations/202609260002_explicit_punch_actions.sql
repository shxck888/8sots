begin;

-- Preserve the original in/out evidence while recording the employee's intent.
alter table public.punch_records add column punch_action text check (punch_action in
  ('clock_in','lunch_start','lunch_end','meal_morning','meal_afternoon','meal_end','clock_out'));
alter table public.punch_correction_requests add column punch_action text check (punch_action in
  ('clock_in','lunch_start','lunch_end','meal_morning','meal_afternoon','meal_end','clock_out'));
create unique index punch_action_once_per_day on public.punch_records(tenant_id,employee_id,work_date,punch_action)
  where voided_at is null and punch_action is not null and punch_action <> 'meal_end';
-- Recreate the private view to include the new column; ordinary clients use RLS tables.
create or replace view public.active_punch_records as select * from public.punch_records where voided_at is null;

create function public.validate_punch_action(p_tenant_id uuid,p_employee_id uuid,p_work_date date,p_action text)
returns public.punch_event_type language plpgsql security definer set search_path='' as $$
declare v_start timestamptz;
begin
  if p_action is null or p_action not in ('clock_in','lunch_start','lunch_end','meal_morning','meal_afternoon','meal_end','clock_out') then
    raise exception 'invalid punch action' using errcode='22023';
  end if;
  if p_action='meal_end' then
    select pr.occurred_at into v_start from public.active_punch_records pr
    where pr.tenant_id=p_tenant_id and pr.employee_id=p_employee_id and pr.work_date=p_work_date
      and pr.punch_action in ('meal_morning','meal_afternoon')
      and pr.occurred_at>statement_timestamp()-interval '30 minutes'
      and not exists(select 1 from public.active_punch_records later where later.tenant_id=pr.tenant_id
        and later.employee_id=pr.employee_id and later.work_date=pr.work_date and later.occurred_at>pr.occurred_at)
    order by pr.occurred_at desc limit 1;
    if v_start is null then raise exception 'no active meal break' using errcode='55000'; end if;
  end if;
  if p_action in ('meal_morning','meal_afternoon') and exists(
    select 1 from public.active_punch_records pr where pr.tenant_id=p_tenant_id and pr.employee_id=p_employee_id
      and pr.work_date=p_work_date and pr.punch_action in ('meal_morning','meal_afternoon')
      and pr.occurred_at>statement_timestamp()-interval '30 minutes'
      and not exists(select 1 from public.active_punch_records later where later.tenant_id=pr.tenant_id
        and later.employee_id=pr.employee_id and later.work_date=pr.work_date and later.occurred_at>pr.occurred_at)
  ) then raise exception 'meal break already active' using errcode='55000'; end if;
  -- Missing earlier punches never prevent a later event from being recorded.
  return case when p_action in ('clock_in','lunch_end','meal_end') then 'clock_in'::public.punch_event_type
    else 'clock_out'::public.punch_event_type end;
end;
$$;
revoke all on function public.validate_punch_action(uuid,uuid,date,text) from public,anon,authenticated;

-- Extend the hardened GPS and QR RPCs; their authentication, locks, geofence,
-- cooldown, QR single-use and audit code remain in the same transaction.
do $migration$
declare v_sql text; v_signature text; v_name text; v_anchor text;
begin
  foreach v_signature in array array[
    'public.record_gps_punch(uuid,uuid,timestamptz,text,numeric,numeric,numeric,boolean)',
    'public.record_qr_punch(uuid,uuid,text,uuid)'
  ] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_sql;
    v_name := case when v_signature like '%gps%' then 'record_gps_punch' else 'record_qr_punch' end;
    v_sql := replace(v_sql,'FUNCTION public.'||v_name||'(', 'FUNCTION public.'||v_name||'_action(');
    v_sql := regexp_replace(v_sql,'\)\n RETURNS uuid', ', p_action text)
 RETURNS uuid');
    v_anchor := 'v_event_type := coalesce(v_event_type, ''clock_in''::public.punch_event_type);';
    if position(v_anchor in v_sql)=0 then raise exception 'punch action anchor missing'; end if;
    v_sql := replace(v_sql,v_anchor,'v_event_type := public.validate_punch_action(p_tenant_id,v_employee_id,v_work_date,p_action);');
    -- Explicit events have no alternating sequence limit.
    v_sql := replace(v_sql,'having count(ss.id) * 2 <= (','having false and count(ss.id) * 2 <= (');
    v_sql := replace(v_sql,'if v_punch_id is not null then return v_punch_id; end if;',
      'if v_punch_id is not null then
        if (select pr.punch_action from public.punch_records pr where pr.id=v_punch_id) is distinct from p_action then
          raise exception ''idempotency action mismatch'' using errcode=''22023'';
        end if;
        return v_punch_id;
      end if;');
    v_sql := replace(v_sql,'work_date, event_type, client_occurred_at','work_date, event_type, punch_action, client_occurred_at');
    v_sql := replace(v_sql,'v_work_date, v_event_type, p_client_occurred_at','v_work_date, v_event_type, p_action, p_client_occurred_at');
    v_sql := replace(v_sql,'v_work_date, v_event_type, statement_timestamp()','v_work_date, v_event_type, p_action, statement_timestamp()');
    v_sql := replace(v_sql,'''event_type'', v_event_type,','''event_type'', v_event_type, ''punch_action'', p_action,');
    v_sql := replace(v_sql,'select pr.event_type from public.active_punch_records pr',
      'select case when pr.punch_action in (''meal_morning'',''meal_afternoon'',''meal_end'') then ''clock_in''::public.punch_event_type else pr.event_type end from public.active_punch_records pr');
    execute v_sql;
  end loop;
end;
$migration$;
revoke all on function public.record_gps_punch_action(uuid,uuid,timestamptz,text,numeric,numeric,numeric,boolean,text),
  public.record_qr_punch_action(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.record_gps_punch_action(uuid,uuid,timestamptz,text,numeric,numeric,numeric,boolean,text),
  public.record_qr_punch_action(uuid,uuid,text,uuid,text) to authenticated;

-- Corrections also carry intent and retain the existing manager approval flow.
do $migration$
declare v_sql text;
begin
  select pg_get_functiondef('public.request_punch_correction(uuid,date,public.punch_event_type,timestamptz,text,text,uuid)'::regprocedure) into v_sql;
  v_sql := replace(v_sql,'FUNCTION public.request_punch_correction(', 'FUNCTION public.request_punch_correction_action(');
  v_sql := regexp_replace(v_sql,'\)\n RETURNS uuid', ', p_action text)
 RETURNS uuid');
  v_sql := replace(v_sql,'begin', 'begin
    if p_action is null or p_action not in (''clock_in'',''lunch_start'',''lunch_end'',''meal_morning'',''meal_afternoon'',''meal_end'',''clock_out'') then
      raise exception ''invalid punch action'' using errcode=''22023'';
    end if;
    if p_event_type <> (case when p_action in (''clock_in'',''lunch_end'',''meal_end'') then ''clock_in''::public.punch_event_type else ''clock_out''::public.punch_event_type end) then
      raise exception ''punch action event mismatch'' using errcode=''22023'';
    end if;');
  v_sql := replace(v_sql,'proposed_event_type, proposed_occurred_at','proposed_event_type, punch_action, proposed_occurred_at');
  v_sql := replace(v_sql,'p_event_type, p_proposed_occurred_at','p_event_type, p_action, p_proposed_occurred_at');
  execute v_sql;
end;
$migration$;
revoke all on function public.request_punch_correction_action(uuid,date,public.punch_event_type,timestamptz,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.request_punch_correction_action(uuid,date,public.punch_event_type,timestamptz,text,text,uuid,text) to authenticated;

-- Meal events stay visible as evidence, but never participate in in/out pairing.
create view public.attendance_punch_records as select * from public.active_punch_records
where punch_action is null or punch_action not in ('meal_morning','meal_afternoon','meal_end');
revoke all on public.attendance_punch_records from public,anon,authenticated;
create view public.attendance_correction_requests as select * from public.punch_correction_requests
where punch_action is null or punch_action not in ('meal_morning','meal_afternoon','meal_end');
revoke all on public.attendance_correction_requests from public,anon,authenticated;

-- Returns actual meal intervals including approved corrections. The next
-- explicit action interrupts a meal; an uninterrupted meal ends at +30 minutes.
create function public.meal_break_intervals(p_tenant_id uuid,p_employee_id uuid,p_work_date date)
returns table(starts_at timestamptz,ends_at timestamptz) language sql stable security definer set search_path='' as $$
  with events as (
    select punch_action,occurred_at from public.active_punch_records
      where tenant_id=p_tenant_id and employee_id=p_employee_id and work_date=p_work_date
    union all
    select r.punch_action,r.proposed_occurred_at from public.punch_correction_requests r
      join public.punch_correction_decisions d on d.tenant_id=r.tenant_id and d.correction_request_id=r.id and d.decision='approved'
      where r.tenant_id=p_tenant_id and r.employee_id=p_employee_id and r.work_date=p_work_date
        and r.punch_action in ('meal_morning','meal_afternoon','meal_end')
        and not exists(select 1 from public.active_punch_records pr where pr.tenant_id=r.tenant_id
          and pr.employee_id=r.employee_id and pr.work_date=r.work_date and pr.punch_action=r.punch_action)
  ), ordered as (
    select *,lead(occurred_at) over(order by occurred_at,punch_action) next_at from events
  ) select occurred_at,least(occurred_at+interval '30 minutes',coalesce(next_at,occurred_at+interval '30 minutes'),statement_timestamp())
  from ordered where punch_action in ('meal_morning','meal_afternoon');
$$;
revoke all on function public.meal_break_intervals(uuid,uuid,date) from public,anon,authenticated;

do $migration$
declare v_sql text; v_anchor text;
begin
  select pg_get_functiondef('public.calculate_attendance_v1(uuid,date,date)'::regprocedure) into v_sql;
  v_sql := replace(v_sql,'from public.active_punch_records','from public.attendance_punch_records');
  v_sql := replace(v_sql,'from public.punch_correction_requests','from public.attendance_correction_requests');
  v_sql := replace(v_sql,'pr.event_type,pr.occurred_at','pr.event_type,pr.occurred_at,pr.punch_action');
  v_sql := replace(v_sql,'r.proposed_event_type,r.proposed_occurred_at','r.proposed_event_type,r.proposed_occurred_at,r.punch_action');
  -- Match explicit boundaries to their intended segment, so a missing first
  -- clock-in cannot turn the lunch-end punch into a morning clock-in.
  v_anchor := 'row_number() over(partition by event_type order by occurred_at,coalesce(id,correction_id)) rn';
  if position(v_anchor in v_sql)=0 then raise exception 'attendance ranking anchor missing'; end if;
  v_sql := replace(v_sql,v_anchor,'case when punch_action in (''clock_in'',''lunch_start'') then 1
    when punch_action in (''lunch_end'',''clock_out'') then v_segment_count
    else row_number() over(partition by event_type order by occurred_at,coalesce(id,correction_id)) end rn');
  -- Include approved corrections only where that explicit boundary is absent.
  v_sql := replace(v_sql,'and pr.event_type=r.proposed_event_type)<v_segment_count',
    'and pr.event_type=r.proposed_event_type and (r.punch_action is null or pr.punch_action=r.punch_action))
      <case when r.punch_action is null then v_segment_count else 1 end');
  v_anchor := '      v_late:=case';
  if position(v_anchor in v_sql)=0 then raise exception 'meal deduction anchor missing'; end if;
  v_sql := replace(v_sql,v_anchor,'      if v_in_at is not null and v_out_at is not null then
        v_actual:=greatest(0,v_actual-coalesce((select floor(sum(greatest(0,extract(epoch from
          (least(b.ends_at,v_out_at)-greatest(b.starts_at,v_in_at)))))/60)::integer
          from public.meal_break_intervals(p_tenant_id,v_item.employee_id,v_item.work_date) b),0));
      end if;
      v_late:=case');
  -- Explicit records reflect actual work beyond the schedule instead of capping at 8h.
  v_sql := replace(v_sql,'least(v_out_at,v_scheduled_end)-greatest(v_in_at,v_scheduled_start)',
    'case when exists(select 1 from public.attendance_punch_records pr where pr.tenant_id=p_tenant_id
      and pr.employee_id=v_item.employee_id and pr.work_date=v_item.work_date and pr.punch_action is not null)
      then v_out_at-v_in_at else least(v_out_at,v_scheduled_end)-greatest(v_in_at,v_scheduled_start) end');
  execute v_sql;
end;
$migration$;
commit;
