"use client";

import { Camera, Clock3, LoaderCircle, QrCode, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { parseQrPunchValue, type PunchActionState } from "@/lib/punch-contract";
import { getPunchFlow, punchActionLabels, type PunchAction, type FlowRecord } from "@/lib/punch-flow";
import { CorrectionForm } from "@/app/attendance/correction-form";
import { PushReminderSettings } from "./push-reminder-settings";
import { useRouter } from "next/navigation";
import { recordGpsPunch, recordQrPunch } from "./actions";

function geolocationMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "定位權限被拒絕，請在瀏覽器允許此網站使用定位。";
  if (error.code === error.TIMEOUT) return "取得定位逾時，請確認 GPS 與網路後重試。";
  return "目前無法取得定位，請移至訊號較好的位置再試。";
}

export function PunchPanel({ enabled, records, initialTimestamp, workDate, hasLunchBreak }: {
  enabled: boolean; records: FlowRecord[]; initialTimestamp: string; workDate: string; hasLunchBreak: boolean;
}) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState(enabled ? "" : "此帳號尚未連結在職員工資料。");
  const [localRecords, setLocalRecords] = useState(records);
  const [now, setNow] = useState(Date.parse(initialTimestamp));
  const anchor = useRef<{ epoch: number; monotonic: number } | null>(null);
  const [selectedAction, setSelectedAction] = useState<PunchAction>("clock_in");
  const [methodOpen, setMethodOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [retryQrPrompt, setRetryQrPrompt] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanLockedRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const flow = getPunchFlow(localRecords, now, hasLunchBreak);
  const dayChanged = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(now) !== workDate;

  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    async function sync() {
      try {
        const response = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json() as { timestamp: string };
        const epoch = Date.parse(data.timestamp);
        if (!stopped && Number.isFinite(epoch)) anchor.current = { epoch, monotonic: performance.now() };
      } catch { /* Keep the last server anchor; timestamps are verified on submit. */ }
    }
    anchor.current = { epoch: Date.parse(initialTimestamp), monotonic: performance.now() };
    const timer = window.setInterval(() => {
      const value = anchor.current;
      if (value) setNow(value.epoch + performance.now() - value.monotonic);
    }, 1000);
    const onFocus = () => { void sync(); router.refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") onFocus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    void sync();
    return () => { stopped = true; controller.abort(); clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); };
  }, [initialTimestamp, router]);

  const showPunchSuccess = useCallback((result: Extract<PunchActionState, { ok: true }>) => {
    setLocalRecords(current => current.some(record => record.id === result.id) ? current : [...current, {
      id: result.id, event_type: result.eventType, occurred_at: result.occurredAt,
      work_date: result.workDate, punch_action: result.action,
    }]);
    anchor.current = { epoch: Date.parse(result.occurredAt), monotonic: performance.now() };
    setNow(Date.parse(result.occurredAt));
    const time = new Intl.DateTimeFormat("zh-TW", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Taipei",
    }).format(new Date(result.occurredAt));
    setMessage(`${punchActionLabels[result.action]}成功，伺服器時間 ${time}。`);
    setMethodOpen(false);
    setOtherOpen(false);
    router.refresh();
  }, [router]);

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
            const response = await recordQrPunch({ ...value, action: selectedAction, idempotencyKey: crypto.randomUUID() });
            if (!response.ok) {
              setMessage(response.message);
              if (response.code === "qr_already_used") setRetryQrPrompt(true);
              return;
            }
            showPunchSuccess(response);
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
  }, [scannerOpen, showPunchSuccess, selectedAction]);

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
            action: selectedAction,
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
          showPunchSuccess(result);
        });
      },
      (error) => setMessage(geolocationMessage(error)),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
  }

  return (
    <div className="punch-panel">
      <div className="punch-flow-status" aria-live="polite">
        <strong>{flow.status}</strong>
        {flow.remainingSeconds > 0 ? <>
          <div className="meal-countdown" aria-label="吃飯剩餘時間">{String(Math.floor(flow.remainingSeconds / 60)).padStart(2, "0")}:{String(flow.remainingSeconds % 60).padStart(2, "0")}</div>
          <small>{flow.remainingSeconds <= 180 ? "剩不到 3 分鐘，請準備返回工作" : "滿 30 分鐘自動結束，不需再打卡"}</small>
        </> : <small>下午預定 16:30–17:00 吃飯 · 21:00 下班</small>}
      </div>
      {dayChanged ? <p className="punch-flow-warning">已跨日，請重新整理取得今天的班表與打卡紀錄。</p> : null}
      {flow.missing.length ? <p className="punch-flow-warning">待確認：{flow.missing.map(action => punchActionLabels[action]).join("、")}。可繼續打卡，再申請補正；未記錄的吃飯不會自動扣工時。</p> : null}
      <button className="clock-button" disabled={!enabled || isPending || !flow.suggested || flow.remainingSeconds > 0 || dayChanged} onClick={() => {
        if (flow.suggested) { setSelectedAction(flow.suggested); setMethodOpen(true); }
      }} type="button">
        {isPending ? <LoaderCircle className="spin" size={22} /> : <Clock3 size={22} />}
        {isPending ? "正在打卡…" : flow.remainingSeconds > 0 ? "吃飯休息中" : flow.suggested ? punchActionLabels[flow.suggested] : "今日已下班"}
      </button>
      <div className="punch-flow-tools">
        <button disabled={!enabled || isPending || dayChanged} onClick={() => setOtherOpen(!otherOpen)} aria-expanded={otherOpen} type="button">其他打卡</button>
        <CorrectionForm enabled={enabled} />
      </div>
      {otherOpen ? <div className="punch-action-options">{(Object.keys(punchActionLabels) as PunchAction[])
        .filter(action => (hasLunchBreak || !["lunch_start", "lunch_end"].includes(action)) && (action !== "meal_end" || flow.remainingSeconds > 0))
        .map(action => <button disabled={isPending || (action !== "meal_end" && flow.done.has(action))} key={action} onClick={() => { setSelectedAction(action); setMethodOpen(true); }} type="button">{punchActionLabels[action]}{flow.done.has(action) && action !== "meal_end" ? " ✓" : ""}</button>)}</div> : null}
      <PushReminderSettings />
      <p aria-live="polite" className="punch-message">{message || "正式時間以伺服器收到打卡的時間為準。"}</p>
      {flow.events.length ? <details className="punch-today-events"><summary>今日紀錄 · {flow.events.length} 筆</summary><ol>{flow.events.map(event => <li key={event.id}>
        <time>{new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit" }).format(new Date(event.occurred_at))}</time>
        <span>{punchActionLabels[event.action]}</span>
        {["meal_morning", "meal_afternoon"].includes(event.action) && now >= Date.parse(event.occurred_at) + 30 * 60_000 ? <small>計時已結束</small> : null}
      </li>)}</ol></details> : null}
      {methodOpen ? createPortal(<div className="qr-scanner-backdrop">
        <div className="qr-scanner-card" role="dialog" aria-modal="true" aria-labelledby="punch-method-title">
          <div className="qr-scanner-heading"><strong id="punch-method-title">{punchActionLabels[selectedAction]}</strong><button aria-label="關閉打卡選擇" disabled={isPending} onClick={() => setMethodOpen(false)} type="button"><X size={22} /></button></div>
          {selectedAction === "meal_end" ? <p>提前結束會依實際休息時間計算，不會扣滿 30 分鐘。</p> : null}
          <button className="qr-button" disabled={isPending} onClick={() => { setMethodOpen(false); setScannerOpen(true); setMessage("請掃描門市機器上的動態 QR Code。"); }} type="button"><QrCode size={18} /> 掃描門市 QR Code</button>
          <details><summary>使用 GPS 定位打卡</summary><label className="location-consent"><input checked={consent} disabled={isPending} onChange={event => setConsent(event.target.checked)} type="checkbox" /><span>我同意本次打卡使用裝置定位</span></label><button className="qr-button" disabled={!consent || isPending} onClick={submitPunch} type="button">GPS 定位打卡</button></details>
          <p aria-live="polite">{message}</p>
        </div>
      </div>, document.body) : null}
      {scannerOpen ? createPortal(<div aria-label="掃描打卡 QR Code" aria-modal="true" className="qr-scanner-backdrop" role="dialog">
        <div className="qr-scanner-card">
          <div className="qr-scanner-heading"><div><Camera size={21} /><strong>掃描門市 QR Code</strong></div><button aria-label="關閉相機" onClick={() => setScannerOpen(false)} type="button"><X size={22} /></button></div>
          <video autoPlay className="qr-scanner-video" muted playsInline ref={videoRef} />
          <p>請對準機器畫面；掃描成功後會自動提交打卡。</p>
        </div>
      </div>, document.body) : null}
      {retryQrPrompt ? createPortal(<div className="qr-scanner-backdrop" role="presentation">
        <div aria-labelledby="qr-retry-title" aria-modal="true" className="qr-scanner-card" role="alertdialog">
          <div className="qr-scanner-heading"><strong id="qr-retry-title">這個 QR Code 已使用</strong></div>
          <p>請等打卡機畫面更新，再掃描新的 QR Code。</p>
          <div className="qr-retry-actions">
            <button onClick={() => setRetryQrPrompt(false)} type="button">稍後再掃</button>
            <button onClick={() => { setRetryQrPrompt(false); setScannerOpen(true); }} type="button">重新開啟相機</button>
          </div>
        </div>
      </div>, document.body) : null}
    </div>
  );
}
