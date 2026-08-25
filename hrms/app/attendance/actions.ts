"use server";

import { revalidatePath } from "next/cache";
import { correctionInputSchema, type CorrectionActionState } from "@/lib/attendance-contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";

export async function requestPunchCorrection(input: unknown): Promise<CorrectionActionState> {
  const parsed = correctionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "請確認日期、時間與至少 10 字的更正原因。" };
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId) return { ok: false, message: "登入或組織資料已失效。" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_punch_correction", {
    p_event_type: parsed.data.eventType,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_proposed_occurred_at: parsed.data.proposedOccurredAt,
    p_reason: parsed.data.reason,
    p_tenant_id: workspace.tenantId,
    p_timezone: parsed.data.timezone,
    p_work_date: parsed.data.workDate,
  });
  if (error) {
    if (error.message.includes("outside allowed window")) return { ok: false, message: "只能申請今天起算 62 天內的打卡更正。" };
    if (error.message.includes("active linked employee")) return { ok: false, message: "此帳號尚未連結在職員工資料。" };
    return { ok: false, message: "更正申請送出失敗，請稍後再試。" };
  }
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  return { ok: true, message: "更正申請已送出，核准前不會改變出勤計算。" };
}
