begin;

insert into public.permissions(code,description) values ('settings.manage','管理門市與營運設定') on conflict(code) do nothing;
insert into public.role_permissions(tenant_id,role_id,permission_id)
select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p
where r.code='platform_admin' and p.code='settings.manage' on conflict do nothing;

create table public.workplace_setting_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  effective_from date not null,
  name text not null check(char_length(trim(name)) between 1 and 120),
  address text not null check(char_length(trim(address)) between 1 and 300),
  latitude numeric not null check(latitude between -90 and 90),
  longitude numeric not null check(longitude between -180 and 180),
  radius_m integer not null check(radius_m between 10 and 5000),
  max_accuracy_m integer not null check(max_accuracy_m between 1 and 1000),
  mode text not null check(mode in ('evidence','enforced')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  unique(tenant_id,id)
);
create index workplace_setting_effective_idx on public.workplace_setting_versions(tenant_id,effective_from desc,created_at desc);
alter table public.workplace_setting_versions enable row level security;
create policy workplace_settings_read on public.workplace_setting_versions for select to authenticated
using(public.current_user_has_permission(tenant_id,'settings.manage'));
revoke all on public.workplace_setting_versions from anon,authenticated;
grant select on public.workplace_setting_versions to authenticated;

create function public.save_workplace_settings(p_tenant_id uuid,p_effective_from date,p_name text,p_address text,p_latitude numeric,p_longitude numeric,p_radius_m integer,p_max_accuracy_m integer,p_mode text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id,'settings.manage') then raise exception 'settings.manage permission required' using errcode='42501'; end if;
  insert into public.workplace_setting_versions(tenant_id,effective_from,name,address,latitude,longitude,radius_m,max_accuracy_m,mode,created_by)
  values(p_tenant_id,p_effective_from,trim(p_name),trim(p_address),p_latitude,p_longitude,p_radius_m,p_max_accuracy_m,p_mode,auth.uid()) returning id into v_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'settings.workplace_created','workplace_settings',v_id::text,jsonb_build_object('effective_from',p_effective_from,'mode',p_mode));
  return v_id;
end $$;

alter table public.punch_records add column workplace_setting_version_id uuid,
  add column location_distance_m numeric,
  add constraint punch_workplace_version_fk foreign key(tenant_id,workplace_setting_version_id) references public.workplace_setting_versions(tenant_id,id);

create function public.apply_punch_geofence()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_setting public.workplace_setting_versions%rowtype; v_distance numeric;
begin
  if new.source <> 'web_gps' then return new; end if;
  select s.* into v_setting from public.workplace_setting_versions s
  where s.tenant_id=new.tenant_id and s.effective_from<=new.work_date
  order by s.effective_from desc,s.created_at desc,s.id desc limit 1;
  if v_setting.id is null then return new; end if;
  v_distance := 6371000 * 2 * asin(sqrt(least(1.0,
    power(sin(radians((new.latitude-v_setting.latitude)::double precision)/2),2)
    + cos(radians(v_setting.latitude::double precision))*cos(radians(new.latitude::double precision))
    * power(sin(radians((new.longitude-v_setting.longitude)::double precision)/2),2))));
  new.workplace_setting_version_id:=v_setting.id;
  new.location_distance_m:=round(v_distance,2);
  new.location_verification:=case when new.accuracy_m>v_setting.max_accuracy_m then 'unavailable'::public.punch_location_verification
    when v_distance<=v_setting.radius_m then 'inside_geofence'::public.punch_location_verification
    else 'outside_geofence'::public.punch_location_verification end;
  if v_setting.mode='enforced' and new.location_verification<>'inside_geofence' then
    raise exception 'geofence rejected: outside range or insufficient accuracy' using errcode='22023';
  end if;
  return new;
end $$;
create trigger punch_geofence_before_insert before insert on public.punch_records for each row execute function public.apply_punch_geofence();

-- Existing raw records are never rewritten. Record the verification selected by
-- the trigger, not the old RPC's literal not_configured audit value.
do $$
declare v_sql text;
begin
  select pg_get_functiondef('public.record_gps_punch(uuid,uuid,timestamptz,text,numeric,numeric,numeric,boolean)'::regprocedure) into v_sql;
  if position('''location_verification'', ''not_configured''' in v_sql)=0 then raise exception 'punch audit migration anchor missing'; end if;
  execute replace(v_sql,'''location_verification'', ''not_configured''','''location_verification'', (select pr.location_verification from public.punch_records pr where pr.id=v_punch_id)');
end $$;

create function public.save_payroll_settings(p_tenant_id uuid,p_effective_from date,p_closing_day integer,p_pay_day integer,p_pay_month_offset integer,p_default_basis text,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_version integer;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  if p_effective_from is null or p_closing_day is null or p_closing_day not between 1 and 31
    or p_pay_day is null or p_pay_day not between 1 and 31 or p_pay_month_offset is null or p_pay_month_offset not between 0 and 2
    or p_default_basis is null or p_default_basis not in ('monthly','hourly') then raise exception 'invalid payroll settings' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':payroll-settings',0));
  select coalesce(max(version),0)+1 into v_version from public.payroll_rule_versions where tenant_id=p_tenant_id;
  insert into public.payroll_rule_versions(tenant_id,effective_from,version,rules,source_note,created_by)
  values(p_tenant_id,p_effective_from,v_version,jsonb_build_object('closing_day',p_closing_day,'pay_day',p_pay_day,'pay_month_offset',p_pay_month_offset,'default_basis',p_default_basis),nullif(trim(p_note),''),auth.uid()) returning id into v_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'settings.payroll_created','payroll_rule_version',v_id::text,jsonb_build_object('version',v_version,'effective_from',p_effective_from));
  return v_id;
end $$;

create function public.get_my_punch_policy()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((
    select jsonb_build_object('configured',true,'name',s.name,'address',s.address,'mode',s.mode,
      'radius_m',s.radius_m,'max_accuracy_m',s.max_accuracy_m,'effective_from',s.effective_from)
    from public.tenant_memberships tm join public.workplace_setting_versions s on s.tenant_id=tm.tenant_id
    where tm.user_id=auth.uid() and tm.status='active' and s.effective_from<=current_date
    order by s.effective_from desc,s.created_at desc,s.id desc limit 1
  ),jsonb_build_object('configured',false));
$$;

drop function public.get_current_workspace_context();
create function public.get_current_workspace_context()
returns table(user_id uuid,email text,user_metadata jsonb,tenant_id uuid,tenant_name text,employee_id uuid,can_manage_employee boolean,can_manage_schedule boolean,can_manage_attendance boolean,can_manage_request boolean,can_manage_payroll boolean,can_manage_settings boolean)
language sql stable security definer set search_path='' as $$
select u.id,coalesce(u.email,''),coalesce(u.raw_user_meta_data,'{}'::jsonb),m.tenant_id,m.tenant_name,e.id,
coalesce(public.current_user_has_permission(m.tenant_id,'employee.manage'),false),
coalesce(public.current_user_has_permission(m.tenant_id,'schedule.manage'),false),
coalesce(public.current_user_has_permission(m.tenant_id,'attendance.manage'),false),
coalesce(public.current_user_has_permission(m.tenant_id,'request.manage'),false),
coalesce(public.current_user_has_permission(m.tenant_id,'payroll.manage'),false),
coalesce(public.current_user_has_permission(m.tenant_id,'settings.manage'),false)
from auth.users u left join lateral (
  select tm.tenant_id,t.name tenant_name from public.tenant_memberships tm join public.tenants t on t.id=tm.tenant_id
  where tm.user_id=u.id and tm.status='active' order by tm.created_at,tm.id limit 1
) m on true left join lateral (
  select x.id from public.employees x where x.tenant_id=m.tenant_id and x.auth_user_id=u.id and x.status='active' order by x.created_at,x.id limit 1
) e on true where u.id=auth.uid();
$$;

revoke all on function public.save_workplace_settings(uuid,date,text,text,numeric,numeric,integer,integer,text),public.save_payroll_settings(uuid,date,integer,integer,integer,text,text),public.get_my_punch_policy(),public.get_current_workspace_context(),public.apply_punch_geofence() from public,anon,authenticated;
grant execute on function public.save_workplace_settings(uuid,date,text,text,numeric,numeric,integer,integer,text),public.save_payroll_settings(uuid,date,integer,integer,integer,text,text),public.get_my_punch_policy(),public.get_current_workspace_context() to authenticated;
commit;
