import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { nextPunchLabel, parseQrPunchValue, punchDisplayLabel, punchInputSchema, qrPunchInputSchema, scheduledPunchLabel } from "../lib/punch-contract";
import { createKioskQrValue } from "../lib/qr-kiosk-token";

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

describe("QR punch contract", () => {
  const deviceId = "4c44df53-0470-4b4f-8239-7f901f2bb43e";
  const token = "a".repeat(64);

  it("accepts both current local signatures and legacy QR values", () => {
    expect(parseQrPunchValue(`8SOTS-PUNCH:1:${deviceId}:${token}`)).toEqual({ deviceId, token });
    expect(parseQrPunchValue(`8SOTS-PUNCH:2:${deviceId}:59642320:${token}`)).toEqual({
      deviceId, token: `2:59642320:${token}`,
    });
    expect(parseQrPunchValue(`https://example.com/8SOTS-PUNCH:1:${deviceId}:${token}`)).toBeNull();
    expect(parseQrPunchValue(`8SOTS-PUNCH:1:bad:${token}`)).toBeNull();
    expect(parseQrPunchValue(`8SOTS-PUNCH:1:${deviceId}:short`)).toBeNull();
    expect(parseQrPunchValue(`8SOTS-PUNCH:2:${deviceId}:bad:${token}`)).toBeNull();
  });

  it("rejects malformed QR punch submissions before calling the database", () => {
    const valid = { deviceId, token, idempotencyKey: crypto.randomUUID() };
    expect(qrPunchInputSchema.safeParse(valid).success).toBe(true);
    expect(qrPunchInputSchema.safeParse({ ...valid, token: `2:59642320:${token}` }).success).toBe(true);
    expect(qrPunchInputSchema.safeParse({ ...valid, token: "b" }).success).toBe(false);
    expect(qrPunchInputSchema.safeParse({ ...valid, token: `2:-1:${token}` }).success).toBe(false);
    expect(qrPunchInputSchema.safeParse({ ...valid, idempotencyKey: "repeat" }).success).toBe(false);
  });

  it("signs the exact device and time slot with a derived key", async () => {
    const credential = "f".repeat(64);
    const slot = 59642320;
    const key = createHash("sha256").update(credential).digest();
    const signature = createHmac("sha256", key).update(`${deviceId}:${slot}`).digest("hex");
    expect(await createKioskQrValue(deviceId, credential, slot)).toBe(
      `8SOTS-PUNCH:2:${deviceId}:${slot}:${signature}`,
    );
  });
});
