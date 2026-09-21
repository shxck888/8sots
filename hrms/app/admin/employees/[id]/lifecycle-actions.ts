"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin";
import type { EmployeeLifecycleState } from "@/lib/employees";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const employeeIdSchema = z.uuid();
const archiveReasonSchema = z.string().trim().min(5, "封存原因至少需要 5 個字。").max(500);

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function authAdminOrNull() {
  try { return createSupabaseAdminClient(); }
  catch { return null; }
}

async function lifecycleContext(employeeId: string) {
  if (!employeeIdSchema.safeParse(employeeId).success) return null;
  const admin = await getAdminContext("employee.manage");
  if (!admin) return null;
  const supabase = await createSupabaseServerClient();
  const { data: employee } = await supabase.from("employees")
    .select("id, employee_no, auth_user_id, archived_at")
    .eq("tenant_id", admin.tenantId).eq("id", employeeId).maybeSingle();
  return employee ? { admin, supabase, employee } : null;
}

export async function archiveEmployee(
  employeeId: string, _state: EmployeeLifecycleState, formData: FormData,
): Promise<EmployeeLifecycleState> {
  const reason = archiveReasonSchema.safeParse(formData.get("reason"));
  if (!reason.success) return { message: reason.error.issues[0]?.message ?? "請填寫封存原因。" };
  const context = await lifecycleContext(employeeId);
  if (!context) return { message: "員工或管理員權限驗證失敗。" };
  const { data, error } = await context.supabase.rpc("archive_employee", {
    p_tenant_id: context.admin.tenantId, p_employee_id: employeeId, p_reason: reason.data,
  });
  if (error) return { message: error.message.includes("own employee") ? "不可封存自己的管理員員工資料。" : "員工封存失敗，請稍後再試。" };

  const authUserId = String(object(data).auth_user_id ?? "");
  let authWarning = false;
  if (authUserId) {
    const authAdmin = authAdminOrNull();
    if (!authAdmin) authWarning = true;
    else {
      const { error: banError } = await authAdmin.auth.admin.updateUserById(authUserId, { ban_duration: "876000h" });
      authWarning = Boolean(banError);
    }
  }
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  redirect(`/admin/employees/${employeeId}?archived=1${authWarning ? "&authWarning=1" : ""}`);
}

export async function restoreEmployee(
  employeeId: string, _state: EmployeeLifecycleState, _formData: FormData,
): Promise<EmployeeLifecycleState> {
  void _state; void _formData;
  const context = await lifecycleContext(employeeId);
  if (!context) return { message: "員工或管理員權限驗證失敗。" };
  const authUserId = context.employee.auth_user_id;
  const authAdmin = authUserId ? authAdminOrNull() : null;
  if (authUserId && !authAdmin) return { message: "登入帳號服務尚未設定，無法安全恢復員工。" };
  if (authUserId && authAdmin) {
    const { error: unbanError } = await authAdmin.auth.admin.updateUserById(authUserId, { ban_duration: "none" });
    if (unbanError) return { message: "登入帳號恢復失敗，員工仍維持封存。" };
  }
  const { error } = await context.supabase.rpc("restore_archived_employee", {
    p_tenant_id: context.admin.tenantId, p_employee_id: employeeId,
  });
  if (error) {
    if (authUserId && authAdmin) await authAdmin.auth.admin.updateUserById(authUserId, { ban_duration: "876000h" });
    return { message: "員工恢復失敗，登入狀態已還原。" };
  }
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  redirect(`/admin/employees/${employeeId}?restored=1`);
}

export async function deleteEmployeePermanently(
  employeeId: string, _state: EmployeeLifecycleState, formData: FormData,
): Promise<EmployeeLifecycleState> {
  const context = await lifecycleContext(employeeId);
  if (!context) return { message: "員工或管理員權限驗證失敗。" };
  if (String(formData.get("confirmation") ?? "").trim().toUpperCase() !== context.employee.employee_no.toUpperCase()) {
    return { message: `請輸入員工編號 ${context.employee.employee_no} 確認永久刪除。` };
  }
  const { data, error } = await context.supabase.rpc("delete_unreferenced_employee", {
    p_tenant_id: context.admin.tenantId, p_employee_id: employeeId,
  });
  if (error) return { message: error.message.includes("retained history") ? "此員工已有必須保留的歷史紀錄，只能維持封存。" : "員工永久刪除失敗。" };

  const result = object(data);
  const photoPath = String(result.photo_path ?? "");
  const authUserId = String(result.auth_user_id ?? "");
  let cleanupWarning = false;
  if (photoPath) {
    const { error: photoError } = await context.supabase.storage.from("employee-photos").remove([photoPath]);
    cleanupWarning ||= Boolean(photoError);
  }
  if (authUserId) {
    const authAdmin = authAdminOrNull();
    if (!authAdmin) cleanupWarning = true;
    else {
      const { error: authError } = await authAdmin.auth.admin.deleteUser(authUserId);
      cleanupWarning ||= Boolean(authError);
    }
  }
  revalidatePath("/admin/employees");
  redirect(`/admin/employees?deleted=1${cleanupWarning ? "&cleanupWarning=1" : ""}`);
}
