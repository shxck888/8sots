import { z } from "zod";

export const punchInputSchema = z.object({
  idempotencyKey: z.uuid(),
  clientOccurredAt: z.iso.datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(64)
    .regex(/^[A-Za-z_]+\/[A-Za-z0-9_+/-]+(?:\/[A-Za-z0-9_+/-]+)*$/),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().positive().max(1000),
  locationConsent: z.literal(true),
});

export type PunchEventType = "clock_in" | "clock_out";
export type PunchInput = z.infer<typeof punchInputSchema>;

export const qrPunchInputSchema = z.object({
  deviceId: z.uuid(),
  token: z.string().regex(/^(?:[0-9a-f]{64}|2:[0-9]{1,12}:[0-9a-f]{64})$/),
  idempotencyKey: z.uuid(),
});

export function parseQrPunchValue(value: string): { deviceId: string; token: string } | null {
  const trimmed = value.trim();
  const legacy = /^8SOTS-PUNCH:1:([0-9a-f-]{36}):([0-9a-f]{64})$/.exec(trimmed);
  const local = /^8SOTS-PUNCH:2:([0-9a-f-]{36}):([0-9]{1,12}):([0-9a-f]{64})$/.exec(trimmed);
  const deviceId = legacy?.[1] ?? local?.[1];
  if (!deviceId) return null;
  return z.uuid().safeParse(deviceId).success
    ? { deviceId, token: legacy?.[2] ?? `2:${local![2]}:${local![3]}` }
    : null;
}

export type PunchActionState =
  | { ok: true; eventType: PunchEventType; occurredAt: string; workDate: string }
  | { ok: false; message: string };

export const punchEventLabels: Record<PunchEventType, string> = {
  clock_in: "上班",
  clock_out: "下班",
};

export const punchSourceLabels = { web_gps: "網頁 GPS", qr: "QR Code" } as const;
export const locationVerificationLabels = {
  not_configured: "尚未設定店址圍欄",
  inside_geofence: "圍欄內",
  outside_geofence: "圍欄外",
  unavailable: "無法驗證",
} as const;

export function nextPunchLabel(lastEventType: PunchEventType | null): string {
  return lastEventType === "clock_in" ? "下班打卡" : "上班打卡";
}

export function scheduledPunchLabel(punchCount: number, hasLunchBreak: boolean): string | null {
  const labels = hasLunchBreak
    ? ["上班打卡", "開始午休打卡", "結束午休打卡", "下班打卡"]
    : ["上班打卡", "下班打卡"];
  return labels[punchCount] ?? null;
}

export function punchDisplayLabel(eventType: PunchEventType, index: number, hasLunchBreak: boolean): string {
  if (hasLunchBreak && index === 1 && eventType === "clock_out") return "開始午休";
  if (hasLunchBreak && index === 2 && eventType === "clock_in") return "結束午休";
  return punchEventLabels[eventType];
}
