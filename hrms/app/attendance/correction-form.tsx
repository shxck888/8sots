"use client";

import { Plus, Send, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { requestPunchCorrection } from "./actions";

export function CorrectionForm({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function submit(formData: FormData) {
    const localValue = String(formData.get("proposedLocal") ?? "");
    const localDate = new Date(localValue);
    if (!localValue || Number.isNaN(localDate.getTime())) {
      setMessage("請選擇建議打卡時間。");
      return;
    }
    startTransition(async () => {
      const result = await requestPunchCorrection({
        eventType: formData.get("eventType"),
        idempotencyKey: crypto.randomUUID(),
        proposedOccurredAt: localDate.toISOString(),
        reason: formData.get("reason"),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        workDate: formData.get("workDate"),
      });
      setMessage(result.message);
    });
  }

  return (
    <>
      <button className="attendance-correction-trigger" disabled={!enabled} onClick={() => setOpen(true)} type="button">
        <Plus size={18} /> 申請補打卡
      </button>
      {open ? (
        <div className="correction-drawer-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <aside aria-labelledby="correction-drawer-title" aria-modal="true" className="correction-drawer" role="dialog">
            <header>
              <div><span className="eyebrow">PUNCH CORRECTION</span><h2 id="correction-drawer-title">申請補打卡</h2><p>原始打卡不會被修改；核准後以獨立更正事件重新計算。</p></div>
              <button aria-label="關閉補打卡表單" className="correction-drawer-close" onClick={() => setOpen(false)} type="button"><X size={21} /></button>
            </header>
            <form action={submit} className="correction-form">
              <label>工作日<input disabled={!enabled || pending} name="workDate" required type="date" /></label>
              <label>事件<select disabled={!enabled || pending} name="eventType"><option value="clock_in">上班</option><option value="clock_out">下班</option></select></label>
              <label>建議時間<input disabled={!enabled || pending} name="proposedLocal" required type="datetime-local" /></label>
              <label className="correction-reason">原因<textarea disabled={!enabled || pending} maxLength={500} minLength={10} name="reason" placeholder="請具體說明缺卡原因（至少 10 字）" required rows={4} /></label>
              <button className="admin-button" disabled={!enabled || pending} type="submit"><Send size={17} /> {pending ? "送出中…" : "送出申請"}</button>
            </form>
            <p aria-live="polite" className="correction-message">{message}</p>
          </aside>
        </div>
      ) : null}
    </>
  );
}
