"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import Link from "next/link";
import { createEmployee, updateEmployee } from "./actions";
import type { EmployeeFormState, EmployeeRecord } from "@/lib/employees";

const initialState: EmployeeFormState = {};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="admin-field-error">{errors[0]}</p>;
}

export function EmployeeForm({ employee }: { employee?: EmployeeRecord }) {
  const action = employee ? updateEmployee.bind(null, employee.id) : createEmployee;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="employee-form">
      {state.message ? <div className="admin-form-error" role="alert">{state.message}</div> : null}

      <div className="admin-form-grid">
        <div className="admin-field">
          <label htmlFor="employeeNo">員工編號 *</label>
          <input id="employeeNo" name="employeeNo" defaultValue={employee?.employee_no} maxLength={32} required />
          <FieldError errors={state.fieldErrors?.employeeNo} />
        </div>
        <div className="admin-field">
          <label htmlFor="fullName">姓名 *</label>
          <input id="fullName" name="fullName" defaultValue={employee?.full_name} maxLength={80} required />
          <FieldError errors={state.fieldErrors?.fullName} />
        </div>
        <div className="admin-field">
          <label htmlFor="preferredName">顯示名稱</label>
          <input id="preferredName" name="preferredName" defaultValue={employee?.preferred_name ?? ""} maxLength={80} />
          <FieldError errors={state.fieldErrors?.preferredName} />
        </div>
        <div className="admin-field">
          <label htmlFor="hireDate">到職日期 *</label>
          <input id="hireDate" name="hireDate" type="date" defaultValue={employee?.hire_date} required />
          <FieldError errors={state.fieldErrors?.hireDate} />
        </div>
        <div className="admin-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" defaultValue={employee?.email ?? ""} maxLength={254} />
          <FieldError errors={state.fieldErrors?.email} />
        </div>
        <div className="admin-field">
          <label htmlFor="phone">電話</label>
          <input id="phone" name="phone" type="tel" defaultValue={employee?.phone ?? ""} maxLength={30} />
          <FieldError errors={state.fieldErrors?.phone} />
        </div>
        <div className="admin-field">
          <label htmlFor="status">任職狀態 *</label>
          <select id="status" name="status" defaultValue={employee?.status ?? "active"} required>
            <option value="active">在職</option>
            <option value="on_leave">留職停薪</option>
            <option value="terminated">離職</option>
          </select>
          <FieldError errors={state.fieldErrors?.status} />
        </div>
      </div>

      <div className="admin-field">
        <label htmlFor="notes">備註</label>
        <textarea id="notes" name="notes" defaultValue={employee?.notes ?? ""} maxLength={500} rows={4} />
        <FieldError errors={state.fieldErrors?.notes} />
      </div>

      <div className="admin-form-actions">
        <Link className="admin-button secondary" href="/admin/employees">取消</Link>
        <button className="admin-button primary" disabled={pending} type="submit">
          <Save size={17} /> {pending ? "儲存中…" : "儲存員工"}
        </button>
      </div>
    </form>
  );
}
