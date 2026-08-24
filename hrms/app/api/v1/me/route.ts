import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return Response.json({ error: { code: "UNAUTHENTICATED", message: "請先登入" } }, { status: 401 });
    }

    const { data: memberships, error } = await supabase
      .from("tenant_memberships")
      .select("tenant_id, status, tenants(id, name, slug)")
      .eq("user_id", authData.user.id)
      .eq("status", "active");

    if (error) {
      return Response.json({ error: { code: "MEMBERSHIP_LOOKUP_FAILED", message: "無法取得組織權限" } }, { status: 500 });
    }

    return Response.json({ data: { user: { id: authData.user.id, email: authData.user.email }, memberships } });
  } catch {
    return Response.json(
      { error: { code: "SERVICE_NOT_CONFIGURED", message: "Supabase 尚未設定" } },
      { status: 503 },
    );
  }
}
