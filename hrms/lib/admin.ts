import { createSupabaseServerClient } from "@/lib/supabase/server";

type MembershipRow = {
  id: string;
  tenant_id: string;
  tenants: { name: string } | { name: string }[] | null;
};

export type AdminContext = {
  userId: string;
  tenantId: string;
  tenantName: string;
};

export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) return null;

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("id, tenant_id, tenants(name)")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .limit(1);

  const membership = (memberships?.[0] ?? null) as MembershipRow | null;
  if (!membership) return null;

  const { data: allowed, error: permissionError } = await supabase.rpc(
    "current_user_has_permission",
    { p_tenant_id: membership.tenant_id, p_permission_code: "employee.manage" },
  );

  if (permissionError || allowed !== true) return null;

  const tenant = Array.isArray(membership.tenants) ? membership.tenants[0] : membership.tenants;
  return {
    userId: authData.user.id,
    tenantId: membership.tenant_id,
    tenantName: tenant?.name ?? "未命名組織",
  };
}
