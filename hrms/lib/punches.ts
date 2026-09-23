import "server-only";

import type { Database } from "@/lib/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PunchRecord = Database["public"]["Tables"]["punch_records"]["Row"];
export type PunchPolicy = {
  configured: boolean;
  name?: string;
  address?: string;
  mode?: "evidence" | "enforced";
  radius_m?: number;
  max_accuracy_m?: number;
  effective_from?: string;
};

export async function getEmployeePunchContext({
  limit = 20,
  employeeId,
  tenantId,
}: {
  limit?: number;
  employeeId: string | null;
  tenantId: string;
}): Promise<{ employeeId: string | null; records: PunchRecord[]; policy: PunchPolicy }> {
  if (!employeeId) return { employeeId: null, records: [], policy: { configured: false } };

  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: policyData, error: policyError }] = await Promise.all([
    supabase.from("punch_records").select("*").eq("tenant_id", tenantId).eq("employee_id", employeeId).is("voided_at", null)
      .order("occurred_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 200)),
    supabase.rpc("get_my_punch_policy"),
  ]);
  if (error) throw error;
  if (policyError) throw policyError;
  const policy = policyData && typeof policyData === "object" && !Array.isArray(policyData)
    ? policyData as PunchPolicy : { configured: false };
  return { employeeId, records: data ?? [], policy };
}
