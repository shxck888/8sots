import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compensationSchema, formatMoney, payrollAdjustmentSchema, payrollPeriodSchema, toCents } from "../lib/payroll-contract";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").toLowerCase();
describe("payroll draft foundation", () => {
  it("validates exact money inputs and formats TWD", () => {
    expect(toCents(36500)).toBe(3650000);
    expect(formatMoney(3650000)).toContain("36,500");
    expect(compensationSchema.safeParse({ employeeId: crypto.randomUUID(), effectiveFrom: "2026-09-01", payBasis: "monthly", rate: "36500.25", note: "" }).success).toBe(true);
    expect(toCents("36500.25")).toBe(3650025);
    expect(() => toCents("1.001")).toThrow();
    expect(compensationSchema.safeParse({ employeeId: crypto.randomUUID(), effectiveFrom: "2026-09-01", payBasis: "monthly", rate: "", note: "" }).success).toBe(false);
    expect(payrollPeriodSchema.safeParse({ periodMonth: "2026-09", payDate: "2026-10-05" }).success).toBe(true);
    expect(payrollAdjustmentSchema.safeParse({ entryId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), kind: "deduction", name: "人工調整", amount: "100", note: "" }).success).toBe(true);
  });
  it("uses snapshot and lock semantics without guessing deductions", () => {
    const sql = read("supabase/migrations/202608280028_payroll_draft_foundation.sql") + read("supabase/migrations/202609200030_payroll_integrity.sql");
    expect(sql).toContain("source_snapshot jsonb");
    expect(sql).toContain("automatic_deductions_applied',false");
    expect(sql).toContain("insurance_tax_applied',false");
    expect(sql).toContain("invalid payroll status transition");
    expect(sql).toContain("employee compensation missing");
    expect(sql).toContain("'payroll.manage'");
    expect(sql).toContain("insert into public.audit_logs");
  });
  it("publishes only locked payslips to employees", () => {
    const page = read("app/payslips/page.tsx");
    expect(page).toMatch(/\.eq\("status",\s*"locked"\)/);
    expect(read("app/payslips/print-button.tsx")).toContain("列印／存成 pdf");
  });
});
