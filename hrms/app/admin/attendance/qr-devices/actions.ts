"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createQrDevice(name: string): Promise<
  { ok: true; pairingCode: string; expiresAt: string } | { ok: false; message: string }
> {
  const parsed = z.string().trim().min(2).max(80).safeParse(name);
  if (!parsed.success) return { ok: false, message: "請輸入 2 至 80 字的機器名稱。" };
  const admin = await getAdminContext("attendance.manage");
  if (!admin) return { ok: false, message: "沒有管理打卡機器的權限。" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_punch_qr_device", {
    p_tenant_id: admin.tenantId,
    p_name: parsed.data,
  });
  const device = data?.[0];
  if (error || !device) return { ok: false, message: "建立失敗，請稍後重試。" };
  revalidatePath("/admin/attendance/qr-devices");
  return { ok: true, pairingCode: device.pairing_code, expiresAt: device.pairing_expires_at };
}

export async function revokeQrDevice(deviceId: string): Promise<
  { ok: true } | { ok: false; message: string }
> {
  if (!z.uuid().safeParse(deviceId).success) return { ok: false, message: "機器識別碼不正確。" };
  const admin = await getAdminContext("attendance.manage");
  if (!admin) return { ok: false, message: "沒有管理打卡機器的權限。" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_punch_qr_device", {
    p_tenant_id: admin.tenantId, p_device_id: deviceId,
  });
  if (error) return { ok: false, message: "停用失敗，請重新整理後再試。" };
  revalidatePath("/admin/attendance/qr-devices");
  return { ok: true };
}

export async function renewQrDevicePairing(deviceId: string): Promise<
  { ok: true; pairingCode: string; expiresAt: string } | { ok: false; message: string }
> {
  if (!z.uuid().safeParse(deviceId).success) return { ok: false, message: "機器識別碼不正確。" };
  const admin = await getAdminContext("attendance.manage");
  if (!admin) return { ok: false, message: "沒有管理打卡機器的權限。" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("renew_punch_qr_pairing", {
    p_tenant_id: admin.tenantId, p_device_id: deviceId,
  });
  const pairing = data?.[0];
  if (error || !pairing) return { ok: false, message: "重新產生配對碼失敗，請重新整理後再試。" };
  return { ok: true, pairingCode: pairing.pairing_code, expiresAt: pairing.pairing_expires_at };
}
