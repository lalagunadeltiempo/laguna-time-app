import type { Paso, PausaEntry } from "./types";

/**
 * Effective milliseconds of active work for a paso, subtracting all pauses.
 * If the paso has no inicioTs, returns null.
 * Uses `finTs` as end time if available, otherwise `Date.now()`.
 */
export function msEfectivos(paso: Pick<Paso, "inicioTs" | "finTs" | "pausas">): number | null {
  if (!paso.inicioTs) return null;
  const start = new Date(paso.inicioTs).getTime();
  const end = paso.finTs ? new Date(paso.finTs).getTime() : Date.now();
  const pausedMs = pausasTotalMs(paso.pausas ?? [], end);
  return Math.max(0, end - start - pausedMs);
}

/**
 * Effective minutes of active work (rounded), or null if no inicioTs.
 * Minimum 1 minute if the paso has both inicioTs and finTs.
 */
export function minutosEfectivos(paso: Pick<Paso, "inicioTs" | "finTs" | "pausas">): number | null {
  const ms = msEfectivos(paso);
  if (ms === null) return null;
  const mins = Math.round(ms / 60000);
  return paso.finTs ? Math.max(1, mins) : mins;
}

/**
 * Human-readable duration string: "5 min", "1h 30m", etc.
 */
export function formatDuracion(paso: Pick<Paso, "inicioTs" | "finTs" | "pausas">): string {
  const ms = msEfectivos(paso);
  if (ms === null) return "—";
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function pausasTotalMs(pausas: PausaEntry[], fallbackEnd: number): number {
  return pausas.reduce((acc, p) => {
    const s = new Date(p.pauseTs).getTime();
    const e = p.resumeTs ? new Date(p.resumeTs).getTime() : fallbackEnd;
    return acc + (e - s);
  }, 0);
}
