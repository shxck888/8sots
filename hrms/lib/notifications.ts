import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getUnreadNotificationCount(tenantId: string | null) {
  if (!tenantId) return 0;
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId).is("read_at", null);
  return error ? 0 : count ?? 0;
}
