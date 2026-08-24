begin;

create type public.employee_status as enum ('active', 'on_leave', 'terminated');

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  auth_user_id uuid references auth.users(id) on delete set null,
  employee_no text not null check (employee_no ~ '^[A-Z0-9_-]{1,32}$'),
  full_name text not null check (char_length(full_name) between 1 and 80),
  preferred_name text check (preferred_name is null or char_length(preferred_name) between 1 and 80),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 30),
  hire_date date not null,
  status public.employee_status not null default 'active',
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, employee_no),
  unique nulls not distinct (tenant_id, auth_user_id)
);

create index employees_tenant_status_idx on public.employees (tenant_id, status, employee_no);

insert into public.permissions (code, description)
values ('employee.manage', '檢視與維護員工主檔')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'platform_admin'
  and p.code = 'employee.manage'
on conflict (role_id, permission_id) do nothing;

create or replace function public.current_user_has_permission(
  p_tenant_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    join public.membership_roles mr
      on mr.tenant_id = tm.tenant_id and mr.membership_id = tm.id
    join public.roles r
      on r.tenant_id = mr.tenant_id and r.id = mr.role_id
    join public.role_permissions rp
      on rp.tenant_id = r.tenant_id and rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where tm.tenant_id = p_tenant_id
      and tm.user_id = (select auth.uid())
      and tm.status = 'active'
      and (p.code = p_permission_code or p.code = 'platform.admin')
  );
$$;

revoke all on function public.current_user_has_permission(uuid, text) from public;
grant execute on function public.current_user_has_permission(uuid, text) to authenticated;

alter table public.employees enable row level security;

create policy employees_select_same_tenant on public.employees for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

revoke all privileges on table public.employees from anon, authenticated;
grant select on table public.employees to authenticated;

create or replace function public.create_employee(
  p_tenant_id uuid,
  p_employee_no text,
  p_full_name text,
  p_preferred_name text,
  p_email text,
  p_phone text,
  p_hire_date date,
  p_status public.employee_status,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id, 'employee.manage') then
    raise exception 'employee.manage permission required' using errcode = '42501';
  end if;

  insert into public.employees (
    tenant_id, employee_no, full_name, preferred_name, email, phone,
    hire_date, status, notes, created_by
  ) values (
    p_tenant_id, upper(trim(p_employee_no)), trim(p_full_name), nullif(trim(p_preferred_name), ''),
    nullif(lower(trim(p_email)), ''), nullif(trim(p_phone), ''), p_hire_date,
    p_status, nullif(trim(p_notes), ''), (select auth.uid())
  ) returning id into v_employee_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  )
  select p_tenant_id, (select auth.uid()), 'employee.created', 'employee',
    v_employee_id::text, to_jsonb(e)
  from public.employees e where e.id = v_employee_id;

  return v_employee_id;
end;
$$;

create or replace function public.update_employee(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_employee_no text,
  p_full_name text,
  p_preferred_name text,
  p_email text,
  p_phone text,
  p_hire_date date,
  p_status public.employee_status,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.current_user_has_permission(p_tenant_id, 'employee.manage') then
    raise exception 'employee.manage permission required' using errcode = '42501';
  end if;

  select to_jsonb(e) into v_before
  from public.employees e
  where e.id = p_employee_id and e.tenant_id = p_tenant_id
  for update;

  if v_before is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;

  update public.employees as e
  set employee_no = upper(trim(p_employee_no)),
      full_name = trim(p_full_name),
      preferred_name = nullif(trim(p_preferred_name), ''),
      email = nullif(lower(trim(p_email)), ''),
      phone = nullif(trim(p_phone), ''),
      hire_date = p_hire_date,
      status = p_status,
      notes = nullif(trim(p_notes), ''),
      updated_at = now()
  where id = p_employee_id and tenant_id = p_tenant_id
  returning to_jsonb(e) into v_after;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_tenant_id, (select auth.uid()), 'employee.updated', 'employee',
    p_employee_id::text, v_before, v_after
  );
end;
$$;

revoke all on function public.create_employee(uuid, text, text, text, text, text, date, public.employee_status, text) from public;
revoke all on function public.update_employee(uuid, uuid, text, text, text, text, text, date, public.employee_status, text) from public;
grant execute on function public.create_employee(uuid, text, text, text, text, text, date, public.employee_status, text) to authenticated;
grant execute on function public.update_employee(uuid, uuid, text, text, text, text, text, date, public.employee_status, text) to authenticated;

commit;
