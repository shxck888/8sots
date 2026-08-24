"use server";

import { revalidatePath } from "next/cache";
import { getAdminContext } from "@/lib/admin";
import { usernameToAuthEmail } from "@/lib/auth";
import {
  employeeAccountCredentialsSchema,
  employeePasswordSchema,
  type EmployeeAccountState,
} from "@/lib/employee-accounts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function contextForEmployee(employeeId: string) {
  const admin = await getAdminContext();
  if (!admin) return null;
  const supabase = await createSupabaseServerClient();
  const { data: employee } = await supabase.from("employees")
    .select("id, full_name, auth_user_id")
    .eq("tenant_id", admin.tenantId).eq("id", employeeId).maybeSingle();
  return employee ? { admin, supabase, employee } : null;
}

async function getAccount(employeeId: string, tenantId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("employee_auth_accounts").select("*")
    .eq("tenant_id", tenantId).eq("employee_id", employeeId).maybeSingle();
  return data;
}

function adminClientOrNull() {
  try { return createSupabaseAdminClient(); }
  catch { return null; }
}

export async function provisionEmployeeAccount(
  employeeId: string, _state: EmployeeAccountState, formData: FormData,
): Promise<EmployeeAccountState> {
  const parsed = employeeAccountCredentialsSchema.safeParse({
    username: formData.get("username"), password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const context = await contextForEmployee(employeeId);
  if (!context) return { message: "員工或管理員權限驗證失敗。" };
  if (context.employee.auth_user_id) return { message: "這位員工已經有登入帳號。" };
  const authAdmin = adminClientOrNull();
  if (!authAdmin) return { message: "帳號管理服務尚未設定，請聯絡系統管理員。" };

  const { data, error } = await authAdmin.auth.admin.createUser({
    email: usernameToAuthEmail(parsed.data.username),
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: context.employee.full_name },
    app_metadata: { tenant_id: context.admin.tenantId, employee_id: employeeId },
  });
  if (error || !data.user) {
    console.error("employee Auth provisioning failed", {
      code: error?.code, status: error?.status, message: error?.message,
    });
    return { message: error?.code === "email_exists" ? "這個帳號已被使用。" : "登入帳號建立失敗，請稍後再試。" };
  }

  const { error: linkError } = await context.supabase.rpc("link_employee_auth_account", {
    p_tenant_id: context.admin.tenantId,
    p_employee_id: employeeId,
    p_auth_user_id: data.user.id,
    p_username: parsed.data.username,
  });
  if (linkError) {
    await authAdmin.auth.admin.deleteUser(data.user.id);
    return { message: linkError.code === "23505" ? "這個帳號已被使用或員工已連結帳號。" : "員工帳號連結失敗，已撤銷新建登入帳號。" };
  }

  revalidatePath(`/admin/employees/${employeeId}`);
  return { success: `登入帳號 ${parsed.data.username} 已建立。` };
}

export async function resetEmployeePassword(
  employeeId: string, _state: EmployeeAccountState, formData: FormData,
): Promise<EmployeeAccountState> {
  const parsed = employeePasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const context = await contextForEmployee(employeeId);
  if (!context) return { message: "員工或管理員權限驗證失敗。" };
  const account = await getAccount(employeeId, context.admin.tenantId);
  if (!account) return { message: "這位員工尚未建立登入帳號。" };
  const authAdmin = adminClientOrNull();
  if (!authAdmin) return { message: "帳號管理服務尚未設定，請聯絡系統管理員。" };

  const { error } = await authAdmin.auth.admin.updateUserById(account.auth_user_id, {
    password: parsed.data.password,
  });
  if (error) return { message: "密碼重設失敗，請稍後再試。" };
  const { error: auditError } = await context.supabase.rpc("record_employee_password_reset", {
    p_tenant_id: context.admin.tenantId, p_employee_id: employeeId,
  });
  if (auditError) return { message: "密碼已更新，但稽核紀錄失敗，請立即聯絡系統管理員。" };
  return { success: "密碼已重設。" };
}

export async function setEmployeeAccountStatus(
  employeeId: string, nextStatus: "active" | "suspended",
  _state: EmployeeAccountState, _formData: FormData,
): Promise<EmployeeAccountState> {
  void _state;
  void _formData;
  const context = await contextForEmployee(employeeId);
  if (!context) return { message: "員工或管理員權限驗證失敗。" };
  const account = await getAccount(employeeId, context.admin.tenantId);
  if (!account) return { message: "這位員工尚未建立登入帳號。" };
  if (account.auth_user_id === context.admin.userId) return { message: "不可從這裡停用或變更自己的管理員帳號。" };
  const authAdmin = adminClientOrNull();
  if (!authAdmin) return { message: "帳號管理服務尚未設定，請聯絡系統管理員。" };

  const { error } = await authAdmin.auth.admin.updateUserById(account.auth_user_id, {
    ban_duration: nextStatus === "suspended" ? "876000h" : "none",
  });
  if (error) return { message: nextStatus === "suspended" ? "帳號停用失敗。" : "帳號恢復失敗。" };

  const { error: databaseError } = await context.supabase.rpc("set_employee_auth_account_status", {
    p_tenant_id: context.admin.tenantId, p_employee_id: employeeId, p_status: nextStatus,
  });
  if (databaseError) {
    await authAdmin.auth.admin.updateUserById(account.auth_user_id, {
      ban_duration: nextStatus === "suspended" ? "none" : "876000h",
    });
    return { message: "帳號狀態同步失敗，Auth 狀態已還原。" };
  }
  revalidatePath(`/admin/employees/${employeeId}`);
  return { success: nextStatus === "suspended" ? "登入帳號已停用。" : "登入帳號已恢復。" };
}
