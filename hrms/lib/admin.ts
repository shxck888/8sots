import "server-only";

import { getWorkspaceContext } from "@/lib/workspace";

export type AdminContext = {
  userId: string;
  tenantId: string;
  tenantName: string;
};

const permissionFields = {
  "employee.manage": "canManageEmployees",
  "schedule.manage": "canManageSchedules",
  "attendance.manage": "canManageAttendance",
  "request.manage": "canManageRequests",
} as const;
type AdminPermissionCode = keyof typeof permissionFields;

export async function getAdminContext(
  permissionCode: AdminPermissionCode = "employee.manage",
): Promise<AdminContext | null> {
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || !workspace[permissionFields[permissionCode]]) return null;
  return { userId: workspace.userId, tenantId: workspace.tenantId, tenantName: workspace.tenantName };
}

export async function getAdminShellContext(): Promise<AdminContext | null> {
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || !workspace.canManage) return null;
  return { userId: workspace.userId, tenantId: workspace.tenantId, tenantName: workspace.tenantName };
}
