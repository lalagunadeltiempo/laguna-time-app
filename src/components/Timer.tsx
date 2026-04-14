"use client";

import { useState, useEffect } from "react";
import type { PausaEntry } from "@/lib/types";
import { msEfectivos } from "@/lib/duration";

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
    const tick = () => setElapsed(msEfectivos({ inicioTs: startTime, finTs: null, pausas }) ?? 0);
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
