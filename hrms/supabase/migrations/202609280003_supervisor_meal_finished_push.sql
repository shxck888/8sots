begin;

insert into public.permissions(code,description)
values('attendance.break_notify','接收員工吃飯休息滿 30 分鐘的推播提醒')
on conflict(code) do update set description=excluded.description;
insert into public.role_permissions(tenant_id,role_id,permission_id)
select r.tenant_id,r.id,p.id from public.roles r
join public.permissions p on p.code='attendance.break_notify'
where r.code='platform_admin' on conflict(role_id,permission_id) do nothing;

-- Extend the existing audited delegation, with no automatic grants to managers.
do $$ declare v_sql text; v_signature text; v_anchor text := '''payroll.manage'', ''settings.manage'', ''security.audit'''; begin
  foreach v_signature in array array['public.get_employee_admin_permissions(uuid,uuid)',
    'public.set_employee_admin_permissions(uuid,uuid,text[])'] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_sql;
    if position(v_anchor in v_sql)=0 then raise exception 'supervisor permission allowlist anchor missing'; end if;
    execute replace(v_sql,v_anchor,v_anchor||', ''attendance.break_notify''');
  end loop;
end $$;

drop function public.get_current_workspace_context();
create function public.get_current_workspace_context()
returns table(
  user_id uuid,email text,user_metadata jsonb,tenant_id uuid,tenant_name text,employee_id uuid,
  can_manage_employee boolean,can_manage_schedule boolean,can_manage_attendance boolean,
  can_manage_request boolean,can_manage_payroll boolean,can_manage_settings boolean,
  can_read_audit boolean,can_manage_access boolean,can_receive_break_notifications boolean
)
language sql stable security definer set search_path='' as $$
  select u.id,coalesce(u.email,'')::text,coalesce(u.raw_user_meta_data,'{}'::jsonb),
    m.tenant_id,m.tenant_name,e.id,
    coalesce(public.current_user_has_permission(m.tenant_id,'employee.manage'),false),
    coalesce(public.current_user_has_permission(m.tenant_id,'schedule.manage'),false),
    coalesce(public.current_user_has_permission(m.tenant_id,'attendance.manage'),false),
    coalesce(public.current_user_has_permission(m.tenant_id,'request.manage'),false),
    coalesce(public.current_user_has_permission(m.tenant_id,'payroll.manage'),false),
    coalesce(public.current_user_has_permission(m.tenant_id,'settings.manage'),false),
    coalesce(public.current_user_has_permission(m.tenant_id,'security.audit'),false),
    coalesce(public.current_user_has_permission(m.tenant_id,'access.manage'),false),
    coalesce(public.current_user_has_permission(m.tenant_id,'attendance.break_notify'),false)
  from auth.users u
  left join lateral (
    select tm.tenant_id,t.name tenant_name from public.tenant_memberships tm
    join public.tenants t on t.id=tm.tenant_id where tm.user_id=u.id and tm.status='active'
    order by tm.created_at,tm.id limit 1
  ) m on true
  left join lateral (
    select x.id from public.employees x where x.tenant_id=m.tenant_id
      and x.auth_user_id=u.id and x.status='active' order by x.created_at,x.id limit 1
  ) e on true where u.id=(select auth.uid());
$$;
revoke all on function public.get_current_workspace_context() from public,anon,authenticated;
grant execute on function public.get_current_workspace_context() to authenticated;

-- Full administrators may have no employee profile. Subscriptions still belong
-- to an active tenant member, and recipients are authorized again at claim time.
alter table public.employee_push_subscriptions alter column employee_id drop not null;
create or replace function public.save_my_push_subscription(p_tenant_id uuid,p_endpoint text,p_p256dh text,p_auth_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_employee uuid; v_id uuid;
begin
  if not exists(select 1 from public.tenant_memberships tm where tm.tenant_id=p_tenant_id
    and tm.user_id=auth.uid() and tm.status='active') then
    raise exception 'active tenant member required' using errcode='42501';
  end if;
  select e.id into v_employee from public.employees e where e.tenant_id=p_tenant_id
    and e.auth_user_id=auth.uid() and e.status='active';
  if v_employee is null and not public.current_user_has_permission(p_tenant_id,'attendance.break_notify') then
    raise exception 'active linked employee or break notification permission required' using errcode='42501';
  end if;
  if exists(select 1 from public.employee_auth_accounts a where a.tenant_id=p_tenant_id
    and a.auth_user_id=auth.uid() and a.status<>'active') then
    raise exception 'active account required' using errcode='42501';
  end if;
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/' then
    raise exception 'invalid push endpoint' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':push',0));
  if not exists(select 1 from public.employee_push_subscriptions where endpoint=p_endpoint and user_id=auth.uid())
    and (select count(*) from public.employee_push_subscriptions where user_id=auth.uid())>=10 then
    raise exception 'push subscription limit reached' using errcode='55000';
  end if;
  insert into public.employee_push_subscriptions(tenant_id,employee_id,user_id,endpoint,p256dh,auth_key)
  values(p_tenant_id,v_employee,auth.uid(),p_endpoint,p_p256dh,p_auth_key)
  on conflict(endpoint) do update set tenant_id=excluded.tenant_id,employee_id=excluded.employee_id,
    user_id=excluded.user_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key
  where employee_push_subscriptions.user_id=auth.uid() returning id into v_id;
  if v_id is null then raise exception 'subscription belongs to another user' using errcode='42501'; end if;
  return v_id;
end;
$$;

alter table public.meal_push_jobs drop constraint meal_push_jobs_kind_check;
alter table public.meal_push_jobs add constraint meal_push_jobs_kind_check
  check(kind in ('meal_ending','afternoon_start','supervisor_meal_finished'));

-- One job per real start, including the meal chained from a verified lunch end.
-- Do not fabricate an end punch or send reminders for historical corrections.
do $$ declare v_sql text; v_anchor text := '  return new;'; begin
  select pg_get_functiondef('public.queue_meal_push()'::regprocedure) into v_sql;
  if position(v_anchor in v_sql)=0 then raise exception 'meal queue return anchor missing'; end if;
  execute replace(v_sql,v_anchor,'  if new.punch_action in (''meal_morning'',''meal_afternoon'') or new.starts_afternoon_meal then
    insert into public.meal_push_jobs(tenant_id,employee_id,punch_id,kind,due_at,expires_at)
    values(new.tenant_id,new.employee_id,new.id,''supervisor_meal_finished'',
      new.occurred_at+interval ''30 minutes'',new.occurred_at+interval ''40 minutes'');
  end if;
'||v_anchor);
end $$;

-- Keep the old dispatcher from sending an employee payload to supervisors
-- during the database/application rollout window.
do $$ declare v_sql text; v_anchor text := 'where completed_at is null and due_at<=statement_timestamp()'; begin
  select pg_get_functiondef('public.claim_meal_push_jobs()'::regprocedure) into v_sql;
  if position(v_anchor in v_sql)=0 then raise exception 'legacy meal claim selection anchor missing'; end if;
  execute replace(v_sql,v_anchor,'where j.kind<>''supervisor_meal_finished'' and completed_at is null and due_at<=statement_timestamp()');
end $$;

create function public.claim_meal_push_jobs_v2() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  update public.meal_push_jobs j set completed_at=statement_timestamp()
  where j.completed_at is null and (j.expires_at<=statement_timestamp() or exists(
    select 1 from public.punch_records p where p.id=j.punch_id and p.voided_at is not null
  ) or (j.kind in ('meal_ending','supervisor_meal_finished') and exists(
    select 1 from public.active_punch_records p join public.punch_records origin on origin.id=j.punch_id
    where p.tenant_id=j.tenant_id and p.employee_id=j.employee_id and p.work_date=origin.work_date
      and p.occurred_at>origin.occurred_at
      and (j.kind='meal_ending' or p.occurred_at<origin.occurred_at+interval '30 minutes')
  )) or (j.kind='afternoon_start' and exists(
    select 1 from public.active_punch_records p join public.punch_records origin on origin.id=j.punch_id
    where p.tenant_id=j.tenant_id and p.employee_id=j.employee_id and p.work_date=origin.work_date
      and (p.punch_action in ('meal_afternoon','clock_out') or p.starts_afternoon_meal)
  )) or not exists(select 1 from public.employees e where e.tenant_id=j.tenant_id
    and e.id=j.employee_id and e.status='active'));
  with chosen as (
    select j.id from public.meal_push_jobs j where completed_at is null and due_at<=statement_timestamp()
      and expires_at>statement_timestamp() and (lease_until is null or lease_until<statement_timestamp())
      and attempts<3 order by due_at limit 10 for update skip locked
  ), leased as (
    update public.meal_push_jobs j set lease_until=statement_timestamp()+interval '55 seconds',
      lease_id=gen_random_uuid(),attempts=attempts+1 from chosen where j.id=chosen.id returning j.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease_id',j.lease_id,'kind',j.kind,
    'employee_name',e.full_name,'expires_at',j.expires_at,
    'subscriptions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,
      'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key))),'[]'::jsonb)
      from public.employee_push_subscriptions s
      join public.tenant_memberships tm on tm.tenant_id=s.tenant_id and tm.user_id=s.user_id and tm.status='active'
      left join public.employees recipient on recipient.tenant_id=s.tenant_id and recipient.id=s.employee_id
      where s.tenant_id=j.tenant_id and not(s.id=any(j.delivered_subscription_ids))
        and (s.employee_id is null or (recipient.status='active' and recipient.auth_user_id=s.user_id))
        and not exists(select 1 from public.employee_auth_accounts a where a.tenant_id=s.tenant_id
          and a.auth_user_id=s.user_id and a.status<>'active')
        and (case when j.kind='supervisor_meal_finished' then exists(
          select 1 from public.membership_roles mr
          join public.role_permissions rp on rp.tenant_id=mr.tenant_id and rp.role_id=mr.role_id
          join public.permissions p on p.id=rp.permission_id
          where mr.tenant_id=tm.tenant_id and mr.membership_id=tm.id
            and p.code in ('attendance.break_notify','platform.admin')
        ) else s.employee_id=j.employee_id end)))), '[]'::jsonb)
  into v_result from leased j join public.employees e on e.tenant_id=j.tenant_id and e.id=j.employee_id;
  return v_result;
end;
$$;

revoke all on function public.claim_meal_push_jobs_v2() from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.claim_meal_push_jobs_v2() to service_role;
  end if;
end $$;
commit;
