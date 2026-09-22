import "server-only";

import { getWorkspaceContext } from "@/lib/workspace";

export type AdminContext = {
  userId: string;
  tenantId: string;
  tenantName: string;
  permissions: {
    employees: boolean;
    schedules: boolean;
    attendance: boolean;
    requests: boolean;
    payroll: boolean;
    settings: boolean;
    audit: boolean;
    access: boolean;
  };
};

const permissionFields = {
  "employee.manage": "canManageEmployees",
  "schedule.manage": "canManageSchedules",
  "attendance.manage": "canManageAttendance",
  "request.manage": "canManageRequests",
  "payroll.manage": "canManagePayroll",
  "settings.manage": "canManageSettings",
  "security.audit": "canReadAudit",
  "access.manage": "canManageAccess",
} as const;
type AdminPermissionCode = keyof typeof permissionFields;

export async function getAdminContext(
  permissionCode: AdminPermissionCode = "employee.manage",
): Promise<AdminContext | null> {
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || !workspace[permissionFields[permissionCode]]) return null;
  return {
    userId: workspace.userId, tenantId: workspace.tenantId, tenantName: workspace.tenantName,
    permissions: {
      employees: workspace.canManageEmployees, schedules: workspace.canManageSchedules,
      attendance: workspace.canManageAttendance, requests: workspace.canManageRequests,
      payroll: workspace.canManagePayroll, settings: workspace.canManageSettings,
      audit: workspace.canReadAudit,
      access: workspace.canManageAccess,
    },
  };
}

export async function getAdminShellContext(): Promise<AdminContext | null> {
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || !workspace.canManage) return null;
  return {
    userId: workspace.userId, tenantId: workspace.tenantId, tenantName: workspace.tenantName,
    permissions: {
      employees: workspace.canManageEmployees, schedules: workspace.canManageSchedules,
      attendance: workspace.canManageAttendance, requests: workspace.canManageRequests,
      payroll: workspace.canManagePayroll, settings: workspace.canManageSettings,
      audit: workspace.canReadAudit,
      access: workspace.canManageAccess,
    },
  };
}
