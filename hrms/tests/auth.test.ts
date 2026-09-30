import { describe, expect, it } from "vitest";
import {
  getUserDisplayName,
  loginFormSchema,
  sanitizeNextPath,
  usernameToAuthEmail,
} from "../lib/auth";

describe("authentication helpers", () => {
  it("accepts valid credentials and normalizes the username", () => {
    const result = loginFormSchema.parse({
      username: "  Store_Admin_01 ",
      password: "secure2026",
      next: "/attendance",
    });

    expect(result.username).toBe("store_admin_01");
  });

  it("rejects invalid credentials before calling Supabase", () => {
    const result = loginFormSchema.safeParse({ username: "a!", password: "123456" });
    expect(result.success).toBe(false);
  });

  it("requires an alphanumeric password with a letter and a number", () => {
    expect(loginFormSchema.safeParse({ username: "admin", password: "admin0708" }).success).toBe(true);
    expect(loginFormSchema.safeParse({ username: "admin", password: "onlyletters" }).success).toBe(false);
    expect(loginFormSchema.safeParse({ username: "admin", password: "123456" }).success).toBe(false);
    expect(loginFormSchema.safeParse({ username: "admin", password: "abc1!@" }).success).toBe(false);
  });

  it("maps a username to an internal Supabase email identifier", () => {
    expect(usernameToAuthEmail(" Admin ")).toBe("admin@auth.8sots.com.tw");
  });

  it("allows local redirect paths and rejects external redirects", () => {
    expect(sanitizeNextPath("/attendance?month=8")).toBe("/attendance?month=8");
    expect(sanitizeNextPath("https://malicious.example")).toBe("/");
    expect(sanitizeNextPath("//malicious.example")).toBe("/");
  });

  it.each([
    "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example",
    "/path\\evil.example", "/\u0000/evil.example", "/.//evil.example",
    "///evil.example", "https://evil.example", "javascript:alert(1)",
    " //evil.example", "", null, undefined, 123,
  ])("rejects unsafe redirect input %j", (input) => {
    expect(sanitizeNextPath(input)).toBe("/");
  });

  it.each(["/", "/attendance?month=8", "/requests#new", "/員工", "/search?q=https%3A%2F%2Fexample.com"]) (
    "preserves local destinations %s", (input) => {
      const result = sanitizeNextPath(input);
      expect(result).toBe(input);
      expect(new URL(result, "https://hrms.example").origin).toBe("https://hrms.example");
    },
  );

  it("uses profile metadata before falling back to the email", () => {
    expect(getUserDisplayName({ email: "employee@example.com", user_metadata: { full_name: "林宥辰" } })).toBe("林宥辰");
    expect(getUserDisplayName({ email: "employee@example.com" })).toBe("employee");
  });
});
