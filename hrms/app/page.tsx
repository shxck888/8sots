import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coffee,
  LayoutDashboard,
  MapPin,
  QrCode,
  ReceiptText,
  LogOut,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { redirect } from "next/navigation";
import { getUserDisplayName } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

const schedule = [
  { time: "10:30", title: "營業準備", detail: "外場 · A 區", state: "即將開始" },
  { time: "11:00", title: "午餐班", detail: "11:00–15:00", state: "今日班別" },
  { time: "17:00", title: "晚餐班", detail: "17:00–22:00", state: "兩段班" },
];

const nav = [
  { label: "工作台", icon: LayoutDashboard, active: true },
  { label: "我的班表", icon: CalendarDays },
  { label: "出勤紀錄", icon: Clock3 },
  { label: "申請中心", icon: ReceiptText },
];

type MembershipWithTenant = {
  tenants: { name: string } | { name: string }[] | null;
};

export const dynamic = "force-dynamic";

export default async function Home() {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect("/login");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect("/login");
  }

  const { data: membershipRows } = await supabase
    .from("tenant_memberships")
    .select("tenants(name)")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .limit(1);

  const membership = (membershipRows?.[0] ?? null) as MembershipWithTenant | null;
  const tenant = Array.isArray(membership?.tenants) ? membership?.tenants[0] : membership?.tenants;
  const tenantName = tenant?.name ?? "尚未加入組織";
  const displayName = getUserDisplayName(authData.user);
  const avatarText = displayName.slice(0, 1).toUpperCase();
  const todayLabel = new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Taipei",
  }).format(new Date());

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="主要導覽">
        <div className="brand">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <span>餐飲 <strong>eHR</strong></span>
        </div>

        <nav className="side-nav">
          {nav.map(({ label, icon: Icon, active }) => (
            <a className={active ? "nav-item active" : "nav-item"} href="#" key={label}>
              <Icon size={19} />
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <div className="store-card">
          <span className="eyebrow">目前所屬組織</span>
          <strong>{tenantName}</strong>
          <span><MapPin size={14} /> 門市資料尚待建立</span>
        </div>

        <div className="profile-mini">
          <div className="avatar">{avatarText}</div>
          <div><strong>{displayName}</strong><span>{authData.user.email}</span></div>
          <form action={logout}>
            <button className="logout-icon" title="登出" type="submit"><LogOut size={17} /><span className="sr-only">登出</span></button>
          </form>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <span className="date-label">{todayLabel}</span>
            <h1>你好，{displayName}</h1>
          </div>
          <button className="icon-button" aria-label="通知"><Bell size={21} /><i>3</i></button>
        </header>

        <div className="dashboard-grid">
          <section className="clock-card">
            <div className="clock-copy">
              <span className="status-pill"><span /> GPS 定位完成</span>
              <p className="time">10:26</p>
              <p className="shift-note">距離今日班別還有 34 分鐘</p>
              <button className="clock-button"><Clock3 size={22} /> 上班打卡</button>
              <button className="qr-button"><QrCode size={18} /> 改用 QR Code</button>
            </div>
            <div className="location-orbit" aria-hidden="true">
              <div className="orbit outer" />
              <div className="orbit inner" />
              <div className="pin"><MapPin size={25} /></div>
              <span className="location-label">距店鋪 18 公尺</span>
            </div>
          </section>

          <section className="summary-card">
            <div className="section-heading"><div><span className="eyebrow">本月摘要</span><h2>出勤狀況</h2></div><a href="#">查看明細 <ChevronRight size={16} /></a></div>
            <div className="stat-grid">
              <article><span className="stat-icon mint"><Clock3 size={20} /></span><strong>128.5</strong><small>已排工時</small></article>
              <article><span className="stat-icon sand"><Coffee size={20} /></span><strong>2</strong><small>剩餘特休</small></article>
              <article><span className="stat-icon blue"><CheckCircle2 size={20} /></span><strong>100%</strong><small>準時出勤</small></article>
            </div>
          </section>

          <section className="schedule-card">
            <div className="section-heading"><div><span className="eyebrow">TODAY</span><h2>今日班表</h2></div><button className="date-chip"><CalendarDays size={16} /> 8/24</button></div>
            <div className="timeline">
              {schedule.map((item, index) => (
                <article className="timeline-row" key={item.time}>
                  <time>{item.time}</time>
                  <div className={index === 1 ? "timeline-dot current" : "timeline-dot"} />
                  <div className="schedule-detail"><div><strong>{item.title}</strong><span>{item.detail}</span></div><em>{item.state}</em></div>
                </article>
              ))}
            </div>
          </section>

          <section className="team-card">
            <div className="section-heading"><div><span className="eyebrow">STORE</span><h2>店內動態</h2></div><span className="team-count"><UsersRound size={16} /> 8 人上班中</span></div>
            <div className="notice">
              <div className="notice-icon">店</div>
              <div><strong>今日訂位較多</strong><p>晚餐時段預計 82 位，請於 16:45 前完成備餐。</p></div>
              <ChevronRight size={18} />
            </div>
            <div className="avatars" aria-label="今日工作夥伴">
              {["陳", "王", "吳", "張", "李"].map((name, i) => <span style={{ zIndex: 6 - i }} key={name}>{name}</span>)}
              <small>和另外 3 位夥伴</small>
            </div>
          </section>
        </div>

        <nav className="mobile-nav" aria-label="行動版導覽">
          {nav.slice(0, 4).map(({ label, icon: Icon, active }) => <a className={active ? "active" : ""} href="#" key={label}><Icon size={21} /><span>{label}</span></a>)}
        </nav>
      </section>
    </main>
  );
}
