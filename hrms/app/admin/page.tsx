import { redirect } from "next/navigation";
import { getAdminShellContext } from "@/lib/admin";

export default async function AdminPage() {
  const admin = await getAdminShellContext();
  if (!admin) redirect("/");
  const destinations: Array<[keyof typeof admin.permissions, string]> = [
    ["employees", "/admin/employees"], ["schedules", "/admin/schedules"],
    ["attendance", "/admin/attendance"], ["requests", "/admin/requests"],
    ["payroll", "/admin/payroll"], ["settings", "/admin/settings"],
    ["audit", "/admin/audit"],
  ];
  redirect(destinations.find(([permission]) => admin.permissions[permission])?.[1] ?? "/");
}
