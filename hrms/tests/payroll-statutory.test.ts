import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { multiplierToPpm, payrollStatutorySettingsSchema, percentageToPpm } from "../lib/operations-settings";
import { leavePayRuleSchema, statutoryProfileSchema } from "../lib/payroll-contract";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202609210034_payroll_statutory_linkage.sql"),
  "utf8",
).toLowerCase();

describe("statutory payroll linkage", () => {
  it("uses effective-dated immutable rules and employee profiles", () => {
    for (const table of [
      "payroll_statutory_rule_versions", "employee_statutory_profile_versions", "leave_pay_rule_versions",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("payroll configuration versions are immutable");
    expect(migration).toContain("statutory_settings_snapshot");
    expect(migration).toContain("payroll_blockers");
  });

  it("links approved leave, overtime, insurance, pension and tax into payroll items", () => {
    for (const code of [
      "'overtime'", "'unpaid_leave'", "'paid_leave'", "'labor_insurance'",
      "'employment_insurance'", "'health_insurance'", "'pension_voluntary'", "'income_tax'",
    ]) expect(migration).toContain(code);
    expect(migration).toContain("wd.decision = 'approved'");
    expect(migration).toContain("public.payroll_premium_cents");
    expect(migration).toContain("public.payroll_prorated_cents");
  });

  it("converts human percentages and multipliers without losing configured precision", () => {
    expect(percentageToPpm(5.17)).toBe(51_700);
    expect(percentageToPpm(30)).toBe(300_000);
    expect(multiplierToPpm(4 / 3)).toBe(1_333_333);
  });

  it("validates admin inputs at the server boundary", () => {
    expect(payrollStatutorySettingsSchema.safeParse({
      effectiveFrom: "2026-01-01", laborInsuranceRate: 11.5, laborEmployeeShare: 20,
      employmentInsuranceRate: 1, employmentEmployeeShare: 20,
      healthInsuranceRate: 5.17, healthEmployeeShare: 30, pensionEmployerRate: 6,
      monthlyHourDivisor: 240, overtimeTier1Minutes: 120, overtimeTier1Multiplier: 4 / 3,
      overtimeTier2Minutes: 120, overtimeTier2Multiplier: 5 / 3,
      overtimeTier3Minutes: 0, overtimeTier3Multiplier: 2, sourceNote: "官方費率測試",
    }).success).toBe(true);
    expect(statutoryProfileSchema.safeParse({
      employeeId: crypto.randomUUID(), effectiveFrom: "2026-01-01",
      laborInsuredSalary: "36000", employmentInsuredSalary: "36000", healthInsuredSalary: "36000",
      healthDependentCount: 4, pensionSalary: "36000", pensionVoluntaryRate: 0,
      incomeTaxWithholding: 0, note: "",
    }).success).toBe(false);
    expect(leavePayRuleSchema.safeParse({
      leaveTypeId: crypto.randomUUID(), effectiveFrom: "2026-01-01", paidRatio: 101, note: "超過上限",
    }).success).toBe(false);
  });
});
