import { z } from "zod";
import type { HolidayKind } from "./holidays";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const assignmentFieldPattern = /^assignment:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/i;

export const WEEKDAY_SHIFT_CODE = "WEEKDAY_SPLIT";
export const HOLIDAY_SHIFT_CODE = "HOLIDAY_CONTINUOUS";
export type ScheduleDayKind = "closed" | "weekday" | "holiday";

export const schedulePeriodSchema = z.object({
  periodStart: z.string().regex(isoDatePattern),
  periodEnd: z.string().regex(isoDatePattern),
}).refine(({ periodStart, periodEnd }) => periodEnd >= periodStart, {
  message: "排班結束日期不可早於開始日期。",
});

export const scheduleVersionSchema = z.object({
  scheduleVersionId: z.string().uuid(),
  weekStart: z.string().regex(isoDatePattern),
});

export type ScheduleAssignmentInput = {
  employee_id: string;
  work_date: string;
  shift_id: string | null;
  is_day_off: boolean;
  is_store_closed: boolean;
};

export const DAY_OFF_VALUE = "day_off";
export const STORE_CLOSED_VALUE = "store_closed";

function parseIsoDate(value: string): Date | null {
  if (!isoDatePattern.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day ? date : null;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getWeekStart(value?: string, today = new Date()): string {
  const input = value ? parseIsoDate(value) : null;
  const date = input ?? new Date(Date.UTC(
    today.getFullYear(), today.getMonth(), today.getDate(),
  ));
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return toIsoDate(date);
}

export function buildWeekDates(weekStart: string): string[] {
  const start = parseIsoDate(weekStart);
  if (!start) throw new Error("Invalid week start");
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return toIsoDate(date);
  });
}

export function getScheduleDayKind(date: string, holidayKind?: HolidayKind): ScheduleDayKind {
  const parsed = parseIsoDate(date);
  if (!parsed) throw new Error("Invalid schedule date");
  if (holidayKind === "company") return "closed";
  if (parsed.getUTCDay() === 1) return "closed";
  if (holidayKind === "makeup_workday") return "weekday";
  if (holidayKind === "national") return "holiday";
  const weekday = parsed.getUTCDay();
  if (weekday === 0 || weekday === 6) return "holiday";
  return "weekday";
}

export function isMonday(date: string): boolean {
  const parsed = parseIsoDate(date);
  if (!parsed) throw new Error("Invalid schedule date");
  return parsed.getUTCDay() === 1;
}

export function defaultShiftCodeForDate(date: string, holidayKind?: HolidayKind): string | null {
  const kind = getScheduleDayKind(date, holidayKind);
  if (kind === "closed") return null;
  return kind === "holiday" ? HOLIDAY_SHIFT_CODE : WEEKDAY_SHIFT_CODE;
}

export function shiftMinuteLabel(minute: number): string {
  const day = Math.floor(minute / 1440);
  const withinDay = minute % 1440;
  const hour = String(Math.floor(withinDay / 60)).padStart(2, "0");
  const minutes = String(withinDay % 60).padStart(2, "0");
  return `${day > 0 ? "翌日 " : ""}${hour}:${minutes}`;
}

export function assignmentFieldName(employeeId: string, workDate: string): string {
  return `assignment:${employeeId}:${workDate}`;
}

export function parseScheduleAssignments(formData: FormData): ScheduleAssignmentInput[] {
  const assignments: ScheduleAssignmentInput[] = [];
  for (const [key, value] of formData.entries()) {
    const match = key.match(assignmentFieldPattern);
    if (!match || typeof value !== "string") continue;
    assignments.push({
      employee_id: match[1].toLowerCase(),
      work_date: match[2],
      shift_id: value === "" || value === DAY_OFF_VALUE || value === STORE_CLOSED_VALUE ? null : z.string().uuid().parse(value),
      is_day_off: value === DAY_OFF_VALUE,
      is_store_closed: value === STORE_CLOSED_VALUE,
    });
  }
  return assignments;
}
