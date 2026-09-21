import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import type { EmployeeDeletionEligibility, EmployeeMasterRecord } from "@/lib/employees";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmployeeForm } from "../employee-form";
import { EmployeeAccountPanel } from "./account-panel";
import { EmployeeLifecyclePanel } from "./employee-lifecycle-panel";

export const dynamic = "force-dynamic";

export default async function EditEmployeePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ archived?: string; restored?: string; authWarning?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
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
  const { data: eligibilityData } = await supabase.rpc("get_employee_deletion_eligibility", {
    p_tenant_id: admin.tenantId, p_employee_id: id,
  });
  const rawEligibility = eligibilityData && typeof eligibilityData === "object" && !Array.isArray(eligibilityData)
    ? eligibilityData as Record<string, unknown> : {};
  const eligibility: EmployeeDeletionEligibility = {
    eligible: rawEligibility.eligible === true,
    archived: rawEligibility.archived === true,
    blockers: Array.isArray(rawEligibility.blockers) ? rawEligibility.blockers.map(String) : [],
  };

  return (
    <>
      <Link className="admin-back" href="/admin/employees"><ChevronLeft size={16} /> 返回員工列表</Link>
      <header className="admin-page-header compact"><div><span className="admin-eyebrow">EDIT EMPLOYEE</span><h1>編輯員工</h1><p>{employee.employee_no} · {employee.full_name}</p></div></header>
      {query.archived ? <div className="admin-success">員工已封存並停用登入。</div> : null}
      {query.restored ? <div className="admin-success">員工已恢復為在職狀態。</div> : null}
      {query.authWarning ? <div className="admin-form-error">員工已封存且站內權限已停用，但 Auth 帳號封鎖未完成；請聯絡系統管理員檢查。</div> : null}
      {!employee.archived_at ? <>
        <section className="admin-panel form-panel"><EmployeeForm employee={employee} supervisors={supervisors ?? []} /></section>
        <EmployeeAccountPanel employeeId={id} account={account} />
      </> : null}
      <EmployeeLifecyclePanel employeeId={id} employeeNo={employee.employee_no}
        archivedAt={employee.archived_at} archiveReason={employee.archive_reason} eligibility={eligibility}/>
    </>
  );
}
