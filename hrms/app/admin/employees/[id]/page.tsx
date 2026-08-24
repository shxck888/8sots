import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import type { EmployeeMasterRecord } from "@/lib/employees";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmployeeForm } from "../employee-form";
import { EmployeeAccountPanel } from "./account-panel";

export const dynamic = "force-dynamic";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getAdminContext();
  if (!admin) redirect("/");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("employee_master_current")
    .select("*")
    .eq("tenant_id", admin.tenantId)
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const employee = data as EmployeeMasterRecord;
  const { data: supervisors } = await supabase.from("employees").select("id, employee_no, full_name")
    .eq("tenant_id", admin.tenantId).eq("status", "active").order("employee_no");
  const { data: account } = await supabase.from("employee_auth_accounts").select("*")
    .eq("tenant_id", admin.tenantId).eq("employee_id", id).maybeSingle();

  return (
    <>
      <Link className="admin-back" href="/admin/employees"><ChevronLeft size={16} /> 返回員工列表</Link>
      <header className="admin-page-header compact"><div><span className="admin-eyebrow">EDIT EMPLOYEE</span><h1>編輯員工</h1><p>{employee.employee_no} · {employee.full_name}</p></div></header>
      <section className="admin-panel form-panel"><EmployeeForm employee={employee} supervisors={supervisors ?? []} /></section>
      <EmployeeAccountPanel employeeId={id} account={account} />
    </>
  );
}
