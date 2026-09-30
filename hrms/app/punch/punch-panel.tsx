"use client";

import { Camera, ChevronDown, Clock3, List, LoaderCircle, MapPin, QrCode, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { parseQrPunchValue, type PunchActionState } from "@/lib/punch-contract";
import { getPunchFlow, punchActionLabels, type PunchAction, type FlowRecord } from "@/lib/punch-flow";
import { CorrectionForm } from "@/app/attendance/correction-form";
import { PushReminderSettings } from "./push-reminder-settings";
import { shiftMinuteLabel } from "@/lib/schedules";
import { useRouter } from "next/navigation";
import { recordGpsPunch, recordQrPunch } from "./actions";

function geolocationMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "定位權限被拒絕，請在瀏覽器允許此網站使用定位。";
  if (error.code === error.TIMEOUT) return "取得定位逾時，請確認 GPS 與網路後重試。";
  return "目前無法取得定位，請移至訊號較好的位置再試。";
}

export function PunchPanel({ enabled, records, initialTimestamp, workDate, hasLunchBreak, children, lunchStartMinute = 840, lunchEndMinute = 960 }: {
  enabled: boolean; records: FlowRecord[]; initialTimestamp: string; workDate: string; hasLunchBreak: boolean; children?: ReactNode; lunchStartMinute?: number; lunchEndMinute?: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(enabled ? "" : "此帳號尚未連結在職員工資料。");
  const [localRecords, setLocalRecords] = useState(records);
  const [now, setNow] = useState(Date.parse(initialTimestamp));
  const anchor = useRef<{ epoch: number; monotonic: number } | null>(null);
  const [selectedAction, setSelectedAction] = useState<PunchAction>("clock_in");
  const [methodOpen, setMethodOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [retryQrPrompt, setRetryQrPrompt] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanLockedRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const flow = getPunchFlow(localRecords, now, hasLunchBreak, { lunchStartMinute, lunchEndMinute });
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
      work_date: result.workDate, punch_action: result.action, starts_afternoon_meal: result.startsAfternoonMeal,
    }]);
    anchor.current = { epoch: Date.parse(result.occurredAt), monotonic: performance.now() };
    setNow(Date.parse(result.occurredAt));
    const time = new Intl.DateTimeFormat("zh-TW", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Taipei",
    }).format(new Date(result.occurredAt));
    setMessage(`${punchActionLabels[result.action]}成功，伺服器時間 ${time}。${result.startsAfternoonMeal ? "已自動開始下午吃飯 30 分鐘倒數。" : ""}`);
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
    if (locating || isPending) return;
    setLocating(true);
    setMessage("正在取得裝置定位…");
    if (!navigator.geolocation) {
      setLocating(false);
      setMessage("此瀏覽器不支援定位，無法使用 GPS 打卡。");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
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
      (error) => { setLocating(false); setMessage(geolocationMessage(error)); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
  }

  const nextHints: Record<PunchAction, string> = {
    clock_in: "開始今天的工作，請選擇打卡方式",
    meal_morning: "休息 30 分鐘，結束後自動接續工作",
    lunch_start: `預定 ${shiftMinuteLabel(lunchStartMinute)}–${shiftMinuteLabel(lunchEndMinute)} 午休，返回時打午休結束卡`,
    lunch_end: "午休結束後，自動開始下午吃飯 30 分鐘倒數",
    meal_afternoon: "預定 16:30–17:00・休息 30 分鐘",
    meal_end: "提前結束會依實際休息時間計算",
    clock_out: "離開前完成下班打卡",
  };
  const mealEndLabel = flow.mealEndsAt ? new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(flow.mealEndsAt) : "";

  return (
    <>
    <section className="punch-panel home-punch-card" aria-label="打卡操作">
      <div className="punch-flow-status">
        <span className="home-flow-state"><i />{flow.status}</span>
        {flow.remainingSeconds > 0 ? <>
          <div className="meal-countdown" role="timer" aria-label="吃飯剩餘時間" aria-live="off">{String(Math.floor(flow.remainingSeconds / 60)).padStart(2, "0")}:{String(flow.remainingSeconds % 60).padStart(2, "0")}</div>
          <strong>{flow.remainingSeconds <= 180 ? "剩不到 3 分鐘，準備返回工作" : "好好休息，稍後再回到工作"}</strong>
          <small>{mealEndLabel} 自動結束，不需再次打卡</small>
        </> : <>
          <h2>{flow.suggested ? `下一步：${punchActionLabels[flow.suggested]}` : "今天辛苦了"}</h2>
          <small>{flow.suggested ? nextHints[flow.suggested] : "今日打卡已完成，可在下方查看紀錄"}</small>
        </>}
      </div>
      {dayChanged ? <p className="punch-flow-warning">已跨日，請重新整理取得今天的班表與打卡紀錄。</p> : null}
      {flow.missing.length ? <p className="punch-flow-warning">待確認：{flow.missing.map(action => punchActionLabels[action]).join("、")}。可繼續打卡，再申請補正；未記錄的吃飯不會自動扣工時。</p> : null}
      {flow.remainingSeconds === 0 && flow.suggested ? <button className="clock-button" disabled={!enabled || isPending || dayChanged} onClick={() => {
        if (flow.suggested) { setSelectedAction(flow.suggested); setMessage(""); setMethodOpen(true); }
      }} type="button">
        {isPending ? <LoaderCircle className="spin" size={22} /> : <Clock3 size={22} />}
        {isPending ? "正在打卡…" : punchActionLabels[flow.suggested]}
      </button> : null}
      <div className="punch-flow-tools">
        <button disabled={!enabled || isPending || dayChanged} onClick={() => setOtherOpen(!otherOpen)} aria-expanded={otherOpen} aria-controls="home-punch-options" type="button"><List size={18} />其他打卡</button>
        <CorrectionForm enabled={enabled} compact />
      </div>
      {otherOpen ? <div id="home-punch-options" className="punch-action-options">{(Object.keys(punchActionLabels) as PunchAction[])
        .filter(action => (hasLunchBreak || !["lunch_start", "lunch_end"].includes(action)) && (action !== "meal_end" || flow.remainingSeconds > 0))
        .map(action => <button disabled={isPending || (action !== "meal_end" && flow.done.has(action))} key={action} onClick={() => { setSelectedAction(action); setMessage(""); setMethodOpen(true); }} type="button">{punchActionLabels[action]}{flow.done.has(action) && action !== "meal_end" ? " ✓" : ""}</button>)}</div> : null}
      <PushReminderSettings />
      {flow.remainingSeconds > 0 ? <button className="home-early-end" disabled={!enabled || isPending || dayChanged} onClick={() => { setSelectedAction("meal_end"); setMessage(""); setMethodOpen(true); }} type="button">提前結束休息</button> : null}
      {message ? <p aria-live="polite" className="punch-message">{message}</p> : null}
    </section>
    {children}
    <details className="punch-today-events home-events-card"><summary><span><Clock3 size={18} />今日打卡紀錄 <small>{flow.events.length} 筆</small></span><ChevronDown size={18} /></summary>
      {flow.events.length ? <ol>{flow.events.map(event => <li key={event.id}>
        <time>{new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit" }).format(new Date(event.occurred_at))}</time>
        <span>{punchActionLabels[event.action]}{event.starts_afternoon_meal ? <small className="home-auto-meal-note">自動開始下午吃飯 30 分鐘</small> : null}</span>
      </li>)}</ol> : <p className="home-schedule-note">今天還沒有打卡紀錄</p>}
      <p className="home-schedule-note">正式時間以伺服器收到打卡的時間為準。</p>
    </details>
      {methodOpen ? createPortal(<div className="qr-scanner-backdrop">
        <div className="qr-scanner-card punch-method-card" role="dialog" aria-modal="true" aria-labelledby="punch-method-title">
          <div className="qr-scanner-heading"><strong id="punch-method-title">{punchActionLabels[selectedAction]}</strong><button aria-label="關閉打卡選擇" disabled={isPending || locating} onClick={() => setMethodOpen(false)} type="button"><X size={22} /></button></div>
          {selectedAction === "meal_end" ? <p className="punch-method-hint">提前結束會依實際休息時間計算。</p> : null}
          <div className="punch-gps-option"><div className="punch-gps-heading"><MapPin size={22} /><div><strong>使用 GPS 打卡</strong><span>本次打卡會使用並記錄裝置位置</span></div></div>
            <button className="punch-gps-submit" disabled={isPending || locating} onClick={submitPunch} type="button">{isPending || locating ? <LoaderCircle className="spin" size={20} /> : <MapPin size={20} />}{locating ? "正在取得定位…" : isPending ? "正在打卡…" : `同意使用定位並${punchActionLabels[selectedAction]}`}</button>
          </div>
          <button className="punch-qr-alternative" disabled={isPending || locating} onClick={() => { setMethodOpen(false); setScannerOpen(true); setMessage("請掃描門市機器上的動態 QR Code。"); }} type="button"><QrCode size={18} />改用門市 QR Code 打卡</button>
          {message ? <p className="punch-method-message" aria-live="polite">{message}</p> : null}
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
    </>
  );
}
