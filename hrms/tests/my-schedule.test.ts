import { describe, expect, it } from "vitest";
import { formatScheduledHours, formatTaipeiDateTime, getMonthBounds, taipeiDateKey } from "../lib/schedule-display";

describe("employee schedule date helpers", () => {
  it("uses the Taiwan calendar date across the UTC day boundary", () => {
    expect(taipeiDateKey(new Date("2026-08-24T16:30:00.000Z"))).toBe("2026-08-25");
  });

  it("returns inclusive month bounds, including leap years", () => {
    expect(getMonthBounds("2028-02-10")).toEqual({
      dateFrom: "2028-02-01",
      dateTo: "2028-02-29",
    });
  });

  it("formats whole and partial scheduled hours", () => {
    expect(formatScheduledHours(540)).toBe("9");
    expect(formatScheduledHours(510)).toBe("8.5");
  });

  it("formats a punch timestamp without mixing incompatible Intl options", () => {
    const formatted = formatTaipeiDateTime("2026-08-25T06:55:12.000Z");
    expect(formatted).toContain("2026");
    expect(formatted).toContain("14:55:12");
    expect(formatTaipeiDateTime("invalid")).toBe("時間資料異常");
  });
});
