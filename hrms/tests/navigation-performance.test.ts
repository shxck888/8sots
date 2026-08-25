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

  it("deduplicates request-scoped identity lookups and uses aggregate database reads", () => {
    const workspace = read("lib/workspace.ts");
    const admin = read("lib/admin.ts");
    const schedule = read("lib/my-schedule.ts");
    const attendance = read("lib/attendance-overview.ts");

    expect(workspace).toContain("export const getWorkspaceContext = cache(");
    expect(workspace).toContain('rpc("get_current_workspace_context")');
    expect(admin).toContain("getWorkspaceContext()");
    expect(schedule).toContain('rpc("get_my_published_schedule"');
    expect(attendance).toContain('rpc("get_my_attendance_overview"');
  });

  it("uses local JWT claims in the request proxy instead of a remote user lookup", () => {
    const proxy = read("proxy.ts");
    expect(proxy).toContain("auth.getClaims()");
    expect(proxy).not.toContain("auth.getUser()");
  });

  it("runs Vercel Functions beside the Tokyo Supabase database", () => {
    const vercel = JSON.parse(read("vercel.json")) as { regions?: string[] };
    expect(vercel.regions).toEqual(["hnd1"]);
  });
});
