"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { workRequestInputSchema, workRequestWithdrawalSchema, type WorkRequestActionState } from "@/lib/work-request-contract";
import { proofObjectPath, validateProofFile } from "@/lib/work-request-proofs";

export async function createWorkRequest(input: unknown): Promise<WorkRequestActionState> {
  const parsed = workRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    const overtimeLimit = parsed.error.issues.some((issue) => issue.message.includes("8 小時"));
    const leaveDay = parsed.error.issues.some((issue) => issue.message.includes("週二至週五"));
    const singleDate = parsed.error.issues.some((issue) => issue.message.includes("一個日期"));
    return { ok: false, message: overtimeLimit ? "單筆加班最多 8 小時；跨日可以，但總時數不得超過 8 小時。" : singleDate ? "每筆請假只能選一個日期；多日請假請分開送出。" : leaveDay ? "請假只能排週二至週五；週一公休，週末不可排休。" : "請確認類型、起訖時間及至少 5 個字的原因。" };
  }

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
    if (error.message.includes("overtime duration")) {
      return { ok: false, message: "單筆加班最多 8 小時；跨日可以，但總時數不得超過 8 小時。" };
    }
    if (error.message.includes("Tuesday through Friday")) {
      return { ok: false, message: "請假只能排週二至週五；週一公休，週末不可排休。" };
    }
    if (error.message.includes("not allowed on holidays")) {
      return { ok: false, message: "所選期間包含國定或公司假日，假日不可排休。" };
    }
    if (error.message.includes("one local date")) {
      return { ok: false, message: "每筆請假只能選一個日期；多日請假請分開送出。" };
    }
    return { ok: false, message: "申請送出失敗，請稍後再試。" };
  }

  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  return { ok: true, message: "申請已送出，請等待管理員審核。" };
}

export async function attachWorkRequestProof(formData: FormData): Promise<WorkRequestActionState> {
  const requestId = formData.get("requestId");
  const file = formData.get("proof");
  if (typeof requestId !== "string" || !(file instanceof File)) {
    return { ok: false, message: "上傳內容不正確。" };
  }

  const validation = validateProofFile(file);
  if (!validation.ok) return { ok: false, message: validation.error };

  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || !workspace.employeeId) {
    return { ok: false, message: "此帳號尚未連結在職員工資料。" };
  }

  const supabase = await createSupabaseServerClient();
  const path = proofObjectPath({
    tenantId: workspace.tenantId,
    authUserId: workspace.userId,
    requestId,
    fileId: randomUUID(),
    extension: validation.extension,
  });

  const { error: uploadError } = await supabase.storage
    .from("work-request-proofs")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { ok: false, message: "證明上傳失敗，請稍後再試。" };

  const { error } = await supabase.rpc("attach_work_request_proof", {
    p_tenant_id: workspace.tenantId,
    p_request_id: requestId,
    p_object_path: path,
    p_file_name: file.name.slice(0, 200),
    p_content_type: file.type,
    p_size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from("work-request-proofs").remove([path]);
    if (error.code === "55000") return { ok: false, message: "已審核或已撤回的申請無法再附證明。" };
    return { ok: false, message: "證明附加失敗，請稍後再試。" };
  }

  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  return { ok: true, message: "證明已上傳。" };
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
