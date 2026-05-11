export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fecha calendario local (YYYY-MM-DD) de un instante ISO. No usar `slice(0,10)` sobre el string ISO: en UTC+1/+2 las primeras horas del día local caen en el día anterior en UTC. */
export function localDateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return toDateKey(d);
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatFechaInicio(f: string): string {
  const d = new Date(f + "T12:00:00");
  if (isNaN(d.getTime())) return f;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function daysBetweenKeys(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / (24 * 3600 * 1000));
}

export function addDaysToKey(key: string, n: number): string {
  const d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}
