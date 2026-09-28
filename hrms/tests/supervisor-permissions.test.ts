import { describe, expect, it } from "vitest";
import {
  isSupervisorPermissionCode,
  parseEmployeeAdminAccess,
  supervisorPermissionDefinitions,
} from "../lib/supervisor-permissions";

describe("supervisor admin permissions", () => {
  it("allows delegated back-office permissions including break reminders", () => {
    expect(supervisorPermissionDefinitions).toHaveLength(8);
    expect(isSupervisorPermissionCode("attendance.break_notify")).toBe(true);
    expect(isSupervisorPermissionCode("schedule.manage")).toBe(true);
    expect(isSupervisorPermissionCode("platform.admin")).toBe(false);
    expect(isSupervisorPermissionCode("access.manage")).toBe(false);
  });

  it("maps the database payload to safe checkbox values", () => {
    const access = parseEmployeeAdminAccess({
      account_linked: true,
      account_status: "active",
      permissions: ["schedule.manage", "request.manage", "attendance.break_notify", "platform.admin", 123],
    });
    expect(access.accountLinked).toBe(true);
    expect(access.permissions.schedules).toBe(true);
    expect(access.permissions.requests).toBe(true);
    expect(access.permissions.breakNotifications).toBe(true);
    expect(access.permissions.payroll).toBe(false);
    expect(access.isPlatformAdmin).toBe(false);
  });

  it("fails closed for malformed access data", () => {
    const access = parseEmployeeAdminAccess(null);
    expect(access.accountLinked).toBe(false);
    expect(Object.values(access.permissions).every((granted) => !granted)).toBe(true);
  });
});
