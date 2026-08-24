import { describe, expect, it } from "vitest";
import {
  assignmentFieldName,
  buildWeekDates,
  getWeekStart,
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
});

describe("schedule assignment form", () => {
  it("parses selected shifts and explicit unassigned cells", () => {
    const employeeId = "11111111-1111-4111-8111-111111111111";
    const shiftId = "22222222-2222-4222-8222-222222222222";
    const form = new FormData();
    form.set(assignmentFieldName(employeeId, "2026-08-24"), shiftId);
    form.set(assignmentFieldName(employeeId, "2026-08-25"), "");

    expect(parseScheduleAssignments(form)).toEqual([
      { employee_id: employeeId, work_date: "2026-08-24", shift_id: shiftId },
      { employee_id: employeeId, work_date: "2026-08-25", shift_id: null },
    ]);
  });

  it("ignores unrelated fields", () => {
    const form = new FormData();
    form.set("scheduleVersionId", "not-an-assignment");
    expect(parseScheduleAssignments(form)).toEqual([]);
  });
});
