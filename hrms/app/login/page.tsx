import { redirect } from "next/navigation";
import Image from "next/image";
import { sanitizeNextPath } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";
import { InstallPrompt } from "./install-prompt";

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
            <Image alt="海之星" height={64} priority src="/haizhixing-logo-icon.png" width={64} />
          </div>
          {passwordChanged === "1" ? <p className="login-success" role="status">密碼已變更，請使用新密碼重新登入。{warning ? " 若舊裝置仍保持登入，請聯絡系統管理員檢查稽核紀錄。" : ""}</p> : null}
          <LoginForm nextPath={sanitizeNextPath(next)} />
          <InstallPrompt />
        </div>
      </section>
    </main>
  );
}
