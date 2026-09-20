"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { compensationSchema, payrollAdjustmentSchema, payrollIdSchema, payrollItemSchema, payrollPeriodSchema, payrollReviewSchema, payrollStatusSchema, toCents } from "@/lib/payroll-contract";

async function payrollContext() {
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("current_user_has_permission", { p_permission_code: "payroll.manage", p_tenant_id: workspace.tenantId });
  if (!allowed) redirect("/");
  return { supabase, tenantId: workspace.tenantId };
}

function finish(error: unknown, success: string): never { redirect(`/admin/payroll?${error ? "error=1" : success}`); }

export async function saveCompensation(formData: FormData) {
  const parsed = compensationSchema.safeParse({ employeeId: formData.get("employeeId"), effectiveFrom: formData.get("effectiveFrom"), payBasis: formData.get("payBasis"), rate: formData.get("rate"), note: formData.get("note") ?? "" });
  if (!parsed.success) redirect("/admin/payroll?error=validation");
  const { supabase, tenantId } = await payrollContext();
  const { error } = await supabase.rpc("save_employee_compensation", { p_tenant_id: tenantId, p_employee_id: parsed.data.employeeId, p_effective_from: parsed.data.effectiveFrom, p_pay_basis: parsed.data.payBasis, p_rate_cents: toCents(parsed.data.rate), p_note: parsed.data.note });
  revalidatePath("/admin/payroll"); finish(error, "saved=compensation");
}
export async function createPeriod(formData: FormData) {
  const parsed = payrollPeriodSchema.safeParse({ periodMonth: formData.get("periodMonth"), payDate: formData.get("payDate") });
  if (!parsed.success) redirect("/admin/payroll?error=validation");
  const { supabase, tenantId } = await payrollContext();
  const { error } = await supabase.rpc("create_payroll_period", { p_tenant_id: tenantId, p_period_month: `${parsed.data.periodMonth}-01`, p_pay_date: parsed.data.payDate });
  revalidatePath("/admin/payroll"); finish(error, "saved=period");
}
export async function calculateDraft(formData: FormData) {
  const parsed = payrollIdSchema.safeParse({ periodId: formData.get("periodId") }); if (!parsed.success) redirect("/admin/payroll?error=validation");
  const { supabase, tenantId } = await payrollContext(); const { error } = await supabase.rpc("calculate_payroll_draft", { p_tenant_id: tenantId, p_period_id: parsed.data.periodId });
  revalidatePath("/admin/payroll"); finish(error, "saved=calculated");
}
export async function addAdjustment(formData: FormData) {
  const parsed = payrollAdjustmentSchema.safeParse({ entryId: formData.get("entryId"), kind: formData.get("kind"), name: formData.get("name"), amount: formData.get("amount"), note: formData.get("note") ?? "", idempotencyKey: formData.get("idempotencyKey") });
  if (!parsed.success) redirect("/admin/payroll?error=validation"); const { supabase, tenantId } = await payrollContext();
  const { error } = await supabase.rpc("add_payroll_adjustment_once", { p_tenant_id: tenantId, p_entry_id: parsed.data.entryId, p_kind: parsed.data.kind, p_name: parsed.data.name, p_amount_cents: toCents(parsed.data.amount), p_note: parsed.data.note, p_idempotency_key: parsed.data.idempotencyKey });
  revalidatePath("/admin/payroll"); finish(error, "saved=adjustment");
}
export async function removeAdjustment(formData: FormData) {
  const parsed = payrollItemSchema.safeParse({ itemId: formData.get("itemId") });
  if (!parsed.success) redirect("/admin/payroll?error=validation");
  const { supabase, tenantId } = await payrollContext();
  const { error } = await supabase.rpc("remove_payroll_adjustment", { p_tenant_id: tenantId, p_item_id: parsed.data.itemId });
  revalidatePath("/admin/payroll"); finish(error, "saved=adjustment");
}
export async function reviewPeriod(formData: FormData) {
  const parsed = payrollReviewSchema.safeParse({ periodId: formData.get("periodId"), reviewNote: formData.get("reviewNote") });
  if (!parsed.success) redirect("/admin/payroll?error=review");
  const { supabase, tenantId } = await payrollContext();
  const { error } = await supabase.rpc("review_payroll_period", { p_tenant_id: tenantId, p_period_id: parsed.data.periodId, p_review_note: parsed.data.reviewNote });
  revalidatePath("/admin/payroll"); finish(error, "saved=reviewed");
}
export async function changePeriodStatus(formData: FormData) {
  const parsed = payrollStatusSchema.safeParse({ periodId: formData.get("periodId"), status: formData.get("status") }); if (!parsed.success) redirect("/admin/payroll?error=validation");
  const { supabase, tenantId } = await payrollContext(); const { error } = await supabase.rpc("set_payroll_period_status", { p_tenant_id: tenantId, p_period_id: parsed.data.periodId, p_status: parsed.data.status });
  revalidatePath("/admin/payroll"); revalidatePath("/payslips"); finish(error, "saved=status");
}
