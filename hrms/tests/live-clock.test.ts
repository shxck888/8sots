import { describe, expect, it } from "vitest";
import { estimateServerEpochAtReceipt, formatTaipeiClock } from "../lib/live-clock";

describe("live home clock", () => {
  it("displays Taipei time with seconds across midnight", () => {
    expect(formatTaipeiClock(Date.parse("2026-09-22T15:59:59.000Z"))).toBe("23:59:59");
    expect(formatTaipeiClock(Date.parse("2026-09-22T16:00:00.000Z"))).toBe("00:00:00");
  });

  it("estimates the current server time from the request round trip", () => {
    expect(estimateServerEpochAtReceipt("2026-09-22T16:00:00.000Z", 200))
      .toBe(Date.parse("2026-09-22T16:00:00.100Z"));
    expect(estimateServerEpochAtReceipt("invalid", 200)).toBeNull();
    expect(estimateServerEpochAtReceipt("2026-09-22T16:00:00.000Z", -1)).toBeNull();
  });
});
