begin;
-- Capture the rule on the evidence itself; later schedule changes must not
-- retroactively add meal deductions to existing punches or corrections.
alter table public.punch_records add column starts_afternoon_meal boolean not null default false;
alter table public.punch_correction_requests add column starts_afternoon_meal boolean not null default false;
create or replace view public.active_punch_records as select * from public.punch_records where voided_at is null;

create function public.stamp_afternoon_meal() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_shift uuid; v_code text; v_off boolean; v_closed boolean;
begin
  new.starts_afternoon_meal:=false;
  if new.punch_action is distinct from 'lunch_end' then return new; end if;
  if tg_table_name='punch_correction_requests' then
    -- Corrections to days before rollout retain the old explicit meal rule.
    if new.work_date<tg_argv[0]::date then return new; end if;
  end if;
  select sa.shift_id,s.code,sa.is_day_off,sa.is_store_closed
  into v_shift,v_code,v_off,v_closed
  from public.schedule_assignments sa
  join public.schedule_versions sv on sv.tenant_id=sa.tenant_id and sv.id=sa.schedule_version_id
  left join public.shifts s on s.tenant_id=sa.tenant_id and s.id=sa.shift_id
  where sa.tenant_id=new.tenant_id and sa.employee_id=new.employee_id
    and sa.work_date=new.work_date and sv.status='published'
  order by sv.published_at desc nulls last,sv.version desc,sv.id desc limit 1;
  if v_code is distinct from 'WEEKDAY_SPLIT' or v_off or v_closed
    or (select count(*) from public.shift_segments where tenant_id=new.tenant_id and shift_id=v_shift)<>2 then
    return new;
  end if;
  -- A manually recorded (or approved) afternoon meal already satisfies the day.
  if exists(select 1 from public.active_punch_records p where p.tenant_id=new.tenant_id
    and p.employee_id=new.employee_id and p.work_date=new.work_date
    and (p.punch_action='meal_afternoon' or p.starts_afternoon_meal))
    or exists(select 1 from public.punch_correction_requests r
      join public.punch_correction_decisions d on d.tenant_id=r.tenant_id and d.correction_request_id=r.id and d.decision='approved'
      where r.tenant_id=new.tenant_id and r.employee_id=new.employee_id and r.work_date=new.work_date
        and (r.punch_action='meal_afternoon' or r.starts_afternoon_meal)) then return new; end if;
  new.starts_afternoon_meal:=true;
  return new;
end;
$$;
revoke all on function public.stamp_afternoon_meal() from public,anon,authenticated;
create trigger punch_auto_afternoon_meal before insert on public.punch_records
  for each row execute function public.stamp_afternoon_meal();
do $$ begin
  execute format('create trigger correction_auto_afternoon_meal before insert on public.punch_correction_requests for each row execute function public.stamp_afternoon_meal(%L)',
    ((statement_timestamp() at time zone 'Asia/Taipei')::date)::text);
end $$;

-- The existing hardened RPCs call this validator under their employee lock.
create or replace function public.validate_punch_action(p_tenant_id uuid,p_employee_id uuid,p_work_date date,p_action text)
returns public.punch_event_type language plpgsql security definer set search_path='' as $$
declare v_start timestamptz;
begin
  if p_action is null or p_action not in ('clock_in','lunch_start','lunch_end','meal_morning','meal_afternoon','meal_end','clock_out') then
    raise exception 'invalid punch action' using errcode='22023'; end if;
  if p_action='meal_afternoon' and exists(select 1 from public.active_punch_records
    where tenant_id=p_tenant_id and employee_id=p_employee_id and work_date=p_work_date and starts_afternoon_meal) then
    raise exception 'punch_action_once_per_day: afternoon meal already started automatically' using errcode='23505';
  end if;
  select pr.occurred_at into v_start from public.active_punch_records pr
  where pr.tenant_id=p_tenant_id and pr.employee_id=p_employee_id and pr.work_date=p_work_date
    and (pr.punch_action in ('meal_morning','meal_afternoon') or pr.starts_afternoon_meal)
    and pr.occurred_at>statement_timestamp()-interval '30 minutes'
    and not exists(select 1 from public.active_punch_records later where later.tenant_id=pr.tenant_id
      and later.employee_id=pr.employee_id and later.work_date=pr.work_date and later.occurred_at>pr.occurred_at)
  order by pr.occurred_at desc limit 1;
  if p_action='meal_end' and v_start is null then
    raise exception 'no active meal break' using errcode='55000'; end if;
  if p_action in ('meal_morning','meal_afternoon') and v_start is not null then
    raise exception 'meal break already active' using errcode='55000'; end if;
  return case when p_action in ('clock_in','lunch_end','meal_end') then 'clock_in'::public.punch_event_type
    else 'clock_out'::public.punch_event_type end;
end;
$$;

create or replace function public.meal_break_intervals(p_tenant_id uuid,p_employee_id uuid,p_work_date date)
returns table(starts_at timestamptz,ends_at timestamptz) language sql stable security definer set search_path='' as $$
  with events as (
    select punch_action,occurred_at,starts_afternoon_meal from public.active_punch_records
      where tenant_id=p_tenant_id and employee_id=p_employee_id and work_date=p_work_date
    union all
    select r.punch_action,r.proposed_occurred_at,r.starts_afternoon_meal from public.punch_correction_requests r
      join public.punch_correction_decisions d on d.tenant_id=r.tenant_id and d.correction_request_id=r.id and d.decision='approved'
      where r.tenant_id=p_tenant_id and r.employee_id=p_employee_id and r.work_date=p_work_date
        and r.punch_action is not null
        and not exists(select 1 from public.active_punch_records pr where pr.tenant_id=r.tenant_id
          and pr.employee_id=r.employee_id and pr.work_date=r.work_date and pr.punch_action=r.punch_action)
  ), effective_events as (
    select * from events where punch_action is distinct from 'meal_afternoon'
      or not exists(select 1 from events automatic where automatic.starts_afternoon_meal)
  ), ordered as (
    select *,lead(occurred_at) over(order by occurred_at,punch_action) next_at from effective_events
  ) select occurred_at,least(occurred_at+interval '30 minutes',coalesce(next_at,occurred_at+interval '30 minutes'),statement_timestamp())
  from ordered where punch_action in ('meal_morning','meal_afternoon') or starts_afternoon_meal;
$$;

create or replace function public.queue_meal_push() returns trigger language plpgsql security definer set search_path='' as $$
declare v_due timestamptz;
begin
  if new.punch_action in ('meal_morning','meal_afternoon') or new.starts_afternoon_meal then
    insert into public.meal_push_jobs(tenant_id,employee_id,punch_id,kind,due_at,expires_at)
    values(new.tenant_id,new.employee_id,new.id,'meal_ending',new.occurred_at+interval '27 minutes',new.occurred_at+interval '30 minutes');
  elsif new.punch_action in ('clock_in','lunch_end') then
    v_due:=(new.work_date::timestamp+interval '16 hours 30 minutes') at time zone new.timezone;
    if v_due>new.occurred_at and not exists(select 1 from public.meal_push_jobs where tenant_id=new.tenant_id
      and employee_id=new.employee_id and kind='afternoon_start' and due_at=v_due) then
      insert into public.meal_push_jobs(tenant_id,employee_id,punch_id,kind,due_at,expires_at)
      values(new.tenant_id,new.employee_id,new.id,'afternoon_start',v_due,v_due+interval '10 minutes');
    end if;
  end if;
  return new;
end;
$$;
-- Cancel the clock-in's old afternoon-start reminder once lunch-end has
-- already started the meal. The origin still supports void/interrupt handling.
do $$ declare v_sql text; v_anchor text; begin
  select pg_get_functiondef('public.claim_meal_push_jobs()'::regprocedure) into v_sql;
  v_anchor:='and p.punch_action in (''meal_afternoon'',''clock_out'')';
  if position(v_anchor in v_sql)=0 then raise exception 'meal push cancellation anchor missing'; end if;
  execute replace(v_sql,v_anchor,'and (p.punch_action in (''meal_afternoon'',''clock_out'') or p.starts_afternoon_meal)');
end $$;
commit;
