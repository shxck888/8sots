import { z } from "zod";

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "時間格式不正確");

export function coveredLeaveDates(startsLocal: string, endsLocal: string): string[] {
  const start = Date.parse(`${startsLocal}Z`);
  const end = Date.parse(`${endsLocal}Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const cursor = new Date(`${startsLocal.slice(0, 10)}T00:00:00Z`);
  const finalDate = new Date(end - 1).toISOString().slice(0, 10);
  const dates: string[] = [];
  while (cursor.toISOString().slice(0, 10) <= finalDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function leaveDatesUseAllowedWeekdays(startsLocal: string, endsLocal: string): boolean {
  return coveredLeaveDates(startsLocal, endsLocal).every((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return weekday >= 2 && weekday <= 5;
  });
}

export function leaveRequestUsesSingleDate(startsLocal: string, endsLocal: string): boolean {
  const dates = coveredLeaveDates(startsLocal, endsLocal);
  return dates.length === 1;
}

export const workRequestInputSchema = z.object({
  requestType: z.enum(["leave", "overtime"]),
  leaveTypeId: z.union([z.uuid(), z.literal("")]).nullable(),
  startsLocal: localDateTime,
  endsLocal: localDateTime,
  reason: z.string().trim().min(5).max(500),
  idempotencyKey: z.uuid(),
}).superRefine((value, context) => {
  if (value.requestType === "leave" && !value.leaveTypeId) {
    context.addIssue({ code: "custom", message: "請選擇假別", path: ["leaveTypeId"] });
  }
  if (value.endsLocal <= value.startsLocal) {
    context.addIssue({ code: "custom", message: "結束時間必須晚於開始時間", path: ["endsLocal"] });
  }
  if (value.requestType === "leave" && !leaveRequestUsesSingleDate(value.startsLocal, value.endsLocal)) {
    context.addIssue({ code: "custom", message: "每筆請假只能選一個日期", path: ["endsLocal"] });
  }
  if (value.requestType === "overtime") {
    const requestedMinutes = (Date.parse(value.endsLocal) - Date.parse(value.startsLocal)) / 60_000;
    if (requestedMinutes > 480) {
      context.addIssue({ code: "custom", message: "單筆加班不得超過 8 小時", path: ["endsLocal"] });
    }
  }
});

export const workRequestDecisionSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  reviewNote: z.string().trim().max(500),
});

export const workRequestWithdrawalSchema = z.object({ requestId: z.uuid() });

export const leaveEntitlementInputSchema = z.object({
  employeeId: z.uuid(),
  leaveTypeId: z.uuid(),
  entitlementYear: z.coerce.number().int().min(2000).max(2200),
  entitledHours: z.coerce.number().min(0).max(8784),
  note: z.string().trim().max(200),
});

export type WorkRequestActionState = { ok: boolean; message: string };

export const workRequestTypeLabels = { leave: "請假", overtime: "加班" } as const;
export const workRequestDecisionLabels = { approved: "已核准", rejected: "已拒絕" } as const;

export function calculateLeaveBalance(entitledMinutes: number, usedMinutes: number) {
  return { entitledMinutes, usedMinutes, remainingMinutes: entitledMinutes - usedMinutes };
}

export function formatRequestedMinutes(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [days ? `${days} 天` : "", hours ? `${hours} 小時` : "", rest ? `${rest} 分鐘` : ""]
    .filter(Boolean).join(" ") || "0 分鐘";
}

export type AnnualLeaveGrant = {
  id: string;
  grantedDays: number;
  grantedMinutes: number;
  usedMinutes: number;
  adjustmentMinutes: number;
  periodStart: string;
  periodEndExclusive: string;
  serviceMilestoneMonths: number;
  settlementStatus: "not_due" | "pending" | "settled";
};

export type AnnualLeaveBalance = {
  configured: boolean;
  standardDayMinutes: number;
  availableMinutes: number;
  pendingMinutes: number;
  usedMinutes: number;
  grants: AnnualLeaveGrant[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseAnnualLeaveBalance(value: unknown): AnnualLeaveBalance {
  const source = record(value);
  const standardDayMinutes = Math.max(1, finite(source.standard_day_minutes, 480));
  const grants = Array.isArray(source.grants) ? source.grants.map((item) => {
    const grant = record(item);
    const settlementStatus = ["not_due", "pending", "settled"].includes(String(grant.settlement_status))
      ? String(grant.settlement_status) as AnnualLeaveGrant["settlementStatus"] : "not_due";
    return {
      id: String(grant.id ?? ""), grantedDays: finite(grant.granted_days),
      grantedMinutes: finite(grant.granted_minutes), usedMinutes: finite(grant.used_minutes),
      adjustmentMinutes: finite(grant.adjustment_minutes), periodStart: String(grant.period_start ?? ""),
      periodEndExclusive: String(grant.period_end_exclusive ?? ""),
      serviceMilestoneMonths: finite(grant.service_milestone_months), settlementStatus,
    };
  }) : [];
  return {
    configured: source.configured === true,
    standardDayMinutes,
    availableMinutes: finite(source.available_minutes),
    pendingMinutes: finite(source.pending_minutes),
    usedMinutes: finite(source.used_minutes),
    grants,
  };
}

export function formatAnnualLeaveMinutes(minutes: number, standardDayMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const safeDay = Math.max(1, Math.round(standardDayMinutes));
  const days = Math.floor(safeMinutes / safeDay);
  const remainder = safeMinutes % safeDay;
  const hours = Math.floor(remainder / 60);
  const rest = remainder % 60;
  return [days ? `${days} 天` : "", hours ? `${hours} 小時` : "", rest ? `${rest} 分鐘` : ""]
    .filter(Boolean).join(" ") || "0 分鐘";
}

export function annualLeavePeriodEnd(periodEndExclusive: string) {
  const end = new Date(`${periodEndExclusive}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return periodEndExclusive;
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}
