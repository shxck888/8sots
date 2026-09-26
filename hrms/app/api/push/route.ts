import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { isAllowedPushEndpoint, pushSubscriptionSchema } from "@/lib/push-contract";
export const dynamic = "force-dynamic";
export async function GET() {
  const workspace = await getWorkspaceContext();
  if (!workspace?.employeeId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const configured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.CRON_SECRET);
  return Response.json({ publicKey: configured ? process.env.VAPID_PUBLIC_KEY : null }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "origin" }, { status: 403 });
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || !workspace.employeeId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const input = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "invalid subscription" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_my_push_subscription", { p_tenant_id: workspace.tenantId,
    p_endpoint: input.data.endpoint, p_p256dh: input.data.keys.p256dh, p_auth_key: input.data.keys.auth });
  return Response.json({ ok: !error }, { status: error ? 400 : 200 });
}
export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "origin" }, { status: 403 });
  const input = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof input?.endpoint !== "string" || !isAllowedPushEndpoint(input.endpoint)) return Response.json({ error: "invalid endpoint" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_my_push_subscription", { p_endpoint: input.endpoint });
  return Response.json({ ok: !error }, { status: error ? 400 : 200 });
}
