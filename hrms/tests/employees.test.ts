import { describe, expect, it } from "vitest";
import { employeeFormSchema, employeeStatusLabels } from "../lib/employees";

const validEmployee = {
  employeeNo: "emp_001",
  fullName: "王小明",
  preferredName: "小明",
  email: "MING@example.com",
  phone: "0912-345-678",
  hireDate: "2026-08-25",
  status: "active",
  notes: "外場正職",
};

describe("employee form", () => {
  it("normalizes employee number, email, and optional values", () => {
    const result = employeeFormSchema.parse(validEmployee);
    expect(result.employeeNo).toBe("EMP_001");
    expect(result.email).toBe("ming@example.com");
  });

  it("accepts blank optional fields as null", () => {
    const result = employeeFormSchema.parse({
      ...validEmployee,
      preferredName: "",
      email: "",
      phone: "",
      notes: "",
    });
    expect(result.preferredName).toBeNull();
    expect(result.email).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.notes).toBeNull();
  });

  it.each(["A B", "員工01", "EMP#1", ""])("rejects invalid employee number %s", (employeeNo) => {
    expect(employeeFormSchema.safeParse({ ...validEmployee, employeeNo }).success).toBe(false);
  });

  it("rejects invalid email and status", () => {
    expect(employeeFormSchema.safeParse({ ...validEmployee, email: "invalid" }).success).toBe(false);
    expect(employeeFormSchema.safeParse({ ...validEmployee, status: "pending" }).success).toBe(false);
  });

  it("defines labels for every persisted status", () => {
    expect(employeeStatusLabels).toEqual({
      active: "在職",
      on_leave: "留職停薪",
      terminated: "離職",
    });
  });
});
