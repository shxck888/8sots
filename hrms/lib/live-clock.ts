const taipeiClockFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Taipei",
});

export function formatTaipeiClock(epochMs: number): string {
  return taipeiClockFormatter.format(new Date(epochMs));
}

export function estimateServerEpochAtReceipt(timestamp: string, roundTripMs: number): number | null {
  const serverEpochMs = Date.parse(timestamp);
  if (!Number.isFinite(serverEpochMs) || !Number.isFinite(roundTripMs) || roundTripMs < 0) return null;
  return serverEpochMs + roundTripMs / 2;
}
