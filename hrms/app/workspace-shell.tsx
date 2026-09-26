import {
  Banknote, Bell, CalendarDays, Clock3, LayoutDashboard, MapPin, Menu, ReceiptText, Settings,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LogoutForm } from "@/app/logout-form";

const nav = [
  { label: "工作台", mobileLabel: "首頁", icon: LayoutDashboard, href: "/" },
  { label: "我的班表", mobileLabel: "班表", icon: CalendarDays, href: "/my-schedule" },
  { label: "出勤紀錄", mobileLabel: "出勤", icon: Clock3, href: "/attendance" },
  { label: "申請中心", mobileLabel: "申請", icon: ReceiptText, href: "/requests" },
  { label: "薪資單", icon: Banknote, href: "/payslips" },
  { label: "通知", icon: Bell, href: "/notifications" },
];

const primaryMobileNav = nav.slice(0, 4);
const secondaryMobileNav = nav.slice(4);

export function WorkspaceShell({
  activePath, canManage, children, displayName, email, tenantName, notificationUnreadCount = 0,
}: Readonly<{
  activePath: "/" | "/my-schedule" | "/attendance" | "/requests" | "/payslips" | "/notifications";
  canManage: boolean;
  children: React.ReactNode;
  displayName: string;
  email: string;
  tenantName: string;
  notificationUnreadCount?: number;
}>) {
  const avatarText = displayName.slice(0, 1).toUpperCase();
  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="主要導覽">
        <div className="brand"><span className="brand-mark"><Image alt="" height={34} priority src="/haizhixing-logo-icon.png" width={34} /></span><span><strong>海之星</strong></span></div>
        <nav className="side-nav">
          {nav.map(({ label, icon: Icon, href }) => (
            <Link className={activePath === href ? "nav-item active" : "nav-item"} href={href} key={label}><Icon size={19} /><span>{label}</span>{href === "/notifications" && notificationUnreadCount > 0 ? <i className="nav-badge">{Math.min(notificationUnreadCount, 99)}</i> : null}</Link>
          ))}
          {canManage ? <Link className="nav-item" href="/admin/employees"><Settings size={19} /><span>管理後台</span></Link> : null}
        </nav>
        <div className="store-card"><span className="eyebrow">目前所屬組織</span><strong>{tenantName}</strong><span><MapPin size={14} /> 門市資料尚待建立</span></div>
        <div className="profile-mini">
          <div className="avatar">{avatarText}</div><div><strong>{displayName}</strong><span>{email}</span></div>
          <LogoutForm />
        </div>
      </aside>
      <section className="content">
        {children}
        <nav className="mobile-nav" aria-label="行動版導覽">
          {primaryMobileNav.map(({ label, mobileLabel, icon: Icon, href }) => <Link aria-current={activePath === href ? "page" : undefined} aria-label={label} className={activePath === href ? "active" : ""} href={href} key={label}><Icon size={22} /><span>{mobileLabel}</span></Link>)}
          <details className="mobile-more">
            <summary className={secondaryMobileNav.some(({ href }) => href === activePath) ? "active" : ""}><Menu size={22} /><span>更多</span>{notificationUnreadCount > 0 ? <i className="nav-badge">{Math.min(notificationUnreadCount, 99)}</i> : null}</summary>
            <div className="mobile-more-menu">
              {secondaryMobileNav.map(({ label, icon: Icon, href }) => <Link aria-current={activePath === href ? "page" : undefined} className={activePath === href ? "active" : ""} href={href} key={label}><Icon size={20} /><span>{label}</span>{href === "/notifications" && notificationUnreadCount > 0 ? <i className="nav-badge">{Math.min(notificationUnreadCount, 99)}</i> : null}</Link>)}
              {canManage ? <Link href="/admin"><Settings size={20} /><span>管理後台</span></Link> : null}
              <LogoutForm variant="menu" />
            </div>
          </details>
        </nav>
      </section>
    </main>
  );
}
