import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const foundationMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608240001_foundation.sql"),
  "utf8",
).toLowerCase();

const grantsMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608240002_data_api_grants.sql"),
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
    expect(foundationMigration).toContain(`alter table public.${table} enable row level security`);
  });

  it("does not grant authenticated client writes in the foundation migration", () => {
    expect(foundationMigration).not.toMatch(
      /create policy[\s\S]*?for (insert|update|delete|all) to authenticated/,
    );
  });

  it("uses composite tenant foreign keys for nested organization records", () => {
    expect(foundationMigration).toContain(
      "foreign key (tenant_id, company_id) references public.companies(tenant_id, id)",
    );
    expect(foundationMigration).toContain(
      "foreign key (tenant_id, membership_id) references public.tenant_memberships(tenant_id, id)",
    );
  });

  it("keeps anonymous Data API access disabled", () => {
    expect(grantsMigration).toContain("from anon");
    expect(grantsMigration).not.toMatch(/grant\s+(select|insert|update|delete|all)[\s\S]*?to anon/);
  });

  it("grants authenticated users read-only access to membership resolution tables", () => {
    expect(grantsMigration).toMatch(
      /grant select on table[\s\S]*?public\.tenants[\s\S]*?public\.tenant_memberships[\s\S]*?to authenticated/,
    );
    expect(grantsMigration).not.toMatch(
      /grant\s+(insert|update|delete|all)[\s\S]*?to authenticated/,
    );
  });

  it("does not expose audit logs to authenticated clients", () => {
    const grantSelectBlock = grantsMigration.match(/grant select on table([\s\S]*?)to authenticated/)?.[1];
    expect(grantSelectBlock).toBeDefined();
    expect(grantSelectBlock).not.toContain("public.audit_logs");
  });
});
