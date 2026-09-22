export const supervisorPermissionDefinitions = [
  { key: "employees", code: "employee.manage", label: "員工管理", description: "檢視與維護員工資料、登入帳號及密碼。", sensitive: false },
  { key: "schedules", code: "schedule.manage", label: "排班管理", description: "建立、調整並發布班表與假日曆。", sensitive: false },
  { key: "attendance", code: "attendance.manage", label: "出勤與打卡", description: "查看打卡紀錄、處理補卡並重算出勤。", sensitive: false },
  { key: "requests", code: "request.manage", label: "申請審核", description: "審核請假、加班與其他員工申請。", sensitive: false },
  { key: "payroll", code: "payroll.manage", label: "薪資管理", description: "查看並處理薪資、投保與扣繳資料。", sensitive: true },
  { key: "settings", code: "settings.manage", label: "系統設定", description: "調整門市打卡範圍、薪資週期與制度設定。", sensitive: true },
  { key: "audit", code: "security.audit", label: "稽核紀錄", description: "查看重要操作的執行者、時間與變更內容。", sensitive: true },
] as const;

export type SupervisorPermissionKey = typeof supervisorPermissionDefinitions[number]["key"];
export type SupervisorPermissionCode = typeof supervisorPermissionDefinitions[number]["code"];

export type EmployeeAdminAccess = {
  accountLinked: boolean;
  accountStatus: "active" | "suspended" | null;
  isSelf: boolean;
  isPlatformAdmin: boolean;
  permissions: Record<SupervisorPermissionKey, boolean>;
};

export type SupervisorPermissionState = { message?: string; success?: string };

const permissionCodes = new Set<string>(supervisorPermissionDefinitions.map(({ code }) => code));

export function isSupervisorPermissionCode(value: string): value is SupervisorPermissionCode {
  return permissionCodes.has(value);
}

export function emptySupervisorPermissions(): Record<SupervisorPermissionKey, boolean> {
  return { employees: false, schedules: false, attendance: false, requests: false, payroll: false, settings: false, audit: false };
}

export function parseEmployeeAdminAccess(value: unknown): EmployeeAdminAccess {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const granted = new Set(
    Array.isArray(source.permissions)
      ? source.permissions.filter((item): item is string => typeof item === "string" && isSupervisorPermissionCode(item))
      : [],
  );
  const permissions = emptySupervisorPermissions();
  for (const definition of supervisorPermissionDefinitions) permissions[definition.key] = granted.has(definition.code);
  return {
    accountLinked: source.account_linked === true,
    accountStatus: source.account_status === "active" || source.account_status === "suspended" ? source.account_status : null,
    isSelf: source.is_self === true,
    isPlatformAdmin: source.is_platform_admin === true,
    permissions,
  };
}
