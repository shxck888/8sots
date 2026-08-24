import { Plus, Search, UserRoundCheck, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { employeeStatusLabels, type EmployeeRecord } from "@/lib/employees";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; created?: string; updated?: string }>;
}) {
  const params = await searchParams;
  const admin = await getAdminContext();
  if (!admin) redirect("/");

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("employees")
    .select("id, tenant_id, auth_user_id, employee_no, full_name, preferred_name, email, phone, hire_date, status, notes, created_at, updated_at")
    .eq("tenant_id", admin.tenantId)
    .order("employee_no");

  const keyword = params.q?.trim();
  if (keyword) query = query.or(`employee_no.ilike.%${keyword}%,full_name.ilike.%${keyword}%,preferred_name.ilike.%${keyword}%`);

  const { data, error } = await query;
  const employees = (data ?? []) as EmployeeRecord[];
  const activeCount = employees.filter((employee) => employee.status === "active").length;

  return (
    <>
      <header className="admin-page-header">
        <div><span className="admin-eyebrow">PEOPLE</span><h1>員工管理</h1><p>維護員工基本資料與任職狀態。</p></div>
        <Link className="admin-button primary" href="/admin/employees/new"><Plus size={17} /> 新增員工</Link>
      </header>

      {params.created ? <div className="admin-success">員工已新增。</div> : null}
      {params.updated ? <div className="admin-success">員工資料已更新。</div> : null}

      <section className="admin-stats">
        <article><span><UsersRound size={19} /></span><div><small>員工總數</small><strong>{employees.length}</strong></div></article>
        <article><span><UserRoundCheck size={19} /></span><div><small>目前在職</small><strong>{activeCount}</strong></div></article>
      </section>

      <section className="admin-panel">
        <div className="admin-toolbar">
          <form className="admin-search" action="/admin/employees">
            <Search size={17} />
            <input aria-label="搜尋員工" defaultValue={keyword} name="q" placeholder="搜尋編號或姓名" />
          </form>
          <span>共 {employees.length} 筆</span>
        </div>

        {error ? <div className="admin-empty"><strong>員工資料尚未就緒</strong><p>請確認最新 database migration 已完成。</p></div> : employees.length === 0 ? (
          <div className="admin-empty"><UsersRound size={30} /><strong>尚未建立員工</strong><p>從新增第一位員工開始建立人員主檔。</p><Link className="admin-button primary" href="/admin/employees/new">新增員工</Link></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>員工</th><th>員工編號</th><th>聯絡方式</th><th>到職日期</th><th>狀態</th><th><span className="sr-only">操作</span></th></tr></thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td><div className="employee-cell"><span>{(employee.preferred_name ?? employee.full_name).slice(0, 1)}</span><div><strong>{employee.full_name}</strong>{employee.preferred_name ? <small>{employee.preferred_name}</small> : null}</div></div></td>
                    <td><code>{employee.employee_no}</code></td>
                    <td><div className="contact-cell"><span>{employee.phone ?? "—"}</span><small>{employee.email ?? "未填 Email"}</small></div></td>
                    <td>{employee.hire_date}</td>
                    <td><span className={`employee-status ${employee.status}`}>{employeeStatusLabels[employee.status]}</span></td>
                    <td><Link className="table-action" href={`/admin/employees/${employee.id}`}>編輯</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
