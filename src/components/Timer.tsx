"use client";

import { useState, useEffect } from "react";
import type { PausaEntry } from "@/lib/types";

export function Timer({
  startTime,
  pausas = [],
  compact,
}: {
  startTime: string;
  pausas?: PausaEntry[];
  compact?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startTime).getTime();
    function calcElapsed() {
      const now = Date.now();
      let pausedMs = 0;
      for (const p of pausas) {
        const pStart = new Date(p.pauseTs).getTime();
        const pEnd = p.resumeTs ? new Date(p.resumeTs).getTime() : now;
        pausedMs += pEnd - pStart;
      }
      return now - start - pausedMs;
    }
    const tick = () => setElapsed(calcElapsed());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime, pausas]);

  const totalSeconds = Math.floor(elapsed / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <span className={`font-mono font-bold tabular-nums tracking-wider ${compact ? "text-xs text-green-700" : "text-2xl"}`}>
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  );
}
