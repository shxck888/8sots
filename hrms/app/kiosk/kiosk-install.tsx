"use client";

import { Download, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed" };
type InstallEvent = Event & {
  prompt: () => Promise<InstallChoice | void>;
  userChoice?: Promise<InstallChoice>;
};
type Mode = "checking" | "native" | "ios" | "manual" | "installed";

export function KioskInstall() {
  const [mode, setMode] = useState<Mode>("checking");
  const [showHelp, setShowHelp] = useState(false);
  const installEvent = useRef<InstallEvent | null>(null);

  useEffect(() => {
    const installed = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (installed) {
      const timer = window.setTimeout(() => setMode("installed"), 0);
      return () => window.clearTimeout(timer);
    }

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const timer = window.setTimeout(() => setMode((current) => current === "native" ? current : ios ? "ios" : "manual"), 0);
    function beforeInstall(event: Event) {
      event.preventDefault();
      installEvent.current = event as InstallEvent;
      setMode("native");
    }
    function installedApp() {
      installEvent.current = null;
      setShowHelp(false);
      setMode("installed");
    }
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installedApp);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installedApp);
    };
  }, []);

  async function install() {
    if (mode !== "native" || !installEvent.current) {
      setShowHelp(true);
      return;
    }
    const event = installEvent.current;
    installEvent.current = null;
    try {
      const result = await event.prompt();
      const outcome = result && typeof result === "object"
        ? result.outcome : (await event.userChoice)?.outcome;
      if (outcome === "accepted") {
        setShowHelp(false);
        setMode("installed");
      } else {
        setMode("manual");
        setShowHelp(true);
      }
    } catch {
      setMode("manual");
      setShowHelp(true);
    }
  }

  if (mode === "checking" || mode === "installed") return null;
  return <div className="kiosk-install-wrap">
    <button aria-label="安裝打卡機 App" className="kiosk-install-button" onClick={() => void install()} type="button"><Download size={18} /><span>安裝打卡機</span></button>
    {showHelp ? <aside aria-label="安裝打卡機說明" className="kiosk-install-help">
      <button aria-label="關閉安裝說明" className="kiosk-install-close" onClick={() => setShowHelp(false)} type="button"><X size={18} /></button>
      <strong>將打卡機加入主畫面</strong>
      <p>{mode === "ios" ? "在 Safari 點選「分享」→「加入主畫面」。安裝後從主畫面開啟。" : "從瀏覽器選單選擇「安裝應用程式」或「建立捷徑」，並選擇以視窗開啟。"}</p>
      <small>安裝後會直接開啟打卡機畫面；配對與員工掃碼打卡需要網路連線。</small>
    </aside> : null}
  </div>;
}
