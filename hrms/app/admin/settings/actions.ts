"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { payrollSettingsSchema, workplaceSettingsSchema } from "@/lib/operations-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function destination(kind: "workplace" | "payroll", error?: string): never {
  redirect(`/admin/settings?${error ? `error=${error}` : `saved=${kind}`}`);
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
