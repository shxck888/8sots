import { MonitorSmartphone } from "lucide-react";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QrDeviceManager } from "./qr-device-manager";

export const dynamic = "force-dynamic";

export default async function QrDevicesPage() {
  const admin = await getAdminContext("attendance.manage");
  if (!admin) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { data: devices, error } = await supabase.from("punch_qr_devices")
    .select("id, name, paired_at, last_seen_at, revoked_at, created_at")
    .eq("tenant_id", admin.tenantId).order("created_at", { ascending: false });

  return <>
    <header className="admin-page-header"><div><span className="admin-eyebrow">QR PUNCH DEVICES</span><h1>動態 QR 打卡機器</h1><p>管理員授權固定機器一次，機器之後免登入顯示定時更新的打卡 QR Code。</p></div></header>
    <section className="admin-panel qr-device-panel">
      <div className="qr-device-intro"><MonitorSmartphone size={26} /><div><strong>配對固定機器</strong><p>先在機器開啟 <a href="/kiosk" rel="noopener noreferrer" target="_blank">打卡機畫面 /kiosk</a>，再輸入下方產生的一次性配對碼。配對碼 10 分鐘有效。</p></div></div>
      {error ? <p className="admin-form-error">讀取機器清單失敗，請確認資料庫更新已完成。</p> : <QrDeviceManager devices={devices ?? []} />}
    </section>
  </>;
}
