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

const platformAdminMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250003_platform_admin_permission.sql"),
  "utf8",
).toLowerCase();

const employeeMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250004_employee_management.sql"),
  "utf8",
).toLowerCase();

const employeeAuthLinkFixMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250005_employee_auth_link_unique_fix.sql"),
  "utf8",
).toLowerCase();

const employeeMasterMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250006_employee_master_details.sql"),
  "utf8",
).toLowerCase();

const employmentTimezoneFixMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250007_employment_effective_date_timezone_fix.sql"),
  "utf8",
).toLowerCase();

const employeeAuthAccountsMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250008_employee_auth_accounts.sql"),
  "utf8",
).toLowerCase();

const preventSelfSuspensionMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250009_prevent_self_account_suspension.sql"),
  "utf8",
).toLowerCase();

const scheduleMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250010_schedule_foundation.sql"),
  "utf8",
).toLowerCase();

const scheduleBatchMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250011_schedule_batch_save.sql"),
  "utf8",
).toLowerCase();

const employeeScheduleVisibilityMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250012_employee_schedule_visibility.sql"),
  "utf8",
).toLowerCase();

const punchFoundationMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250013_punch_foundation.sql"),
  "utf8",
).toLowerCase();

const scheduleSeed = readFileSync(
  join(process.cwd(), "supabase/seeds/8sots_schedule_templates.sql"),
  "utf8",
).toLowerCase();

const crossTenantRlsTest = readFileSync(
  join(process.cwd(), "supabase/tests/cross_tenant_rls.sql"),
  "utf8",
).toLowerCase();

const scheduleFoundationTest = readFileSync(
  join(process.cwd(), "supabase/tests/schedule_foundation.sql"),
  "utf8",
).toLowerCase();

const employeeScheduleVisibilityTest = readFileSync(
  join(process.cwd(), "supabase/tests/employee_schedule_visibility.sql"),
  "utf8",
).toLowerCase();

const punchFoundationTest = readFileSync(
  join(process.cwd(), "supabase/tests/punch_foundation.sql"),
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

  it("versions the platform administrator permission as reference data", () => {
    expect(platformAdminMigration).toContain("'platform.admin'");
    expect(platformAdminMigration).toContain("on conflict (code) do update");
    expect(platformAdminMigration).not.toContain("auth.users");
  });

  it("creates a tenant-scoped employee table with RLS", () => {
    expect(employeeMigration).toContain("create table public.employees");
    expect(employeeMigration).toContain("tenant_id uuid not null");
    expect(employeeMigration).toContain("unique (tenant_id, employee_no)");
    expect(employeeMigration).toContain("alter table public.employees enable row level security");
    expect(employeeMigration).toContain("employees_select_same_tenant");
  });

  it("keeps employee table writes behind permission-checked RPCs", () => {
    expect(employeeMigration).toContain("current_user_has_permission");
    expect(employeeMigration).toContain("'employee.manage'");
    expect(employeeMigration).toContain("create or replace function public.create_employee");
    expect(employeeMigration).toContain("create or replace function public.update_employee");
    expect(employeeMigration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?public\.employees[\s\S]*?to authenticated/);
  });

  it("writes employee create and update audit evidence", () => {
    expect(employeeMigration).toContain("'employee.created'");
    expect(employeeMigration).toContain("'employee.updated'");
    expect(employeeMigration).toContain("insert into public.audit_logs");
  });

  it("allows multiple employees without Auth links while keeping real links unique", () => {
    expect(employeeAuthLinkFixMigration).toContain(
      "drop constraint if exists employees_tenant_id_auth_user_id_key",
    );
    expect(employeeAuthLinkFixMigration).toContain(
      "on public.employees (tenant_id, auth_user_id)",
    );
    expect(employeeAuthLinkFixMigration).toContain("where auth_user_id is not null");
  });

  it("models employee personal, contact, organization and employment data separately", () => {
    for (const table of ["departments", "positions", "employee_profiles", "employee_contacts", "employment_records"]) {
      expect(employeeMasterMigration).toContain(`create table public.${table}`);
      expect(employeeMasterMigration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(employeeMasterMigration).toContain("create type public.employment_type");
    expect(employeeMasterMigration).toContain("supervisor_employee_id uuid");
    expect(employeeMasterMigration).toContain("probation_end_date date");
    expect(employeeMasterMigration).toContain("termination_date date");
  });

  it("keeps employee photos private and caps accepted files", () => {
    expect(employeeMasterMigration).toContain("'employee-photos', 'employee-photos', false, 3145728");
    expect(employeeMasterMigration).toContain("employee_photos_admin_select");
    expect(employeeMasterMigration).toContain("employee_photos_admin_insert");
  });

  it("versions audited Employee Master mutations", () => {
    expect(employeeMasterMigration).toContain("create_employee_master");
    expect(employeeMasterMigration).toContain("update_employee_master");
    expect(employeeMasterMigration).toContain("public.employee_master_current");
    expect(employeeMasterMigration).toContain("insert into public.audit_logs");
  });

  it("uses the tenant timezone for employment effective dates", () => {
    expect(employmentTimezoneFixMigration).toContain("at time zone t.timezone");
    expect(employmentTimezoneFixMigration).toContain("effective_from >= v_effective_date");
    expect(employmentTimezoneFixMigration).toContain("effective_to = v_effective_date - 1");
  });

  it("provisions employee Auth accounts through permission-checked audited RPCs", () => {
    expect(employeeAuthAccountsMigration).toContain("create table public.employee_auth_accounts");
    expect(employeeAuthAccountsMigration).toContain("alter table public.employee_auth_accounts enable row level security");
    expect(employeeAuthAccountsMigration).toContain("link_employee_auth_account");
    expect(employeeAuthAccountsMigration).toContain("set_employee_auth_account_status");
    expect(employeeAuthAccountsMigration).toContain("record_employee_password_reset");
    expect(employeeAuthAccountsMigration).toContain("employee.account_provisioned");
    expect(employeeAuthAccountsMigration).not.toContain("password text");
  });

  it("prevents administrators from changing their own login status", () => {
    expect(preventSelfSuspensionMigration).toContain("v_account.auth_user_id = (select auth.uid())");
    expect(preventSelfSuspensionMigration).toContain("cannot change own account status");
  });

  it("models tenant-wide shifts as ordered segments and supports cross-midnight offsets", () => {
    expect(scheduleMigration).toContain("create table public.shifts");
    expect(scheduleMigration).toContain("create table public.shift_segments");
    expect(scheduleMigration).toContain("start_minute >= 0 and start_minute < 1440");
    expect(scheduleMigration).toContain("end_minute <= 2880");
    expect(scheduleMigration).toContain("shift segments overlap");
    expect(scheduleMigration).not.toContain("location_id");
  });

  it("creates versioned draft and published schedules with immutable history", () => {
    expect(scheduleMigration).toContain("create table public.schedule_versions");
    expect(scheduleMigration).toContain("create table public.schedule_assignments");
    expect(scheduleMigration).toContain("schedule_versions_one_published_period_idx");
    expect(scheduleMigration).toContain("guard_published_schedule_assignment");
    expect(scheduleMigration).toContain("guard_published_shift_segment");
    expect(scheduleMigration).toContain("published or superseded schedules are immutable");
  });

  it("keeps schedule writes behind permission-checked audited RPCs", () => {
    expect(scheduleMigration).toContain("'schedule.manage'");
    expect(scheduleMigration).toContain("upsert_shift_template");
    expect(scheduleMigration).toContain("create_schedule_draft");
    expect(scheduleMigration).toContain("assign_schedule_shift");
    expect(scheduleMigration).toContain("publish_schedule");
    expect(scheduleMigration).toContain("insert into public.audit_logs");
    expect(scheduleMigration).not.toMatch(
      /grant\s+(insert|update|delete|all)[\s\S]*?public\.(shifts|shift_segments|schedule_versions|schedule_assignments)[\s\S]*?to authenticated/,
    );
  });

  it("saves weekly assignment edits atomically through one audited RPC", () => {
    expect(scheduleBatchMigration).toContain("save_schedule_assignments");
    expect(scheduleBatchMigration).toContain("current_user_has_permission");
    expect(scheduleBatchMigration).toContain("'schedule.manage'");
    expect(scheduleBatchMigration).toContain("only draft schedules can be changed");
    expect(scheduleBatchMigration).toContain("duplicate employee work date assignment");
    expect(scheduleBatchMigration).toContain("schedule.assignments_saved");
    expect(scheduleBatchMigration).toContain("insert into public.audit_logs");
    expect(scheduleBatchMigration).toContain("schedule_versions_one_draft_period_idx");
    expect(scheduleBatchMigration).toContain("copied_assignments");
  });

  it("versions the actual Seastar weekday and holiday shift templates", () => {
    expect(scheduleSeed).toContain("'weekday_split', '平日班'");
    expect(scheduleSeed).toContain("(v_tenant_id, v_shift_id, 1, 600, 840)");
    expect(scheduleSeed).toContain("(v_tenant_id, v_shift_id, 2, 960, 1260)");
    expect(scheduleSeed).toContain("'holiday_continuous', '假日班'");
    expect(scheduleSeed).toContain("(v_tenant_id, v_shift_id, 1, 600, 1260)");
  });

  it("limits employee schedule reads to self and published versions", () => {
    expect(employeeScheduleVisibilityMigration).toContain(
      "schedule_assignments_select_manager_or_self_published",
    );
    expect(employeeScheduleVisibilityMigration).toContain("current_user_has_permission");
    expect(employeeScheduleVisibilityMigration).toContain("'schedule.manage'");
    expect(employeeScheduleVisibilityMigration).toContain("e.auth_user_id = (select auth.uid())");
    expect(employeeScheduleVisibilityMigration).toContain("sv.status = 'published'");
    expect(employeeScheduleVisibilityMigration).not.toMatch(
      /create policy[\s\S]*?for (insert|update|delete|all) to authenticated/,
    );
  });

  it("tests employee schedule visibility with rollback-only production fixtures", () => {
    expect(employeeScheduleVisibilityTest).toMatch(/^--[\s\S]*?begin;/);
    expect(employeeScheduleVisibilityTest.trim()).toMatch(/rollback;$/);
    expect(employeeScheduleVisibilityTest).not.toContain("commit;");
    expect(employeeScheduleVisibilityTest).toContain("employee published schedule read failed");
    expect(employeeScheduleVisibilityTest).toContain("other employee schedule leaked");
    expect(employeeScheduleVisibilityTest).toContain("draft employee schedule leaked");
  });

  it("creates append-only server-authoritative GPS punch evidence", () => {
    expect(punchFoundationMigration).toContain("create table public.punch_records");
    expect(punchFoundationMigration).toContain("occurred_at timestamptz not null default statement_timestamp()");
    expect(punchFoundationMigration).toContain("punch_records_append_only");
    expect(punchFoundationMigration).toContain("raw punch records are append-only");
    expect(punchFoundationMigration).toContain("location_consent_at");
    expect(punchFoundationMigration).toContain("unique (tenant_id, employee_id, idempotency_key)");
  });

  it("keeps GPS writes behind an identity-checked audited RPC", () => {
    expect(punchFoundationMigration).toContain("record_gps_punch");
    expect(punchFoundationMigration).toContain("active linked employee required");
    expect(punchFoundationMigration).toContain("location consent required");
    expect(punchFoundationMigration).toContain("pg_advisory_xact_lock");
    expect(punchFoundationMigration).toContain("client timestamp outside allowed window");
    expect(punchFoundationMigration).toContain("invalid gps evidence");
    expect(punchFoundationMigration).toContain("'punch.recorded'");
    expect(punchFoundationMigration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?public\.punch_records[\s\S]*?to authenticated/);
  });

  it("limits punch reads to self or attendance managers", () => {
    expect(punchFoundationMigration).toContain("'attendance.manage'");
    expect(punchFoundationMigration).toContain("punch_records_select_manager_or_self");
    expect(punchFoundationMigration).toContain("e.auth_user_id = (select auth.uid())");
  });

  it("keeps punch integration fixtures rollback-only and covers critical boundaries", () => {
    expect(punchFoundationTest).toMatch(/^--[\s\S]*?begin;/);
    expect(punchFoundationTest.trim()).toMatch(/rollback;$/);
    expect(punchFoundationTest).not.toContain("commit;");
    expect(punchFoundationTest).toContain("first punch was not clock_in");
    expect(punchFoundationTest).toContain("second punch was not clock_out");
    expect(punchFoundationTest).toContain("idempotent punch duplicated");
    expect(punchFoundationTest).toContain("direct punch insert unexpectedly succeeded");
    expect(punchFoundationTest).toContain("punch mutation unexpectedly succeeded");
  });

  it("keeps schedule integration fixtures rollback-only and covers critical boundaries", () => {
    expect(scheduleFoundationTest).toMatch(/^--[\s\S]*?begin;/);
    expect(scheduleFoundationTest.trim()).toMatch(/rollback;$/);
    expect(scheduleFoundationTest).not.toContain("commit;");
    expect(scheduleFoundationTest).toContain("weekday shift minutes mismatch");
    expect(scheduleFoundationTest).toContain("cross-midnight shift minutes mismatch");
    expect(scheduleFoundationTest).toContain("overlapping shift segments unexpectedly succeeded");
    expect(scheduleFoundationTest).toContain("cross-tenant schedule rpc unexpectedly succeeded");
    expect(scheduleFoundationTest).toContain("published schedule mutation unexpectedly succeeded");
    expect(scheduleFoundationTest).toContain("published shift mutation unexpectedly succeeded");
    expect(scheduleFoundationTest).toContain("published schedule clone failed");
    expect(scheduleFoundationTest).toContain("batch schedule assignment save failed");
  });

  it("keeps the cross-tenant RLS integration fixture transaction-scoped", () => {
    expect(crossTenantRlsTest).toMatch(/^--[\s\S]*?begin;/);
    expect(crossTenantRlsTest.trim()).toMatch(/rollback;$/);
    expect(crossTenantRlsTest).not.toContain("commit;");
  });

  it("asserts same-tenant reads and cross-tenant isolation boundaries", () => {
    expect(crossTenantRlsTest).toContain("same-tenant read failed");
    expect(crossTenantRlsTest).toContain("cross-tenant tenant read leaked");
    expect(crossTenantRlsTest).toContain("cross-tenant employee read leaked");
    expect(crossTenantRlsTest).toContain("authenticated client write unexpectedly succeeded");
    expect(crossTenantRlsTest).toContain("anonymous read unexpectedly succeeded");
    expect(crossTenantRlsTest).toContain("cross-tenant rpc unexpectedly succeeded");
    expect(crossTenantRlsTest).toContain("cross-tenant foreign key unexpectedly succeeded");
  });
});
