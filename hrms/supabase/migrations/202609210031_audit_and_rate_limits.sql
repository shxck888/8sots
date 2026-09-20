begin;

insert into public.permissions(code,description) values('security.audit','檢視系統稽核紀錄') on conflict(code) do nothing;
insert into public.role_permissions(tenant_id,role_id,permission_id)
select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p
where r.code='platform_admin' and p.code='security.audit' on conflict do nothing;

create function public.get_audit_log_page(p_tenant_id uuid,p_limit integer default 100,p_before timestamptz default null)
returns table(id bigint,actor_user_id uuid,actor_email text,action text,entity_type text,entity_id text,request_id text,before_data jsonb,after_data jsonb,occurred_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.current_user_has_permission(p_tenant_id,'security.audit') then raise exception 'security.audit permission required' using errcode='42501'; end if;
  return query select a.id,a.actor_user_id,coalesce(u.email,''),a.action,a.entity_type,a.entity_id,a.request_id,a.before_data,a.after_data,a.occurred_at
  from public.audit_logs a left join auth.users u on u.id=a.actor_user_id
  where a.tenant_id=p_tenant_id and (p_before is null or a.occurred_at<p_before)
  order by a.occurred_at desc,a.id desc limit least(greatest(coalesce(p_limit,100),1),200);
end $$;

create function public.enforce_submission_rate_limit()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if tg_table_name='punch_records' then
    select count(*) into v_count from public.punch_records where tenant_id=new.tenant_id and employee_id=new.employee_id and created_at>clock_timestamp()-interval '10 minutes';
    if v_count>=20 then raise exception 'punch rate limit exceeded' using errcode='54000'; end if;
  elsif tg_table_name='work_requests' then
    select count(*) into v_count from public.work_requests where tenant_id=new.tenant_id and employee_id=new.employee_id and requested_at>clock_timestamp()-interval '1 day';
    if v_count>=30 then raise exception 'request rate limit exceeded' using errcode='54000'; end if;
  elsif tg_table_name='punch_correction_requests' then
    select count(*) into v_count from public.punch_correction_requests where tenant_id=new.tenant_id and employee_id=new.employee_id and requested_at>clock_timestamp()-interval '1 day';
    if v_count>=30 then raise exception 'correction rate limit exceeded' using errcode='54000'; end if;
  elsif tg_table_name='work_request_attachments' then
    select count(*) into v_count from public.work_request_attachments where tenant_id=new.tenant_id and uploaded_by=new.uploaded_by and created_at>clock_timestamp()-interval '1 day';
    if v_count>=50 then raise exception 'attachment rate limit exceeded' using errcode='54000'; end if;
  end if;
  return new;
end $$;
create trigger punch_submission_rate_limit before insert on public.punch_records for each row execute function public.enforce_submission_rate_limit();
create trigger request_submission_rate_limit before insert on public.work_requests for each row execute function public.enforce_submission_rate_limit();
create trigger correction_submission_rate_limit before insert on public.punch_correction_requests for each row execute function public.enforce_submission_rate_limit();
create trigger attachment_submission_rate_limit before insert on public.work_request_attachments for each row execute function public.enforce_submission_rate_limit();

drop function public.get_current_workspace_context();
create function public.get_current_workspace_context()
returns table(user_id uuid,email text,user_metadata jsonb,tenant_id uuid,tenant_name text,employee_id uuid,can_manage_employee boolean,can_manage_schedule boolean,can_manage_attendance boolean,can_manage_request boolean,can_manage_payroll boolean,can_manage_settings boolean,can_read_audit boolean)
language sql stable security definer set search_path='' as $$
select u.id,coalesce(u.email,''),coalesce(u.raw_user_meta_data,'{}'::jsonb),m.tenant_id,m.tenant_name,e.id,
coalesce(public.current_user_has_permission(m.tenant_id,'employee.manage'),false),
coalesce(public.current_user_has_permission(m.tenant_id,'schedule.manage'),false),
coalesce(public.current_user_has_permission(m.tenant_id,'attendance.manage'),false),
coalesce(public.current_user_has_permission(m.tenant_id,'request.manage'),false),
coalesce(public.current_user_has_permission(m.tenant_id,'payroll.manage'),false),
coalesce(public.current_user_has_permission(m.tenant_id,'settings.manage'),false),
coalesce(public.current_user_has_permission(m.tenant_id,'security.audit'),false)
from auth.users u left join lateral (
  select tm.tenant_id,t.name tenant_name from public.tenant_memberships tm join public.tenants t on t.id=tm.tenant_id
  where tm.user_id=u.id and tm.status='active' order by tm.created_at,tm.id limit 1
) m on true left join lateral (
  select x.id from public.employees x where x.tenant_id=m.tenant_id and x.auth_user_id=u.id and x.status='active' order by x.created_at,x.id limit 1
) e on true where u.id=auth.uid();
$$;

revoke all on function public.get_audit_log_page(uuid,integer,timestamptz),public.enforce_submission_rate_limit(),public.get_current_workspace_context() from public,anon,authenticated;
grant execute on function public.get_audit_log_page(uuid,integer,timestamptz),public.get_current_workspace_context() to authenticated;
commit;
