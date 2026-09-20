"use server";

import { redirect } from "next/navigation";
import { getAdminShellContext } from "@/lib/admin";
import { adminPasswordChangeSchema } from "@/lib/admin-password";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function fail(code: string): never {
  redirect(`/admin/account?error=${code}`);
}

export async function changeOwnPassword(formData: FormData) {
  const parsed = adminPasswordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) fail("input");

  const admin = await getAdminShellContext();
  if (!admin) fail("permission");
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user?.email || user.id !== admin.userId) fail("session");

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) fail("current");

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (updateError) fail("update");

  const { error: auditError } = await supabase.rpc("record_self_password_change", {
    p_tenant_id: admin.tenantId,
  });
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  const warning = auditError ? "audit" : signOutError ? "session" : "";
  redirect(`/login?passwordChanged=1${warning ? `&warning=${warning}` : ""}`);
}
