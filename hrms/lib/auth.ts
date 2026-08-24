import { z } from "zod";

export const AUTH_USERNAME_DOMAIN = "auth.8sots.com.tw";

export const loginFormSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "帳號至少需要 3 個字元")
    .max(32, "帳號最多 32 個字元")
    .regex(/^[a-z0-9_]+$/, "帳號只能使用英文字母、數字與底線"),
  password: z
    .string()
    .min(6, "密碼至少需要 6 個字元")
    .max(64, "密碼最多 64 個字元")
    .regex(/^[A-Za-z0-9]+$/, "密碼只能使用英文字母與數字")
    .regex(/[A-Za-z]/, "密碼至少需要一個英文字母")
    .regex(/[0-9]/, "密碼至少需要一個數字"),
  next: z.string().optional(),
});

export type LoginFormState = {
  message?: string;
  fieldErrors?: {
    username?: string[];
    password?: string[];
  };
};

export function usernameToAuthEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_USERNAME_DOMAIN}`;
}

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
