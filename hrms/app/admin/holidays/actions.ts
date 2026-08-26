"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { holidayDeleteSchema, holidayEntrySchema, holidayYear } from "@/lib/holidays";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function holidayError(code?: string): string {
  if (code === "42501") return "permission";
  if (code === "P0002") return "missing";
  return "save";
}

export async function upsertHoliday(formData: FormData) {
  const parsed = holidayEntrySchema.safeParse({
    holidayDate: formData.get("holidayDate"),
    name: formData.get("name"),
    kind: formData.get("kind"),
    note: formData.get("note") ?? "",
  });
  const year = holidayYear(String(formData.get("holidayDate") ?? ""));
  if (!parsed.success) redirect(`/admin/holidays?year=${year}&error=input`);

  const admin = await getAdminContext("schedule.manage");
  if (!admin) redirect(`/admin/holidays?year=${year}&error=permission`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_holiday_entry", {
    p_tenant_id: admin.tenantId,
    p_holiday_date: parsed.data.holidayDate,
    p_name: parsed.data.name,
    p_kind: parsed.data.kind,
    p_note: parsed.data.note ?? "",
  });
  if (error) redirect(`/admin/holidays?year=${year}&error=${holidayError(error.code)}`);
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/schedules");
  redirect(`/admin/holidays?year=${holidayYear(parsed.data.holidayDate)}&saved=1`);
}

export async function deleteHoliday(formData: FormData) {
  const parsed = holidayDeleteSchema.safeParse({ holidayId: formData.get("holidayId") });
  const year = holidayYear(String(formData.get("year") ?? ""));
  if (!parsed.success) redirect(`/admin/holidays?year=${year}&error=input`);

  const admin = await getAdminContext("schedule.manage");
  if (!admin) redirect(`/admin/holidays?year=${year}&error=permission`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_holiday_entry", {
    p_tenant_id: admin.tenantId,
    p_holiday_id: parsed.data.holidayId,
  });
  if (error) redirect(`/admin/holidays?year=${year}&error=${holidayError(error.code)}`);
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/schedules");
  redirect(`/admin/holidays?year=${year}&deleted=1`);
}
