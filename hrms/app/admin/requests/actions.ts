"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { workRequestDecisionSchema } from "@/lib/work-request-contract";

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
  if (error) redirect("/admin/requests?error=decision");
  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  redirect("/admin/requests?decided=1");
}
