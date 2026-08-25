import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateLeaveBalance, formatRequestedMinutes, leaveEntitlementInputSchema, workRequestDecisionSchema, workRequestInputSchema, workRequestWithdrawalSchema } from "../lib/work-request-contract";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").toLowerCase();

describe("work request center", () => {
  it("validates leave and overtime request boundaries", () => {
    const base = {
      idempotencyKey: crypto.randomUUID(),
      startsLocal: "2026-08-26T10:00",
      endsLocal: "2026-08-26T14:00",
      reason: "家中有重要事情需要處理",
    };
    expect(workRequestInputSchema.safeParse({ ...base, requestType: "leave", leaveTypeId: crypto.randomUUID() }).success).toBe(true);
    expect(workRequestInputSchema.safeParse({ ...base, requestType: "leave", leaveTypeId: "" }).success).toBe(false);
    expect(workRequestInputSchema.safeParse({ ...base, requestType: "overtime", leaveTypeId: null }).success).toBe(true);
    expect(workRequestInputSchema.safeParse({ ...base, requestType: "overtime", leaveTypeId: null, endsLocal: base.startsLocal }).success).toBe(false);
  });

  it("only permits final approval decisions", () => {
    expect(workRequestDecisionSchema.safeParse({ requestId: crypto.randomUUID(), decision: "approved", reviewNote: "" }).success).toBe(true);
    expect(workRequestDecisionSchema.safeParse({ requestId: crypto.randomUUID(), decision: "pending", reviewNote: "" }).success).toBe(false);
  });

  it("formats requested duration for readable summaries", () => {
    expect(formatRequestedMinutes(90)).toBe("1 小時 30 分鐘");
    expect(formatRequestedMinutes(1500)).toBe("1 天 1 小時");
  });

  it("validates withdrawal and annual leave entitlement inputs", () => {
    expect(workRequestWithdrawalSchema.safeParse({ requestId: crypto.randomUUID() }).success).toBe(true);
    expect(leaveEntitlementInputSchema.safeParse({ employeeId: crypto.randomUUID(), leaveTypeId: crypto.randomUUID(), entitlementYear: 2026, entitledHours: 80, note: "年度特休" }).success).toBe(true);
    expect(calculateLeaveBalance(4800, 960)).toEqual({ entitledMinutes: 4800, usedMinutes: 960, remainingMinutes: 3840 });
  });

  it("adds audited withdrawal, balances, and attendance snapshot integration", () => {
    const migration = read("supabase/migrations/202608250017_request_withdrawal_balances_attendance.sql");
    expect(migration).toContain("create table public.work_request_withdrawals");
    expect(migration).toContain("create table public.leave_entitlements");
    expect(migration).toContain("create or replace function public.withdraw_work_request");
    expect(migration).toContain("create or replace function public.upsert_leave_entitlement");
    expect(migration).toContain("approved_leave_minutes");
    expect(migration).toContain("approved_overtime_minutes");
    expect(migration).toContain("least(wr.ends_at, aseg.scheduled_end_at)");
    expect(migration).toContain("greatest(wr.starts_at, aseg.scheduled_start_at)");
    expect(migration).toContain("insert into public.audit_logs");
  });

  it("keeps V2 database acceptance rollback-only", () => {
    const integration = read("supabase/tests/request_center_v2.sql");
    expect(integration).toContain("begin;");
    expect(integration).toContain("withdraw_work_request");
    expect(integration).toContain("upsert_leave_entitlement");
    expect(integration.trim().endsWith("rollback;")).toBe(true);
  });

  it("keeps request writes behind audited permission-checked RPCs", () => {
    const migration = read("supabase/migrations/202608250016_request_center.sql");
    for (const table of ["leave_types", "work_requests", "work_request_decisions"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("'request.manage'");
    expect(migration).toContain("create or replace function public.create_work_request");
    expect(migration).toContain("create or replace function public.decide_work_request");
    expect(migration).toContain("insert into public.audit_logs");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?public\.work_requests[\s\S]*?to authenticated/);
  });

  it("links both employee and admin navigation to real request pages", () => {
    expect(read("app/workspace-shell.tsx")).toContain('href: "/requests"');
    expect(read("app/admin/admin-nav.tsx")).toContain('href: "/admin/requests"');
  });
});
