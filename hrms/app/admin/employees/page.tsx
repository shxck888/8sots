import { Plus, Search, UserRoundCheck, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getAdminContext } from "@/lib/admin";
import { employeeStatusLabels, employmentTypeLabels, type EmployeeMasterRecord } from "@/lib/employees";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({ searchParams }: {
  searchParams: Promise<{ q?: string; created?: string; updated?: string; photoError?: string }>;
}) {
  const params = await searchParams;
  const admin = await getAdminContext();
  if (!admin) redirect("/");

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("employee_master_current").select("*")
    .eq("tenant_id", admin.tenantId).order("employee_no");
  const keyword = params.q?.trim();
  if (keyword) query = query.or(`employee_no.ilike.%${keyword}%,full_name.ilike.%${keyword}%,department_name.ilike.%${keyword}%,position_name.ilike.%${keyword}%`);

  const { data, error } = await query;
  const employees = (data ?? []) as EmployeeMasterRecord[];
  const employeesWithPhotos = await Promise.all(employees.map(async (employee) => {
    if (!employee.photo_path) return employee;
    const { data: signed } = await supabase.storage.from("employee-photos").createSignedUrl(employee.photo_path, 600);
    return { ...employee, photo_url: signed?.signedUrl ?? null };
  }));
  const activeCount = employees.filter((employee) => employee.status === "active").length;

  return (
    <>
      <header className="admin-page-header">
        <div><span className="admin-eyebrow">PEOPLE</span><h1>員工管理</h1><p>維護個人、聯絡與任職資料。</p></div>
        <Link className="admin-button primary" href="/admin/employees/new"><Plus size={17} /> 新增員工</Link>
      </header>
      {params.created ? <div className="admin-success">員工已新增。</div> : null}
      {params.updated ? <div className="admin-success">員工資料已更新。</div> : null}
      {params.photoError ? <div className="admin-form-error">員工資料已儲存，但照片上傳失敗，請重新編輯上傳。</div> : null}

      <section className="admin-stats">
        <article><span><UsersRound size={19} /></span><div><small>員工總數</small><strong>{employees.length}</strong></div></article>
        <article><span><UserRoundCheck size={19} /></span><div><small>目前在職</small><strong>{activeCount}</strong></div></article>
      </section>

      <section className="admin-panel">
        <div className="admin-toolbar"><form className="admin-search" action="/admin/employees"><Search size={17} /><input aria-label="搜尋員工" defaultValue={keyword} name="q" placeholder="搜尋編號、姓名、部門或職位" /></form><span>共 {employees.length} 筆</span></div>
        {error ? <div className="admin-empty"><strong>員工資料尚未就緒</strong><p>請確認最新 database migration 已完成。</p></div> : employees.length === 0 ? (
          <div className="admin-empty"><UsersRound size={30} /><strong>尚未建立員工</strong><p>從新增第一位員工開始建立人員主檔。</p><Link className="admin-button primary" href="/admin/employees/new">新增員工</Link></div>
        ) : (
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>員工</th><th>部門／職位</th><th>任職類型</th><th>聯絡方式</th><th>到職日期</th><th>狀態</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>
            {employeesWithPhotos.map((employee) => (
              <tr key={employee.id}>
                <td><div className="employee-cell">{employee.photo_url ? <Image alt="" height={35} src={employee.photo_url} unoptimized width={35} /> : <span>{employee.full_name.slice(0, 1)}</span>}<div><strong>{employee.full_name}</strong><small>{employee.employee_no}{employee.english_name ? ` · ${employee.english_name}` : ""}</small></div></div></td>
                <td><div className="contact-cell"><span>{employee.department_name ?? "未設定部門"}</span><small>{employee.position_name ?? "未設定職位"}</small></div></td>
                <td>{employee.employment_type ? employmentTypeLabels[employee.employment_type] : "—"}</td>
                <td><div className="contact-cell"><span>{employee.mobile ?? "—"}</span><small>{employee.email ?? "未填 Email"}</small></div></td>
                <td>{employee.hire_date ?? "—"}</td>
                <td>{employee.status ? <span className={`employee-status ${employee.status}`}>{employeeStatusLabels[employee.status]}</span> : "—"}</td>
                <td><Link className="table-action" href={`/admin/employees/${employee.id}`}>編輯</Link></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}
