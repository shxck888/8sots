import webpush from "web-push";
import { isAllowedPushEndpoint } from "@/lib/push-contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "origin" }, { status: 403 });
  }
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || !workspace.canReceiveBreakNotifications) {
    return Response.json({ error: "unauthorized" }, { status: 403 });
  }
  const input = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof input?.endpoint !== "string" || !isAllowedPushEndpoint(input.endpoint)) {
    return Response.json({ error: "invalid endpoint" }, { status: 400 });
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return Response.json({ error: "push not configured" }, { status: 503 });

  const supabase = await createSupabaseServerClient();
  const { data: subscription, error } = await supabase.from("employee_push_subscriptions")
    .select("endpoint,p256dh,auth_key")
    .eq("tenant_id", workspace.tenantId).eq("user_id", workspace.userId)
    .eq("endpoint", input.endpoint).maybeSingle();
  if (error) return Response.json({ error: "subscription unavailable" }, { status: 503 });
  if (!subscription) return Response.json({ error: "subscription missing" }, { status: 404 });

  try {
    await webpush.sendNotification({ endpoint: subscription.endpoint, keys: {
      p256dh: subscription.p256dh, auth: subscription.auth_key,
    } }, JSON.stringify({
      title: "測試通知：員工休息時間已到",
      body: "這是管理員裝置的測試推播，沒有員工實際休息到時。",
      tag: `meal-test-${Date.now()}`,
      url: "/admin/break-reminders",
    }), { TTL: 60, urgency: "high", timeout: 5000, vapidDetails: {
      subject: process.env.VAPID_SUBJECT || "https://hrms.8sots.com.tw", publicKey, privateKey,
    } });
    return Response.json({ ok: true });
  } catch (pushError) {
    const status = (pushError as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await supabase.rpc("remove_my_push_subscription", { p_endpoint: input.endpoint });
      return Response.json({ error: "subscription expired" }, { status: 410 });
    }
    console.error("Supervisor test push failed", { status });
    return Response.json({ error: "push failed" }, { status: 502 });
  }
}
