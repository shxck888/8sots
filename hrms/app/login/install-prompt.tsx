"use client";

import { Download, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>;
};
type PromptMode = "checking" | "native" | "ios" | "manual" | "hidden";

export function InstallPrompt() {
  const [mode, setMode] = useState<PromptMode>("checking");
  const installEvent = useRef<InstallEvent | null>(null);

  useEffect(() => {
    const installed = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try { dismissed = window.sessionStorage.getItem("pwa-install-prompt-dismissed") === "1"; } catch { /* Storage may be unavailable. */ }
    if (installed || dismissed) return;

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    let wasInstalled = false;
    const initialModeTimer = window.setTimeout(() => {
      if (!installEvent.current && !wasInstalled) setMode(isIos ? "ios" : "manual");
    }, 0);

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      installEvent.current = event as InstallEvent;
      setMode("native");
    }
    function onInstalled() {
      wasInstalled = true;
      installEvent.current = null;
      setMode("hidden");
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.clearTimeout(initialModeTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try { window.sessionStorage.setItem("pwa-install-prompt-dismissed", "1"); } catch { /* Storage may be unavailable. */ }
    installEvent.current = null;
    setMode("hidden");
  }

  async function install() {
    const event = installEvent.current;
    if (!event) return;
    installEvent.current = null;
    try {
      await event.prompt();
      dismiss();
    } catch {
      setMode("manual");
    }
  }

  if (mode === "checking" || mode === "hidden") return null;

  return (
    <aside aria-label="加入主畫面提示" className="login-install">
      <span aria-hidden="true" className="login-install-icon"><Download size={20} /></span>
      <div className="login-install-copy">
        <strong>將海之星加入主畫面</strong>
        <p>下次可從桌面圖示直接開啟員工工作台。</p>
        {mode === "native" ? <button className="login-install-action" onClick={() => void install()} type="button">立即安裝</button> :
          <small>{mode === "ios" ? "點瀏覽器的「分享」，再選「加入主畫面」。" : "可從瀏覽器選單選擇「安裝應用程式」或「加入主畫面」。"}</small>}
      </div>
      <button aria-label="關閉加入主畫面提示" className="login-install-close" onClick={dismiss} type="button"><X size={17} /></button>
    </aside>
  );
}
