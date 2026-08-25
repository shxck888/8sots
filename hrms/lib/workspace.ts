import "server-only";

import { getUserDisplayName } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MembershipWithTenant = {
  tenant_id: string;
  tenants: { name: string } | { name: string }[] | null;
};

export type WorkspaceContext = {
  userId: string;
  email: string;
  displayName: string;
  tenantId: string | null;
  tenantName: string;
  canManage: boolean;
};

export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data: membershipRows } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, tenants(name)")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .limit(1);
  const membership = (membershipRows?.[0] ?? null) as MembershipWithTenant | null;
  const tenant = Array.isArray(membership?.tenants) ? membership.tenants[0] : membership?.tenants;
  const { data: canManageEmployees } = membership?.tenant_id
    ? await supabase.rpc("current_user_has_permission", {
        p_tenant_id: membership.tenant_id,
        p_permission_code: "employee.manage",
      })
    : { data: false };
  const { data: canManageSchedules } = membership?.tenant_id
    ? await supabase.rpc("current_user_has_permission", {
        p_tenant_id: membership.tenant_id,
        p_permission_code: "schedule.manage",
      })
    : { data: false };

  return {
    userId: authData.user.id,
    email: authData.user.email ?? "",
    displayName: getUserDisplayName(authData.user),
    tenantId: membership?.tenant_id ?? null,
    tenantName: tenant?.name ?? "尚未加入組織",
    canManage: canManageEmployees === true || canManageSchedules === true,
  };
}
