import { describe, expect, it } from "vitest";
import { attendanceRuleSetSchema, graceLabel, GRACE_MAX } from "../lib/attendance-rules";

describe("attendance rule set validation", () => {
  it("accepts valid grace minutes and coerces numeric strings", () => {
    const parsed = attendanceRuleSetSchema.parse({
      lateGraceMinutes: "5", earlyLeaveGraceMinutes: "10", effectiveFrom: "2026-09-01",
    });
    expect(parsed.lateGraceMinutes).toBe(5);
    expect(parsed.earlyLeaveGraceMinutes).toBe(10);
    expect(parsed.effectiveFrom).toBe("2026-09-01");
  });

  it("accepts the boundary values 0 and 120", () => {
    expect(attendanceRuleSetSchema.safeParse({ lateGraceMinutes: 0, earlyLeaveGraceMinutes: GRACE_MAX, effectiveFrom: "2026-01-01" }).success).toBe(true);
  });

  it("rejects out-of-range, non-integer and bad dates", () => {
    expect(attendanceRuleSetSchema.safeParse({ lateGraceMinutes: -1, earlyLeaveGraceMinutes: 0, effectiveFrom: "2026-01-01" }).success).toBe(false);
    expect(attendanceRuleSetSchema.safeParse({ lateGraceMinutes: 121, earlyLeaveGraceMinutes: 0, effectiveFrom: "2026-01-01" }).success).toBe(false);
    expect(attendanceRuleSetSchema.safeParse({ lateGraceMinutes: 5.5, earlyLeaveGraceMinutes: 0, effectiveFrom: "2026-01-01" }).success).toBe(false);
    expect(attendanceRuleSetSchema.safeParse({ lateGraceMinutes: 5, earlyLeaveGraceMinutes: 0, effectiveFrom: "2026/01/01" }).success).toBe(false);
  });

  it("labels grace minutes for display", () => {
    expect(graceLabel(0)).toBe("不寬限");
    expect(graceLabel(5)).toBe("5 分鐘");
  });
});
