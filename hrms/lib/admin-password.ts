import { z } from "zod";
import { loginFormSchema } from "./auth";

export const adminPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: loginFormSchema.shape.password,
  confirmPassword: z.string(),
}).superRefine((value, context) => {
  if (value.newPassword !== value.confirmPassword) {
    context.addIssue({ code: "custom", path: ["confirmPassword"], message: "兩次輸入的新密碼不一致" });
  }
  if (value.currentPassword === value.newPassword) {
    context.addIssue({ code: "custom", path: ["newPassword"], message: "新密碼不可與目前密碼相同" });
  }
});
