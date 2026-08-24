import { describe, expect, it } from "vitest";
import { employeeAccountCredentialsSchema, employeePasswordSchema } from "../lib/employee-accounts";

describe("employee account credentials", () => {
  it("normalizes a valid username and accepts an alphanumeric password", () => {
    const result = employeeAccountCredentialsSchema.parse({
      username: " Staff_001 ", password: "welcome2026",
    });
    expect(result.username).toBe("staff_001");
  });

  it.each([
    { username: "ab", password: "welcome2026" },
    { username: "員工001", password: "welcome2026" },
    { username: "staff001", password: "onlyletters" },
    { username: "staff001", password: "123456" },
    { username: "staff001", password: "abc123!" },
  ])("rejects invalid provisioning credentials", (input) => {
    expect(employeeAccountCredentialsSchema.safeParse(input).success).toBe(false);
  });

  it("uses the same password policy for resets", () => {
    expect(employeePasswordSchema.safeParse({ password: "reset0708" }).success).toBe(true);
    expect(employeePasswordSchema.safeParse({ password: "short" }).success).toBe(false);
  });
});
