"use client";

import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { useActionState } from "react";
import type { EmployeeDeletionEligibility, EmployeeLifecycleState } from "@/lib/employees";
import { archiveEmployee, deleteEmployeePermanently, restoreEmployee } from "./lifecycle-actions";

const initialState: EmployeeLifecycleState = {};

function ErrorMessage({ state }: { state: EmployeeLifecycleState }) {
  return state.message ? <div className="admin-form-error" role="alert">{state.message}</div> : null;
}

export function EmployeeLifecyclePanel({
  employeeId, employeeNo, archivedAt, archiveReason, eligibility,
}: {
  employeeId: string;
  employeeNo: string;
  archivedAt: string | null;
  archiveReason: string | null;
  eligibility: EmployeeDeletionEligibility;
}) {
  const [archiveState, archiveAction, archiving] = useActionState(archiveEmployee.bind(null, employeeId), initialState);
  const [restoreState, restoreAction, restoring] = useActionState(restoreEmployee.bind(null, employeeId), initialState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteEmployeePermanently.bind(null, employeeId), initialState);

  return <section className={`admin-panel employee-lifecycle-panel ${archivedAt ? "archived" : ""}`}>
    <header><div><span className="admin-eyebrow">EMPLOYEE LIFECYCLE</span><h2>{archivedAt ? "已封存員工" : "封存員工資料"}</h2></div></header>
    {!archivedAt ? <form action={archiveAction} onSubmit={(event) => { if (!window.confirm("確定封存此員工並停用登入嗎？")) event.preventDefault(); }}>
      <p>封存會將員工改為離職、停用登入，並從一般員工與排班名單隱藏；歷史紀錄仍會保留。</p>
      <ErrorMessage state={archiveState}/>
      <label>封存原因<input name="reason" minLength={5} maxLength={500} placeholder="例如：員工離職，保留歷史紀錄" required/></label>
      <button className="admin-button danger" disabled={archiving} type="submit"><Archive size={16}/>{archiving ? "封存中…" : "封存員工"}</button>
    </form> : <div className="employee-archive-actions">
      <div className="employee-archive-summary"><strong>封存於 {new Date(archivedAt).toLocaleString("zh-TW")}</strong><span>{archiveReason}</span></div>
      <form action={restoreAction}><ErrorMessage state={restoreState}/><button className="admin-button secondary" disabled={restoring} type="submit"><RotateCcw size={16}/>{restoring ? "恢復中…" : "恢復為在職員工"}</button></form>
      {eligibility.eligible ? <form className="employee-permanent-delete" action={deleteAction} onSubmit={(event) => { if (!window.confirm("這會永久刪除員工主檔且無法復原，確定繼續嗎？")) event.preventDefault(); }}>
        <h3>永久刪除誤建資料</h3><p>這位員工沒有任何必須保留的歷史紀錄。輸入員工編號 <strong>{employeeNo}</strong> 後才可永久刪除。</p>
        <ErrorMessage state={deleteState}/><input name="confirmation" autoComplete="off" placeholder={employeeNo} required/>
        <button className="admin-button danger" disabled={deleting} type="submit"><Trash2 size={16}/>{deleting ? "刪除中…" : "永久刪除"}</button>
      </form> : <div className="employee-delete-blocked"><strong>不可永久刪除</strong><p>此員工已有必須保留的紀錄，只能維持封存。</p>{eligibility.blockers.length ? <span>關聯：{eligibility.blockers.join("、")}</span> : null}</div>}
    </div>}
  </section>;
}
