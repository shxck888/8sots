import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getLinkedEmployeeId = cache(async (
  tenantId: string,
  userId: string,
): Promise<string | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: employee, error } = await supabase
    .from("employees")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("auth_user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return employee?.id ?? null;
});
