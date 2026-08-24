import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { EmployeeForm } from "../employee-form";

export default function NewEmployeePage() {
  return (
    <>
      <Link className="admin-back" href="/admin/employees"><ChevronLeft size={16} /> 返回員工列表</Link>
      <header className="admin-page-header compact"><div><span className="admin-eyebrow">NEW EMPLOYEE</span><h1>新增員工</h1><p>建立員工主檔；登入帳號可在後續帳號管理流程連結。</p></div></header>
      <section className="admin-panel form-panel"><EmployeeForm /></section>
    </>
  );
}
