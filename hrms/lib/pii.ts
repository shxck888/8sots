import { createCipheriv, createHmac, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) throw new Error("PII_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PII_ENCRYPTION_KEY must be a 32-byte base64 key");
  return key;
}

export function normalizeNationalId(value: string): string {
  return value.trim().toUpperCase();
}

export function protectNationalId(value: string) {
  const normalized = normalizeNationalId(value);
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":"),
    hash: createHmac("sha256", key).update(normalized).digest("hex"),
    last4: normalized.slice(-4),
  };
}

export function maskNationalId(last4: string | null): string {
  return last4 ? `******${last4}` : "尚未設定";
}
