import { z } from "zod";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const HOLIDAY_KINDS = ["national", "company", "makeup_workday"] as const;
export type HolidayKind = (typeof HOLIDAY_KINDS)[number];

export const holidayKindLabels: Record<HolidayKind, string> = {
  national: "國定假日",
  company: "公司休假",
  makeup_workday: "補班日",
};

export const holidayEntrySchema = z.object({
  holidayDate: z.string().regex(isoDatePattern, "日期格式不正確。"),
  name: z.string().trim().min(1, "請輸入假日名稱。").max(80, "假日名稱最多 80 字。"),
  kind: z.enum(HOLIDAY_KINDS),
  note: z.string().trim().max(300, "備註最多 300 字。").optional().default(""),
});

export const holidayDeleteSchema = z.object({
  holidayId: z.string().uuid(),
});

export type HolidayEntryInput = z.infer<typeof holidayEntrySchema>;

/** Year of an ISO date string, or the current UTC year when the value is missing/invalid. */
export function holidayYear(value?: string, today = new Date()): number {
  if (value && /^\d{4}$/.test(value)) return Number(value);
  if (value && isoDatePattern.test(value)) return Number(value.slice(0, 4));
  return today.getUTCFullYear();
}

export function holidayYearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}
