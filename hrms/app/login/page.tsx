import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { sanitizeNextPath } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; passwordChanged?: string; warning?: string }>;
}) {
  let currentUser = null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    currentUser = data.user;
  } catch {
    // The form displays a configuration error if a user attempts to sign in.
  }

  if (currentUser) {
    redirect("/");
  }

  const { next, passwordChanged, warning } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-panel" aria-label="海之星員工登入">
        <div className="login-card">
          <div className="login-card-brand">
            <span className="brand-mark"><Star aria-hidden="true" size={20} /></span>
            <div><strong>海之星</strong><span>員工工作台</span></div>
          </div>
          <h1>員工登入</h1>
          <p className="login-intro">請使用您的員工帳號登入。</p>
          {passwordChanged === "1" ? <p className="login-success" role="status">密碼已變更，請使用新密碼重新登入。{warning ? " 若舊裝置仍保持登入，請聯絡系統管理員檢查稽核紀錄。" : ""}</p> : null}
          <LoginForm nextPath={sanitizeNextPath(next)} />
          <p className="login-help">尚未取得帳號或忘記密碼？請聯絡門市主管或 HR。</p>
        </div>
      </section>
    </main>
  );
}
