"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import {
  parseScheduleAssignments,
  schedulePeriodSchema,
  scheduleVersionSchema,
} from "@/lib/schedules";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function scheduleError(code?: string): string {
  if (code === "42501") return "permission";
  if (code === "55000") return "locked";
  if (code === "P0002") return "missing";
  return "save";
}

export async function createScheduleDraft(formData: FormData) {
  const parsed = schedulePeriodSchema.safeParse({
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
  });
  if (!parsed.success) redirect("/admin/schedules?error=period");

  const admin = await getAdminContext("schedule.manage");
  if (!admin) redirect("/admin/schedules?error=permission");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_schedule_draft", {
    p_tenant_id: admin.tenantId,
    p_period_start: parsed.data.periodStart,
    p_period_end: parsed.data.periodEnd,
  });
  if (error) redirect(`/admin/schedules?week=${parsed.data.periodStart}&error=${scheduleError(error.code)}`);
  revalidatePath("/admin/schedules");
  redirect(`/admin/schedules?week=${parsed.data.periodStart}&draft=1`);
}

export async function saveScheduleDraft(formData: FormData) {
  const parsed = scheduleVersionSchema.safeParse({
    scheduleVersionId: formData.get("scheduleVersionId"),
    weekStart: formData.get("weekStart"),
  });
  if (!parsed.success) redirect("/admin/schedules?error=period");

  let assignments;
  try { assignments = parseScheduleAssignments(formData); }
  catch { redirect(`/admin/schedules?week=${parsed.data.weekStart}&error=assignment`); }

  const admin = await getAdminContext("schedule.manage");
  if (!admin) redirect(`/admin/schedules?week=${parsed.data.weekStart}&error=permission`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_schedule_assignments", {
    p_tenant_id: admin.tenantId,
    p_schedule_version_id: parsed.data.scheduleVersionId,
    p_assignments: assignments,
  });
  if (error) redirect(`/admin/schedules?week=${parsed.data.weekStart}&error=${scheduleError(error.code)}`);
  revalidatePath("/admin/schedules");
  redirect(`/admin/schedules?week=${parsed.data.weekStart}&saved=1`);
}

export async function publishSchedule(formData: FormData) {
  const parsed = scheduleVersionSchema.safeParse({
    scheduleVersionId: formData.get("scheduleVersionId"),
    weekStart: formData.get("weekStart"),
  });
  if (!parsed.success) redirect("/admin/schedules?error=period");

  const admin = await getAdminContext("schedule.manage");
  if (!admin) redirect(`/admin/schedules?week=${parsed.data.weekStart}&error=permission`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("publish_schedule", {
    p_tenant_id: admin.tenantId,
    p_schedule_version_id: parsed.data.scheduleVersionId,
  });
  if (error) redirect(`/admin/schedules?week=${parsed.data.weekStart}&error=${scheduleError(error.code)}`);
  revalidatePath("/admin/schedules");
  redirect(`/admin/schedules?week=${parsed.data.weekStart}&published=1`);
}
