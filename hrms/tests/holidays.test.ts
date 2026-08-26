import { describe, expect, it } from "vitest";
import {
  holidayDeleteSchema,
  holidayEntrySchema,
  holidayKindLabels,
  holidayYear,
  holidayYearBounds,
  HOLIDAY_KINDS,
} from "../lib/holidays";
import { computeScheduleWarnings } from "../lib/schedule-warnings";

const employees = [
  { id: "11111111-1111-1111-1111-111111111111", full_name: "王小明", employee_no: "E001" },
  { id: "22222222-2222-2222-2222-222222222222", full_name: "陳小華", employee_no: "E002" },
];
const weekDates = [
  "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27",
  "2026-08-28", "2026-08-29", "2026-08-30",
];

describe("holiday validation", () => {
  it("accepts a valid holiday entry and trims the name", () => {
    const parsed = holidayEntrySchema.parse({
      holidayDate: "2026-10-10", name: "  國慶日  ", kind: "national", note: "",
    });
    expect(parsed.name).toBe("國慶日");
    expect(parsed.kind).toBe("national");
  });

  it("rejects malformed dates and unknown kinds", () => {
    expect(holidayEntrySchema.safeParse({ holidayDate: "2026/10/10", name: "x", kind: "national" }).success).toBe(false);
    expect(holidayEntrySchema.safeParse({ holidayDate: "2026-10-10", name: "x", kind: "weekend" }).success).toBe(false);
    expect(holidayEntrySchema.safeParse({ holidayDate: "2026-10-10", name: "", kind: "national" }).success).toBe(false);
  });

  it("validates the delete payload as a uuid", () => {
    expect(holidayDeleteSchema.safeParse({ holidayId: "not-a-uuid" }).success).toBe(false);
    expect(holidayDeleteSchema.safeParse({ holidayId: "3f1a7b2c-4d5e-4f6a-8b9c-0d1e2f3a4b5c" }).success).toBe(true);
  });

  it("labels every holiday kind", () => {
    for (const kind of HOLIDAY_KINDS) {
      expect(holidayKindLabels[kind]).toBeTruthy();
    }
  });

  it("derives the year and its bounds", () => {
    expect(holidayYear("2026-10-10")).toBe(2026);
    expect(holidayYear("2027")).toBe(2027);
    expect(holidayYear(undefined, new Date(Date.UTC(2025, 0, 1)))).toBe(2025);
    expect(holidayYearBounds(2026)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
});

describe("schedule pre-publish warnings", () => {
  it("warns when the week has no assignments at all", () => {
    const warnings = computeScheduleWarnings({ weekDates, employees, holidays: [], assignments: [] });
    expect(warnings.some((w) => w.code === "empty_week" && w.level === "warn")).toBe(true);
  });

  it("warns about active employees with no shift while others are scheduled", () => {
    const warnings = computeScheduleWarnings({
      weekDates, employees, holidays: [],
      assignments: [{ employee_id: employees[0].id, work_date: "2026-08-24", shift_id: "s1" }],
    });
    const w = warnings.find((x) => x.code === "employee_no_shift");
    expect(w?.level).toBe("warn");
    expect(w?.message).toContain("陳小華");
    expect(w?.message).not.toContain("王小明");
  });

  it("flags a national holiday that still has assignments as an advisory notice", () => {
    const warnings = computeScheduleWarnings({
      weekDates, employees,
      holidays: [{ holiday_date: "2026-08-25", name: "測試假日", kind: "national" }],
      assignments: [
        { employee_id: employees[0].id, work_date: "2026-08-24", shift_id: "s1" },
        { employee_id: employees[1].id, work_date: "2026-08-25", shift_id: "s1" },
      ],
    });
    const w = warnings.find((x) => x.code === "holiday_scheduled");
    expect(w?.level).toBe("info");
    expect(w?.message).toContain("測試假日");
  });

  it("notes a make-up workday that has not been scheduled", () => {
    const warnings = computeScheduleWarnings({
      weekDates, employees,
      holidays: [{ holiday_date: "2026-08-29", name: "補班", kind: "makeup_workday" }],
      assignments: [{ employee_id: employees[0].id, work_date: "2026-08-24", shift_id: "s1" }],
    });
    expect(warnings.some((w) => w.code === "makeup_workday_unscheduled" && w.level === "info")).toBe(true);
  });

  it("ignores assignments and holidays outside the given week", () => {
    const warnings = computeScheduleWarnings({
      weekDates,
      employees: [employees[0]],
      holidays: [{ holiday_date: "2026-09-10", name: "隔月假日", kind: "national" }],
      assignments: [{ employee_id: employees[0].id, work_date: "2026-08-24", shift_id: "s1" }],
    });
    expect(warnings.some((w) => w.code === "holiday_scheduled")).toBe(false);
    expect(warnings.some((w) => w.code === "empty_week")).toBe(false);
    expect(warnings.some((w) => w.code === "employee_no_shift")).toBe(false);
  });

  it("does not count an unscheduled (null shift) cell as coverage", () => {
    const warnings = computeScheduleWarnings({
      weekDates,
      employees: [employees[0]],
      holidays: [],
      assignments: [{ employee_id: employees[0].id, work_date: "2026-08-24", shift_id: null }],
    });
    expect(warnings.some((w) => w.code === "empty_week")).toBe(true);
  });
});
