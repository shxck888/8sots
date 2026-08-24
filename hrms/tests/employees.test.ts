import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { employeeFormSchema, employeeStatusLabels, employmentTypeLabels, genderLabels } from "../lib/employees";
import { maskNationalId, protectNationalId } from "../lib/pii";

const validEmployee = {
  employeeNo: "emp_001", fullName: "王小明", englishName: "Ming Wang",
  nationalId: "A123456789", birthDate: "1995-01-02", gender: "male",
  address: "台北市信義區", mobile: "0912-345-678", email: "MING@example.com",
  emergencyContactName: "王大明", emergencyContactPhone: "0988-000-000",
  departmentName: "外場部", positionName: "外場正職", supervisorEmployeeId: "",
  employmentType: "full_time", hireDate: "2026-08-25", terminationDate: "",
  probationEndDate: "2026-11-25", status: "active", notes: "外場正職",
};

describe("employee master form", () => {
  it("normalizes identifiers and email", () => {
    const result = employeeFormSchema.parse(validEmployee);
    expect(result.employeeNo).toBe("EMP_001");
    expect(result.nationalId).toBe("A123456789");
    expect(result.email).toBe("ming@example.com");
  });

  it("normalizes optional fields to null", () => {
    const result = employeeFormSchema.parse({ ...validEmployee, englishName: "", email: "", notes: "" });
    expect(result.englishName).toBeNull();
    expect(result.email).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.supervisorEmployeeId).toBeNull();
    expect(result.terminationDate).toBeNull();
  });

  it.each(["A B", "員工01", "EMP#1", ""])("rejects invalid employee number %s", (employeeNo) => {
    expect(employeeFormSchema.safeParse({ ...validEmployee, employeeNo }).success).toBe(false);
  });

  it("requires the requested personal and employment fields", () => {
    for (const field of ["birthDate", "address", "mobile", "emergencyContactName", "emergencyContactPhone", "departmentName", "positionName"] as const) {
      expect(employeeFormSchema.safeParse({ ...validEmployee, [field]: "" }).success).toBe(false);
    }
  });

  it("requires termination date for terminated employees", () => {
    const result = employeeFormSchema.safeParse({ ...validEmployee, status: "terminated", terminationDate: "" });
    expect(result.success).toBe(false);
  });

  it("rejects termination and probation dates before hire date", () => {
    expect(employeeFormSchema.safeParse({ ...validEmployee, terminationDate: "2026-01-01" }).success).toBe(false);
    expect(employeeFormSchema.safeParse({ ...validEmployee, probationEndDate: "2026-01-01" }).success).toBe(false);
  });

  it("defines every persisted label", () => {
    expect(employeeStatusLabels.terminated).toBe("離職");
    expect(employmentTypeLabels).toMatchObject({ full_time: "正職", part_time: "兼職", hourly: "時薪", contract: "約聘", temporary: "臨時" });
    expect(genderLabels).toMatchObject({ male: "男性", female: "女性" });
  });
});

describe("national ID protection", () => {
  const previousKey = process.env.PII_ENCRYPTION_KEY;
  beforeEach(() => { process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });
  afterEach(() => { process.env.PII_ENCRYPTION_KEY = previousKey; });

  it("encrypts without storing plaintext and produces a stable lookup hash", () => {
    const first = protectNationalId("a123456789");
    const second = protectNationalId("A123456789");
    expect(first.ciphertext).not.toContain("A123456789");
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.hash).toBe(second.hash);
    expect(first.last4).toBe("6789");
    expect(maskNationalId(first.last4)).toBe("******6789");
  });
});
