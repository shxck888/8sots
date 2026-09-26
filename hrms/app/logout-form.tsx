"use client";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { logout } from "@/app/login/actions";
export function LogoutForm({ variant = "icon" }: { variant?: "icon" | "menu" | "admin" }) {
  const [pending, setPending] = useState(false);
  return <form action={async formData => {
    setPending(true);
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          formData.set("pushEndpoint", subscription.endpoint);
          await subscription.unsubscribe();
        }
      }
    } catch { /* The server still signs out even if browser push cleanup fails. */ }
    await logout(formData);
  }}><button disabled={pending} aria-label="登出" className={variant === "icon" ? "logout-icon" : variant === "admin" ? "admin-logout" : undefined} title="登出" type="submit">
    <LogOut size={variant === "menu" ? 20 : 17} /><span className={variant === "icon" ? "sr-only" : undefined}>{pending ? "登出中…" : "登出"}</span>
  </button></form>;
}
