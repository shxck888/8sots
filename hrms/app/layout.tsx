import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "餐飲 eHR｜今日工作台",
  description: "為台灣餐飲團隊設計的排班、打卡與人資工作台。",
  applicationName: "餐飲 eHR",
};

export const viewport: Viewport = {
  themeColor: "#133f37",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
