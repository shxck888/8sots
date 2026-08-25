"use client";

import { CalendarDays, ClipboardCheck, Clock3, LayoutDashboard, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "工作台", icon: LayoutDashboard, exact: true },
  { href: "/admin/employees", label: "員工管理", icon: UsersRound },
  { href: "/admin/schedules", label: "排班管理", icon: CalendarDays },
  { href: "/admin/attendance", label: "打卡紀錄", icon: Clock3 },
  { href: "/admin/requests", label: "申請審核", icon: ClipboardCheck },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="管理後台導覽">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return <Link className={active ? "active" : undefined} href={href} key={href}><Icon size={18} /> {label}</Link>;
      })}
    </nav>
  );
}
