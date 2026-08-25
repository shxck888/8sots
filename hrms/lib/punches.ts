import "server-only";

import type { Database } from "@/lib/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PunchRecord = Database["public"]["Tables"]["punch_records"]["Row"];

export async function getEmployeePunchContext({
  limit = 20,
  tenantId,
  userId,
}: {
  limit?: number;
  tenantId: string;
  userId: string;
}): Promise<{ employeeId: string | null; records: PunchRecord[] }> {
  const supabase = await createSupabaseServerClient();
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("auth_user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (employeeError) throw employeeError;
  if (!employee) return { employeeId: null, records: [] };

  const { data, error } = await supabase
    .from("punch_records")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employee.id)
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw error;
  return { employeeId: employee.id, records: data ?? [] };
}
