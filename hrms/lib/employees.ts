import { z } from "zod";

const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, message).transform((value) => value || null);

export const employeeFormSchema = z.object({
  employeeNo: z
    .string()
    .trim()
    .min(1, "請輸入員工編號。")
    .max(32, "員工編號最多 32 字元。")
    .regex(/^[A-Za-z0-9_-]+$/, "員工編號只能使用英文字母、數字、底線或連字號。")
    .transform((value) => value.toUpperCase()),
  fullName: z.string().trim().min(1, "請輸入員工姓名。").max(80, "員工姓名最多 80 字元。"),
  preferredName: optionalText(80, "顯示名稱最多 80 字元。"),
  email: z
    .string()
    .trim()
    .max(254, "Email 最多 254 字元。")
    .refine((value) => value === "" || z.email().safeParse(value).success, "Email 格式不正確。")
    .transform((value) => value.toLowerCase() || null),
  phone: optionalText(30, "電話最多 30 字元。"),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "請選擇到職日期。"),
  status: z.enum(["active", "on_leave", "terminated"], "請選擇有效的任職狀態。"),
  notes: optionalText(500, "備註最多 500 字元。"),
});

export type EmployeeFormInput = z.infer<typeof employeeFormSchema>;
export type EmployeeStatus = EmployeeFormInput["status"];

export type EmployeeFormState = {
  message?: string;
  fieldErrors?: Partial<Record<keyof z.input<typeof employeeFormSchema>, string[]>>;
};

export type EmployeeRecord = {
  id: string;
  tenant_id: string;
  auth_user_id: string | null;
  employee_no: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  hire_date: string;
  status: EmployeeStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const employeeStatusLabels: Record<EmployeeStatus, string> = {
  active: "在職",
  on_leave: "留職停薪",
  terminated: "離職",
};
