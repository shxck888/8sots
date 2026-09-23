export const QR_SLOT_MS = 30_000;

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createKioskQrValue(deviceId: string, credential: string, slot: number): Promise<string> {
  if (!crypto.subtle || !Number.isSafeInteger(slot) || slot < 0) {
    throw new Error("Secure QR generation is unavailable");
  }
  const credentialHash = await crypto.subtle.digest("SHA-256", encoder.encode(credential));
  const key = await crypto.subtle.importKey(
    "raw", credentialHash, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${deviceId}:${slot}`));
  return `8SOTS-PUNCH:2:${deviceId}:${slot}:${hex(signature)}`;
}
