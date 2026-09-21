"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import {
  annualLeavePolicySchema, multiplierToPpm, payrollSettingsSchema, payrollStatutorySettingsSchema,
  percentageToPpm, workplaceSettingsSchema,
} from "@/lib/operations-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function destination(kind: "workplace" | "payroll" | "statutory" | "annual-leave", error?: string): never {
  redirect(`/admin/settings?${error ? `error=${error}` : `saved=${kind}`}`);
}

export async function saveAnnualLeavePolicy(formData: FormData) {
  const parsed = annualLeavePolicySchema.safeParse({
    effectiveFrom: formData.get("effectiveFrom"),
    standardDayMinutes: formData.get("standardDayMinutes"),
    sourceNote: formData.get("sourceNote"),
  });
  if (!parsed.success) destination("annual-leave", "annual-leave-input");
  const admin = await getAdminContext("request.manage");
  if (!admin) destination("annual-leave", "permission");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_annual_leave_policy", {
    p_tenant_id: admin.tenantId,
    p_effective_from: parsed.data.effectiveFrom,
    p_standard_day_minutes: parsed.data.standardDayMinutes,
    p_source_note: parsed.data.sourceNote,
  });
  if (error) destination("annual-leave", error.code === "42501" ? "permission" : "save");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/requests");
  revalidatePath("/requests");
  revalidatePath("/admin/payroll");
  destination("annual-leave");
}

export async function savePayrollStatutorySettings(formData: FormData) {
  const parsed = payrollStatutorySettingsSchema.safeParse({
    effectiveFrom: formData.get("effectiveFrom"),
    laborInsuranceRate: formData.get("laborInsuranceRate"), laborEmployeeShare: formData.get("laborEmployeeShare"),
    employmentInsuranceRate: formData.get("employmentInsuranceRate"), employmentEmployeeShare: formData.get("employmentEmployeeShare"),
    healthInsuranceRate: formData.get("healthInsuranceRate"), healthEmployeeShare: formData.get("healthEmployeeShare"),
    pensionEmployerRate: formData.get("pensionEmployerRate"), monthlyHourDivisor: formData.get("monthlyHourDivisor"),
    overtimeTier1Minutes: formData.get("overtimeTier1Minutes"), overtimeTier1Multiplier: formData.get("overtimeTier1Multiplier"),
    overtimeTier2Minutes: formData.get("overtimeTier2Minutes"), overtimeTier2Multiplier: formData.get("overtimeTier2Multiplier"),
    overtimeTier3Minutes: formData.get("overtimeTier3Minutes"), overtimeTier3Multiplier: formData.get("overtimeTier3Multiplier"),
    sourceNote: formData.get("sourceNote"),
  });
  if (!parsed.success) destination("statutory", "statutory-input");
  const admin = await getAdminContext("payroll.manage");
  if (!admin) destination("statutory", "permission");
  const supabase = await createSupabaseServerClient();
  const data = parsed.data;
  const { error } = await supabase.rpc("save_payroll_statutory_settings", {
    p_tenant_id: admin.tenantId, p_effective_from: data.effectiveFrom,
    p_labor_insurance_rate_ppm: percentageToPpm(data.laborInsuranceRate),
    p_labor_employee_share_ppm: percentageToPpm(data.laborEmployeeShare),
    p_employment_insurance_rate_ppm: percentageToPpm(data.employmentInsuranceRate),
    p_employment_employee_share_ppm: percentageToPpm(data.employmentEmployeeShare),
    p_health_insurance_rate_ppm: percentageToPpm(data.healthInsuranceRate),
    p_health_employee_share_ppm: percentageToPpm(data.healthEmployeeShare),
    p_pension_employer_rate_ppm: percentageToPpm(data.pensionEmployerRate),
    p_monthly_hour_divisor: data.monthlyHourDivisor,
    p_overtime_tier_1_minutes: data.overtimeTier1Minutes,
    p_overtime_tier_1_multiplier_ppm: multiplierToPpm(data.overtimeTier1Multiplier),
    p_overtime_tier_2_minutes: data.overtimeTier2Minutes,
    p_overtime_tier_2_multiplier_ppm: multiplierToPpm(data.overtimeTier2Multiplier),
    p_overtime_tier_3_minutes: data.overtimeTier3Minutes,
    p_overtime_tier_3_multiplier_ppm: multiplierToPpm(data.overtimeTier3Multiplier),
    p_source_note: data.sourceNote,
  });
  if (error) destination("statutory", error.code === "42501" ? "permission" : "save");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/payroll");
  destination("statutory");
}

export async function saveWorkplaceSettings(formData: FormData) {
  const parsed = workplaceSettingsSchema.safeParse({
    effectiveFrom: formData.get("effectiveFrom"), name: formData.get("name"),
    address: formData.get("address"), latitude: formData.get("latitude"),
    longitude: formData.get("longitude"), radiusM: formData.get("radiusM"),
    maxAccuracyM: formData.get("maxAccuracyM"), mode: formData.get("mode"),
  });
  if (!parsed.success) destination("workplace", "workplace-input");
  const admin = await getAdminContext("settings.manage");
  if (!admin) destination("workplace", "permission");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_workplace_settings", {
    p_tenant_id: admin.tenantId, p_effective_from: parsed.data.effectiveFrom,
    p_name: parsed.data.name, p_address: parsed.data.address,
    p_latitude: parsed.data.latitude, p_longitude: parsed.data.longitude,
    p_radius_m: parsed.data.radiusM, p_max_accuracy_m: parsed.data.maxAccuracyM,
    p_mode: parsed.data.mode,
  });
  if (error) destination("workplace", error.code === "42501" ? "permission" : "save");
  revalidatePath("/admin/settings");
  destination("workplace");
}

export async function savePayrollSettings(formData: FormData) {
  const parsed = payrollSettingsSchema.safeParse({
    effectiveFrom: formData.get("effectiveFrom"), closingDay: formData.get("closingDay"),
    payDay: formData.get("payDay"), payMonthOffset: formData.get("payMonthOffset"),
    defaultBasis: formData.get("defaultBasis"), note: formData.get("note") ?? "",
  });
  if (!parsed.success) destination("payroll", "payroll-input");
  const admin = await getAdminContext("payroll.manage");
  if (!admin) destination("payroll", "permission");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_payroll_settings", {
    p_tenant_id: admin.tenantId, p_effective_from: parsed.data.effectiveFrom,
    p_closing_day: parsed.data.closingDay, p_pay_day: parsed.data.payDay,
    p_pay_month_offset: parsed.data.payMonthOffset, p_default_basis: parsed.data.defaultBasis,
    p_note: parsed.data.note,
  });
  if (error) destination("payroll", error.code === "42501" ? "permission" : "save");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/payroll");
  destination("payroll");
}
