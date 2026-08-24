import { Building2, LayoutDashboard, LogOut, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { logout } from "@/app/login/actions";
import { getAdminContext } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let admin;
  try {
    admin = await getAdminContext();
  } catch {
    redirect("/login?next=/admin/employees");
  }

  if (!admin) redirect("/");

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin/employees">
          <span><Building2 size={20} /></span>
          <div><strong>餐飲 eHR</strong><small>管理後台</small></div>
        </Link>
        <nav className="admin-nav" aria-label="管理後台導覽">
          <Link href="/"><LayoutDashboard size={18} /> 工作台</Link>
          <Link className="active" href="/admin/employees"><UsersRound size={18} /> 員工管理</Link>
        </nav>
        <div className="admin-tenant"><small>目前組織</small><strong>{admin.tenantName}</strong></div>
        <form action={logout}>
          <button className="admin-logout" type="submit"><LogOut size={17} /> 登出</button>
        </form>
      </aside>
      <section className="admin-content">{children}</section>
    </main>
  );
}
