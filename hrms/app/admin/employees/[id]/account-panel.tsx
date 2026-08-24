"use client";

import { useActionState } from "react";
import { KeyRound, PauseCircle, PlayCircle, UserRoundPlus } from "lucide-react";
import type { EmployeeAccountState, EmployeeAuthAccount } from "@/lib/employee-accounts";
import {
  provisionEmployeeAccount,
  resetEmployeePassword,
  setEmployeeAccountStatus,
} from "./account-actions";

const initialState: EmployeeAccountState = {};

function Feedback({ state }: { state: EmployeeAccountState }) {
  if (state.message) return <div className="admin-form-error" role="alert">{state.message}</div>;
  if (state.success) return <div className="admin-form-success" role="status">{state.success}</div>;
  return null;
}

export function EmployeeAccountPanel({
  employeeId, account,
}: { employeeId: string; account: EmployeeAuthAccount | null }) {
  const [provisionState, provisionAction, provisioning] = useActionState(
    provisionEmployeeAccount.bind(null, employeeId), initialState,
  );
  const [passwordState, passwordAction, resetting] = useActionState(
    resetEmployeePassword.bind(null, employeeId), initialState,
  );
  const nextStatus = account?.status === "active" ? "suspended" : "active";
  const [statusState, statusAction, changingStatus] = useActionState(
    setEmployeeAccountStatus.bind(null, employeeId, nextStatus), initialState,
  );

  return (
    <section className="admin-panel account-panel">
      <div className="account-panel-header">
        <div><span className="admin-eyebrow">LOGIN ACCOUNT</span><h2>登入帳號</h2></div>
        {account ? <span className={`account-status ${account.status}`}>{account.status === "active" ? "可登入" : "已停用"}</span> : null}
      </div>
      {!account ? (
        <form action={provisionAction} className="account-form">
          <p>為此員工建立獨立登入帳號。帳號建立後不可直接改名；密碼不會被保存或顯示。</p>
          <Feedback state={provisionState} />
          <div className="admin-form-grid">
            <div className="admin-field"><label htmlFor="accountUsername">登入帳號 *</label><input id="accountUsername" name="username" autoComplete="off" minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" required />{provisionState.fieldErrors?.username?.[0] ? <p className="admin-field-error">{provisionState.fieldErrors.username[0]}</p> : null}</div>
            <div className="admin-field"><label htmlFor="accountPassword">初始密碼 *</label><input id="accountPassword" name="password" type="password" autoComplete="new-password" minLength={6} maxLength={64} required />{provisionState.fieldErrors?.password?.[0] ? <p className="admin-field-error">{provisionState.fieldErrors.password[0]}</p> : null}</div>
          </div>
          <button className="admin-button primary" disabled={provisioning} type="submit"><UserRoundPlus size={17} />{provisioning ? "建立中…" : "建立登入帳號"}</button>
        </form>
      ) : (
        <div className="account-management">
          <div className="account-summary"><span>帳號</span><strong>{account.username}</strong><small>建立於 {new Date(account.provisioned_at).toLocaleDateString("zh-TW")}</small></div>
          <form action={passwordAction} className="account-inline-form">
            <Feedback state={passwordState} />
            <div className="admin-field"><label htmlFor="resetPassword">新密碼</label><input id="resetPassword" name="password" type="password" autoComplete="new-password" minLength={6} maxLength={64} required />{passwordState.fieldErrors?.password?.[0] ? <p className="admin-field-error">{passwordState.fieldErrors.password[0]}</p> : null}</div>
            <button className="admin-button secondary" disabled={resetting} type="submit"><KeyRound size={17} />{resetting ? "重設中…" : "重設密碼"}</button>
          </form>
          <form action={statusAction} className="account-status-form">
            <Feedback state={statusState} />
            <button className={`admin-button ${account.status === "active" ? "danger" : "primary"}`} disabled={changingStatus} type="submit">
              {account.status === "active" ? <PauseCircle size={17} /> : <PlayCircle size={17} />}
              {changingStatus ? "處理中…" : account.status === "active" ? "停用登入" : "恢復登入"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
