import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/202609210036_employee_archive_and_safe_delete.sql").toLowerCase();

describe("employee archive and safe deletion", () => {
  it("archives with audit evidence and suspends application access", () => {
    expect(migration).toContain("add column archived_at");
    expect(migration).toContain("create function public.archive_employee");
    expect(migration).toContain("create function public.restore_archived_employee");
    expect(migration).toContain("'employee.archived'");
    expect(migration).toContain("'employee.restored'");
    expect(migration).toContain("update public.tenant_memberships set status='suspended'");
    expect(migration).toContain("cannot archive own employee account");
  });

  it("only permits permanent deletion after checking retained history", () => {
    expect(migration).toContain("create function public.get_employee_deletion_eligibility");
    expect(migration).toContain("create function public.delete_unreferenced_employee");
    for (const table of [
      "schedule_assignments", "punch_records", "attendance_days", "punch_correction_requests",
      "work_requests", "leave_entitlements", "employee_compensation_versions", "payroll_entries",
      "employee_statutory_profile_versions", "annual_leave_grants",
    ]) expect(migration).toContain(`from public.${table}`);
    expect(migration).toContain("employee must be archived before deletion");
    expect(migration).toContain("employee has retained history");
    expect(migration).toContain("'employee.deleted_unreferenced'");
  });

  it("exposes archive filters and explicit destructive confirmation", () => {
    const listPage = read("app/admin/employees/page.tsx");
    const lifecycle = read("app/admin/employees/[id]/employee-lifecycle-panel.tsx");
    expect(listPage).toContain("現有員工");
    expect(listPage).toContain("已封存");
    expect(lifecycle).toContain("封存員工");
    expect(lifecycle).toContain("永久刪除誤建資料");
    expect(lifecycle).toContain("confirmation");
  });
});
