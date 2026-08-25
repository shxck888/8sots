import "server-only";

import { cache } from "react";
import { getUserDisplayName } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type WorkspaceContext = {
  userId: string;
  email: string;
  displayName: string;
  tenantId: string | null;
  tenantName: string;
  employeeId: string | null;
  canManageEmployees: boolean;
  canManageSchedules: boolean;
  canManageAttendance: boolean;
  canManageRequests: boolean;
  canManage: boolean;
};

export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_current_workspace_context").maybeSingle();
  if (error || !data) return null;

  const userMetadata = data.user_metadata && typeof data.user_metadata === "object" && !Array.isArray(data.user_metadata)
    ? data.user_metadata
    : {};
  const canManageEmployees = data.can_manage_employee === true;
  const canManageSchedules = data.can_manage_schedule === true;
  const canManageAttendance = data.can_manage_attendance === true;
  const canManageRequests = data.can_manage_request === true;

  return {
    userId: data.user_id,
    email: data.email,
    displayName: getUserDisplayName({ email: data.email, user_metadata: userMetadata }),
    tenantId: data.tenant_id,
    tenantName: data.tenant_name ?? "尚未加入組織",
    employeeId: data.employee_id,
    canManageEmployees,
    canManageSchedules,
    canManageAttendance,
    canManageRequests,
    canManage: canManageEmployees || canManageSchedules || canManageAttendance || canManageRequests,
  };
});
