"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";

export async function markNotificationRead(formData: FormData) {
  const parsed = z.string().uuid().safeParse(formData.get("notificationId"));
  if (!parsed.success) redirect("/notifications?error=1");
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: parsed.data });
  if (error) redirect("/notifications?error=1");
  revalidatePath("/");
  revalidatePath("/notifications");
  redirect("/notifications");
}

export async function markAllNotificationsRead() {
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_all_notifications_read", { p_tenant_id: workspace.tenantId });
  if (error) redirect("/notifications?error=1");
  revalidatePath("/");
  revalidatePath("/notifications");
  redirect("/notifications?saved=1");
}
