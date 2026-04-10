export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
