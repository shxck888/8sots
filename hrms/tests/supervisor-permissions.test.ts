import { describe, expect, it } from "vitest";
import {
  isSupervisorPermissionCode,
  parseEmployeeAdminAccess,
  supervisorPermissionDefinitions,
} from "../lib/supervisor-permissions";

describe("supervisor admin permissions", () => {
  it("allows only the seven delegated back-office permissions", () => {
    expect(supervisorPermissionDefinitions).toHaveLength(7);
    expect(isSupervisorPermissionCode("schedule.manage")).toBe(true);
    expect(isSupervisorPermissionCode("platform.admin")).toBe(false);
    expect(isSupervisorPermissionCode("access.manage")).toBe(false);
  });

  it("maps the database payload to safe checkbox values", () => {
    const access = parseEmployeeAdminAccess({
      account_linked: true,
      account_status: "active",
      permissions: ["schedule.manage", "request.manage", "platform.admin", 123],
    });
    expect(access.accountLinked).toBe(true);
    expect(access.permissions.schedules).toBe(true);
    expect(access.permissions.requests).toBe(true);
    expect(access.permissions.payroll).toBe(false);
    expect(access.isPlatformAdmin).toBe(false);
  });

  it("fails closed for malformed access data", () => {
    const access = parseEmployeeAdminAccess(null);
    expect(access.accountLinked).toBe(false);
    expect(Object.values(access.permissions).every((granted) => !granted)).toBe(true);
  });
});
