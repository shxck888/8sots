import "server-only";

import type { Database } from "@/lib/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PunchRecord = Database["public"]["Tables"]["punch_records"]["Row"];

export async function getEmployeePunchContext({
  limit = 20,
  employeeId,
  tenantId,
}: {
  limit?: number;
  employeeId: string | null;
  tenantId: string;
}): Promise<{ employeeId: string | null; records: PunchRecord[] }> {
  if (!employeeId) return { employeeId: null, records: [] };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("punch_records")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employeeId)
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw error;
  return { employeeId, records: data ?? [] };
}
