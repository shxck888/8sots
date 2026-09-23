"use client";

import { Camera, Clock3, LoaderCircle, QrCode, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { nextPunchLabel, parseQrPunchValue, punchDisplayLabel, scheduledPunchLabel, type PunchEventType } from "@/lib/punch-contract";
import { recordGpsPunch, recordQrPunch } from "./actions";

function geolocationMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "定位權限被拒絕，請在瀏覽器允許此網站使用定位。";
  if (error.code === error.TIMEOUT) return "取得定位逾時，請確認 GPS 與網路後重試。";
  return "目前無法取得定位，請移至訊號較好的位置再試。";
}

export function PunchPanel({
  enabled,
  lastEventType,
  scheduledPunchCount,
  hasLunchBreak,
}: {
  enabled: boolean;
  lastEventType: PunchEventType | null;
  scheduledPunchCount: number | null;
  hasLunchBreak: boolean;
}) {
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState(enabled ? "" : "此帳號尚未連結在職員工資料。 ");
  const [latestEvent, setLatestEvent] = useState(lastEventType);
  const [punchCount, setPunchCount] = useState(scheduledPunchCount);
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanLockedRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const nextLabel = punchCount === null ? nextPunchLabel(latestEvent) : scheduledPunchLabel(punchCount, hasLunchBreak);

  const showPunchSuccess = useCallback((eventType: PunchEventType, occurredAt: string) => {
    setLatestEvent(eventType);
    if (punchCount !== null) setPunchCount((count) => count === null ? null : count + 1);
    const time = new Intl.DateTimeFormat("zh-TW", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Taipei",
    }).format(new Date(occurredAt));
    const eventLabel = punchCount === null
      ? (eventType === "clock_in" ? "上班" : "下班")
      : punchDisplayLabel(eventType, punchCount, hasLunchBreak);
    setMessage(`${eventLabel}打卡成功，伺服器時間 ${time}。`);
  }, [punchCount, hasLunchBreak]);

  useEffect(() => {
    if (!scannerOpen) return;
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    scanLockedRef.current = false;

    async function startScanner() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera unavailable");
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (stopped || !videoRef.current) return;
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 300 });
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _error, scannerControls) => {
          if (!result || scanLockedRef.current) return;
          const value = parseQrPunchValue(result.getText());
          if (!value) {
            setMessage("這不是有效的門市打卡 QR Code，請掃描機器畫面。 ");
            return;
          }
          scanLockedRef.current = true;
          scannerControls.stop();
          setScannerOpen(false);
          setMessage("已掃描，正在向伺服器確認打卡…");
          startTransition(async () => {
            const response = await recordQrPunch({ ...value, idempotencyKey: crypto.randomUUID() });
            if (!response.ok) {
              setMessage(response.message);
              return;
            }
            showPunchSuccess(response.eventType, response.occurredAt);
          });
        });
        if (stopped) controls.stop();
      } catch {
        if (!stopped) {
          setScannerOpen(false);
          setMessage("無法開啟相機；請允許此網站使用相機，並以 HTTPS 或已安裝的 App 開啟。 ");
        }
      }
    }
    void startScanner();
    return () => { stopped = true; controls?.stop(); };
  }, [scannerOpen, showPunchSuccess]);

  function submitPunch() {
    setMessage("正在取得裝置定位…");
    if (!navigator.geolocation) {
      setMessage("此瀏覽器不支援定位，無法使用 GPS 打卡。");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (position.coords.accuracy > 1000) {
          setMessage("定位誤差超過 1 公里，請移至訊號較好的位置再試。");
          return;
        }
        startTransition(async () => {
          const result = await recordGpsPunch({
            accuracyM: position.coords.accuracy,
            clientOccurredAt: new Date().toISOString(),
            idempotencyKey: crypto.randomUUID(),
            latitude: position.coords.latitude,
            locationConsent: true,
            longitude: position.coords.longitude,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
          if (!result.ok) {
            setMessage(result.message);
            return;
          }
          showPunchSuccess(result.eventType, result.occurredAt);
        });
      },
      (error) => setMessage(geolocationMessage(error)),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
  }

  return (
    <div className="punch-panel">
      <label className="location-consent">
        <input checked={consent} disabled={!enabled || isPending} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
        <span>我同意本次打卡使用裝置定位</span>
      </label>
      <div>
        <button className="clock-button" disabled={!enabled || !consent || isPending || !nextLabel} onClick={submitPunch} type="button">
          {isPending ? <LoaderCircle className="spin" size={22} /> : <Clock3 size={22} />} {isPending ? "正在打卡…" : nextLabel ?? "今日打卡已完成"}
        </button>
        <button className="qr-button" disabled={!enabled || isPending || !nextLabel} onClick={() => {
          setMessage("請將相機對準門市機器上的動態 QR Code。");
          setScannerOpen(true);
        }} type="button"><QrCode size={18} /> 掃描 QR Code 打卡</button>
      </div>
      <p aria-live="polite" className="punch-message">{message || "正式時間以伺服器收到打卡的時間為準。"}</p>
      {scannerOpen ? <div aria-label="掃描打卡 QR Code" aria-modal="true" className="qr-scanner-backdrop" role="dialog">
        <div className="qr-scanner-card">
          <div className="qr-scanner-heading"><div><Camera size={21} /><strong>掃描門市 QR Code</strong></div><button aria-label="關閉相機" onClick={() => setScannerOpen(false)} type="button"><X size={22} /></button></div>
          <video autoPlay className="qr-scanner-video" muted playsInline ref={videoRef} />
          <p>請對準機器畫面；掃描成功後會自動提交打卡。</p>
        </div>
      </div> : null}
    </div>
  );
}
