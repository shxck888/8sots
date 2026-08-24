import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { sanitizeNextPath } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
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

  const { next } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-story" aria-label="餐飲 eHR 介紹">
        <div className="login-brand">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <span>餐飲 <strong>eHR</strong></span>
        </div>
        <div className="login-story-copy">
          <span className="login-kicker">RESTAURANT PEOPLE OPERATIONS</span>
          <h1>讓每一個班次，<br />都從安心開始。</h1>
          <p>排班、出勤與人事資訊集中在同一個安全入口，讓餐飲團隊把時間留給真正重要的服務。</p>
        </div>
        <div className="login-trust"><ShieldCheck size={18} /> 以 Supabase Auth 保護帳號與工作資料</div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <span className="login-kicker">WELCOME BACK</span>
          <h2>登入員工工作台</h2>
          <p className="login-intro">使用公司提供的工作帳號登入。</p>
          <LoginForm nextPath={sanitizeNextPath(next)} />
          <p className="login-help">尚未取得帳號或忘記密碼？請聯絡門市主管或 HR。</p>
        </div>
      </section>
    </main>
  );
}
