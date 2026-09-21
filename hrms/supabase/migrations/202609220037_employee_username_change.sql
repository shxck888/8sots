begin;

create or replace function public.change_employee_account_username(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_username text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.employee_auth_accounts%rowtype;
  v_username text := lower(trim(p_username));
begin
  if not public.current_user_has_permission(p_tenant_id, 'employee.manage') then
    raise exception 'employee.manage permission required' using errcode = '42501';
  end if;
  if v_username !~ '^[a-z0-9_]{3,32}$' then
    raise exception 'invalid username' using errcode = '22023';
  end if;

  select * into v_account
  from public.employee_auth_accounts
  where tenant_id = p_tenant_id and employee_id = p_employee_id
  for update;
  if v_account.employee_id is null then
    raise exception 'employee account not found' using errcode = 'P0002';
  end if;
  if v_account.username = v_username then
    return;
  end if;

  update public.employee_auth_accounts
  set username = v_username, updated_at = now()
  where tenant_id = p_tenant_id and employee_id = p_employee_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_tenant_id,
    (select auth.uid()),
    'employee.username_changed',
    'employee',
    p_employee_id::text,
    jsonb_build_object('username', v_account.username),
    jsonb_build_object('username', v_username)
  );
exception
  when unique_violation then
    raise exception 'username already exists' using errcode = '23505';
end;
$$;

revoke all on function public.change_employee_account_username(uuid,uuid,text) from public;
grant execute on function public.change_employee_account_username(uuid,uuid,text) to authenticated;

commit;
