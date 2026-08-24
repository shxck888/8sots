import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("請輸入有效的 Email")),
  password: z.string().min(8, "密碼至少需要 8 個字元").max(128, "密碼長度超過限制"),
  next: z.string().optional(),
});

export type LoginFormState = {
  message?: string;
  fieldErrors?: {
    email?: string[];
    password?: string[];
  };
};

export function sanitizeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export function getUserDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;

  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  const emailName = user.email?.split("@")[0]?.trim();
  return emailName || "夥伴";
}
