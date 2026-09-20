import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace";
import { changeOwnPassword } from "./actions";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  input: "請確認新密碼符合規則、兩次輸入一致，且與目前密碼不同。",
  current: "目前密碼不正確，請重新輸入。",
  permission: "你沒有使用管理後台的權限。",
  session: "登入狀態已失效，請重新登入後再試。",
  update: "密碼更新失敗，請稍後再試。",
};

export default async function AdminAccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || !workspace.canManage) redirect("/");
  const username = workspace.email.split("@")[0] || "admin";

  return <>
    <header className="admin-page-header"><div><span className="admin-eyebrow">ACCOUNT SECURITY</span><h1>帳號安全</h1><p>變更管理員登入密碼，並撤銷所有裝置上的既有登入工作階段。</p></div></header>
    {params.error ? <div className="admin-form-error schedule-message" role="alert">{errors[params.error] ?? errors.update}</div> : null}
    <section className="admin-panel account-security-panel">
      <header><div><span className="admin-eyebrow">PASSWORD</span><h2><KeyRound size={19}/> 變更密碼</h2><p>目前登入帳號：<strong>{username}</strong></p></div><ShieldCheck aria-hidden="true" size={30}/></header>
      <form action={changeOwnPassword} className="account-security-form">
        <label>目前密碼<input autoComplete="current-password" name="currentPassword" type="password" maxLength={128} required/></label>
        <label>新密碼<input autoComplete="new-password" name="newPassword" type="password" minLength={6} maxLength={64} pattern="(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{6,64}" required/><small>6–64 位英文字母與數字，且兩者都要包含。</small></label>
        <label>再次輸入新密碼<input autoComplete="new-password" name="confirmPassword" type="password" minLength={6} maxLength={64} pattern="(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{6,64}" required/></label>
        <div className="account-security-note"><LogOut size={18}/><p><strong>儲存後會登出所有裝置。</strong><span>請立即使用新密碼重新登入；系統不會儲存或顯示密碼內容。</span></p></div>
        <button className="admin-button primary" type="submit"><KeyRound size={16}/> 變更密碼並登出</button>
      </form>
    </section>
  </>;
}
