import { describe, expect, it } from "vitest";
import { getUserDisplayName, loginFormSchema, sanitizeNextPath } from "../lib/auth";

describe("authentication helpers", () => {
  it("accepts valid credentials and normalizes the email", () => {
    const result = loginFormSchema.parse({
      email: "  Employee@Example.COM ",
      password: "secure-password",
      next: "/attendance",
    });

    expect(result.email).toBe("employee@example.com");
  });

  it("rejects invalid credentials before calling Supabase", () => {
    const result = loginFormSchema.safeParse({ email: "not-an-email", password: "short" });
    expect(result.success).toBe(false);
  });

  it("allows local redirect paths and rejects external redirects", () => {
    expect(sanitizeNextPath("/attendance?month=8")).toBe("/attendance?month=8");
    expect(sanitizeNextPath("https://malicious.example")).toBe("/");
    expect(sanitizeNextPath("//malicious.example")).toBe("/");
  });

  it("uses profile metadata before falling back to the email", () => {
    expect(getUserDisplayName({ email: "employee@example.com", user_metadata: { full_name: "林宥辰" } })).toBe("林宥辰");
    expect(getUserDisplayName({ email: "employee@example.com" })).toBe("employee");
  });
});
