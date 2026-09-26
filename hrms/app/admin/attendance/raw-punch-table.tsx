"use client";
import { punchActionLabels, punchActionSchema } from "@/lib/punch-flow";

import { useState } from "react";
import { MapPin, Trash2 } from "lucide-react";
import { locationVerificationLabels, punchEventLabels, punchSourceLabels } from "@/lib/punch-contract";
import type { PunchRecord } from "@/lib/punches";
import { formatTaipeiDateTime } from "@/lib/schedule-display";

type EmployeeLabel = { full_name: string; employee_no: string };

export function RawPunchTable({ records, employees, canDelete, deleteAction }: {
  records: PunchRecord[];
  employees: Record<string, EmployeeLabel>;
  canDelete: boolean;
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const allSelected = records.length > 0 && selected.length === records.length;
  const toggle = (id: string) => setSelected((current) => current.includes(id)
    ? current.filter((item) => item !== id) : [...current, id]);
  return (
    <form action={deleteAction} className="raw-punch-form" onSubmit={(event) => {
      if (!window.confirm(`確定要刪除所選的 ${selected.length} 筆打卡紀錄？刪除後需重新計算受影響日期。`)) event.preventDefault();
    }}>
      {canDelete ? <div className="raw-punch-toolbar">
        <label className="raw-punch-select-all"><input aria-label="全選目前顯示的打卡紀錄" checked={allSelected} onChange={() => setSelected(allSelected ? [] : records.map((record) => record.id))} type="checkbox" /> 全選目前顯示的 {records.length} 筆</label>
        <span>已選 {selected.length} 筆</span>
        <label className="raw-punch-reason">刪除原因<input maxLength={500} minLength={5} name="reason" onChange={(event) => setReason(event.target.value)} placeholder="請填寫原因（至少 5 字）" required value={reason} /></label>
        <button className="admin-button danger" disabled={!selected.length || reason.trim().length < 5} type="submit"><Trash2 size={15} /> 刪除所選</button>
      </div> : null}
      {selected.map((id) => <input key={id} name="punchIds" type="hidden" value={id} />)}
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{canDelete ? <th>選取</th> : null}<th>伺服器時間</th><th>員工</th><th>事件</th><th>工作日</th><th>來源</th><th>定位證據</th><th>驗證</th></tr></thead><tbody>
        {records.map((record) => { const employee = employees[record.employee_id]; return <tr key={record.id}>{canDelete ? <td><input aria-label={`選取 ${employee?.full_name ?? "員工"} ${formatTaipeiDateTime(record.occurred_at)} ${(punchActionSchema.safeParse(record.punch_action).success ? punchActionLabels[record.punch_action as keyof typeof punchActionLabels] : punchEventLabels[record.event_type])}`} checked={selected.includes(record.id)} onChange={() => toggle(record.id)} type="checkbox" /></td> : null}<td><strong>{formatTaipeiDateTime(record.occurred_at)}</strong></td><td>{employee?.full_name ?? "未知員工"}<br /><code>{employee?.employee_no ?? record.employee_id.slice(0, 8)}</code></td><td><span className={`attendance-event ${record.event_type}`}>{(punchActionSchema.safeParse(record.punch_action).success ? punchActionLabels[record.punch_action as keyof typeof punchActionLabels] : punchEventLabels[record.event_type])}</span></td><td>{record.work_date}</td><td>{punchSourceLabels[record.source]}</td><td>{record.source === "qr" ? "已驗證授權機器" : <><MapPin size={13} /> {Number(record.latitude).toFixed(5)}, {Number(record.longitude).toFixed(5)}<br /><small>誤差約 {Number(record.accuracy_m).toFixed(0)} m{record.location_distance_m != null ? ` · 距門市 ${Number(record.location_distance_m).toFixed(0)} m` : ""}</small></>}</td><td>{record.source === "qr" ? "機器驗證" : locationVerificationLabels[record.location_verification]}</td></tr>; })}
      </tbody></table></div>
    </form>
  );
}
