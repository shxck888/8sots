"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { workRequestInputSchema, workRequestWithdrawalSchema, type WorkRequestActionState } from "@/lib/work-request-contract";

export async function createWorkRequest(input: unknown): Promise<WorkRequestActionState> {
  const parsed = workRequestInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "請確認類型、起訖時間及至少 5 個字的原因。" };

  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || !workspace.employeeId) {
    return { ok: false, message: "此帳號尚未連結在職員工資料。" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_work_request", {
    p_ends_local: parsed.data.endsLocal.replace("T", " "),
    p_idempotency_key: parsed.data.idempotencyKey,
    p_leave_type_id: parsed.data.requestType === "leave" ? parsed.data.leaveTypeId || null : null,
    p_reason: parsed.data.reason,
    p_request_type: parsed.data.requestType,
    p_starts_local: parsed.data.startsLocal.replace("T", " "),
    p_tenant_id: workspace.tenantId,
  });
  if (error) {
    if (error.message.includes("outside allowed window")) {
      return { ok: false, message: "申請日期限過去 62 天至未來 366 天內。" };
    }
    if (error.message.includes("active linked employee")) {
      return { ok: false, message: "此帳號尚未連結在職員工資料。" };
    }
    return { ok: false, message: "申請送出失敗，請稍後再試。" };
  }

  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  return { ok: true, message: "申請已送出，請等待管理員審核。" };
}

export async function withdrawWorkRequest(formData: FormData) {
  const parsed = workRequestWithdrawalSchema.safeParse({ requestId: formData.get("requestId") });
  if (!parsed.success) return;
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || !workspace.employeeId) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("withdraw_work_request", {
    p_request_id: parsed.data.requestId,
    p_tenant_id: workspace.tenantId,
  });
  revalidatePath("/requests");
  revalidatePath("/admin/requests");
}
