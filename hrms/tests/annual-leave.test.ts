import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatAnnualLeaveMinutes, parseAnnualLeaveBalance } from "../lib/work-request-contract";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202609210035_anniversary_annual_leave.sql"),
  "utf8",
).toLowerCase();

describe("anniversary annual leave", () => {
  it("keeps policy, grants, usage, and corrections in an auditable ledger", () => {
    for (const table of [
      "annual_leave_policy_versions", "annual_leave_grants", "annual_leave_usages", "annual_leave_adjustments",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("annual leave policy versions are immutable");
    expect(migration).toContain("create trigger annual_leave_allocate_after_approval");
    expect(migration).toContain("insufficient annual leave balance");
    expect(migration).toContain("p_effective_from,1000000");
  });

  it("encodes every statutory service milestone and the 30-day cap", () => {
    expect(migration).toContain("when p_service_milestone_months = 6 then 3");
    expect(migration).toContain("when p_service_milestone_months between 12 and 23 then 7");
    expect(migration).toContain("when p_service_milestone_months between 24 and 35 then 10");
    expect(migration).toContain("when p_service_milestone_months between 36 and 59 then 14");
    expect(migration).toContain("when p_service_milestone_months between 60 and 119 then 15");
    expect(migration).toContain("least(30, p_service_milestone_months / 12 + 6)");
  });

  it("parses and formats an employee balance using the configured workday", () => {
    const balance = parseAnnualLeaveBalance({
      configured: true,
      standard_day_minutes: 480,
      available_minutes: 1_020,
      pending_minutes: 60,
      used_minutes: 420,
      grants: [{ id: "grant", granted_days: 3, granted_minutes: 1_440, used_minutes: 420,
        adjustment_minutes: 0, period_start: "2026-07-01", period_end_exclusive: "2027-01-01",
        service_milestone_months: 6, settlement_status: "not_due" }],
    });
    expect(balance.availableMinutes).toBe(1_020);
    expect(balance.grants[0].grantedDays).toBe(3);
    expect(formatAnnualLeaveMinutes(balance.availableMinutes, balance.standardDayMinutes)).toBe("2 天 1 小時");
  });
});
