"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { attendanceRuleSetSchema } from "@/lib/attendance-rules";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function ruleError(code?: string): string {
  if (code === "42501") return "permission";
  return "save";
}

export async function createAttendanceRuleSet(formData: FormData) {
  const parsed = attendanceRuleSetSchema.safeParse({
    lateGraceMinutes: formData.get("lateGraceMinutes"),
    earlyLeaveGraceMinutes: formData.get("earlyLeaveGraceMinutes"),
    effectiveFrom: formData.get("effectiveFrom"),
  });
  if (!parsed.success) redirect("/admin/attendance-rules?error=input");

  const admin = await getAdminContext("attendance.manage");
  if (!admin) redirect("/admin/attendance-rules?error=permission");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_attendance_rule_set", {
    p_tenant_id: admin.tenantId,
    p_late_grace_minutes: parsed.data.lateGraceMinutes,
    p_early_leave_grace_minutes: parsed.data.earlyLeaveGraceMinutes,
    p_effective_from: parsed.data.effectiveFrom,
  });
  if (error) redirect(`/admin/attendance-rules?error=${ruleError(error.code)}`);
  revalidatePath("/admin/attendance-rules");
  redirect("/admin/attendance-rules?saved=1");
}
