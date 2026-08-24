import { z } from "zod";
import { loginFormSchema } from "./auth";

export const employeeAccountCredentialsSchema = loginFormSchema.pick({
  username: true,
  password: true,
});

export const employeePasswordSchema = z.object({
  password: loginFormSchema.shape.password,
});

export type EmployeeAccountState = {
  message?: string;
  success?: string;
  fieldErrors?: { username?: string[]; password?: string[] };
};

export type EmployeeAuthAccount = {
  employee_id: string;
  tenant_id: string;
  auth_user_id: string;
  username: string;
  status: "active" | "suspended";
  provisioned_at: string;
  updated_at: string;
};
