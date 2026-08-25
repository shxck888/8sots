import { z } from "zod";

export const attendanceRangeSchema = z.object({
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
}).refine(({ dateFrom, dateTo }) => {
  const from = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const to = Date.parse(`${dateTo}T00:00:00.000Z`);
  return to >= from && to - from <= 31 * 86_400_000;
}, "日期範圍必須為 1 至 32 天");

export const correctionInputSchema = z.object({
  workDate: z.iso.date(),
  eventType: z.enum(["clock_in", "clock_out"]),
  proposedOccurredAt: z.iso.datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(64)
    .regex(/^[A-Za-z_]+\/[A-Za-z0-9_+/-]+(?:\/[A-Za-z0-9_+/-]+)*$/),
  reason: z.string().trim().min(10).max(500),
  idempotencyKey: z.uuid(),
});

export const correctionDecisionSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  reviewNote: z.string().trim().max(500),
});

export const attendanceExceptionLabels = {
  missing_clock_in: "缺上班卡",
  missing_clock_out: "缺下班卡",
  late: "晚於排班",
  early_leave: "早於排班離開",
  unmatched_punch: "多餘打卡",
  unscheduled_punch: "未排班打卡",
} as const;

export const attendanceStatusLabels = {
  complete: "完整",
  exception: "有異常",
  unscheduled: "未排班",
} as const;

export type CorrectionActionState = { ok: boolean; message: string };
