begin;

create function public.record_self_password_change(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.tenant_memberships tm
    join public.membership_roles mr on mr.tenant_id = tm.tenant_id and mr.membership_id = tm.id
    join public.role_permissions rp on rp.tenant_id = tm.tenant_id and rp.role_id = mr.role_id
    join public.permissions p on p.id = rp.permission_id
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and p.code in ('employee.manage','schedule.manage','attendance.manage','request.manage','payroll.manage','settings.manage','security.audit')
  ) then
    raise exception 'administrator membership required' using errcode = '42501';
  end if;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (p_tenant_id, auth.uid(), 'auth.password_changed', 'auth_user', auth.uid()::text);
end;
$$;

revoke all on function public.record_self_password_change(uuid) from public, anon, authenticated;
grant execute on function public.record_self_password_change(uuid) to authenticated;

commit;
