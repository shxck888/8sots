import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmployeeForm } from "../employee-form";
import { getAdminContext } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewEmployeePage() {
  const admin = await getAdminContext();
  if (!admin) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("employees").select("id, employee_no, full_name")
    .eq("tenant_id", admin.tenantId).eq("status", "active").order("employee_no");
  return (
    <>
      <Link className="admin-back" href="/admin/employees"><ChevronLeft size={16} /> 返回員工列表</Link>
      <header className="admin-page-header compact"><div><span className="admin-eyebrow">NEW EMPLOYEE</span><h1>新增員工</h1><p>建立員工主檔；登入帳號可在後續帳號管理流程連結。</p></div></header>
      <section className="admin-panel form-panel"><EmployeeForm supervisors={data ?? []} /></section>
    </>
  );
}
