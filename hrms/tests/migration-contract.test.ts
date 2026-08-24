import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608240001_foundation.sql"),
  "utf8",
).toLowerCase();

const tenantTables = [
  "tenants",
  "tenant_memberships",
  "companies",
  "locations",
  "roles",
  "role_permissions",
  "membership_roles",
  "audit_logs",
];

describe("foundation migration contract", () => {
  it.each(tenantTables)("enables RLS for %s", (table) => {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
  });

  it("does not grant authenticated client writes in the foundation migration", () => {
    expect(migration).not.toMatch(/create policy[\s\S]*?for (insert|update|delete|all) to authenticated/);
  });

  it("uses composite tenant foreign keys for nested organization records", () => {
    expect(migration).toContain(
      "foreign key (tenant_id, company_id) references public.companies(tenant_id, id)",
    );
    expect(migration).toContain(
      "foreign key (tenant_id, membership_id) references public.tenant_memberships(tenant_id, id)",
    );
  });
});
