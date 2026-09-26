"use client";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
export function PushReminderSettings() {
  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    async function check() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!stopped) setStatus("unsupported"); return;
      }
      try {
        const response = await fetch("/api/push", { cache: "no-store" });
        const config = await response.json() as { publicKey?: string | null };
        if (!config.publicKey) { if (!stopped) setStatus("unconfigured"); return; }
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (stopped) return;
        setPublicKey(config.publicKey);
        // Resave on login so an existing browser subscription is associated with this employee.
        if (subscription) {
          const saved = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
          if (!saved.ok) await subscription.unsubscribe();
          if (!stopped) setStatus(saved.ok ? "enabled" : "disabled");
        } else setStatus(Notification.permission === "denied" ? "denied" : "disabled");
      } catch { if (!stopped) setStatus("disabled"); }
    }
    void check(); return () => { stopped = true; };
  }, []);
  async function toggle() {
    setBusy(true); setMessage("");
    try {
      if (status !== "enabled") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") { setStatus(permission === "denied" ? "denied" : "disabled"); return; }
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (status === "enabled" && existing) {
        const response = await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) });
        if (!response.ok) throw new Error();
        await existing.unsubscribe(); setStatus("disabled");
      } else {
        if (!publicKey) throw new Error();
        const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
        const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        const response = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
        if (!response.ok) throw new Error();
        setStatus("enabled");
      }
    } catch { setMessage("提醒設定未完成，請確認網路與通知權限後重試。"); }
    finally { setBusy(false); }
  }
  return <div className="push-reminder-settings"><Bell size={15} aria-hidden="true" />
    {status === "unsupported" ? <span>iPhone 請先加入主畫面，再開啟通知提醒。</span>
      : status === "unconfigured" ? <span>推播提醒尚未啟用；首頁仍顯示倒數。</span>
      : status === "denied" ? <span>通知權限已關閉，請至裝置設定允許通知。</span>
      : status === "checking" ? <span>正在確認提醒設定…</span>
      : <button disabled={busy || !publicKey} onClick={() => void toggle()} type="button">{busy ? "設定中…" : status === "enabled" ? "吃飯推播已開啟 · 關閉" : "開啟吃飯推播提醒"}</button>}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
