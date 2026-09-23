import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "海之星員工工作台",
    short_name: "海之星",
    description: "海之星員工專用工作台",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1e9",
    theme_color: "#133f37",
    lang: "zh-Hant",
    icons: [
      { src: "/haizhixing-logo-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/haizhixing-logo-icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
