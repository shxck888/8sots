begin;

create extension if not exists pgcrypto;

create type public.membership_status as enum ('invited', 'active', 'suspended', 'revoked');
create type public.organization_status as enum ('active', 'inactive', 'archived');
create type public.role_scope_type as enum ('tenant', 'company', 'location', 'department', 'self');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'Asia/Taipei',
  status public.organization_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.membership_status not null default 'invited',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, user_id)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  tax_id text,
  status public.organization_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique nulls not distinct (tenant_id, tax_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  company_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  code text not null check (char_length(code) between 1 and 40),
  timezone text not null default 'Asia/Taipei',
  status public.organization_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code),
  foreign key (tenant_id, company_id) references public.companies(tenant_id, id) on delete restrict
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_.-]*$'),
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_.-]*$'),
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  role_id uuid not null,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id),
  foreign key (tenant_id, role_id) references public.roles(tenant_id, id) on delete cascade
);

create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  membership_id uuid not null,
  role_id uuid not null,
  scope_type public.role_scope_type not null default 'tenant',
  scope_id uuid,
  created_at timestamptz not null default now(),
  unique nulls not distinct (membership_id, role_id, scope_type, scope_id),
  foreign key (tenant_id, membership_id) references public.tenant_memberships(tenant_id, id) on delete cascade,
  foreign key (tenant_id, role_id) references public.roles(tenant_id, id) on delete cascade,
  check ((scope_type in ('tenant', 'self') and scope_id is null) or (scope_type not in ('tenant', 'self') and scope_id is not null))
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  request_id text,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);

create index tenant_memberships_user_active_idx on public.tenant_memberships (user_id, tenant_id) where status = 'active';
create index companies_tenant_idx on public.companies (tenant_id);
create index locations_tenant_company_idx on public.locations (tenant_id, company_id);
create index membership_roles_tenant_membership_idx on public.membership_roles (tenant_id, membership_id);
create index audit_logs_tenant_occurred_idx on public.audit_logs (tenant_id, occurred_at desc);

create or replace function public.current_user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tm.tenant_id
  from public.tenant_memberships tm
  where tm.user_id = (select auth.uid())
    and tm.status = 'active';
$$;

revoke all on function public.current_user_tenant_ids() from public;
grant execute on function public.current_user_tenant_ids() to authenticated;

alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.companies enable row level security;
alter table public.locations enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.membership_roles enable row level security;
alter table public.audit_logs enable row level security;

create policy tenants_select_member on public.tenants for select to authenticated
  using (id in (select public.current_user_tenant_ids()));
create policy memberships_select_same_tenant on public.tenant_memberships for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy companies_select_same_tenant on public.companies for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy locations_select_same_tenant on public.locations for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy roles_select_same_tenant on public.roles for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy permissions_select_authenticated on public.permissions for select to authenticated using (true);
create policy role_permissions_select_same_tenant on public.role_permissions for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy membership_roles_select_same_tenant on public.membership_roles for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

-- No client write policies are created intentionally. Mutations will be exposed only
-- through permission-checked server operations added in the next slice.

commit;
