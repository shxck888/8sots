import { z } from "zod";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const GRACE_MIN = 0;
export const GRACE_MAX = 120;

const graceMinutes = z.coerce
  .number({ message: "請輸入 0–120 的分鐘數。" })
  .int("寬限分鐘必須是整數。")
  .min(GRACE_MIN, "寬限分鐘不可小於 0。")
  .max(GRACE_MAX, "寬限分鐘最多 120。");

export const attendanceRuleSetSchema = z.object({
  lateGraceMinutes: graceMinutes,
  earlyLeaveGraceMinutes: graceMinutes,
  effectiveFrom: z.string().regex(isoDatePattern, "生效日期格式不正確。"),
});

export type AttendanceRuleSetInput = z.infer<typeof attendanceRuleSetSchema>;

export function graceLabel(minutes: number): string {
  return minutes === 0 ? "不寬限" : `${minutes} 分鐘`;
}
