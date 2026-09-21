"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { leaveEntitlementInputSchema, workRequestDecisionSchema } from "@/lib/work-request-contract";

export async function decideWorkRequest(formData: FormData) {
  const parsed = workRequestDecisionSchema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    reviewNote: formData.get("reviewNote") ?? "",
  });
  if (!parsed.success) redirect("/admin/requests?error=validation");
  const admin = await getAdminContext("request.manage");
  if (!admin) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_work_request", {
    p_decision: parsed.data.decision,
    p_request_id: parsed.data.requestId,
    p_review_note: parsed.data.reviewNote,
    p_tenant_id: admin.tenantId,
  });
  if (error?.message.includes("required leave proof missing")) {
    redirect("/admin/requests?error=proofRequired");
  }
  if (error?.message.includes("insufficient annual leave balance")) {
    redirect("/admin/requests?error=annualBalance");
  }
  if (error) redirect("/admin/requests?error=decision");
  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  redirect("/admin/requests?decided=1");
}

export async function syncAnnualLeaveGrants() {
  const admin = await getAdminContext("request.manage");
  if (!admin) redirect("/");
  const supabase = await createSupabaseServerClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const { data, error } = await supabase.rpc("sync_annual_leave_grants", {
    p_tenant_id: admin.tenantId,
    p_as_of: today,
  });
  if (error) redirect("/admin/requests?error=annualSync");
  revalidatePath("/admin/requests");
  revalidatePath("/requests");
  redirect(`/admin/requests?annualSynced=${Number(data ?? 0)}`);
}

export async function saveLeaveEntitlement(formData: FormData) {
  const parsed = leaveEntitlementInputSchema.safeParse({
    employeeId: formData.get("employeeId"), leaveTypeId: formData.get("leaveTypeId"),
    entitlementYear: formData.get("entitlementYear"), entitledHours: formData.get("entitledHours"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) redirect("/admin/requests?error=entitlement");
  const admin = await getAdminContext("request.manage");
  if (!admin) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_leave_entitlement", {
    p_employee_id: parsed.data.employeeId,
    p_entitled_minutes: Math.round(parsed.data.entitledHours * 60),
    p_entitlement_year: parsed.data.entitlementYear,
    p_leave_type_id: parsed.data.leaveTypeId,
    p_note: parsed.data.note,
    p_tenant_id: admin.tenantId,
  });
  if (error) redirect("/admin/requests?error=entitlement");
  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  redirect("/admin/requests?entitlementSaved=1");
}
