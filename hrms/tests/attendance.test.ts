import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { attendanceRangeSchema, correctionDecisionSchema, correctionInputSchema } from "../lib/attendance-contract";

describe("attendance contracts", () => {
  it("accepts a bounded calculation range", () => {
    expect(attendanceRangeSchema.safeParse({ dateFrom: "2026-08-01", dateTo: "2026-08-31" }).success).toBe(true);
    expect(attendanceRangeSchema.safeParse({ dateFrom: "2026-08-01", dateTo: "2026-09-02" }).success).toBe(false);
  });

  it("requires a specific correction reason and valid proposed timestamp", () => {
    const input = {
      eventType: "clock_out",
      idempotencyKey: "35cfa1d3-f9b5-48b0-a200-2f463990e4d6",
      proposedOccurredAt: "2026-08-25T13:00:00.000Z",
      reason: "下班時裝置沒有網路，回家後才發現缺卡",
      timezone: "Asia/Taipei",
      workDate: "2026-08-25",
    };
    expect(correctionInputSchema.safeParse(input).success).toBe(true);
    expect(correctionInputSchema.safeParse({ ...input, reason: "忘記" }).success).toBe(false);
  });

  it("limits correction decisions to approved or rejected", () => {
    expect(correctionDecisionSchema.safeParse({ requestId: crypto.randomUUID(), decision: "approved", reviewNote: "" }).success).toBe(true);
    expect(correctionDecisionSchema.safeParse({ requestId: crypto.randomUUID(), decision: "pending", reviewNote: "" }).success).toBe(false);
  });

  it("keeps attendance day evidence drill-down and recalculation warnings visible", () => {
    const adminPage = readFileSync(join(process.cwd(), "app/admin/attendance/page.tsx"), "utf8");
    const detailPage = readFileSync(join(process.cwd(), "app/admin/attendance/[dayId]/page.tsx"), "utf8");
    expect(adminPage).toContain("需要重新計算");
    expect(adminPage).toContain("/admin/attendance/${day.id}");
    expect(detailPage).toContain("班段計算明細");
    expect(detailPage).toContain("異常證據");
    expect(detailPage).toContain("當日原始打卡");
  });
});
