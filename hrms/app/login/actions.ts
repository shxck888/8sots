"use server";

import { redirect } from "next/navigation";
import { loginFormSchema, sanitizeNextPath, type LoginFormState } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function login(
  _previousState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = loginFormSchema.safeParse({
    email: formData.get("email"),
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
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { message: "Email 或密碼不正確，請重新確認。" };
  }

  redirect(sanitizeNextPath(parsed.data.next));
}

export async function logout() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } finally {
    redirect("/login");
  }
}
