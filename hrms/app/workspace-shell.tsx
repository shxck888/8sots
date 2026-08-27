import {
  Banknote, CalendarDays, Clock3, LayoutDashboard, LogOut, MapPin, ReceiptText, Settings, Sparkles,
} from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/login/actions";

const nav = [
  { label: "工作台", icon: LayoutDashboard, href: "/" },
  { label: "我的班表", icon: CalendarDays, href: "/my-schedule" },
  { label: "出勤紀錄", icon: Clock3, href: "/attendance" },
  { label: "申請中心", icon: ReceiptText, href: "/requests" },
  { label: "薪資單", icon: Banknote, href: "/payslips" },
];

export function WorkspaceShell({
  activePath, canManage, children, displayName, email, tenantName,
}: Readonly<{
  activePath: "/" | "/my-schedule" | "/attendance" | "/requests" | "/payslips";
  canManage: boolean;
  children: React.ReactNode;
  displayName: string;
  email: string;
  tenantName: string;
}>) {
  const avatarText = displayName.slice(0, 1).toUpperCase();
  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="主要導覽">
        <div className="brand"><span className="brand-mark"><Sparkles size={20} /></span><span>餐飲 <strong>eHR</strong></span></div>
        <nav className="side-nav">
          {nav.map(({ label, icon: Icon, href }) => (
            <Link className={activePath === href ? "nav-item active" : "nav-item"} href={href} key={label}><Icon size={19} /><span>{label}</span></Link>
          ))}
          {canManage ? <Link className="nav-item" href="/admin/employees"><Settings size={19} /><span>管理後台</span></Link> : null}
        </nav>
        <div className="store-card"><span className="eyebrow">目前所屬組織</span><strong>{tenantName}</strong><span><MapPin size={14} /> 門市資料尚待建立</span></div>
        <div className="profile-mini">
          <div className="avatar">{avatarText}</div><div><strong>{displayName}</strong><span>{email}</span></div>
          <form action={logout}><button aria-label="登出" className="logout-icon" title="登出" type="submit"><LogOut size={17} /><span className="sr-only">登出</span></button></form>
        </div>
      </aside>
      <section className="content">
        {children}
        <nav className="mobile-nav" aria-label="行動版導覽">
          {nav.map(({ label, icon: Icon, href }) => <Link className={activePath === href ? "active" : ""} href={href} key={label}><Icon size={21} /><span>{label}</span></Link>)}
          {canManage ? <Link href="/admin"><Settings size={21} /><span>管理後台</span></Link> : null}
          <form action={logout}><button aria-label="登出" type="submit"><LogOut size={21} /><span>登出</span></button></form>
        </nav>
      </section>
    </main>
  );
}
