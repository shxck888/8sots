import { describe, expect, it } from "vitest";
import { nextPunchLabel, punchDisplayLabel, punchInputSchema, scheduledPunchLabel } from "../lib/punch-contract";

const validInput = {
  accuracyM: 18.4,
  clientOccurredAt: "2026-08-25T03:00:00.000Z",
  idempotencyKey: "4c44df53-0470-4b4f-8239-7f901f2bb43e",
  latitude: 25.033,
  locationConsent: true as const,
  longitude: 121.5654,
  timezone: "Asia/Taipei",
};

describe("GPS punch contract", () => {
  it("accepts complete consented GPS evidence", () => {
    expect(punchInputSchema.safeParse(validInput).success).toBe(true);
  });

  it("requires explicit location consent", () => {
    expect(punchInputSchema.safeParse({ ...validInput, locationConsent: false }).success).toBe(false);
  });

  it("rejects impossible coordinates and unusable accuracy", () => {
    expect(punchInputSchema.safeParse({ ...validInput, latitude: 91 }).success).toBe(false);
    expect(punchInputSchema.safeParse({ ...validInput, accuracyM: 1001 }).success).toBe(false);
  });

  it("alternates the next action for split shifts", () => {
    expect(nextPunchLabel(null)).toBe("上班打卡");
    expect(nextPunchLabel("clock_in")).toBe("下班打卡");
    expect(nextPunchLabel("clock_out")).toBe("上班打卡");
  });

  it("requires lunch punches only for the published lunch shift", () => {
    expect([0, 1, 2, 3, 4].map((count) => scheduledPunchLabel(count, true))).toEqual([
      "上班打卡", "開始午休打卡", "結束午休打卡", "下班打卡", null,
    ]);
    expect([0, 1, 2].map((count) => scheduledPunchLabel(count, false))).toEqual([
      "上班打卡", "下班打卡", null,
    ]);
    expect(punchDisplayLabel("clock_out", 1, true)).toBe("開始午休");
    expect(punchDisplayLabel("clock_in", 2, true)).toBe("結束午休");
    expect(punchDisplayLabel("clock_out", 1, false)).toBe("下班");
  });
});
