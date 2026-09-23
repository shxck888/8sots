import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "海之星｜動態 QR 打卡機",
  description: "固定機器專用的海之星動態 QR 打卡畫面。",
  applicationName: "海之星動態 QR 打卡機",
  manifest: "/kiosk/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "海之星打卡機",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#103c33",
  width: "device-width",
  initialScale: 1,
};

export default function KioskLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
