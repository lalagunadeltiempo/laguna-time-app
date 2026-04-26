/**
 * Utilidades para unidades de planificación (semanas y meses) en hora local.
 *
 * Formato adoptado (fuente de verdad):
 *  - monday key: "YYYY-MM-DD" — lunes de la semana (hora local).
 *  - mes key: "YYYY-MM" — mes calendario.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseLocalDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Lunes (hora local) de la semana que contiene la fecha dada. */
export function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const dow = d.getDay() || 7; // 1..7, lunes=1
  d.setDate(d.getDate() - dow + 1);
  return d;
}

/** Monday key "YYYY-MM-DD" de la semana que contiene la fecha / clave dada. */
export function mondayKey(dateOrKey: Date | string | null | undefined): string | null {
  if (!dateOrKey) return null;
  const d = typeof dateOrKey === "string" ? parseLocalDateKey(dateOrKey) : new Date(dateOrKey);
  if (!d || Number.isNaN(d.getTime())) return null;
  return toLocalDateKey(mondayOf(d));
}

/** Mes key "YYYY-MM" de la fecha / clave dada. */
export function mesKey(dateOrKey: Date | string | null | undefined): string | null {
  if (!dateOrKey) return null;
  const d = typeof dateOrKey === "string" ? parseLocalDateKey(dateOrKey) : new Date(dateOrKey);
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Mes de una monday key (usa el lunes como referencia). */
export function mesDeSemana(monday: string | null | undefined): string | null {
  return mesKey(monday);
}

const MESES_CORTOS_MAYUS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function etiquetaMesCorta(mes: string | null | undefined, upper = true): string {
  if (!mes) return "";
  const m = /^\d{4}-(\d{2})$/.exec(mes);
  if (!m) return "";
  const idx = Number(m[1]) - 1;
  if (idx < 0 || idx > 11) return "";
  return (upper ? MESES_CORTOS_MAYUS : MESES_CORTOS)[idx];
}

export interface WeekInfo {
  /** 1-based index within the month (S1..S5). */
  idx: number;
  /** "S1", "S2", ... */
  label: string;
  /** Rango legible "20 abr – 26 abr". */
  rangeLabel: string;
  /** monday key "YYYY-MM-DD". */
  monday: string;
  /** ms del lunes 00:00 local. */
  mondayMs: number;
  /** ms del domingo 23:59:59.999 local. */
  sundayMs: number;
}

/**
 * Devuelve todas las semanas (L-D) que contienen algún día del mes dado.
 * Puede devolver 4, 5 o 6 semanas.
 */
export function weeksOfMonth(year: number, month: number): WeekInfo[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const firstMonday = mondayOf(firstDay);

  const weeks: WeekInfo[] = [];
  const cur = new Date(firstMonday);
  let idx = 1;

  while (cur.getTime() <= lastDay.getTime()) {
    const mon = new Date(cur);
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(cur);
    sun.setDate(sun.getDate() + 6);
    sun.setHours(23, 59, 59, 999);

    const monStr = mon.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const sunStr = sun.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

    const mondayStr = toLocalDateKey(mon);
    const isoLabel = etiquetaSemanaIso(mondayStr);
    weeks.push({
      idx,
      label: isoLabel || `S${idx}`,
      rangeLabel: `${monStr} – ${sunStr}`,
      monday: mondayStr,
      mondayMs: mon.getTime(),
      sundayMs: sun.getTime(),
    });

    cur.setDate(cur.getDate() + 7);
    idx++;
  }
  return weeks;
}

/** Genera claves "YYYY-MM" de todos los meses del trimestre (3 meses). */
export function mesesDeTrimestre(trimestre: string): string[] {
  const m = /^(\d{4})-Q([1-4])$/.exec(trimestre);
  if (!m) return [];
  const year = Number(m[1]);
  const q = Number(m[2]);
  const start = (q - 1) * 3;
  return [0, 1, 2].map((i) => `${year}-${pad(start + i + 1)}`);
}

/** Primer lunes que cae DENTRO del mes dado ("YYYY-MM"). Devuelve "YYYY-MM-DD".
 *  A diferencia de `weeksOfMonth(...)[0].monday`, nunca devuelve un lunes del mes anterior:
 *  si el mes empieza un miércoles, devuelve el lunes 6 (no el 30 del mes previo). */
export function primerLunesDeMes(mes: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  const first = new Date(year, month, 1);
  const dow = first.getDay() || 7;
  const offset = dow === 1 ? 0 : 8 - dow;
  const lunes = new Date(year, month, 1 + offset);
  return toLocalDateKey(lunes);
}

/** "2026-04" -> trimestre "2026-Q2". */
export function trimestreDeMes(mes: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const q = Math.floor((month - 1) / 3) + 1;
  return `${year}-Q${q}`;
}

/**
 * ISO 8601 week number (1..53) de una fecha o monday key.
 * Lunes es el primer día de la semana, y la semana 1 es la que contiene el primer jueves del año.
 */
export function isoWeekNumber(dateOrKey: Date | string | null | undefined): number | null {
  if (!dateOrKey) return null;
  const d = typeof dateOrKey === "string" ? parseLocalDateKey(dateOrKey) : new Date(dateOrKey);
  if (!d || Number.isNaN(d.getTime())) return null;
  // Trabajar en UTC para evitar desfases por DST.
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return week;
}

/** Etiqueta corta tipo "S18" a partir de un monday key (o cualquier fecha). */
export function etiquetaSemanaIso(monday: string | null | undefined): string {
  const n = isoWeekNumber(monday);
  return n ? `S${n}` : "";
}

/** Devuelve el rango legible "27 abr – 3 may" de un monday key. */
export function rangoSemanaCorto(monday: string): string {
  const m = parseLocalDateKey(monday);
  if (!m) return monday;
  const d = new Date(m); d.setDate(d.getDate() + 6);
  const lun = m.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const dom = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${lun} – ${dom}`;
}

/**
 * Lista de monday keys (lunes ISO) de todas las semanas que contienen al menos
 * un día dentro del mes "YYYY-MM" dado. Ordenadas ascendentes.
 */
export function semanasDeMes(mes: string): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return [];
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return [];
  const weeks = weeksOfMonth(year, month);
  return weeks.map((w) => w.monday);
}

/** Lista de monday keys de todas las semanas de un conjunto de meses (sin duplicados, ordenadas). */
export function semanasDeMeses(meses: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const m of meses) for (const wk of semanasDeMes(m)) set.add(wk);
  return [...set].sort();
}

/** Mes principal de una semana: el mes que contiene su jueves (regla ISO). */
export function mesPrincipalDeSemana(monday: string): string | null {
  const d = parseLocalDateKey(monday);
  if (!d) return null;
  const j = new Date(d); j.setDate(j.getDate() + 3);
  return `${j.getFullYear()}-${pad(j.getMonth() + 1)}`;
}
