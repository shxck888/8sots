import { z } from "zod";

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "時間格式不正確");

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
