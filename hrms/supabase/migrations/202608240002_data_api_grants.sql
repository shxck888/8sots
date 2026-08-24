begin;

-- Keep future tables private until a migration grants the exact privileges needed.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- The public API has no anonymous access in the foundation phase.
revoke all privileges on table
  public.tenants,
  public.tenant_memberships,
  public.companies,
  public.locations,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.membership_roles,
  public.audit_logs
from anon;

-- Authenticated users may read only the tables required to resolve their tenant
-- context and RBAC scope. RLS policies still decide which rows are visible.
revoke all privileges on table
  public.tenants,
  public.tenant_memberships,
  public.companies,
  public.locations,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.membership_roles,
  public.audit_logs
from authenticated;

grant select on table
  public.tenants,
  public.tenant_memberships,
  public.companies,
  public.locations,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.membership_roles
to authenticated;

-- Audit evidence is server-only. No anon/authenticated table privilege is granted.
-- Client mutations remain unavailable until permission-checked server operations exist.

commit;
