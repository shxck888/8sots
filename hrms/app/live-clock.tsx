"use client";

import { useEffect, useRef, useState } from "react";
import { estimateServerEpochAtReceipt, formatTaipeiClock } from "@/lib/live-clock";

type ClockSource = "syncing" | "server" | "device";

const digitSegments: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};
const segmentPositions = ["a", "b", "c", "d", "e", "f", "g"];

export function LiveClock({ initialTimestamp }: { initialTimestamp: string }) {
  const [now, setNow] = useState(() => Date.parse(initialTimestamp));
  const [source, setSource] = useState<ClockSource>("syncing");
  const serverAnchor = useRef<{ epochMs: number; monotonicMs: number } | null>(null);

  useEffect(() => {
    let disposed = false;
    let pending: AbortController | null = null;

    function tick() {
      const anchor = serverAnchor.current;
      const current = anchor ? anchor.epochMs + performance.now() - anchor.monotonicMs : Date.now();
      setNow((previous) => Math.floor(previous / 1000) === Math.floor(current / 1000) ? previous : current);
    }

    async function sync() {
      if (pending) return;
      const controller = new AbortController();
      pending = controller;
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      const startedAt = performance.now();
      try {
        const response = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Time sync failed");
        const result = await response.json() as { timestamp?: string };
        const receivedAt = performance.now();
        const estimated = typeof result.timestamp === "string"
          ? estimateServerEpochAtReceipt(result.timestamp, receivedAt - startedAt) : null;
        if (estimated === null) throw new Error("Invalid server time");
        if (disposed) return;
        serverAnchor.current = { epochMs: estimated, monotonicMs: receivedAt };
        setSource("server");
        tick();
      } catch {
        if (!disposed && !serverAnchor.current) setSource("device");
      } finally {
        window.clearTimeout(timeout);
        if (pending === controller) pending = null;
      }
    }

    tick();
    const tickTimer = window.setInterval(tick, 250);
    const syncTimer = window.setInterval(() => void sync(), 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        tick();
        void sync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void sync();
    return () => {
      disposed = true;
      pending?.abort();
      window.clearInterval(tickTimer);
      window.clearInterval(syncTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const time = formatTaipeiClock(now);
  const sourceLabel = source === "server" ? "台北時間 · 已與伺服器同步"
    : source === "device" ? "台北時間 · 暫以裝置時間顯示"
      : "台北時間 · 正在同步伺服器";

  return (
    <>
      <time className="time led-clock" dateTime={new Date(now).toISOString()} role="timer" aria-label={`台北時間 ${time}`} aria-live="off">
        {Array.from(time).map((character, index) => character === ":"
          ? <span className="led-colon" aria-hidden="true" key={index}><span /><span /></span>
          : <span className="led-digit" aria-hidden="true" key={index}>
            {segmentPositions.map((position) => <span className={`led-segment led-${position}${digitSegments[character]?.includes(position) ? " on" : ""}`} key={position} />)}
          </span>)}
      </time>
      <p className="clock-source">{sourceLabel}</p>
    </>
  );
}
