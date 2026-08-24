"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { employeeFormSchema, type EmployeeFormState } from "@/lib/employees";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseEmployeeForm(formData: FormData) {
  return employeeFormSchema.safeParse({
    employeeNo: formData.get("employeeNo"),
    fullName: formData.get("fullName"),
    preferredName: formData.get("preferredName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    hireDate: formData.get("hireDate"),
    status: formData.get("status"),
    notes: formData.get("notes"),
  });
}

function employeeRpcPayload(tenantId: string, data: ReturnType<typeof employeeFormSchema.parse>) {
  return {
    p_tenant_id: tenantId,
    p_employee_no: data.employeeNo,
    p_full_name: data.fullName,
    p_preferred_name: data.preferredName ?? "",
    p_email: data.email ?? "",
    p_phone: data.phone ?? "",
    p_hire_date: data.hireDate,
    p_status: data.status,
    p_notes: data.notes ?? "",
  };
}

function databaseMessage(code?: string): string {
  if (code === "23505") return "員工編號已存在，請使用其他編號。";
  if (code === "42501") return "你沒有維護員工資料的權限。";
  return "員工資料儲存失敗，請稍後再試。";
}

export async function createEmployee(
  _previousState: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const parsed = parseEmployeeForm(formData);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const admin = await getAdminContext();
  if (!admin) return { message: "管理員權限驗證失敗，請重新登入。" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_employee", employeeRpcPayload(admin.tenantId, parsed.data));
  if (error) return { message: databaseMessage(error.code) };

  revalidatePath("/admin/employees");
  redirect("/admin/employees?created=1");
}

export async function updateEmployee(
  employeeId: string,
  _previousState: EmployeeFormState,
  formData: FormData,
): Promise<EmployeeFormState> {
  const parsed = parseEmployeeForm(formData);
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const admin = await getAdminContext();
  if (!admin) return { message: "管理員權限驗證失敗，請重新登入。" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_employee", {
    ...employeeRpcPayload(admin.tenantId, parsed.data),
    p_employee_id: employeeId,
  });
  if (error) return { message: databaseMessage(error.code) };

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  redirect("/admin/employees?updated=1");
}
