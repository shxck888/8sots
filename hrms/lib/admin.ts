import "server-only";

import { cache } from "react";
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

const adminPermissionCodes = [
  "employee.manage",
  "schedule.manage",
  "attendance.manage",
] as const;
type AdminPermissionCode = typeof adminPermissionCodes[number];

const getMembershipContext = cache(async (): Promise<{
  context: AdminContext;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
} | null> => {
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
});

const getAdminPermissionContext = cache(async () => {
  const membership = await getMembershipContext();
  if (!membership) return null;
  const checks = await Promise.all(adminPermissionCodes.map(async (permissionCode) => {
    const { data, error } = await membership.supabase.rpc("current_user_has_permission", {
      p_tenant_id: membership.context.tenantId,
      p_permission_code: permissionCode,
    });
    return { allowed: !error && data === true, permissionCode };
  }));
  return {
    context: membership.context,
    permissions: new Set(checks.filter(({ allowed }) => allowed).map(({ permissionCode }) => permissionCode)),
  };
});

export async function getAdminContext(
  permissionCode: AdminPermissionCode = "employee.manage",
): Promise<AdminContext | null> {
  const admin = await getAdminPermissionContext();
  return admin?.permissions.has(permissionCode) ? admin.context : null;
}

export async function getAdminShellContext(): Promise<AdminContext | null> {
  const admin = await getAdminPermissionContext();
  return admin && admin.permissions.size > 0 ? admin.context : null;
}
