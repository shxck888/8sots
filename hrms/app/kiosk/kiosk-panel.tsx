"use client";

import { createClient } from "@supabase/supabase-js";
import { Clock3, MonitorCheck, QrCode, RefreshCw } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import type { Database } from "@/lib/database";

type PairedDevice = { deviceId: string; credential: string; deviceName: string; tenantName: string };
type CurrentQr = { imageUrl: string; validUntil: number };
const storageKey = "hrms.qr-punch-device.v1";

function getKioskClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

export function KioskPanel() {
  const [device, setDevice] = useState<PairedDevice | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<CurrentQr | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [monotonicNow, setMonotonicNow] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as PairedDevice;
          if (parsed.deviceId && /^[0-9a-f]{64}$/.test(parsed.credential)) setDevice(parsed);
        }
      } catch { /* An invalid or inaccessible local credential requires pairing again. */ }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      setMonotonicNow(performance.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!device) return;
    let active = true;
    let refreshing = false;
    async function refresh() {
      if (!active || refreshing || !device) return;
      refreshing = true;
      try {
        const supabase = getKioskClient();
        const { data, error } = await supabase.rpc("issue_punch_qr_token", {
          p_device_id: device.deviceId, p_credential: device.credential,
        });
        if (!active) return;
        if (error?.message.includes("device not authorized")) {
          window.localStorage.removeItem(storageKey);
          setDevice(null);
          setQr(null);
          setMessage("此機器已停用或授權失效，請管理員重新配對。 ");
          return;
        }
        const issued = data?.[0];
        if (error || !issued) throw new Error("QR token unavailable");
        const QRCode = await import("qrcode");
        const imageUrl = await QRCode.toDataURL(issued.qr_value, {
          width: 460, margin: 2, errorCorrectionLevel: "M",
          color: { dark: "#123f36", light: "#ffffff" },
        });
        if (!active) return;
        // Display for less than the server's 35-second validity window.
        // This uses elapsed device time, so an incorrect wall clock cannot
        // make an expired code appear usable.
        setQr({ imageUrl, validUntil: performance.now() + 30000 });
        setMonotonicNow(performance.now());
        setMessage("");
      } catch {
        if (active) setMessage("無法更新 QR Code，正在重試。請檢查機器網路連線。 ");
      } finally { refreshing = false; }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20000);
    return () => { active = false; window.clearInterval(timer); };
  }, [device]);

  function pair(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const normalized = code.replace(/[\s-]/g, "").toUpperCase();
      if (!/^[0-9A-F]{16}$/.test(normalized)) {
        setMessage("請輸入管理員提供的 16 位配對碼。 ");
        return;
      }
      const { data, error } = await getKioskClient().rpc("pair_punch_qr_device", { p_pairing_code: normalized });
      const paired = data?.[0];
      if (error || !paired) {
        setMessage("配對碼錯誤、已使用或已逾時，請向管理員索取新的配對碼。 ");
        return;
      }
      const nextDevice = {
        deviceId: paired.device_id, credential: paired.credential,
        deviceName: paired.device_name, tenantName: paired.tenant_name,
      };
      try { window.localStorage.setItem(storageKey, JSON.stringify(nextDevice)); }
      catch { setMessage("此瀏覽器無法保存機器授權，請啟用本機儲存後再試。 "); return; }
      setDevice(nextDevice);
      setCode("");
      setMessage("");
    });
  }

  const secondsLeft = qr ? Math.max(0, Math.ceil((qr.validUntil - monotonicNow) / 1000)) : 0;
  const visibleQr = qr && secondsLeft > 0;
  const time = new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    timeZone: "Asia/Taipei",
  }).format(new Date(now));

  return <main className="kiosk-shell">
    <header className="kiosk-header"><span><MonitorCheck size={25} /> 海之星打卡機</span><time>{time}</time></header>
    {!loaded ? <div className="kiosk-center"><RefreshCw className="spin" size={34} /><p>正在載入機器授權…</p></div> : !device ? <div className="kiosk-pair-card">
      <QrCode size={38} /><h1>配對打卡機器</h1><p>請管理員先到「管理後台 → 動態 QR 機器」新增此機器，並提供一次性配對碼。配對後這台機器不需登入。</p>
      <form onSubmit={pair}><label>一次性配對碼<input autoCapitalize="characters" autoComplete="off" autoCorrect="off" maxLength={24} onChange={(event) => setCode(event.target.value)} placeholder="XXXX XXXX XXXX XXXX" required spellCheck={false} value={code} /></label><button disabled={pending} type="submit">{pending ? "配對中…" : "授權這台機器"}</button></form>
      {message ? <p aria-live="polite" className="kiosk-error">{message}</p> : null}
    </div> : <div className="kiosk-display">
      <span className="kiosk-eyebrow">{device.tenantName} · {device.deviceName}</span>
      <h1>掃描 QR Code 打卡</h1>
      <p>請在員工首頁點選「掃描 QR Code 打卡」，將相機對準此畫面。</p>
      <div className="kiosk-qr-frame">{visibleQr ? <Image alt="動態打卡 QR Code" height={460} src={qr.imageUrl} unoptimized width={460} /> : <div className="kiosk-qr-wait"><RefreshCw className="spin" size={42} /><span>更新 QR Code 中…</span></div>}</div>
      <div className="kiosk-countdown"><Clock3 size={20} />{visibleQr ? `${secondsLeft} 秒後更新` : "暫無有效 QR Code"}</div>
      {message ? <p aria-live="polite" className="kiosk-error">{message}</p> : null}
      <small>打卡時間以伺服器收件時間為準。請勿分享或拍攝此畫面。</small>
    </div>}
  </main>;
}
