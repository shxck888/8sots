"use server";

import { redirect } from "next/navigation";
import {
  loginFormSchema,
  sanitizeNextPath,
  usernameToAuthEmail,
  type LoginFormState,
} from "@/lib/auth";
import { getAdminShellContext } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function login(
  _previousState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = loginFormSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { message: "登入服務尚未設定完成，請聯絡系統管理員。" };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToAuthEmail(parsed.data.username),
    password: parsed.data.password,
  });

  if (error) {
    return { message: "帳號或密碼不正確，請重新確認。" };
  }

  const nextPath = sanitizeNextPath(parsed.data.next);
  if (nextPath === "/") {
    const admin = await getAdminShellContext();
    if (admin) redirect("/admin");
  }

  redirect(nextPath);
}

export async function logout() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } finally {
    redirect("/login");
  }
}
