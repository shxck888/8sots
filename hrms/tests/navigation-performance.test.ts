import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("navigation performance contract", () => {
  it("provides immediate loading boundaries for dynamic employee and admin routes", () => {
    expect(read("app/loading.tsx")).toContain("<RouteLoading />");
    expect(read("app/admin/loading.tsx")).toContain("<RouteLoading admin />");
    expect(read("app/loading-state.tsx")).toContain('role="status"');
  });

  it("deduplicates request-scoped identity lookups and parallelizes permission checks", () => {
    const workspace = read("lib/workspace.ts");
    const admin = read("lib/admin.ts");
    const linkedEmployee = read("lib/linked-employee.ts");

    expect(workspace).toContain("export const getWorkspaceContext = cache(");
    expect(workspace).toContain("await Promise.all(workspacePermissionCodes.map");
    expect(admin).toContain("const getMembershipContext = cache(");
    expect(admin).toContain("const getAdminPermissionContext = cache(");
    expect(linkedEmployee).toContain("export const getLinkedEmployeeId = cache(");
  });
});
