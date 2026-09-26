begin;
create table public.employee_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  employee_id uuid not null,
  user_id uuid not null references auth.users(id),
  endpoint text not null unique check (char_length(endpoint) between 20 and 2048),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth_key text not null check (char_length(auth_key) between 16 and 100),
  created_at timestamptz not null default statement_timestamp(),
  foreign key(tenant_id,employee_id) references public.employees(tenant_id,id)
);
alter table public.employee_push_subscriptions enable row level security;
create policy push_subscription_self on public.employee_push_subscriptions for select to authenticated
using(user_id=auth.uid() and tenant_id in(select public.current_user_tenant_ids()));
grant select on public.employee_push_subscriptions to authenticated;

create function public.save_my_push_subscription(p_tenant_id uuid,p_endpoint text,p_p256dh text,p_auth_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_employee uuid; v_id uuid;
begin
  select e.id into v_employee from public.employees e
  where e.tenant_id=p_tenant_id and e.auth_user_id=auth.uid() and e.status='active'
    and exists(select 1 from public.tenant_memberships tm where tm.tenant_id=e.tenant_id
      and tm.user_id=auth.uid() and tm.status='active');
  if v_employee is null then raise exception 'active linked employee required' using errcode='42501'; end if;
  -- Match the application allowlist; clients cannot turn the push sender into an SSRF proxy.
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/' then
    raise exception 'invalid push endpoint' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||v_employee::text||':push',0));
  if not exists(select 1 from public.employee_push_subscriptions where endpoint=p_endpoint and user_id=auth.uid())
    and (select count(*) from public.employee_push_subscriptions where user_id=auth.uid())>=10 then
    raise exception 'push subscription limit reached' using errcode='55000';
  end if;
  insert into public.employee_push_subscriptions(tenant_id,employee_id,user_id,endpoint,p256dh,auth_key)
  values(p_tenant_id,v_employee,auth.uid(),p_endpoint,p_p256dh,p_auth_key)
  on conflict(endpoint) do update set tenant_id=excluded.tenant_id,employee_id=excluded.employee_id,
    user_id=excluded.user_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key
  where employee_push_subscriptions.user_id=auth.uid()
  returning id into v_id;
  if v_id is null then raise exception 'subscription belongs to another user' using errcode='42501'; end if;
  return v_id;
end;
$$;
create function public.remove_my_push_subscription(p_endpoint text)
returns void language sql security definer set search_path='' as $$
  delete from public.employee_push_subscriptions where endpoint=p_endpoint and user_id=auth.uid();
$$;
revoke all on function public.save_my_push_subscription(uuid,text,text,text),public.remove_my_push_subscription(text) from public,anon,authenticated;
grant execute on function public.save_my_push_subscription(uuid,text,text,text),public.remove_my_push_subscription(text) to authenticated;

create table public.meal_push_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  employee_id uuid not null,
  punch_id uuid not null references public.punch_records(id),
  kind text not null check(kind in ('meal_ending','afternoon_start')),
  due_at timestamptz not null,
  expires_at timestamptz not null,
  lease_until timestamptz,
  lease_id uuid,
  attempts integer not null default 0,
  delivered_subscription_ids uuid[] not null default array[]::uuid[],
  completed_at timestamptz,
  unique(punch_id,kind),
  foreign key(tenant_id,employee_id) references public.employees(tenant_id,id)
);
alter table public.meal_push_jobs enable row level security;
create index meal_push_jobs_due on public.meal_push_jobs(due_at) where completed_at is null;
create function public.queue_meal_push() returns trigger language plpgsql security definer set search_path='' as $$
declare v_due timestamptz;
begin
  if new.punch_action in ('meal_morning','meal_afternoon') then
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
revoke all on function public.queue_meal_push() from public,anon,authenticated;
create trigger punch_queue_meal_push after insert on public.punch_records for each row execute function public.queue_meal_push();

-- Lease work atomically so concurrent cron invocations cannot send the same job.
create function public.claim_meal_push_jobs() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  update public.meal_push_jobs j set completed_at=statement_timestamp()
  where j.completed_at is null and (j.expires_at<=statement_timestamp() or exists(
    select 1 from public.punch_records p where p.id=j.punch_id and p.voided_at is not null
  ) or (j.kind='meal_ending' and exists(
    select 1 from public.active_punch_records p join public.punch_records origin on origin.id=j.punch_id
    where p.tenant_id=j.tenant_id and p.employee_id=j.employee_id and p.work_date=origin.work_date
      and p.occurred_at>origin.occurred_at
  )) or (j.kind='afternoon_start' and exists(
    select 1 from public.active_punch_records p join public.punch_records origin on origin.id=j.punch_id
    where p.tenant_id=j.tenant_id and p.employee_id=j.employee_id and p.work_date=origin.work_date
      and p.punch_action in ('meal_afternoon','clock_out')
  )));
  with chosen as (
    select j.id from public.meal_push_jobs j where completed_at is null and due_at<=statement_timestamp()
      and expires_at>statement_timestamp() and (lease_until is null or lease_until<statement_timestamp())
      and attempts<3
    order by due_at limit 10 for update skip locked
  ), leased as (
    update public.meal_push_jobs j set lease_until=statement_timestamp()+interval '55 seconds',lease_id=gen_random_uuid(),attempts=attempts+1
    from chosen where j.id=chosen.id returning j.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease_id',j.lease_id,'kind',j.kind,'expires_at',j.expires_at,
    'subscriptions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'keys',
      jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key))),'[]'::jsonb)
      from public.employee_push_subscriptions s join public.employees e on e.tenant_id=s.tenant_id and e.id=s.employee_id
      where s.tenant_id=j.tenant_id and s.employee_id=j.employee_id
        and not(s.id=any(j.delivered_subscription_ids)) and e.status='active' and e.auth_user_id=s.user_id
        and exists(select 1 from public.tenant_memberships tm where tm.tenant_id=s.tenant_id and tm.user_id=s.user_id and tm.status='active')))), '[]'::jsonb)
  into v_result from leased j;
  return v_result;
end;
$$;
create function public.mark_meal_push_delivered(p_job_id uuid,p_lease_id uuid,p_subscription_id uuid)
returns void language sql security definer set search_path='' as $$
  update public.meal_push_jobs set delivered_subscription_ids=array_append(delivered_subscription_ids,p_subscription_id)
  where id=p_job_id and lease_id=p_lease_id and not(p_subscription_id=any(delivered_subscription_ids));
$$;
revoke all on function public.mark_meal_push_delivered(uuid,uuid,uuid) from public,anon,authenticated;
create function public.complete_meal_push_job(p_job_id uuid,p_lease_id uuid)
returns void language sql security definer set search_path='' as $$
  update public.meal_push_jobs set completed_at=statement_timestamp() where id=p_job_id and lease_id=p_lease_id;
$$;
revoke all on function public.claim_meal_push_jobs(),public.complete_meal_push_job(uuid,uuid) from public,anon,authenticated;
-- The service role is present on Supabase; the local PGlite harness has no such role.
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.mark_meal_push_delivered(uuid,uuid,uuid),public.claim_meal_push_jobs(),public.complete_meal_push_job(uuid,uuid) to service_role;
    grant all on public.employee_push_subscriptions,public.meal_push_jobs to service_role;
  end if;
end $$;
commit;
