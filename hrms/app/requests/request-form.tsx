"use client";

import { CalendarPlus, Send, Timer } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { createWorkRequest } from "./actions";

type LeaveType = { id: string; name: string; description: string | null };

export function RequestForm({ enabled, leaveTypes, requestType }: {
  enabled: boolean;
  leaveTypes: LeaveType[];
  requestType: "leave" | "overtime";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const isLeave = requestType === "leave";

  function submit(formData: FormData) {
    if (!isLeave) {
      const startsLocal = String(formData.get("startsLocal") ?? "");
      const endsLocal = String(formData.get("endsLocal") ?? "");
      const requestedMinutes = (Date.parse(endsLocal) - Date.parse(startsLocal)) / 60_000;
      if (requestedMinutes > 480) {
        setMessage("單筆加班最多 8 小時；跨日可以，但總時數不得超過 8 小時。");
        return;
      }
    }
    startTransition(async () => {
      const result = await createWorkRequest({
        requestType,
        leaveTypeId: isLeave ? formData.get("leaveTypeId") : null,
        startsLocal: formData.get("startsLocal"),
        endsLocal: formData.get("endsLocal"),
        reason: formData.get("reason"),
        idempotencyKey: crypto.randomUUID(),
      });
      setMessage(result.message);
      if (result.ok) formRef.current?.reset();
    });
  }

  const Icon = isLeave ? CalendarPlus : Timer;
  return (
    <article className="work-request-form-card">
      <header><span><Icon size={21} /></span><div><strong>{isLeave ? "請假申請" : "加班申請"}</strong><p>{isLeave ? "選擇假別與請假起訖時間。" : "填寫實際預計加班的起訖時間。"}</p></div></header>
      <form action={submit} ref={formRef}>
        {isLeave ? <label>假別<select disabled={!enabled || pending} name="leaveTypeId" required><option value="">請選擇</option>{leaveTypes.map((item) => <option key={item.id} title={item.description ?? undefined} value={item.id}>{item.name}</option>)}</select></label> : null}
        <label>開始時間<input disabled={!enabled || pending} name="startsLocal" required type="datetime-local" /></label>
        <label>結束時間<input disabled={!enabled || pending} name="endsLocal" required type="datetime-local" /></label>
        <label className="work-request-reason">原因<textarea disabled={!enabled || pending} maxLength={500} minLength={5} name="reason" placeholder="請簡要說明（至少 5 字）" required rows={3} /></label>
        <button className="admin-button" disabled={!enabled || pending} type="submit"><Send size={16} /> {pending ? "送出中…" : "送出申請"}</button>
      </form>
      {!isLeave ? <p className="work-request-policy-note">單筆最多 8 小時；可跨日，但以起訖時間合計。</p> : null}
      <p aria-live="polite" className="correction-message">{message}</p>
    </article>
  );
}
