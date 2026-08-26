"use server";

import { revalidatePath } from "next/cache";
import { punchInputSchema, type PunchActionState } from "@/lib/punch-contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";

function safeMessage(message: string): string {
  if (message.includes("active linked employee")) return "此帳號尚未連結在職員工資料。";
  if (message.includes("client timestamp")) return "定位資料已逾時，請重新取得定位後打卡。";
  if (message.includes("invalid GPS")) return "定位資料或精度不符合要求，請移至訊號較好的位置再試。";
  if (message.includes("location consent")) return "必須同意本次使用裝置定位才能打卡。";
  if (message.includes("punch cooldown")) return "剛剛已完成打卡，請等待 30 秒後再操作。";
  return "打卡未完成，請稍後再試。";
}

export async function recordGpsPunch(input: unknown): Promise<PunchActionState> {
  const parsed = punchInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "定位資料格式不正確，請重新取得定位。" };

  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId) return { ok: false, message: "登入或組織資料已失效，請重新登入。" };

  const supabase = await createSupabaseServerClient();
  const { data: punchId, error } = await supabase.rpc("record_gps_punch", {
    p_accuracy_m: parsed.data.accuracyM,
    p_client_occurred_at: parsed.data.clientOccurredAt,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_latitude: parsed.data.latitude,
    p_location_consent: parsed.data.locationConsent,
    p_longitude: parsed.data.longitude,
    p_tenant_id: workspace.tenantId,
    p_timezone: parsed.data.timezone,
  });
  if (error || !punchId) return { ok: false, message: safeMessage(error?.message ?? "") };

  const { data: record, error: readError } = await supabase
    .from("punch_records")
    .select("event_type, occurred_at, work_date")
    .eq("tenant_id", workspace.tenantId)
    .eq("id", punchId)
    .single();
  if (readError || !record) return { ok: false, message: "打卡已送出，但紀錄讀取失敗，請至出勤紀錄確認。" };

  revalidatePath("/");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  return { ok: true, eventType: record.event_type, occurredAt: record.occurred_at, workDate: record.work_date };
}
