"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import {
  employeeFormSchema,
  employeeFormValuesFromFormData,
  type EmployeeFormInput,
  type EmployeeFormState,
  type EmployeeFormValues,
} from "@/lib/employees";
import { protectNationalId } from "@/lib/pii";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const photoTypes: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

function failure(values: EmployeeFormValues, state: Omit<EmployeeFormState, "values">): EmployeeFormState {
  return { ...state, values };
}

function employeeRpcPayload(tenantId: string, data: EmployeeFormInput, protectedId: ReturnType<typeof protectNationalId> | null) {
  return {
    p_tenant_id: tenantId, p_employee_no: data.employeeNo, p_full_name: data.fullName,
    p_english_name: data.englishName ?? "", p_national_id_ciphertext: protectedId?.ciphertext ?? null,
    p_national_id_hash: protectedId?.hash ?? null, p_national_id_last4: protectedId?.last4 ?? null,
    p_birth_date: data.birthDate, p_gender: data.gender, p_address: data.address,
    p_mobile: data.mobile, p_email: data.email ?? "",
    p_emergency_contact_name: data.emergencyContactName,
    p_emergency_contact_phone: data.emergencyContactPhone,
    p_department_name: data.departmentName, p_position_name: data.positionName,
    p_supervisor_employee_id: data.supervisorEmployeeId,
    p_employment_type: data.employmentType, p_hire_date: data.hireDate,
    p_termination_date: data.terminationDate, p_probation_end_date: data.probationEndDate,
    p_status: data.status, p_notes: data.notes ?? "",
  };
}

function databaseMessage(code?: string, detail?: string): string {
  if (detail?.includes("hire date change requires annual leave reconciliation")) {
    return "此員工已有特休使用或人工調整，變更到職日會影響既有紀錄；請先由管理員核對特休台帳。";
  }
  if (code === "23505") return "員工編號或身分證字號已存在，請重新確認。";
  if (code === "42501") return "你沒有維護員工資料的權限。";
  return "員工資料儲存失敗，請稍後再試。";
}

function validatePhoto(value: FormDataEntryValue | null): { file: File | null; error?: string } {
  if (!(value instanceof File) || value.size === 0) return { file: null };
  if (!photoTypes[value.type]) return { file: null, error: "照片只接受 JPG、PNG 或 WebP。" };
  if (value.size > 3 * 1024 * 1024) return { file: null, error: "照片不可超過 3MB。" };
  return { file: value };
}

async function uploadPhoto(
  employeeId: string, tenantId: string, file: File, previousPath?: string | null,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const path = `${tenantId}/${employeeId}/${randomUUID()}.${photoTypes[file.type]}`;
  const { error: uploadError } = await supabase.storage.from("employee-photos").upload(path, file, {
    contentType: file.type, cacheControl: "3600", upsert: false,
  });
  if (uploadError) return false;

  const { error: linkError } = await supabase.rpc("set_employee_photo", {
    p_tenant_id: tenantId, p_employee_id: employeeId, p_photo_path: path,
  });
  if (linkError) {
    await supabase.storage.from("employee-photos").remove([path]);
    return false;
  }
  if (previousPath && previousPath !== path) {
    await supabase.storage.from("employee-photos").remove([previousPath]);
  }
  return true;
}

export async function createEmployee(
  _previousState: EmployeeFormState, formData: FormData,
): Promise<EmployeeFormState> {
  const values = employeeFormValuesFromFormData(formData);
  const parsed = employeeFormSchema.safeParse(values);
  if (!parsed.success) return failure(values, { fieldErrors: parsed.error.flatten().fieldErrors });
  if (!parsed.data.nationalId) return failure(values, { fieldErrors: { nationalId: ["請輸入身分證／居留證字號。"] } });
  const photo = validatePhoto(formData.get("photo"));
  if (photo.error) return failure(values, { fieldErrors: { photo: [photo.error] } });

  const admin = await getAdminContext();
  if (!admin) return failure(values, { message: "管理員權限驗證失敗，請重新登入。" });

  let protectedId;
  try { protectedId = protectNationalId(parsed.data.nationalId); }
  catch { return failure(values, { message: "敏感資料加密服務尚未設定，請聯絡系統管理員。" }); }

  const supabase = await createSupabaseServerClient();
  const { data: employeeId, error } = await supabase.rpc(
    "create_employee_master", employeeRpcPayload(admin.tenantId, parsed.data, protectedId),
  );
  if (error || typeof employeeId !== "string") return failure(values, { message: databaseMessage(error?.code) });

  const photoOkay = photo.file ? await uploadPhoto(employeeId, admin.tenantId, photo.file) : true;
  revalidatePath("/admin/employees");
  redirect(`/admin/employees?created=1${photoOkay ? "" : "&photoError=1"}`);
}

export async function updateEmployee(
  employeeId: string, _previousState: EmployeeFormState, formData: FormData,
): Promise<EmployeeFormState> {
  const values = employeeFormValuesFromFormData(formData);
  const parsed = employeeFormSchema.safeParse(values);
  if (!parsed.success) return failure(values, { fieldErrors: parsed.error.flatten().fieldErrors });
  const photo = validatePhoto(formData.get("photo"));
  if (photo.error) return failure(values, { fieldErrors: { photo: [photo.error] } });

  const admin = await getAdminContext();
  if (!admin) return failure(values, { message: "管理員權限驗證失敗，請重新登入。" });

  let protectedId = null;
  if (parsed.data.nationalId) {
    try { protectedId = protectNationalId(parsed.data.nationalId); }
    catch { return failure(values, { message: "敏感資料加密服務尚未設定，請聯絡系統管理員。" }); }
  }

  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase.from("employee_master_current")
    .select("photo_path").eq("tenant_id", admin.tenantId).eq("id", employeeId).maybeSingle();
  const { error } = await supabase.rpc("update_employee_master", {
    ...employeeRpcPayload(admin.tenantId, parsed.data, protectedId), p_employee_id: employeeId,
  });
  if (error) return failure(values, { message: databaseMessage(error.code, error.message) });

  const photoOkay = photo.file
    ? await uploadPhoto(employeeId, admin.tenantId, photo.file, current?.photo_path as string | null)
    : true;
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${employeeId}`);
  redirect(`/admin/employees?updated=1${photoOkay ? "" : "&photoError=1"}`);
}
