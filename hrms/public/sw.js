/* Only notifications are handled here; authenticated HR data is never cached. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* Ignore malformed payloads. */ }
  event.waitUntil(self.registration.showNotification(data.title || "打卡提醒", {
    body: data.body || "請開啟首頁確認打卡狀態。", icon: "/haizhixing-logo-icon-192.png",
    tag: data.tag || "meal-reminder", data: { url: "/" },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const home = windows.find(client => new URL(client.url).origin === self.location.origin && new URL(client.url).pathname === "/");
    if (home) return home.focus();
    return self.clients.openWindow("/");
  })());
});
