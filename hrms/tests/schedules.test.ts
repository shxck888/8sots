import { describe, expect, it } from "vitest";
import {
  assignmentFieldName,
  buildWeekDates,
  defaultShiftCodeForDate,
  getScheduleDayKind,
  getWeekStart,
  isMonday,
  parseScheduleAssignments,
  schedulePeriodSchema,
  shiftMinuteLabel,
} from "../lib/schedules";

describe("schedule week helpers", () => {
  it("normalizes any selected date to Monday", () => {
    expect(getWeekStart("2026-08-25")).toBe("2026-08-24");
    expect(getWeekStart("2026-08-30")).toBe("2026-08-24");
  });

  it("builds a seven-day local-date week without timezone drift", () => {
    expect(buildWeekDates("2026-08-24")).toEqual([
      "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27",
      "2026-08-28", "2026-08-29", "2026-08-30",
    ]);
  });

  it("rejects invalid or reversed schedule periods", () => {
    expect(schedulePeriodSchema.safeParse({ periodStart: "2026-08-30", periodEnd: "2026-08-24" }).success).toBe(false);
    expect(schedulePeriodSchema.safeParse({ periodStart: "not-a-date", periodEnd: "2026-08-24" }).success).toBe(false);
  });

  it("formats ordinary and cross-midnight minute offsets", () => {
    expect(shiftMinuteLabel(600)).toBe("10:00");
    expect(shiftMinuteLabel(1560)).toBe("翌日 02:00");
  });

  it("uses the restaurant default shift for each operating day", () => {
    expect(getScheduleDayKind("2026-09-28")).toBe("closed");
    expect(isMonday("2026-09-28")).toBe(true);
    expect(defaultShiftCodeForDate("2026-09-28")).toBeNull();
    expect(defaultShiftCodeForDate("2026-09-28", "national")).toBeNull();
    expect(defaultShiftCodeForDate("2026-09-29")).toBe("WEEKDAY_SPLIT");
    expect(defaultShiftCodeForDate("2026-10-03")).toBe("HOLIDAY_CONTINUOUS");
    expect(defaultShiftCodeForDate("2026-10-04")).toBe("HOLIDAY_CONTINUOUS");
  });

  it("lets the holiday calendar override the weekday default", () => {
    expect(defaultShiftCodeForDate("2026-10-06", "national")).toBe("HOLIDAY_CONTINUOUS");
    expect(defaultShiftCodeForDate("2026-10-03", "makeup_workday")).toBe("WEEKDAY_SPLIT");
    expect(defaultShiftCodeForDate("2026-10-06", "company")).toBeNull();
  });
});

describe("schedule assignment form", () => {
  it("parses shifts, days off, store closures, and unassigned cells separately", () => {
    const employeeId = "11111111-1111-4111-8111-111111111111";
    const shiftId = "22222222-2222-4222-8222-222222222222";
    const form = new FormData();
    form.set(assignmentFieldName(employeeId, "2026-08-24"), shiftId);
    form.set(assignmentFieldName(employeeId, "2026-08-25"), "");
    form.set(assignmentFieldName(employeeId, "2026-08-26"), "day_off");
    form.set(assignmentFieldName(employeeId, "2026-08-27"), "store_closed");

    expect(parseScheduleAssignments(form)).toEqual([
      { employee_id: employeeId, work_date: "2026-08-24", shift_id: shiftId, is_day_off: false, is_store_closed: false },
      { employee_id: employeeId, work_date: "2026-08-25", shift_id: null, is_day_off: false, is_store_closed: false },
      { employee_id: employeeId, work_date: "2026-08-26", shift_id: null, is_day_off: true, is_store_closed: false },
      { employee_id: employeeId, work_date: "2026-08-27", shift_id: null, is_day_off: false, is_store_closed: true },
    ]);
  });

  it("ignores unrelated fields", () => {
    const form = new FormData();
    form.set("scheduleVersionId", "not-an-assignment");
    expect(parseScheduleAssignments(form)).toEqual([]);
  });
});
