import type { NodoArbol, PlanArbolConfigAnio, RegistroNodo } from "./types";

/** Lunes local como YYYY-MM-DD */
export function toMondayDateKeyLocal(d: Date): string {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function parseLocalDateKey(key: string): Date {
  const [y, mo, d] = key.split("-").map((s) => parseInt(s, 10));
  return new Date(y, mo - 1, d);
}

/** Todos los lunes del año calendario `year` (fecha local). */
export function mondaysInCalendarYear(year: number): string[] {
  const keys: string[] = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    if (d.getDay() === 1) {
      keys.push(toMondayDateKeyLocal(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return keys;
}

/** Algún día lun-dom de esa semana cae en agosto del año `year`. */
export function weekTouchesAugust(mondayKey: string, year: number): boolean {
  const mon = parseLocalDateKey(mondayKey);
  for (let i = 0; i < 7; i++) {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    if (x.getFullYear() === year && x.getMonth() === 7) return true;
  }
  return false;
}

/** Lunes de la semana ISO que contiene el 25-dic y el lunes siguiente (vacaciones Navidad). */
export function christmasVacationMondays(year: number): string[] {
  const dec25 = new Date(year, 11, 25);
  const m1 = parseLocalDateKey(toMondayDateKeyLocal(dec25));
  const m2 = new Date(m1);
  m2.setDate(m1.getDate() + 7);
  return [toMondayDateKeyLocal(m1), toMondayDateKeyLocal(m2)];
}

/** Agosto completo + dos semanas de Navidad (lunes ISO). */
export function defaultSemanasNoActivas(anio: number): string[] {
  const set = new Set<string>();
  for (const mk of mondaysInCalendarYear(anio)) {
    if (weekTouchesAugust(mk, anio)) set.add(mk);
  }
  for (const mk of christmasVacationMondays(anio)) set.add(mk);
  return [...set].sort();
}

export function ensureConfigAnio(configs: PlanArbolConfigAnio[], anio: number): PlanArbolConfigAnio[] {
  if (configs.some((c) => c.anio === anio)) return configs;
  return [...configs, { anio, semanasNoActivas: defaultSemanasNoActivas(anio) }].sort((a, b) => a.anio - b.anio);
}

export function semanasActivasCount(anio: number, config: PlanArbolConfigAnio | undefined): number {
  const noAct = new Set(config?.semanasNoActivas ?? []);
  return mondaysInCalendarYear(anio).filter((m) => !noAct.has(m)).length;
}

export function metaSemanalPropuesta(metaAnual: number, anio: number, config: PlanArbolConfigAnio | undefined): number {
  const n = semanasActivasCount(anio, config);
  if (n <= 0) return 0;
  return metaAnual / n;
}

/** Cuántas semanas activas (lunes ISO no marcados como descanso) hay en un mes calendario YYYY-MM. */
export function semanasActivasEnMes(mesKey: string, anio: number, config: PlanArbolConfigAnio | undefined): number {
  const noAct = new Set(config?.semanasNoActivas ?? []);
  let n = 0;
  for (const mk of mondaysInCalendarYear(anio)) {
    if (noAct.has(mk)) continue;
    if (mondayEnMes(mk, mesKey)) n += 1;
  }
  return n;
}

/** Semanas activas de un trimestre `YYYY-Qn`. */
export function semanasActivasEnTrimestre(qKey: string, anio: number, config: PlanArbolConfigAnio | undefined): number {
  const meses = mesKeysEnTrimestre(qKey);
  return meses.reduce((acc, mk) => acc + semanasActivasEnMes(mk, anio, config), 0);
}

/** ISO week year + week number for a Monday date key (robusto para límites de año ISO). */
export function isoWeekLabelFromMondayKey(mondayKey: string): string {
  const d = parseLocalDateKey(mondayKey);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const isoYear = date.getUTCFullYear();
  return `S${String(weekNo).padStart(2, "0")} · ${isoYear}`;
}

export function formatWeekRange(mondayKey: string): string {
  const mon = parseLocalDateKey(mondayKey);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

export type VistaPeriodoArbol = "semana" | "mes" | "trimestre" | "anio";

export function cadenciaMatchesVista(cadencia: import("./types").NodoCadencia, vista: VistaPeriodoArbol): boolean {
  return (
    (cadencia === "semanal" && vista === "semana") ||
    (cadencia === "mensual" && vista === "mes") ||
    (cadencia === "trimestral" && vista === "trimestre") ||
    (cadencia === "anual" && vista === "anio")
  );
}

export function mesKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function trimestreKeyFromMesKey(mesKey: string): string {
  const [y, m] = mesKey.split("-").map((s) => parseInt(s, 10));
  const q = Math.floor(((m || 1) - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

export function mesKeysEnTrimestre(qKey: string): string[] {
  const [yRaw, qRaw] = qKey.split("-Q");
  const y = parseInt(yRaw, 10);
  const q = parseInt(qRaw, 10);
  const start = (Number.isFinite(q) ? q : 1) * 3 - 2;
  return [0, 1, 2].map((i) => `${y}-${String(start + i).padStart(2, "0")}`);
}

/** ¿El lunes `mondayKey` pertenece al mes `YYYY-MM`? */
export function mondayEnMes(mondayKey: string, mesKey: string): boolean {
  const d = parseLocalDateKey(mondayKey);
  return mesKeyFromDate(d) === mesKey;
}

/** ¿El mes está en el trimestre? */
export function mesEnTrimestre(mesKey: string, trimestreKey: string): boolean {
  return mesKeysEnTrimestre(trimestreKey).includes(mesKey);
}

/** Agrega registros del nodo al periodo de vista seleccionado (semanas → mes/Q/año). */
export function sumarRegistrosNodoSimple(
  registros: RegistroNodo[],
  nodoId: string,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  year: number,
): number {
  let sum = 0;
  for (const r of registros) {
    if (r.nodoId !== nodoId) continue;
    if (vista === "semana") {
      if (r.periodoTipo === "semana" && r.periodoKey === periodoKey) sum += r.valor;
    } else if (vista === "mes") {
      if (r.periodoTipo === "semana" && mondayEnMes(r.periodoKey, periodoKey)) sum += r.valor;
      else if (r.periodoTipo === "mes" && r.periodoKey === periodoKey) sum += r.valor;
    } else if (vista === "trimestre") {
      if (r.periodoTipo === "semana") {
        const mk = r.periodoKey;
        const mKey = mesKeyFromDate(parseLocalDateKey(mk));
        if (mesEnTrimestre(mKey, periodoKey)) sum += r.valor;
      } else if (r.periodoTipo === "mes" && mesEnTrimestre(r.periodoKey, periodoKey)) sum += r.valor;
      else if (r.periodoTipo === "trimestre" && r.periodoKey === periodoKey) sum += r.valor;
    } else {
      if (r.periodoTipo === "anio" && r.periodoKey === periodoKey) sum += r.valor;
      else if (r.periodoTipo === "trimestre" && r.periodoKey.startsWith(`${year}-`)) sum += r.valor;
      else if (r.periodoTipo === "mes" && r.periodoKey.startsWith(`${year}-`)) sum += r.valor;
      else if (r.periodoTipo === "semana" && r.periodoKey.startsWith(`${year}-`)) sum += r.valor;
    }
  }
  return sum;
}

/** IDs del subárbol (incluye rootId). */
export function collectSubtreeIds(nodos: NodoArbol[], rootId: string): Set<string> {
  const byParent = new Map<string | undefined, NodoArbol[]>();
  for (const n of nodos) {
    const p = n.parentId;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(n);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.add(id);
    for (const ch of byParent.get(id) ?? []) stack.push(ch.id);
  }
  return out;
}

export function wouldCreateCycle(nodos: NodoArbol[], nodeId: string, newParentId: string | undefined): boolean {
  if (newParentId === nodeId) return true;
  if (!newParentId) return false;
  const byId = new Map(nodos.map((n) => [n.id, n]));
  let cur: string | undefined = newParentId;
  const guard = new Set<string>();
  while (cur && !guard.has(cur)) {
    if (cur === nodeId) return true;
    guard.add(cur);
    cur = byId.get(cur)?.parentId;
  }
  return false;
}

export function metaParaVista(
  cadencia: import("./types").NodoCadencia,
  metaValor: number | undefined,
  vista: VistaPeriodoArbol,
): number | undefined {
  if (metaValor === undefined) return undefined;
  if (cadencia === "semanal") {
    if (vista === "semana") return metaValor;
    if (vista === "mes") return metaValor * 4;
    if (vista === "trimestre") return metaValor * 13;
    if (vista === "anio") return metaValor * 52;
  }
  if (cadencia === "mensual") {
    if (vista === "mes") return metaValor;
    if (vista === "trimestre") return metaValor * 3;
    if (vista === "anio") return metaValor * 12;
  }
  if (cadencia === "trimestral") {
    if (vista === "trimestre") return metaValor;
    if (vista === "anio") return metaValor * 4;
  }
  if (cadencia === "anual") {
    if (vista === "anio") return metaValor;
    if (vista === "trimestre") return metaValor / 4;
    if (vista === "mes") return metaValor / 12;
  }
  return metaValor;
}

/**
 * Cuota real para un periodo concreto teniendo en cuenta las semanas activas reales del año.
 * Cuando hay info suficiente (cadencia anual + config + periodoKey), reparte proporcional a las semanas activas
 * del periodo. Si no, vuelve al cálculo simple de `metaParaVista`.
 */
export function metaParaPeriodo(
  cadencia: import("./types").NodoCadencia,
  metaValor: number | undefined,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  anio: number,
  config: PlanArbolConfigAnio | undefined,
): number | undefined {
  if (metaValor === undefined) return undefined;
  const totalSemanas = semanasActivasCount(anio, config);
  if (cadencia === "anual" && totalSemanas > 0) {
    if (vista === "semana") return metaValor / totalSemanas;
    if (vista === "mes") return (metaValor * semanasActivasEnMes(periodoKey, anio, config)) / totalSemanas;
    if (vista === "trimestre")
      return (metaValor * semanasActivasEnTrimestre(periodoKey, anio, config)) / totalSemanas;
    if (vista === "anio") return metaValor;
  }
  if (cadencia === "semanal" && vista === "semana") return metaValor;
  if (cadencia === "semanal" && vista === "mes")
    return metaValor * semanasActivasEnMes(periodoKey, anio, config);
  if (cadencia === "semanal" && vista === "trimestre")
    return metaValor * semanasActivasEnTrimestre(periodoKey, anio, config);
  if (cadencia === "semanal" && vista === "anio") return metaValor * totalSemanas;
  if (cadencia === "mensual") {
    if (vista === "mes") return metaValor;
    if (vista === "trimestre") return metaValor * 3;
    if (vista === "anio") return metaValor * 12;
  }
  if (cadencia === "trimestral") {
    if (vista === "trimestre") return metaValor;
    if (vista === "anio") return metaValor * 4;
  }
  return metaParaVista(cadencia, metaValor, vista);
}
