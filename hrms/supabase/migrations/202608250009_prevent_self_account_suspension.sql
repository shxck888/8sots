create or replace function public.set_employee_auth_account_status(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_status public.employee_auth_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.employee_auth_accounts%rowtype;
begin
  if not public.current_user_has_permission(p_tenant_id, 'employee.manage') then
    raise exception 'employee.manage permission required' using errcode = '42501';
  end if;

  select * into v_account from public.employee_auth_accounts
  where tenant_id = p_tenant_id and employee_id = p_employee_id for update;
  if v_account.employee_id is null then raise exception 'employee account not found' using errcode = 'P0002'; end if;
  if v_account.auth_user_id = (select auth.uid()) then
    raise exception 'cannot change own account status' using errcode = '42501';
  end if;

  update public.employee_auth_accounts set status = p_status, updated_at = now()
  where tenant_id = p_tenant_id and employee_id = p_employee_id;
  update public.tenant_memberships set
    status = case when p_status = 'active' then 'active'::public.membership_status else 'suspended'::public.membership_status end,
    updated_at = now()
  where tenant_id = p_tenant_id and user_id = v_account.auth_user_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    p_tenant_id, (select auth.uid()), 'employee.account_status_changed', 'employee', p_employee_id::text,
    jsonb_build_object('status', v_account.status), jsonb_build_object('status', p_status)
  );
end;
$$;

revoke all on function public.set_employee_auth_account_status(uuid,uuid,public.employee_auth_status) from public;
grant execute on function public.set_employee_auth_account_status(uuid,uuid,public.employee_auth_status) to authenticated;
