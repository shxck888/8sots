import type { MetadataRoute } from "next";

const manifest: MetadataRoute.Manifest = {
  id: "/kiosk",
  name: "海之星動態 QR 打卡機",
  short_name: "海之星打卡機",
  description: "固定機器顯示海之星員工打卡用的動態 QR Code。",
  start_url: "/kiosk",
  scope: "/kiosk",
  display: "standalone",
  background_color: "#103c33",
  theme_color: "#103c33",
  lang: "zh-Hant",
  icons: [
    { src: "/haizhixing-logo-icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/haizhixing-logo-icon.png", sizes: "512x512", type: "image/png" },
  ],
};

export function GET() {
  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
