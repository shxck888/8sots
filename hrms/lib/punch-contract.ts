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
