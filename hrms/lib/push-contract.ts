import { z } from "zod";
export function isAllowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443")
      && (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname)
        || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname));
  } catch { return false; }
}
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().min(20).max(2048).refine(isAllowedPushEndpoint),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{40,200}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/) }),
});
