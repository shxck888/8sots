"use client";

import { Banknote, Bell, CalendarDays, CalendarHeart, ClipboardCheck, Clock3, FileClock, KeyRound, LayoutDashboard, Settings, SlidersHorizontal, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type PermissionKey = "employees" | "schedules" | "attendance" | "requests" | "payroll" | "settings" | "audit";
const items: Array<{ href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; permission?: PermissionKey }> = [
  { href: "/", label: "工作台", icon: LayoutDashboard, exact: true },
  { href: "/notifications", label: "通知中心", icon: Bell },
  { href: "/admin/employees", label: "員工管理", icon: UsersRound, permission: "employees" },
  { href: "/admin/schedules", label: "排班管理", icon: CalendarDays, permission: "schedules" },
  { href: "/admin/holidays", label: "假日曆", icon: CalendarHeart, permission: "schedules" },
  { href: "/admin/attendance", label: "打卡紀錄", icon: Clock3, permission: "attendance" },
  { href: "/admin/attendance-rules", label: "出勤規則", icon: SlidersHorizontal, permission: "attendance" },
  { href: "/admin/requests", label: "申請審核", icon: ClipboardCheck, permission: "requests" },
  { href: "/admin/payroll", label: "薪資管理", icon: Banknote, permission: "payroll" },
  { href: "/admin/settings", label: "系統設定", icon: Settings, permission: "settings" },
  { href: "/admin/audit", label: "稽核紀錄", icon: FileClock, permission: "audit" },
  { href: "/admin/account", label: "帳號安全", icon: KeyRound },
];

export function AdminNav({ permissions }: { permissions: Record<PermissionKey, boolean> }) {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="管理後台導覽">
      {items.filter((item) => !item.permission || permissions[item.permission]).map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return <Link className={active ? "active" : undefined} href={href} key={href}><Icon size={18} /> {label}</Link>;
      })}
    </nav>
  );
}
