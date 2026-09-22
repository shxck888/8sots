"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import type { EmployeeAdminAccess, SupervisorPermissionState } from "@/lib/supervisor-permissions";
import { supervisorPermissionDefinitions } from "@/lib/supervisor-permissions";
import { updateEmployeeAdminPermissions } from "./permission-actions";

const initialState: SupervisorPermissionState = {};

export function EmployeePermissionPanel({ employeeId, access }: { employeeId: string; access: EmployeeAdminAccess }) {
  const [state, action, pending] = useActionState(updateEmployeeAdminPermissions.bind(null, employeeId), initialState);
  const locked = !access.accountLinked || access.isSelf || access.isPlatformAdmin;

  return (
    <section className="admin-panel employee-permission-panel">
      <header className="permission-panel-header">
        <div>
          <span className="admin-eyebrow">BACK OFFICE ACCESS</span>
          <h2>主管後台權限</h2>
          <p>只開放主管實際需要的功能；未勾選的後台頁面不會顯示，也無法直接存取。</p>
        </div>
        <span className="permission-admin-only"><ShieldCheck size={17} /> 僅完整 admin 可設定</span>
      </header>

      {!access.accountLinked ? (
        <div className="permission-panel-notice">請先在上方建立登入帳號，之後才能授予後台權限。</div>
      ) : access.isSelf || access.isPlatformAdmin ? (
        <div className="permission-panel-notice">此帳號擁有完整管理員權限，不能在員工頁面變更或降級。</div>
      ) : null}

      <form action={action} className="permission-form">
        {state.message ? <div className="admin-form-error" role="alert">{state.message}</div> : null}
        {state.success ? <div className="admin-form-success" role="status">{state.success}</div> : null}
        <div className="permission-grid">
          {supervisorPermissionDefinitions.map((permission) => (
            <label className={`permission-option${permission.sensitive ? " sensitive" : ""}`} key={permission.code}>
              <input defaultChecked={access.permissions[permission.key]} disabled={locked} name="permissions" type="checkbox" value={permission.code} />
              <span>
                <strong>{permission.label}{permission.sensitive ? <em>敏感權限</em> : null}</strong>
                <small>{permission.description}</small>
              </span>
            </label>
          ))}
        </div>
        <div className="permission-form-footer">
          <p>{access.accountStatus === "suspended" ? "帳號目前已停用；權限會在恢復登入後生效。" : "儲存後，主管重新整理或再次登入即可使用獲授權的後台功能。"}</p>
          <button className="admin-button primary" disabled={locked || pending} type="submit"><ShieldCheck size={17} /> {pending ? "儲存中…" : "儲存後台權限"}</button>
        </div>
      </form>
    </section>
  );
}
