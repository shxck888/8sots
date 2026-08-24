import { describe, expect, it } from "vitest";
import { createHealthStatus } from "../lib/health";

describe("createHealthStatus", () => {
  it("returns a stable service identity and ISO timestamp", () => {
    const now = new Date("2026-08-24T03:20:00.000Z");
    expect(createHealthStatus(now)).toEqual({
      status: "ok",
      service: "restaurant-ehr",
      timestamp: "2026-08-24T03:20:00.000Z",
    });
  });
});
