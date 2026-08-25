"use client";

import { Clock3, LoaderCircle, QrCode } from "lucide-react";
import { useState, useTransition } from "react";
import { nextPunchLabel, punchEventLabels, type PunchEventType } from "@/lib/punch-contract";
import { recordGpsPunch } from "./actions";

function geolocationMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "定位權限被拒絕，請在瀏覽器允許此網站使用定位。";
  if (error.code === error.TIMEOUT) return "取得定位逾時，請確認 GPS 與網路後重試。";
  return "目前無法取得定位，請移至訊號較好的位置再試。";
}

export function PunchPanel({
  enabled,
  lastEventType,
}: {
  enabled: boolean;
  lastEventType: PunchEventType | null;
}) {
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState(enabled ? "" : "此帳號尚未連結在職員工資料。 ");
  const [latestEvent, setLatestEvent] = useState(lastEventType);
  const [isPending, startTransition] = useTransition();

  function submitPunch() {
    setMessage("正在取得裝置定位…");
    if (!navigator.geolocation) {
      setMessage("此瀏覽器不支援定位，無法使用 GPS 打卡。");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (position.coords.accuracy > 1000) {
          setMessage("定位誤差超過 1 公里，請移至訊號較好的位置再試。");
          return;
        }
        startTransition(async () => {
          const result = await recordGpsPunch({
            accuracyM: position.coords.accuracy,
            clientOccurredAt: new Date().toISOString(),
            idempotencyKey: crypto.randomUUID(),
            latitude: position.coords.latitude,
            locationConsent: true,
            longitude: position.coords.longitude,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
          if (!result.ok) {
            setMessage(result.message);
            return;
          }
          setLatestEvent(result.eventType);
          const time = new Intl.DateTimeFormat("zh-TW", {
            hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Taipei",
          }).format(new Date(result.occurredAt));
          setMessage(`${punchEventLabels[result.eventType]}打卡成功，伺服器時間 ${time}。`);
        });
      },
      (error) => setMessage(geolocationMessage(error)),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
  }

  return (
    <div className="punch-panel">
      <label className="location-consent">
        <input checked={consent} disabled={!enabled || isPending} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
        <span>我同意本次打卡使用裝置定位</span>
      </label>
      <div>
        <button className="clock-button" disabled={!enabled || !consent || isPending} onClick={submitPunch} type="button">
          {isPending ? <LoaderCircle className="spin" size={22} /> : <Clock3 size={22} />} {isPending ? "正在打卡…" : nextPunchLabel(latestEvent)}
        </button>
        <button className="qr-button" disabled type="button"><QrCode size={18} /> QR Code 尚未啟用</button>
      </div>
      <p aria-live="polite" className="punch-message">{message || "正式時間以伺服器收到打卡的時間為準。"}</p>
    </div>
  );
}
