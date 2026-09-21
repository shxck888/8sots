begin;

create table public.annual_leave_policy_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  effective_from date not null,
  standard_day_minutes integer not null check (standard_day_minutes between 60 and 720),
  allocation_method text not null default 'anniversary' check (allocation_method = 'anniversary'),
  unused_leave_treatment text not null default 'cash_out' check (unused_leave_treatment = 'cash_out'),
  statutory_tiers jsonb not null,
  source_note text not null check (char_length(trim(source_note)) between 5 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, effective_from),
  check (jsonb_typeof(statutory_tiers) = 'array')
);

create table public.annual_leave_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null,
  policy_version_id uuid not null,
  service_milestone_months integer not null check (service_milestone_months >= 6),
  granted_days integer not null check (granted_days between 1 and 30),
  granted_minutes integer not null check (granted_minutes > 0),
  period_start date not null,
  period_end_exclusive date not null,
  settlement_status text not null default 'not_due' check (settlement_status in ('not_due','pending','settled')),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, service_milestone_months),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete restrict,
  foreign key (tenant_id, policy_version_id) references public.annual_leave_policy_versions(tenant_id, id) on delete restrict,
  check (period_end_exclusive > period_start)
);

create table public.annual_leave_usages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null,
  grant_id uuid not null,
  work_request_id uuid not null,
  used_minutes integer not null check (used_minutes > 0),
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (grant_id, work_request_id),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete restrict,
  foreign key (tenant_id, grant_id) references public.annual_leave_grants(tenant_id, id) on delete restrict,
  foreign key (tenant_id, work_request_id) references public.work_requests(tenant_id, id) on delete restrict
);

create table public.annual_leave_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null,
  grant_id uuid not null,
  adjustment_minutes integer not null check (adjustment_minutes <> 0),
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete restrict,
  foreign key (tenant_id, grant_id) references public.annual_leave_grants(tenant_id, id) on delete restrict
);

create index annual_leave_policy_effective_idx on public.annual_leave_policy_versions (tenant_id, effective_from desc, created_at desc);
create index annual_leave_grants_employee_period_idx on public.annual_leave_grants (tenant_id, employee_id, period_start, period_end_exclusive);
create index annual_leave_usages_employee_idx on public.annual_leave_usages (tenant_id, employee_id, created_at);

alter table public.annual_leave_policy_versions enable row level security;
alter table public.annual_leave_grants enable row level security;
alter table public.annual_leave_usages enable row level security;
alter table public.annual_leave_adjustments enable row level security;

create function public.guard_annual_leave_policy_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'annual leave policy versions are immutable; create a new effective date' using errcode = '55000';
end $$;
create trigger annual_leave_policy_immutable before update or delete on public.annual_leave_policy_versions
  for each row execute function public.guard_annual_leave_policy_version();

create policy annual_leave_policy_manager_read on public.annual_leave_policy_versions for select to authenticated
  using (public.current_user_has_permission(tenant_id, 'request.manage'));
create policy annual_leave_grants_manager_or_self on public.annual_leave_grants for select to authenticated
  using (public.current_user_has_permission(tenant_id, 'request.manage') or employee_id in (
    select e.id from public.employees e where e.tenant_id = annual_leave_grants.tenant_id and e.auth_user_id = (select auth.uid())
  ));
create policy annual_leave_usages_manager_or_self on public.annual_leave_usages for select to authenticated
  using (public.current_user_has_permission(tenant_id, 'request.manage') or employee_id in (
    select e.id from public.employees e where e.tenant_id = annual_leave_usages.tenant_id and e.auth_user_id = (select auth.uid())
  ));
create policy annual_leave_adjustments_manager_or_self on public.annual_leave_adjustments for select to authenticated
  using (public.current_user_has_permission(tenant_id, 'request.manage') or employee_id in (
    select e.id from public.employees e where e.tenant_id = annual_leave_adjustments.tenant_id and e.auth_user_id = (select auth.uid())
  ));

revoke all privileges on table public.annual_leave_policy_versions, public.annual_leave_grants,
  public.annual_leave_usages, public.annual_leave_adjustments from anon, authenticated;
grant select on table public.annual_leave_policy_versions, public.annual_leave_grants,
  public.annual_leave_usages, public.annual_leave_adjustments to authenticated;

create function public.annual_leave_statutory_tiers()
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_array(
    jsonb_build_object('minimum_service_months',6,'maximum_service_months',11,'days',3),
    jsonb_build_object('minimum_service_months',12,'maximum_service_months',23,'days',7),
    jsonb_build_object('minimum_service_months',24,'maximum_service_months',35,'days',10),
    jsonb_build_object('minimum_service_months',36,'maximum_service_months',59,'days',14),
    jsonb_build_object('minimum_service_months',60,'maximum_service_months',119,'days',15),
    jsonb_build_object('minimum_service_months',120,'maximum_service_months',null,'days_formula','least(30, completed_years + 6)')
  )
$$;

create function public.annual_leave_days_for_milestone(p_service_milestone_months integer)
returns integer language sql immutable set search_path = '' as $$
  select case
    when p_service_milestone_months = 6 then 3
    when p_service_milestone_months between 12 and 23 then 7
    when p_service_milestone_months between 24 and 35 then 10
    when p_service_milestone_months between 36 and 59 then 14
    when p_service_milestone_months between 60 and 119 then 15
    when p_service_milestone_months >= 120 and p_service_milestone_months % 12 = 0
      then least(30, p_service_milestone_months / 12 + 6)
    else 0 end
$$;

create function public.save_annual_leave_policy(
  p_tenant_id uuid, p_effective_from date, p_standard_day_minutes integer, p_source_note text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_annual_leave_type uuid;
begin
  if not public.current_user_has_permission(p_tenant_id, 'request.manage') then
    raise exception 'request.manage permission required' using errcode = '42501';
  end if;
  if p_effective_from is null or p_standard_day_minutes not between 60 and 720
    or p_source_note is null or char_length(trim(p_source_note)) not between 5 and 500
  then raise exception 'invalid annual leave policy' using errcode = '22023'; end if;
  select id into v_annual_leave_type from public.leave_types where tenant_id = p_tenant_id and code = 'ANNUAL' and is_active;
  if v_annual_leave_type is null then raise exception 'active ANNUAL leave type required' using errcode = '23514'; end if;
  insert into public.annual_leave_policy_versions(
    tenant_id,effective_from,standard_day_minutes,statutory_tiers,source_note,created_by
  ) values (
    p_tenant_id,p_effective_from,p_standard_day_minutes,public.annual_leave_statutory_tiers(),trim(p_source_note),auth.uid()
  ) returning id into v_id;
  if exists(select 1 from public.leave_pay_rule_versions where tenant_id=p_tenant_id and leave_type_id=v_annual_leave_type and effective_from=p_effective_from and paid_ratio_ppm<>1000000) then
    raise exception 'annual leave pay ratio must be 100 percent' using errcode = '23514';
  end if;
  insert into public.leave_pay_rule_versions(tenant_id,leave_type_id,effective_from,paid_ratio_ppm,note,created_by)
  values(p_tenant_id,v_annual_leave_type,p_effective_from,1000000,'法定特別休假工資照給',auth.uid())
  on conflict(tenant_id,leave_type_id,effective_from) do nothing;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'annual_leave.policy_created','annual_leave_policy',v_id::text,
    jsonb_build_object('effective_from',p_effective_from,'standard_day_minutes',p_standard_day_minutes,'allocation_method','anniversary'));
  return v_id;
end $$;

create function public.sync_employee_annual_leave(p_tenant_id uuid,p_employee_id uuid,p_as_of date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_employee public.employees%rowtype; v_policy public.annual_leave_policy_versions%rowtype;
  v_years integer; v_milestone integer; v_days integer; v_start date; v_end date;
  v_grant_id uuid; v_inserted boolean := false; v_remaining integer; v_user_id uuid;
begin
  if p_as_of is null then raise exception 'as-of date required' using errcode='22023'; end if;
  select * into v_employee from public.employees where tenant_id=p_tenant_id and id=p_employee_id;
  if v_employee.id is null or v_employee.hire_date>p_as_of then return null; end if;
  select * into v_policy from public.annual_leave_policy_versions where tenant_id=p_tenant_id and effective_from<=p_as_of
    order by effective_from desc,created_at desc,id desc limit 1;
  if v_policy.id is null then return null; end if;

  if p_as_of >= (v_employee.hire_date + interval '6 months')::date
    and p_as_of < (v_employee.hire_date + interval '1 year')::date then
    v_milestone:=6; v_start:=(v_employee.hire_date+interval '6 months')::date;
    v_end:=(v_employee.hire_date+interval '1 year')::date;
  elsif p_as_of >= (v_employee.hire_date + interval '1 year')::date then
    v_years:=extract(year from age(p_as_of,v_employee.hire_date))::integer;
    v_milestone:=v_years*12; v_start:=(v_employee.hire_date+make_interval(years=>v_years))::date;
    v_end:=(v_employee.hire_date+make_interval(years=>v_years+1))::date;
  else return null; end if;
  v_days:=public.annual_leave_days_for_milestone(v_milestone);
  if v_days<=0 then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':annual-leave:'||p_employee_id::text,0));
  insert into public.annual_leave_grants(
    tenant_id,employee_id,policy_version_id,service_milestone_months,granted_days,granted_minutes,period_start,period_end_exclusive
  ) values (
    p_tenant_id,p_employee_id,v_policy.id,v_milestone,v_days,v_days*v_policy.standard_day_minutes,v_start,v_end
  ) on conflict(tenant_id,employee_id,service_milestone_months) do nothing returning id into v_grant_id;
  v_inserted:=v_grant_id is not null;
  if not v_inserted then select id into v_grant_id from public.annual_leave_grants
    where tenant_id=p_tenant_id and employee_id=p_employee_id and service_milestone_months=v_milestone; end if;

  update public.annual_leave_grants g set settlement_status=case when totals.remaining_minutes>0 then 'pending' else 'settled' end
  from (select old.id,old.granted_minutes
      +coalesce((select sum(a.adjustment_minutes) from public.annual_leave_adjustments a where a.grant_id=old.id),0)
      -coalesce((select sum(u.used_minutes) from public.annual_leave_usages u where u.grant_id=old.id),0) remaining_minutes
    from public.annual_leave_grants old where old.tenant_id=p_tenant_id and old.employee_id=p_employee_id and old.period_end_exclusive<=p_as_of) totals
  where g.id=totals.id and g.settlement_status='not_due';

  if v_inserted then
    select auth_user_id into v_user_id from public.employees where tenant_id=p_tenant_id and id=p_employee_id;
    perform public.enqueue_notification(p_tenant_id,v_user_id,'request','已取得法定特休',
      '依到職年資取得 '||v_days::text||' 天特休，可使用至 '||(v_end-1)::text||'。',
      '/requests','annual_leave_grant',v_grant_id::text,'annual-leave:granted:'||v_grant_id::text);
    insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
    values(p_tenant_id,auth.uid(),'annual_leave.granted','annual_leave_grant',v_grant_id::text,
      jsonb_build_object('employee_id',p_employee_id,'milestone_months',v_milestone,'days',v_days,'period_start',v_start,'period_end_exclusive',v_end));
  end if;
  return v_grant_id;
end $$;

create function public.sync_annual_leave_grants(p_tenant_id uuid,p_as_of date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_employee_id uuid; v_count integer:=0; v_before uuid; v_after uuid;
begin
  if not public.current_user_has_permission(p_tenant_id,'request.manage') then
    raise exception 'request.manage permission required' using errcode='42501';
  end if;
  for v_employee_id in select id from public.employees where tenant_id=p_tenant_id and status in ('active','on_leave')
  loop
    select id into v_before from public.annual_leave_grants where tenant_id=p_tenant_id and employee_id=v_employee_id
      order by service_milestone_months desc limit 1;
    v_after:=public.sync_employee_annual_leave(p_tenant_id,v_employee_id,p_as_of);
    if v_after is not null and v_after is distinct from v_before then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end $$;

create function public.get_annual_leave_balance(p_tenant_id uuid,p_employee_id uuid,p_as_of date default current_date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_self boolean; v_grant uuid; v_available integer; v_pending integer; v_used integer; v_result jsonb;
  v_configured boolean; v_standard_day_minutes integer;
begin
  select exists(select 1 from public.employees e where e.tenant_id=p_tenant_id and e.id=p_employee_id and e.auth_user_id=auth.uid()) into v_self;
  if not v_self and not public.current_user_has_permission(p_tenant_id,'request.manage') then
    raise exception 'employee self or request.manage required' using errcode='42501';
  end if;
  v_grant:=public.sync_employee_annual_leave(p_tenant_id,p_employee_id,p_as_of);
  select p.id is not null,p.standard_day_minutes into v_configured,v_standard_day_minutes
  from (select 1) seed left join lateral (
    select id,standard_day_minutes from public.annual_leave_policy_versions
    where tenant_id=p_tenant_id and effective_from<=p_as_of
    order by effective_from desc,created_at desc,id desc limit 1
  ) p on true;
  with grant_totals as (
    select g.id,g.granted_minutes,
      coalesce((select sum(a.adjustment_minutes) from public.annual_leave_adjustments a where a.grant_id=g.id),0) adjustment_minutes,
      coalesce((select sum(u.used_minutes) from public.annual_leave_usages u where u.grant_id=g.id),0) used_minutes
    from public.annual_leave_grants g
    where g.tenant_id=p_tenant_id and g.employee_id=p_employee_id
      and g.period_start<=p_as_of and g.period_end_exclusive>p_as_of
  )
  select coalesce(sum(granted_minutes+adjustment_minutes-used_minutes),0),coalesce(sum(used_minutes),0)
    into v_available,v_used from grant_totals;
  select coalesce(sum(wr.requested_minutes),0) into v_pending from public.work_requests wr
  join public.leave_types lt on lt.tenant_id=wr.tenant_id and lt.id=wr.leave_type_id and lt.code='ANNUAL'
  where wr.tenant_id=p_tenant_id and wr.employee_id=p_employee_id
    and not exists(select 1 from public.work_request_decisions d where d.work_request_id=wr.id)
    and not exists(select 1 from public.work_request_withdrawals w where w.work_request_id=wr.id);
  with grant_rows as (
    select g.id,g.granted_days,g.granted_minutes,g.period_start,g.period_end_exclusive,
      g.service_milestone_months,g.settlement_status,
      coalesce((select sum(u.used_minutes) from public.annual_leave_usages u where u.grant_id=g.id),0) used_minutes,
      coalesce((select sum(a.adjustment_minutes) from public.annual_leave_adjustments a where a.grant_id=g.id),0) adjustment_minutes
    from public.annual_leave_grants g
    where g.tenant_id=p_tenant_id and g.employee_id=p_employee_id
  )
  select jsonb_build_object('configured',v_configured,'standard_day_minutes',coalesce(v_standard_day_minutes,480),
    'available_minutes',v_available,'pending_minutes',v_pending,'used_minutes',v_used,
    'grants',coalesce((select jsonb_agg(jsonb_build_object(
      'id',gr.id,'granted_days',gr.granted_days,'granted_minutes',gr.granted_minutes,
      'period_start',gr.period_start,'period_end_exclusive',gr.period_end_exclusive,
      'service_milestone_months',gr.service_milestone_months,'settlement_status',gr.settlement_status,
      'used_minutes',gr.used_minutes,'adjustment_minutes',gr.adjustment_minutes
    ) order by gr.period_start desc) from grant_rows gr),'[]'::jsonb)) into v_result;
  return v_result;
end $$;

create function public.get_my_annual_leave_balance(p_as_of date default current_date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_employee uuid;
begin
  select e.tenant_id,e.id into v_tenant,v_employee from public.employees e
  join public.tenant_memberships tm on tm.tenant_id=e.tenant_id and tm.user_id=e.auth_user_id and tm.status='active'
  where e.auth_user_id=auth.uid() and e.status in ('active','on_leave') order by e.created_at,e.id limit 1;
  if v_employee is null then return jsonb_build_object('configured',false,'standard_day_minutes',480,'available_minutes',0,'pending_minutes',0,'used_minutes',0,'grants','[]'::jsonb); end if;
  return public.get_annual_leave_balance(v_tenant,v_employee,p_as_of);
end $$;

create function public.allocate_approved_annual_leave()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_request record; v_grant record; v_remaining integer; v_available integer; v_allocate integer; v_leave_date date;
begin
  if new.decision<>'approved' then return new; end if;
  select wr.*,lt.code leave_code into v_request from public.work_requests wr
  join public.leave_types lt on lt.tenant_id=wr.tenant_id and lt.id=wr.leave_type_id
  where wr.tenant_id=new.tenant_id and wr.id=new.work_request_id;
  if v_request.leave_code is distinct from 'ANNUAL' then return new; end if;
  v_leave_date:=(v_request.starts_at at time zone v_request.timezone)::date;
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text||':annual-leave:'||v_request.employee_id::text,0));
  perform public.sync_employee_annual_leave(new.tenant_id,v_request.employee_id,v_leave_date);
  v_remaining:=v_request.requested_minutes;
  for v_grant in
    select g.*,g.granted_minutes
      +coalesce((select sum(a.adjustment_minutes) from public.annual_leave_adjustments a where a.grant_id=g.id),0)
      -coalesce((select sum(u.used_minutes) from public.annual_leave_usages u where u.grant_id=g.id),0) available_minutes
    from public.annual_leave_grants g where g.tenant_id=new.tenant_id and g.employee_id=v_request.employee_id
      and g.period_start<=v_leave_date and g.period_end_exclusive>v_leave_date order by g.period_end_exclusive,g.period_start,g.id
  loop
    v_available:=greatest(v_grant.available_minutes,0); v_allocate:=least(v_remaining,v_available);
    if v_allocate>0 then
      insert into public.annual_leave_usages(tenant_id,employee_id,grant_id,work_request_id,used_minutes)
      values(new.tenant_id,v_request.employee_id,v_grant.id,v_request.id,v_allocate);
      v_remaining:=v_remaining-v_allocate;
    end if;
    exit when v_remaining=0;
  end loop;
  if v_remaining>0 then raise exception 'insufficient annual leave balance' using errcode='23514'; end if;
  return new;
end $$;
create trigger annual_leave_allocate_after_approval after insert on public.work_request_decisions
  for each row execute function public.allocate_approved_annual_leave();

create function public.add_annual_leave_adjustment(
  p_tenant_id uuid,p_grant_id uuid,p_adjustment_minutes integer,p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_grant public.annual_leave_grants%rowtype; v_id uuid; v_balance integer;
begin
  if not public.current_user_has_permission(p_tenant_id,'request.manage') then raise exception 'request.manage permission required' using errcode='42501'; end if;
  if p_adjustment_minutes is null or p_adjustment_minutes=0 or p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then raise exception 'invalid annual leave adjustment' using errcode='22023'; end if;
  select * into v_grant from public.annual_leave_grants where tenant_id=p_tenant_id and id=p_grant_id for update;
  if v_grant.id is null then raise exception 'annual leave grant not found' using errcode='P0002'; end if;
  select v_grant.granted_minutes+coalesce(sum(adjustment_minutes),0)-coalesce((select sum(used_minutes) from public.annual_leave_usages where grant_id=v_grant.id),0)+p_adjustment_minutes
    into v_balance from public.annual_leave_adjustments where grant_id=v_grant.id;
  if v_balance<0 then raise exception 'adjustment would make annual leave negative' using errcode='23514'; end if;
  insert into public.annual_leave_adjustments(tenant_id,employee_id,grant_id,adjustment_minutes,reason,created_by)
  values(p_tenant_id,v_grant.employee_id,v_grant.id,p_adjustment_minutes,trim(p_reason),auth.uid()) returning id into v_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'annual_leave.adjusted','annual_leave_grant',v_grant.id::text,jsonb_build_object('adjustment_id',v_id,'minutes',p_adjustment_minutes,'reason',trim(p_reason)));
  return v_id;
end $$;

-- Statutory annual leave is generated by the ledger, not by the legacy manual entitlement field.
create or replace function public.upsert_leave_entitlement(
  p_tenant_id uuid, p_employee_id uuid, p_leave_type_id uuid, p_entitlement_year integer,
  p_entitled_minutes integer, p_note text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id, 'request.manage') then raise exception 'request.manage permission required' using errcode = '42501'; end if;
  if exists(select 1 from public.leave_types where tenant_id=p_tenant_id and id=p_leave_type_id and code='ANNUAL') then
    raise exception 'annual leave entitlement is system generated from hire date' using errcode='22023';
  end if;
  if p_entitlement_year not between 2000 and 2200 or p_entitled_minutes not between 0 and 527040 then raise exception 'invalid leave entitlement' using errcode = '22023'; end if;
  if not exists (select 1 from public.employees where tenant_id = p_tenant_id and id = p_employee_id)
     or not exists (select 1 from public.leave_types where tenant_id = p_tenant_id and id = p_leave_type_id and is_active) then raise exception 'employee or leave type not found' using errcode = 'P0002'; end if;
  insert into public.leave_entitlements(tenant_id,employee_id,leave_type_id,entitlement_year,entitled_minutes,note,updated_by)
  values(p_tenant_id,p_employee_id,p_leave_type_id,p_entitlement_year,p_entitled_minutes,nullif(trim(p_note),''),auth.uid())
  on conflict(tenant_id,employee_id,leave_type_id,entitlement_year) do update set entitled_minutes=excluded.entitled_minutes,note=excluded.note,updated_by=excluded.updated_by,updated_at=statement_timestamp()
  returning id into v_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'leave_entitlement.upserted','leave_entitlement',v_id::text,jsonb_build_object('employee_id',p_employee_id,'leave_type_id',p_leave_type_id,'entitlement_year',p_entitlement_year,'entitled_minutes',p_entitled_minutes));
  return v_id;
end $$;

revoke all on function public.guard_annual_leave_policy_version(),public.annual_leave_statutory_tiers(),public.annual_leave_days_for_milestone(integer),
  public.save_annual_leave_policy(uuid,date,integer,text),public.sync_employee_annual_leave(uuid,uuid,date),
  public.sync_annual_leave_grants(uuid,date),public.get_annual_leave_balance(uuid,uuid,date),
  public.get_my_annual_leave_balance(date),public.allocate_approved_annual_leave(),
  public.add_annual_leave_adjustment(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.save_annual_leave_policy(uuid,date,integer,text),public.sync_annual_leave_grants(uuid,date),
  public.get_annual_leave_balance(uuid,uuid,date),public.get_my_annual_leave_balance(date),
  public.add_annual_leave_adjustment(uuid,uuid,integer,text) to authenticated;

commit;
