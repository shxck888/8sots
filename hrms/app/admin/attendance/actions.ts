"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { attendanceRangeSchema, correctionDecisionSchema } from "@/lib/attendance-contract";
import { getAdminContext } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function calculateAttendance(formData: FormData) {
  const parsed = attendanceRangeSchema.safeParse({ dateFrom: formData.get("dateFrom"), dateTo: formData.get("dateTo") });
  if (!parsed.success) redirect("/admin/attendance?error=range");
  const admin = await getAdminContext("attendance.manage");
  if (!admin) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("calculate_attendance", {
    p_date_from: parsed.data.dateFrom, p_date_to: parsed.data.dateTo, p_tenant_id: admin.tenantId,
  });
  if (error) redirect("/admin/attendance?error=calculate");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  redirect("/admin/attendance?calculated=1");
}

export async function decideCorrection(formData: FormData) {
  const parsed = correctionDecisionSchema.safeParse({
    decision: formData.get("decision"), requestId: formData.get("requestId"), reviewNote: formData.get("reviewNote") ?? "",
  });
  if (!parsed.success) redirect("/admin/attendance?error=decision");
  const admin = await getAdminContext("attendance.manage");
  if (!admin) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_punch_correction", {
    p_decision: parsed.data.decision, p_request_id: parsed.data.requestId,
    p_review_note: parsed.data.reviewNote, p_tenant_id: admin.tenantId,
  });
  if (error) redirect("/admin/attendance?error=decision");
  revalidatePath("/attendance");
  revalidatePath("/admin/attendance");
  redirect("/admin/attendance?decided=1");
}
