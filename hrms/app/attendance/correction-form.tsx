"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";
import { requestPunchCorrection } from "./actions";

export function CorrectionForm({ enabled }: { enabled: boolean }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

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
    <section className="correction-card">
      <div><span className="eyebrow">PUNCH CORRECTION</span><h2>申請補打卡</h2><p>原始打卡不會被修改；核准後以獨立更正事件重新計算。</p></div>
      <form action={submit} className="correction-form">
        <label>工作日<input disabled={!enabled || pending} name="workDate" required type="date" /></label>
        <label>事件<select disabled={!enabled || pending} name="eventType"><option value="clock_in">上班</option><option value="clock_out">下班</option></select></label>
        <label>建議時間<input disabled={!enabled || pending} name="proposedLocal" required type="datetime-local" /></label>
        <label className="correction-reason">原因<textarea disabled={!enabled || pending} maxLength={500} minLength={10} name="reason" placeholder="請具體說明缺卡原因（至少 10 字）" required rows={3} /></label>
        <button className="admin-button" disabled={!enabled || pending} type="submit"><Send size={15} /> {pending ? "送出中…" : "送出申請"}</button>
      </form>
      <p aria-live="polite" className="correction-message">{message}</p>
    </section>
  );
}
