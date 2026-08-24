import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "餐飲 eHR",
    short_name: "餐飲 eHR",
    description: "台灣餐飲業排班、打卡與人資管理",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1e9",
    theme_color: "#133f37",
    lang: "zh-Hant",
  };
}
