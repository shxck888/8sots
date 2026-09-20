import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminPasswordChangeSchema } from "../lib/admin-password";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("administrator password change", () => {
  it("requires a valid, confirmed and different new password", () => {
    expect(adminPasswordChangeSchema.safeParse({ currentPassword: "old2026", newPassword: "new2027", confirmPassword: "new2027" }).success).toBe(true);
    expect(adminPasswordChangeSchema.safeParse({ currentPassword: "old2026", newPassword: "new2027", confirmPassword: "other2027" }).success).toBe(false);
    expect(adminPasswordChangeSchema.safeParse({ currentPassword: "same2026", newPassword: "same2026", confirmPassword: "same2026" }).success).toBe(false);
    expect(adminPasswordChangeSchema.safeParse({ currentPassword: "old2026", newPassword: "letters", confirmPassword: "letters" }).success).toBe(false);
  });

  it("reauthenticates, changes the current user password and signs out every session", () => {
    const action = read("app/admin/account/actions.ts");
    expect(action).toContain("signInWithPassword");
    expect(action).toContain("updateUser({ password:");
    expect(action).toContain('scope: "global"');
    expect(action).toContain('rpc("record_self_password_change"');
  });

  it("exposes the page in admin navigation and never stores a password in audit", () => {
    expect(read("app/admin/admin-nav.tsx")).toContain('/admin/account');
    const migration = read("supabase/migrations/202609210032_admin_self_password_audit.sql").toLowerCase();
    expect(migration).toContain("'auth.password_changed'");
    expect(migration).not.toMatch(/password\s+(text|varchar)/);
  });
});
