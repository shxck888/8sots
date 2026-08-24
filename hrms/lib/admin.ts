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

async function getMembershipContext(): Promise<{
  context: AdminContext;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
} | null> {
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

  const tenant = Array.isArray(membership.tenants) ? membership.tenants[0] : membership.tenants;
  return {
    supabase,
    context: {
      userId: authData.user.id,
      tenantId: membership.tenant_id,
      tenantName: tenant?.name ?? "未命名組織",
    },
  };
}

export async function getAdminContext(
  permissionCode = "employee.manage",
): Promise<AdminContext | null> {
  const membership = await getMembershipContext();
  if (!membership) return null;

  const { data: allowed, error: permissionError } = await membership.supabase.rpc(
    "current_user_has_permission",
    { p_tenant_id: membership.context.tenantId, p_permission_code: permissionCode },
  );

  if (permissionError || allowed !== true) return null;
  return membership.context;
}

export async function getAdminShellContext(): Promise<AdminContext | null> {
  const membership = await getMembershipContext();
  if (!membership) return null;
  const checks = await Promise.all([
    membership.supabase.rpc("current_user_has_permission", {
      p_tenant_id: membership.context.tenantId, p_permission_code: "employee.manage",
    }),
    membership.supabase.rpc("current_user_has_permission", {
      p_tenant_id: membership.context.tenantId, p_permission_code: "schedule.manage",
    }),
  ]);
  return checks.some(({ data, error }) => !error && data === true) ? membership.context : null;
}
