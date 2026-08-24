begin;

create type public.employee_auth_status as enum ('active', 'suspended');

create table public.employee_auth_accounts (
  employee_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,32}$'),
  status public.employee_auth_status not null default 'active',
  provisioned_by uuid references auth.users(id) on delete set null,
  provisioned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_id),
  unique (auth_user_id),
  unique (username),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete cascade
);

create index employee_auth_accounts_tenant_status_idx
  on public.employee_auth_accounts (tenant_id, status);

alter table public.employee_auth_accounts enable row level security;
create policy employee_auth_accounts_select_same_tenant
  on public.employee_auth_accounts for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

revoke all on table public.employee_auth_accounts from anon, authenticated;
grant select on table public.employee_auth_accounts to authenticated;

create or replace function public.link_employee_auth_account(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_auth_user_id uuid,
  p_username text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee public.employees%rowtype;
begin
  if not public.current_user_has_permission(p_tenant_id, 'employee.manage') then
    raise exception 'employee.manage permission required' using errcode = '42501';
  end if;
  if lower(trim(p_username)) !~ '^[a-z0-9_]{3,32}$' then
    raise exception 'invalid username' using errcode = '22023';
  end if;

  select * into v_employee from public.employees
  where tenant_id = p_tenant_id and id = p_employee_id for update;
  if v_employee.id is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
  if v_employee.auth_user_id is not null then raise exception 'employee account already linked' using errcode = '23505'; end if;

  update public.employees set auth_user_id = p_auth_user_id, updated_at = now()
  where tenant_id = p_tenant_id and id = p_employee_id;

  insert into public.tenant_memberships (tenant_id, user_id, status, joined_at)
  values (p_tenant_id, p_auth_user_id, 'active', now())
  on conflict (tenant_id, user_id) do update set
    status = 'active', joined_at = coalesce(public.tenant_memberships.joined_at, now()), updated_at = now();

  insert into public.employee_auth_accounts (
    employee_id, tenant_id, auth_user_id, username, status, provisioned_by
  ) values (
    p_employee_id, p_tenant_id, p_auth_user_id, lower(trim(p_username)), 'active', (select auth.uid())
  );

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    p_tenant_id, (select auth.uid()), 'employee.account_provisioned', 'employee', p_employee_id::text,
    jsonb_build_object('auth_user_id', p_auth_user_id, 'username', lower(trim(p_username)), 'status', 'active')
  );
end;
$$;

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

create or replace function public.record_employee_password_reset(
  p_tenant_id uuid,
  p_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.current_user_has_permission(p_tenant_id, 'employee.manage') then
    raise exception 'employee.manage permission required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.employee_auth_accounts
    where tenant_id = p_tenant_id and employee_id = p_employee_id
  ) then raise exception 'employee account not found' using errcode = 'P0002'; end if;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (p_tenant_id, (select auth.uid()), 'employee.password_reset', 'employee', p_employee_id::text);
end;
$$;

revoke all on function public.link_employee_auth_account(uuid,uuid,uuid,text) from public;
revoke all on function public.set_employee_auth_account_status(uuid,uuid,public.employee_auth_status) from public;
revoke all on function public.record_employee_password_reset(uuid,uuid) from public;
grant execute on function public.link_employee_auth_account(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.set_employee_auth_account_status(uuid,uuid,public.employee_auth_status) to authenticated;
grant execute on function public.record_employee_password_reset(uuid,uuid) to authenticated;

commit;
