import { LoaderCircle } from "lucide-react";

export function RouteLoading({ admin = false }: { admin?: boolean }) {
  return (
    <section
      aria-live="polite"
      className={admin ? "route-loading admin-route-loading" : "route-loading"}
      role="status"
    >
      <div className="route-loading-card">
        <LoaderCircle aria-hidden="true" className="route-loading-spinner" size={32} />
        <div>
          <strong>正在載入資料</strong>
          <span>請稍候，畫面很快就會更新。</span>
        </div>
      </div>
    </section>
  );
}
