import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "海之星｜員工工作台",
  description: "海之星員工專用工作台。",
  applicationName: "海之星員工工作台",
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
