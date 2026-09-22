"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin";
import { isSupervisorPermissionCode, type SupervisorPermissionState } from "@/lib/supervisor-permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateEmployeeAdminPermissions(
  employeeId: string,
  _state: SupervisorPermissionState,
  formData: FormData,
): Promise<SupervisorPermissionState> {
  void _state;
  const admin = await getAdminContext("access.manage");
  if (!admin) return { message: "只有完整管理員可以調整後台權限。" };

  const requested = formData.getAll("permissions").filter((value): value is string => typeof value === "string");
  if (requested.some((code) => !isSupervisorPermissionCode(code))) {
    return { message: "權限項目無效，請重新整理頁面後再試。" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_employee_admin_permissions", {
    p_employee_id: employeeId,
    p_permission_codes: [...new Set(requested)],
    p_tenant_id: admin.tenantId,
  });
  if (error) {
    const detail = error.message.toLowerCase();
    if (detail.includes("account not linked")) return { message: "請先為員工建立登入帳號。" };
    if (detail.includes("cannot change own")) return { message: "不可在此變更自己的完整管理員權限。" };
    if (detail.includes("platform administrator")) return { message: "完整管理員帳號不可在員工頁面降級，請由系統管理流程處理。" };
    return { message: "後台權限更新失敗，請稍後再試。" };
  }

  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/audit");
  return { success: requested.length ? "主管後台權限已更新。" : "此員工的後台管理權限已移除。" };
}
