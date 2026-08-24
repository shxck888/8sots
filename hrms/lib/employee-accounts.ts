import { z } from "zod";
import type { Tables } from "@/lib/database.types";
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

export type EmployeeAuthAccount = Tables<"employee_auth_accounts">;
