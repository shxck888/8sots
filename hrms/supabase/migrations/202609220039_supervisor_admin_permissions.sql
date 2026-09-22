begin;

insert into public.permissions (code, description)
values ('access.manage', '授予或撤銷員工的後台管理權限')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from public.roles r
join public.permissions p on p.code = 'access.manage'
where r.code = 'platform_admin'
on conflict (role_id, permission_id) do nothing;

create function public.get_employee_admin_permissions(p_tenant_id uuid, p_employee_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
  v_account_status text;
  v_membership_id uuid;
  v_is_platform_admin boolean := false;
  v_permissions text[] := array[]::text[];
begin
  if not public.current_user_has_permission(p_tenant_id, 'access.manage') then
    raise exception 'access.manage permission required' using errcode = '42501';
  end if;

  select e.auth_user_id, a.status::text, tm.id
  into v_auth_user_id, v_account_status, v_membership_id
  from public.employees e
  left join public.employee_auth_accounts a
    on a.tenant_id = e.tenant_id and a.employee_id = e.id
  left join public.tenant_memberships tm
    on tm.tenant_id = e.tenant_id and tm.user_id = e.auth_user_id
  where e.tenant_id = p_tenant_id and e.id = p_employee_id;

  if not found then raise exception 'employee not found' using errcode = 'P0002'; end if;

  if v_auth_user_id is null or v_membership_id is null or v_account_status is null then
    return jsonb_build_object(
      'account_linked', false, 'account_status', null, 'is_self', false,
      'is_platform_admin', false, 'permissions', '[]'::jsonb
    );
  end if;

  select exists (
    select 1
    from public.membership_roles mr
    join public.role_permissions rp on rp.tenant_id = mr.tenant_id and rp.role_id = mr.role_id
    join public.permissions p on p.id = rp.permission_id
    where mr.tenant_id = p_tenant_id and mr.membership_id = v_membership_id and p.code = 'platform.admin'
  ) into v_is_platform_admin;

  select coalesce(array_agg(distinct p.code order by p.code), array[]::text[])
  into v_permissions
  from public.membership_roles mr
  join public.role_permissions rp on rp.tenant_id = mr.tenant_id and rp.role_id = mr.role_id
  join public.permissions p on p.id = rp.permission_id
  where mr.tenant_id = p_tenant_id
    and mr.membership_id = v_membership_id
    and p.code = any(array[
      'employee.manage', 'schedule.manage', 'attendance.manage', 'request.manage',
      'payroll.manage', 'settings.manage', 'security.audit'
    ]::text[]);

  return jsonb_build_object(
    'account_linked', true,
    'account_status', v_account_status,
    'is_self', v_auth_user_id = (select auth.uid()),
    'is_platform_admin', v_is_platform_admin,
    'permissions', to_jsonb(v_permissions)
  );
end;
$$;

create function public.set_employee_admin_permissions(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_permission_codes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed constant text[] := array[
    'employee.manage', 'schedule.manage', 'attendance.manage', 'request.manage',
    'payroll.manage', 'settings.manage', 'security.audit'
  ]::text[];
  v_requested text[];
  v_auth_user_id uuid;
  v_account_status text;
  v_employee_name text;
  v_membership_id uuid;
  v_role_id uuid;
  v_role_code text;
  v_is_platform_admin boolean;
  v_before text[] := array[]::text[];
begin
  if not public.current_user_has_permission(p_tenant_id, 'access.manage') then
    raise exception 'access.manage permission required' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct code order by code), array[]::text[])
  into v_requested
  from unnest(coalesce(p_permission_codes, array[]::text[])) as code;

  if exists (select 1 from unnest(v_requested) code where not code = any(v_allowed)) then
    raise exception 'invalid admin permission code' using errcode = '22023';
  end if;

  select e.auth_user_id, e.full_name, tm.id, a.status::text
  into v_auth_user_id, v_employee_name, v_membership_id, v_account_status
  from public.employees e
  left join public.employee_auth_accounts a on a.tenant_id = e.tenant_id and a.employee_id = e.id
  left join public.tenant_memberships tm on tm.tenant_id = e.tenant_id and tm.user_id = e.auth_user_id
  where e.tenant_id = p_tenant_id and e.id = p_employee_id
  for update of e;

  if not found then raise exception 'employee not found' using errcode = 'P0002'; end if;
  if v_auth_user_id is null or v_membership_id is null or v_account_status is null then
    raise exception 'employee account not linked' using errcode = 'P0002';
  end if;
  if v_auth_user_id = (select auth.uid()) then
    raise exception 'cannot change own admin permissions' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.membership_roles mr
    join public.role_permissions rp on rp.tenant_id = mr.tenant_id and rp.role_id = mr.role_id
    join public.permissions p on p.id = rp.permission_id
    where mr.tenant_id = p_tenant_id and mr.membership_id = v_membership_id and p.code = 'platform.admin'
  ) into v_is_platform_admin;
  if v_is_platform_admin then
    raise exception 'platform administrator permissions cannot be changed here' using errcode = '42501';
  end if;

  perform 1 from public.tenant_memberships tm
  where tm.tenant_id = p_tenant_id and tm.id = v_membership_id
  for update;

  select coalesce(array_agg(distinct p.code order by p.code), array[]::text[])
  into v_before
  from public.membership_roles mr
  join public.role_permissions rp on rp.tenant_id = mr.tenant_id and rp.role_id = mr.role_id
  join public.permissions p on p.id = rp.permission_id
  where mr.tenant_id = p_tenant_id and mr.membership_id = v_membership_id and p.code = any(v_allowed);

  v_role_code := 'manager.' || replace(v_membership_id::text, '-', '');
  select r.id into v_role_id from public.roles r
  where r.tenant_id = p_tenant_id and r.code = v_role_code;

  if cardinality(v_requested) = 0 then
    if v_role_id is not null then
      delete from public.roles r where r.tenant_id = p_tenant_id and r.id = v_role_id;
    end if;
  else
    insert into public.roles (tenant_id, code, name, is_system)
    values (p_tenant_id, v_role_code, v_employee_name || '－主管後台權限', false)
    on conflict (tenant_id, code) do update set name = excluded.name, updated_at = now()
    returning id into v_role_id;

    insert into public.membership_roles (tenant_id, membership_id, role_id, scope_type)
    values (p_tenant_id, v_membership_id, v_role_id, 'tenant')
    on conflict (membership_id, role_id, scope_type, scope_id) do nothing;

    delete from public.role_permissions rp where rp.tenant_id = p_tenant_id and rp.role_id = v_role_id;
    insert into public.role_permissions (tenant_id, role_id, permission_id)
    select p_tenant_id, v_role_id, p.id from public.permissions p where p.code = any(v_requested);
  end if;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    p_tenant_id, (select auth.uid()), 'employee.admin_permissions_changed', 'employee', p_employee_id::text,
    jsonb_build_object('permissions', to_jsonb(v_before)),
    jsonb_build_object('permissions', to_jsonb(v_requested))
  );

  return jsonb_build_object('permissions', to_jsonb(v_requested));
end;
$$;

drop function public.get_current_workspace_context();
create function public.get_current_workspace_context()
returns table(
  user_id uuid, email text, user_metadata jsonb, tenant_id uuid, tenant_name text, employee_id uuid,
  can_manage_employee boolean, can_manage_schedule boolean, can_manage_attendance boolean,
  can_manage_request boolean, can_manage_payroll boolean, can_manage_settings boolean,
  can_read_audit boolean, can_manage_access boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id, coalesce(u.email, '')::text, coalesce(u.raw_user_meta_data, '{}'::jsonb),
    m.tenant_id, m.tenant_name, e.id,
    coalesce(public.current_user_has_permission(m.tenant_id, 'employee.manage'), false),
    coalesce(public.current_user_has_permission(m.tenant_id, 'schedule.manage'), false),
    coalesce(public.current_user_has_permission(m.tenant_id, 'attendance.manage'), false),
    coalesce(public.current_user_has_permission(m.tenant_id, 'request.manage'), false),
    coalesce(public.current_user_has_permission(m.tenant_id, 'payroll.manage'), false),
    coalesce(public.current_user_has_permission(m.tenant_id, 'settings.manage'), false),
    coalesce(public.current_user_has_permission(m.tenant_id, 'security.audit'), false),
    coalesce(public.current_user_has_permission(m.tenant_id, 'access.manage'), false)
  from auth.users u
  left join lateral (
    select tm.tenant_id, t.name as tenant_name
    from public.tenant_memberships tm join public.tenants t on t.id = tm.tenant_id
    where tm.user_id = u.id and tm.status = 'active'
    order by tm.created_at, tm.id limit 1
  ) m on true
  left join lateral (
    select x.id from public.employees x
    where x.tenant_id = m.tenant_id and x.auth_user_id = u.id and x.status = 'active'
    order by x.created_at, x.id limit 1
  ) e on true
  where u.id = (select auth.uid());
$$;

revoke all on function public.get_employee_admin_permissions(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_employee_admin_permissions(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function public.get_current_workspace_context() from public, anon, authenticated;
grant execute on function public.get_employee_admin_permissions(uuid, uuid) to authenticated;
grant execute on function public.set_employee_admin_permissions(uuid, uuid, text[]) to authenticated;
grant execute on function public.get_current_workspace_context() to authenticated;

commit;
