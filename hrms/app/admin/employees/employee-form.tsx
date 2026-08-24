"use client";

import { useActionState } from "react";
import { ImagePlus, Save, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { createEmployee, updateEmployee } from "./actions";
import type { EmployeeFormState, EmployeeMasterRecord } from "@/lib/employees";

const initialState: EmployeeFormState = {};
type SupervisorOption = { id: string; employee_no: string; full_name: string };
const maskNationalId = (last4: string | null) => last4 ? `******${last4}` : "尚未設定";

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? <p className="admin-field-error">{errors[0]}</p> : null;
}

export function EmployeeForm({
  employee,
  supervisors,
}: {
  employee?: EmployeeMasterRecord;
  supervisors: SupervisorOption[];
}) {
  const action = employee ? updateEmployee.bind(null, employee.id) : createEmployee;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="employee-form">
      {state.message ? <div className="admin-form-error" role="alert">{state.message}</div> : null}

      <fieldset className="employee-form-section">
        <legend>基本資料</legend>
        <div className="admin-form-grid">
          <div className="admin-field"><label htmlFor="employeeNo">員工編號 *</label><input id="employeeNo" name="employeeNo" defaultValue={employee?.employee_no} maxLength={32} required /><FieldError errors={state.fieldErrors?.employeeNo} /></div>
          <div className="admin-field"><label htmlFor="fullName">姓名 *</label><input id="fullName" name="fullName" defaultValue={employee?.full_name} maxLength={80} required /><FieldError errors={state.fieldErrors?.fullName} /></div>
          <div className="admin-field"><label htmlFor="englishName">英文姓名</label><input id="englishName" name="englishName" defaultValue={employee?.english_name ?? ""} maxLength={120} /><FieldError errors={state.fieldErrors?.englishName} /></div>
          <div className="admin-field"><label htmlFor="nationalId">身分證／居留證字號 *</label><input id="nationalId" name="nationalId" autoComplete="off" placeholder={employee ? `${maskNationalId(employee.national_id_last4)}（留空表示不變）` : "例如 A123456789"} maxLength={10} required={!employee} /><span className="field-hint"><ShieldCheck size={12} /> 加密保存，畫面僅顯示末四碼</span><FieldError errors={state.fieldErrors?.nationalId} /></div>
          <div className="admin-field"><label htmlFor="birthDate">出生日期 *</label><input id="birthDate" name="birthDate" type="date" defaultValue={employee?.birth_date ?? ""} required /><FieldError errors={state.fieldErrors?.birthDate} /></div>
          <div className="admin-field"><label htmlFor="gender">性別 *</label><select id="gender" name="gender" defaultValue={employee?.gender ?? "undisclosed"} required><option value="male">男性</option><option value="female">女性</option><option value="non_binary">其他</option><option value="undisclosed">不透露</option></select><FieldError errors={state.fieldErrors?.gender} /></div>
          <div className="admin-field admin-field-wide"><label htmlFor="address">地址 *</label><input id="address" name="address" defaultValue={employee?.address ?? ""} maxLength={300} required /><FieldError errors={state.fieldErrors?.address} /></div>
          <div className="admin-field admin-field-wide"><label htmlFor="photo">員工照片</label><label className="photo-upload" htmlFor="photo"><ImagePlus size={20} /><span>{employee?.photo_path ? "更換照片" : "上傳照片"}<small>JPG、PNG 或 WebP，最大 3MB</small></span></label><input className="sr-only" id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></div>
        </div>
      </fieldset>

      <fieldset className="employee-form-section">
        <legend>聯絡資料</legend>
        <div className="admin-form-grid">
          <div className="admin-field"><label htmlFor="mobile">手機 *</label><input id="mobile" name="mobile" type="tel" defaultValue={employee?.mobile ?? ""} maxLength={30} required /><FieldError errors={state.fieldErrors?.mobile} /></div>
          <div className="admin-field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" defaultValue={employee?.email ?? ""} maxLength={254} /><FieldError errors={state.fieldErrors?.email} /></div>
          <div className="admin-field"><label htmlFor="emergencyContactName">緊急聯絡人 *</label><input id="emergencyContactName" name="emergencyContactName" defaultValue={employee?.emergency_contact_name ?? ""} maxLength={80} required /><FieldError errors={state.fieldErrors?.emergencyContactName} /></div>
          <div className="admin-field"><label htmlFor="emergencyContactPhone">緊急聯絡電話 *</label><input id="emergencyContactPhone" name="emergencyContactPhone" type="tel" defaultValue={employee?.emergency_contact_phone ?? ""} maxLength={30} required /><FieldError errors={state.fieldErrors?.emergencyContactPhone} /></div>
        </div>
      </fieldset>

      <fieldset className="employee-form-section">
        <legend>任職資料</legend>
        <div className="admin-form-grid">
          <div className="admin-field"><label htmlFor="departmentName">部門 *</label><input id="departmentName" name="departmentName" defaultValue={employee?.department_name ?? ""} maxLength={80} placeholder="例如 外場部" required /><FieldError errors={state.fieldErrors?.departmentName} /></div>
          <div className="admin-field"><label htmlFor="positionName">職位 *</label><input id="positionName" name="positionName" defaultValue={employee?.position_name ?? ""} maxLength={80} placeholder="例如 外場正職" required /><FieldError errors={state.fieldErrors?.positionName} /></div>
          <div className="admin-field"><label htmlFor="supervisorEmployeeId">直屬主管</label><select id="supervisorEmployeeId" name="supervisorEmployeeId" defaultValue={employee?.supervisor_employee_id ?? ""}><option value="">無</option>{supervisors.filter((item) => item.id !== employee?.id).map((item) => <option key={item.id} value={item.id}>{item.employee_no} · {item.full_name}</option>)}</select><FieldError errors={state.fieldErrors?.supervisorEmployeeId} /></div>
          <div className="admin-field"><label htmlFor="employmentType">任職類型 *</label><select id="employmentType" name="employmentType" defaultValue={employee?.employment_type ?? "full_time"} required><option value="full_time">正職</option><option value="part_time">兼職</option><option value="hourly">時薪</option><option value="contract">約聘</option><option value="temporary">臨時</option></select><FieldError errors={state.fieldErrors?.employmentType} /></div>
          <div className="admin-field"><label htmlFor="hireDate">到職日期 *</label><input id="hireDate" name="hireDate" type="date" defaultValue={employee?.hire_date ?? ""} required /><FieldError errors={state.fieldErrors?.hireDate} /></div>
          <div className="admin-field"><label htmlFor="probationEndDate">試用期結束日</label><input id="probationEndDate" name="probationEndDate" type="date" defaultValue={employee?.probation_end_date ?? ""} /><FieldError errors={state.fieldErrors?.probationEndDate} /></div>
          <div className="admin-field"><label htmlFor="status">任職狀態 *</label><select id="status" name="status" defaultValue={employee?.status ?? "active"} required><option value="active">在職</option><option value="on_leave">留職停薪</option><option value="terminated">離職</option></select><FieldError errors={state.fieldErrors?.status} /></div>
          <div className="admin-field"><label htmlFor="terminationDate">離職日期</label><input id="terminationDate" name="terminationDate" type="date" defaultValue={employee?.termination_date ?? ""} /><FieldError errors={state.fieldErrors?.terminationDate} /></div>
        </div>
      </fieldset>

      <div className="admin-field"><label htmlFor="notes">備註</label><textarea id="notes" name="notes" defaultValue={employee?.notes ?? ""} maxLength={500} rows={4} /><FieldError errors={state.fieldErrors?.notes} /></div>
      <div className="admin-form-actions"><Link className="admin-button secondary" href="/admin/employees">取消</Link><button className="admin-button primary" disabled={pending} type="submit"><Save size={17} /> {pending ? "儲存中…" : "儲存員工"}</button></div>
    </form>
  );
}
