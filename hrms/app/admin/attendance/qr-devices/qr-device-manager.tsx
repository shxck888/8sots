"use client";

import { Monitor, Plus, ShieldX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createQrDevice, renewQrDevicePairing, revokeQrDevice } from "./actions";

type Device = {
  id: string;
  name: string;
  paired_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

export function QrDeviceManager({ devices }: { devices: Device[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createQrDevice(name);
      if (!result.ok) { setMessage(result.message); return; }
      setPairing({ code: result.pairingCode, expiresAt: result.expiresAt });
      setName("");
      setMessage("機器已建立。請在該機器輸入配對碼。");
      router.refresh();
    });
  }

  function revoke(device: Device) {
    if (!window.confirm(`確定停用「${device.name}」？該機器畫面上的 QR Code 會立即失效。`)) return;
    startTransition(async () => {
      const result = await revokeQrDevice(device.id);
      setMessage(result.ok ? `已停用「${device.name}」。` : result.message);
      if (result.ok) router.refresh();
    });
  }

  function renew(device: Device) {
    startTransition(async () => {
      const result = await renewQrDevicePairing(device.id);
      if (!result.ok) { setMessage(result.message); return; }
      setPairing({ code: result.pairingCode, expiresAt: result.expiresAt });
      setMessage(`已重新產生「${device.name}」的配對碼。`);
    });
  }

  return <>
    <form className="qr-device-create" onSubmit={submit}>
      <label>機器名稱<input autoComplete="off" maxLength={80} minLength={2} onChange={(event) => setName(event.target.value)} placeholder="例如：櫃檯打卡螢幕" required value={name} /></label>
      <button className="admin-button" disabled={pending} type="submit"><Plus size={17} /> 新增並產生配對碼</button>
    </form>
    {pairing ? <div className="qr-pairing-result" role="status"><small>一次性配對碼 · 請在固定機器輸入</small><strong>{pairing.code.match(/.{1,4}/g)?.join(" ")}</strong><span>有效至 {formatDateTime(pairing.expiresAt)}。關閉此頁後無法再次查看；若逾時，可重新產生配對碼。</span></div> : null}
    {message ? <p aria-live="polite" className="qr-device-message">{message}</p> : null}
    <div className="qr-device-list"><h2>已授權機器</h2>
      {devices.length === 0 ? <p>尚未新增打卡機器。</p> : devices.map((device) => <article key={device.id}>
        <Monitor size={20} /><div><strong>{device.name}</strong><span>{device.revoked_at ? `已停用 · ${formatDateTime(device.revoked_at)}` : device.paired_at ? `已配對${device.last_seen_at ? ` · 最近連線 ${formatDateTime(device.last_seen_at)}` : ""}` : "等待配對"}</span></div>
        {!device.revoked_at && !device.paired_at ? <button disabled={pending} onClick={() => renew(device)} type="button"><Plus size={16} /> 重新產生配對碼</button> : null}
        {!device.revoked_at ? <button disabled={pending} onClick={() => revoke(device)} type="button"><ShieldX size={16} /> 停用</button> : null}
      </article>)}
    </div>
  </>;
}
