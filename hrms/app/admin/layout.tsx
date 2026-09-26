import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogoutForm } from "@/app/logout-form";
import { getAdminShellContext } from "@/lib/admin";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let admin;
  try {
    admin = await getAdminShellContext();
  } catch {
    redirect("/login?next=/admin/employees");
  }

  if (!admin) redirect("/");

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin/employees">
          <span><Image alt="" height={38} priority src="/haizhixing-logo-icon.png" width={38} /></span>
          <div><strong>海之星</strong><small>管理後台</small></div>
        </Link>
        <AdminNav permissions={admin.permissions} />
        <div className="admin-tenant"><small>目前組織</small><strong>{admin.tenantName}</strong></div>
        <LogoutForm variant="admin" />
      </aside>
      <section className="admin-content">{children}</section>
    </main>
  );
}
