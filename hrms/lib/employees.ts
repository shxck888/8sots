import { z } from "zod";

const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, message).transform((value) => value || null);
const requiredText = (max: number, emptyMessage: string, maxMessage: string) =>
  z.string().trim().min(1, emptyMessage).max(max, maxMessage);

export const employeeFormSchema = z.object({
  employeeNo: z.string().trim().min(1, "請輸入員工編號。").max(32, "員工編號最多 32 字元。")
    .regex(/^[A-Za-z0-9_-]+$/, "員工編號只能使用英文字母、數字、底線或連字號。")
    .transform((value) => value.toUpperCase()),
  fullName: requiredText(80, "請輸入員工姓名。", "員工姓名最多 80 字元。"),
  englishName: optionalText(120, "英文姓名最多 120 字元。"),
  nationalId: z.string().trim().transform((value) => value.toUpperCase())
    .refine((value) => value === "" || /^[A-Z][A-Z0-9]\d{8}$/.test(value), "身分證／居留證格式不正確。"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "請選擇出生日期。"),
  gender: z.enum(["male", "female", "non_binary", "undisclosed"], "請選擇性別。"),
  address: requiredText(300, "請輸入地址。", "地址最多 300 字元。"),
  mobile: requiredText(30, "請輸入手機號碼。", "手機號碼最多 30 字元。"),
  email: z.string().trim().max(254, "Email 最多 254 字元。")
    .refine((value) => value === "" || z.email().safeParse(value).success, "Email 格式不正確。")
    .transform((value) => value.toLowerCase() || null),
  emergencyContactName: requiredText(80, "請輸入緊急聯絡人。", "緊急聯絡人最多 80 字元。"),
  emergencyContactPhone: requiredText(30, "請輸入緊急聯絡電話。", "緊急聯絡電話最多 30 字元。"),
  departmentName: requiredText(80, "請輸入部門。", "部門最多 80 字元。"),
  positionName: requiredText(80, "請輸入職位。", "職位最多 80 字元。"),
  supervisorEmployeeId: z.string().uuid("直屬主管格式不正確。").or(z.literal("")).transform((value) => value || null),
  employmentType: z.enum(["full_time", "part_time", "hourly", "contract", "temporary"], "請選擇任職類型。"),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "請選擇到職日期。"),
  terminationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "離職日期格式不正確。").or(z.literal("")).transform((value) => value || null),
  probationEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "試用期日期格式不正確。").or(z.literal("")).transform((value) => value || null),
  status: z.enum(["active", "on_leave", "terminated"], "請選擇有效的任職狀態。"),
  notes: optionalText(500, "備註最多 500 字元。"),
}).superRefine((data, context) => {
  if (data.terminationDate && data.terminationDate < data.hireDate) {
    context.addIssue({ code: "custom", path: ["terminationDate"], message: "離職日期不可早於到職日期。" });
  }
  if (data.status === "terminated" && !data.terminationDate) {
    context.addIssue({ code: "custom", path: ["terminationDate"], message: "離職狀態必須填寫離職日期。" });
  }
  if (data.probationEndDate && data.probationEndDate < data.hireDate) {
    context.addIssue({ code: "custom", path: ["probationEndDate"], message: "試用期結束日不可早於到職日期。" });
  }
});

export type EmployeeFormInput = z.infer<typeof employeeFormSchema>;
export type EmployeeStatus = EmployeeFormInput["status"];
export type GenderType = EmployeeFormInput["gender"];
export type EmploymentType = EmployeeFormInput["employmentType"];
export type EmployeeFormState = {
  message?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof employeeFormSchema>, string[]>>;
};

export type EmployeeMasterRecord = {
  id: string; tenant_id: string; auth_user_id: string | null;
  employee_no: string; full_name: string; english_name: string | null;
  national_id_last4: string | null; birth_date: string | null; gender: GenderType | null;
  address: string | null; photo_path: string | null; photo_url?: string | null;
  mobile: string | null; email: string | null;
  emergency_contact_name: string | null; emergency_contact_phone: string | null;
  employment_record_id: string | null; department_id: string | null; department_name: string | null;
  position_id: string | null; position_name: string | null;
  supervisor_employee_id: string | null; supervisor_name: string | null;
  employment_type: EmploymentType | null; hire_date: string | null;
  termination_date: string | null; probation_end_date: string | null;
  status: EmployeeStatus | null; effective_from: string | null;
  notes: string | null; created_at: string; updated_at: string;
};

export const employeeStatusLabels: Record<EmployeeStatus, string> = {
  active: "在職", on_leave: "留職停薪", terminated: "離職",
};
export const genderLabels: Record<GenderType, string> = {
  male: "男性", female: "女性", non_binary: "其他", undisclosed: "不透露",
};
export const employmentTypeLabels: Record<EmploymentType, string> = {
  full_time: "正職", part_time: "兼職", hourly: "時薪", contract: "約聘", temporary: "臨時",
};
