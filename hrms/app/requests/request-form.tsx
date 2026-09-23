"use client";

import { CalendarPlus, Send, Timer } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { createWorkRequest } from "./actions";
import { leaveRequestUsesSingleDate, nextCalendarDate } from "@/lib/work-request-contract";

type LeaveType = { id: string; name: string; description: string | null };

export function RequestForm({ enabled, leaveTypes, requestType }: {
  enabled: boolean;
  leaveTypes: LeaveType[];
  requestType: "leave" | "overtime";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState("");
  const [leaveScope, setLeaveScope] = useState<"full_day" | "custom">("full_day");
  const [pending, startTransition] = useTransition();
  const isLeave = requestType === "leave";

  function submit(formData: FormData) {
    const leaveDate = String(formData.get("leaveDate") ?? "");
    const fullDay = isLeave && formData.get("leaveScope") === "full_day";
    const followingDate = fullDay ? nextCalendarDate(leaveDate) : null;
    if (fullDay && !followingDate) {
      setMessage("請先選擇有效的請假日期。");
      return;
    }
    const startsLocal = isLeave
      ? `${leaveDate}T${fullDay ? "00:00" : String(formData.get("startsTime") ?? "")}`
      : String(formData.get("startsLocal") ?? "");
    const endsLocal = isLeave
      ? fullDay ? `${followingDate}T00:00` : `${leaveDate}T${String(formData.get("endsTime") ?? "")}`
      : String(formData.get("endsLocal") ?? "");
    if (isLeave && endsLocal <= startsLocal) {
      setMessage("結束時間必須晚於開始時間。");
      return;
    }
    if (isLeave && !leaveRequestUsesSingleDate(startsLocal, endsLocal)) {
      setMessage("每筆請假只能選一個日期；多日請假請分開送出多筆申請。");
      return;
    }
    if (!isLeave) {
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
        startsLocal,
        endsLocal,
        reason: formData.get("reason"),
        idempotencyKey: crypto.randomUUID(),
      });
      setMessage(result.message);
      if (result.ok) {
        formRef.current?.reset();
        if (isLeave) setLeaveScope("full_day");
      }
    });
  }

  const Icon = isLeave ? CalendarPlus : Timer;
  return (
    <article className="work-request-form-card">
      <header><span><Icon size={21} /></span><div><strong>{isLeave ? "請假申請" : "加班申請"}</strong><p>{isLeave ? "選擇請假日期；預設申請整日，亦可改選指定時間。" : "填寫實際預計加班的起訖時間。"}</p></div></header>
      <form action={submit} ref={formRef}>
        {isLeave ? <label>假別<select disabled={!enabled || pending} name="leaveTypeId" required><option value="">請選擇</option>{leaveTypes.map((item) => <option key={item.id} title={item.description ?? undefined} value={item.id}>{item.name}</option>)}</select></label> : null}
        {isLeave ? <>
          <label>請假日期<input disabled={!enabled || pending} name="leaveDate" required type="date" /></label>
          <fieldset className="leave-scope"><legend>請假時段</legend>
            <label><input checked={leaveScope === "full_day"} disabled={!enabled || pending} name="leaveScope" onChange={() => setLeaveScope("full_day")} type="radio" value="full_day" />整日</label>
            <label><input checked={leaveScope === "custom"} disabled={!enabled || pending} name="leaveScope" onChange={() => setLeaveScope("custom")} type="radio" value="custom" />指定時間</label>
          </fieldset>
          {leaveScope === "custom" ? <>
            <label>開始時間<input disabled={!enabled || pending} name="startsTime" required type="time" /></label>
            <label>結束時間<input disabled={!enabled || pending} name="endsTime" required type="time" /></label>
          </> : <p className="leave-scope-note">將以所選日期的整日送審，並按一天的標準工時計算請假額度。</p>}
        </> : <>
          <label>開始時間<input disabled={!enabled || pending} name="startsLocal" required type="datetime-local" /></label>
          <label>結束時間<input disabled={!enabled || pending} name="endsLocal" required type="datetime-local" /></label>
        </>}
        <label className="work-request-reason">原因<textarea disabled={!enabled || pending} maxLength={500} minLength={5} name="reason" placeholder="請簡要說明（至少 5 字）" required rows={3} /></label>
        <button className="admin-button" disabled={!enabled || pending} type="submit"><Send size={16} /> {pending ? "送出中…" : "送出申請"}</button>
      </form>
      {!isLeave ? <p className="work-request-policy-note">單筆最多 8 小時；可跨日，但以起訖時間合計。</p> : null}
      <p aria-live="polite" className="correction-message">{message}</p>
      {isLeave ? <p className="work-request-policy-note">每筆限單一日期；多日請分筆申請。特殊營業日須先有已發布班表。</p> : null}
    </article>
  );
}
