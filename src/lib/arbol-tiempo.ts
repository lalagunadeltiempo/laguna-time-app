import type { NodoArbol, PlanArbolConfigAnio, RegistroNodo } from "./types";
import { esDiaLaborable, fechaKeyDesdeDate } from "./festivos-es";

/** Hijos directos que suman al padre (ramas y flores). */
export function hijosSumaDirectos(nodos: NodoArbol[], parentId: string, anio: number): NodoArbol[] {
  return nodos
    .filter((n) => n.anio === anio && n.parentId === parentId && n.relacionConPadre === "suma")
    .sort((a, b) => a.orden - b.orden);
}

export function tieneHijosSuma(nodos: NodoArbol[], nodoId: string, anio: number): boolean {
  return hijosSumaDirectos(nodos, nodoId, anio).length > 0;
}

/** Meta anual efectiva: si hay hijos que suman, suma sus metas efectivas; si no, la meta del propio nodo. */
export function metaEfectivaNodo(nodo: NodoArbol, nodos: NodoArbol[], anio: number): number | undefined {
  const hijos = hijosSumaDirectos(nodos, nodo.id, anio);
  if (hijos.length > 0) {
    let sum = 0;
    let any = false;
    for (const h of hijos) {
      const m = metaEfectivaNodo(h, nodos, anio);
      if (m !== undefined && Number.isFinite(m)) {
        sum += m;
        any = true;
      }
    }
    return any ? sum : undefined;
  }
  return nodo.metaValor;
}

/** Plan del periodo agregando hijos que suman (o el plan del nodo hoja). */
export function planAgregadoEnPeriodo(
  nodo: NodoArbol,
  nodos: NodoArbol[],
  vista: VistaPeriodoArbol,
  periodoKey: string,
  anio: number,
  config: PlanArbolConfigAnio | undefined,
): number | undefined {
  const hijos = hijosSumaDirectos(nodos, nodo.id, anio);
  if (hijos.length === 0) {
    const meta = metaEfectivaNodo(nodo, nodos, anio);
    return metaParaPeriodo(nodo.cadencia, meta, vista, periodoKey, anio, config);
  }
  let sum = 0;
  let any = false;
  for (const h of hijos) {
    const p = planAgregadoEnPeriodo(h, nodos, vista, periodoKey, anio, config);
    if (p !== undefined && Number.isFinite(p)) {
      sum += p;
      any = true;
    }
  }
  return any ? sum : undefined;
}

/** Real del periodo: suma recursiva por hijos que suman si existen. */
export function realEfectivoEnPeriodo(
  registros: RegistroNodo[],
  nodos: NodoArbol[],
  nodoId: string,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  year: number,
): number {
  const nodo = nodos.find((n) => n.id === nodoId);
  if (!nodo || nodo.anio !== year) {
    return sumarRegistrosNodoSimple(registros, nodoId, vista, periodoKey, year);
  }
  if (!tieneHijosSuma(nodos, nodoId, year)) {
    return sumarRegistrosNodoSimple(registros, nodoId, vista, periodoKey, year);
  }
  const hijos = hijosSumaDirectos(nodos, nodoId, year);
  return hijos.reduce((acc, h) => acc + realEfectivoEnPeriodo(registros, nodos, h.id, vista, periodoKey, year), 0);
}

/** Referencia año pasado agregada por hijos que suman. */
export function realAnioPasadoAgregado(
  registros: RegistroNodo[],
  nodos: NodoArbol[],
  nodoId: string,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  year: number,
): number {
  const nodo = nodos.find((n) => n.id === nodoId);
  if (!nodo || nodo.anio !== year) {
    return sumarRegistrosNodoAnioAnterior(registros, nodoId, vista, periodoKey, year);
  }
  if (!tieneHijosSuma(nodos, nodoId, year)) {
    return sumarRegistrosNodoAnioAnterior(registros, nodoId, vista, periodoKey, year);
  }
  const hijos = hijosSumaDirectos(nodos, nodoId, year);
  return hijos.reduce((acc, h) => acc + realAnioPasadoAgregado(registros, nodos, h.id, vista, periodoKey, year), 0);
}

/** Índices precalculados para evitar barridos lineales sobre todos los registros/nodos en la UI. */
export type ArbolIndices = {
  regsPorNodo: Map<string, RegistroNodo[]>;
  nodosPorParent: Map<string, NodoArbol[]>;
  nodosById: Map<string, NodoArbol>;
  year: number;
};

export function buildArbolIndices(registros: RegistroNodo[], nodos: NodoArbol[], year: number): ArbolIndices {
  const regsPorNodo = new Map<string, RegistroNodo[]>();
  for (const r of registros) {
    const list = regsPorNodo.get(r.nodoId);
    if (list) list.push(r);
    else regsPorNodo.set(r.nodoId, [r]);
  }
  const nodosPorParent = new Map<string, NodoArbol[]>();
  const nodosById = new Map<string, NodoArbol>();
  for (const n of nodos) {
    if (n.anio !== year) continue;
    nodosById.set(n.id, n);
    const pid = n.parentId ?? "";
    const list = nodosPorParent.get(pid);
    if (list) list.push(n);
    else nodosPorParent.set(pid, [n]);
  }
  for (const list of nodosPorParent.values()) {
    list.sort((a, b) => a.orden - b.orden);
  }
  return { regsPorNodo, nodosPorParent, nodosById, year };
}

/** Suma registros ya filtrados por nodo (misma semántica que `sumarRegistrosNodoSimple`). */
export function sumarRegistrosNodoSimpleLista(
  registrosDelNodo: RegistroNodo[] | undefined,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  year: number,
): number {
  if (!registrosDelNodo?.length) return 0;
  let sum = 0;
  for (const r of registrosDelNodo) {
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

/** Version lista de `sumarRegistrosNodoAnioAnterior` (usa `desplazarPeriodoUnAnio` definido más abajo). */
export function sumarRegistrosNodoAnioAnteriorLista(
  registrosDelNodo: RegistroNodo[] | undefined,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  year: number,
): number {
  const yearPrev = year - 1;
  const periodoTipo =
    vista === "semana" ? "semana" : vista === "mes" ? "mes" : vista === "trimestre" ? "trimestre" : "anio";
  const keyPrev = desplazarPeriodoUnAnio(periodoTipo, periodoKey);
  return sumarRegistrosNodoSimpleLista(registrosDelNodo, vista, keyPrev, yearPrev);
}

export function hijosSumaDirectosIdx(idx: ArbolIndices, parentId: string): NodoArbol[] {
  const kids = idx.nodosPorParent.get(parentId) ?? [];
  return kids.filter((n) => n.relacionConPadre === "suma");
}

export function tieneHijosSumaIdx(idx: ArbolIndices, nodoId: string): boolean {
  return hijosSumaDirectosIdx(idx, nodoId).length > 0;
}

export function metaEfectivaNodoIdx(idx: ArbolIndices, nodo: NodoArbol): number | undefined {
  const hijos = hijosSumaDirectosIdx(idx, nodo.id);
  if (hijos.length > 0) {
    let sum = 0;
    let any = false;
    for (const h of hijos) {
      const m = metaEfectivaNodoIdx(idx, h);
      if (m !== undefined && Number.isFinite(m)) {
        sum += m;
        any = true;
      }
    }
    return any ? sum : undefined;
  }
  return nodo.metaValor;
}

export function planAgregadoEnPeriodoIdx(
  idx: ArbolIndices,
  nodo: NodoArbol,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  config: PlanArbolConfigAnio | undefined,
): number | undefined {
  const hijos = hijosSumaDirectosIdx(idx, nodo.id);
  if (hijos.length === 0) {
    const meta = metaEfectivaNodoIdx(idx, nodo);
    return metaParaPeriodo(nodo.cadencia, meta, vista, periodoKey, idx.year, config);
  }
  let sum = 0;
  let any = false;
  for (const h of hijos) {
    const p = planAgregadoEnPeriodoIdx(idx, h, vista, periodoKey, config);
    if (p !== undefined && Number.isFinite(p)) {
      sum += p;
      any = true;
    }
  }
  return any ? sum : undefined;
}

export function realEfectivoEnPeriodoIdx(
  idx: ArbolIndices,
  nodoId: string,
  vista: VistaPeriodoArbol,
  periodoKey: string,
): number {
  const nodo = idx.nodosById.get(nodoId);
  const regs = idx.regsPorNodo.get(nodoId);
  if (!nodo || nodo.anio !== idx.year) {
    return sumarRegistrosNodoSimpleLista(regs, vista, periodoKey, idx.year);
  }
  if (!tieneHijosSumaIdx(idx, nodoId)) {
    return sumarRegistrosNodoSimpleLista(regs, vista, periodoKey, idx.year);
  }
  const hijos = hijosSumaDirectosIdx(idx, nodoId);
  return hijos.reduce((acc, h) => acc + realEfectivoEnPeriodoIdx(idx, h.id, vista, periodoKey), 0);
}

export function realAnioPasadoAgregadoIdx(
  idx: ArbolIndices,
  nodoId: string,
  vista: VistaPeriodoArbol,
  periodoKey: string,
): number {
  const nodo = idx.nodosById.get(nodoId);
  const regs = idx.regsPorNodo.get(nodoId);
  if (!nodo || nodo.anio !== idx.year) {
    return sumarRegistrosNodoAnioAnteriorLista(regs, vista, periodoKey, idx.year);
  }
  if (!tieneHijosSumaIdx(idx, nodoId)) {
    return sumarRegistrosNodoAnioAnteriorLista(regs, vista, periodoKey, idx.year);
  }
  const hijos = hijosSumaDirectosIdx(idx, nodoId);
  return hijos.reduce((acc, h) => acc + realAnioPasadoAgregadoIdx(idx, h.id, vista, periodoKey), 0);
}

/** Real acumulado del año hasta hoy (lista ya filtrada por nodo). */
export function realDelAnioHastaHoyLista(
  registrosDelNodo: RegistroNodo[] | undefined,
  year: number,
  hoy: Date = new Date(),
): number {
  if (!registrosDelNodo?.length) return 0;
  let sum = 0;
  const hoyKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  for (const r of registrosDelNodo) {
    if (r.periodoTipo === "semana") {
      if (r.periodoKey.startsWith(`${year}-`) && r.periodoKey <= hoyKey) sum += r.valor;
    } else if (r.periodoTipo === "mes") {
      if (r.periodoKey.startsWith(`${year}-`)) {
        const [, m] = r.periodoKey.split("-").map((s) => parseInt(s, 10));
        const mesActual = hoy.getMonth() + 1;
        if (year < hoy.getFullYear() || (year === hoy.getFullYear() && m <= mesActual)) sum += r.valor;
      }
    } else if (r.periodoTipo === "trimestre") {
      if (r.periodoKey.startsWith(`${year}-Q`)) {
        const q = parseInt(r.periodoKey.slice(-1), 10);
        const qActual = Math.floor(hoy.getMonth() / 3) + 1;
        if (year < hoy.getFullYear() || (year === hoy.getFullYear() && q <= qActual)) sum += r.valor;
      }
    } else if (r.periodoTipo === "anio") {
      if (r.periodoKey === String(year) && year < hoy.getFullYear()) sum += r.valor;
    }
  }
  return sum;
}

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

/** Días laborables (lun–vie, sin descansos ni festivos ES/CCAA) en el año calendario. */
export function diasLaborablesEnAnio(anio: number, config: PlanArbolConfigAnio | undefined): number {
  let n = 0;
  for (let mes = 1; mes <= 12; mes++) {
    const mesKey = `${anio}-${String(mes).padStart(2, "0")}`;
    n += diasLaborablesEnMes(mesKey, anio, config);
  }
  return n;
}

/** Días laborables en un mes calendario YYYY-MM. */
export function diasLaborablesEnMes(mesKey: string, anio: number, config: PlanArbolConfigAnio | undefined): number {
  const [y, m] = mesKey.split("-").map((s) => parseInt(s, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || y !== anio) return 0;
  const ultimo = new Date(anio, m, 0).getDate();
  let n = 0;
  for (let day = 1; day <= ultimo; day++) {
    const dk = `${anio}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (esDiaLaborable(dk, anio, config)) n += 1;
  }
  return n;
}

/** Días laborables en el trimestre canónico (Q1..Q4). */
export function diasLaborablesEnTrimestre(qKey: string, anio: number, config: PlanArbolConfigAnio | undefined): number {
  return mesKeysEnTrimestre(qKey).reduce((acc, mk) => acc + diasLaborablesEnMes(mk, anio, config), 0);
}

/**
 * Días laborables de la semana ISO (lun–dom del `mondayKey`) que caen en `anio`.
 */
export function diasLaborablesEnSemanaISO(mondayKey: string, anio: number, config: PlanArbolConfigAnio | undefined): number {
  const mon = parseLocalDateKey(mondayKey);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    if (d.getFullYear() !== anio) continue;
    const dk = fechaKeyDesdeDate(d);
    if (esDiaLaborable(dk, anio, config)) n += 1;
  }
  return n;
}

/** Media semanal equivalente del plan lineal: meta / (días laborables / 5). */
export function metaSemanalPropuesta(metaAnual: number, anio: number, config: PlanArbolConfigAnio | undefined): number {
  const d = diasLaborablesEnAnio(anio, config);
  if (d <= 0) return 0;
  return (metaAnual * 5) / d;
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
  const totalDias = diasLaborablesEnAnio(anio, config);
  if (cadencia === "anual" && totalDias > 0) {
    if (vista === "semana") return (metaValor * diasLaborablesEnSemanaISO(periodoKey, anio, config)) / totalDias;
    if (vista === "mes") return (metaValor * diasLaborablesEnMes(periodoKey, anio, config)) / totalDias;
    if (vista === "trimestre")
      return (metaValor * diasLaborablesEnTrimestre(periodoKey, anio, config)) / totalDias;
    if (vista === "anio") return metaValor;
  }
  if (cadencia === "semanal" && vista === "semana") return metaValor;
  if (cadencia === "semanal" && vista === "mes")
    return metaValor * (diasLaborablesEnMes(periodoKey, anio, config) / 5);
  if (cadencia === "semanal" && vista === "trimestre")
    return metaValor * (diasLaborablesEnTrimestre(periodoKey, anio, config) / 5);
  if (cadencia === "semanal" && vista === "anio")
    return totalDias > 0 ? metaValor * (totalDias / 5) : metaParaVista(cadencia, metaValor, vista);
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

/* ---------- Helpers para la vista de bloques (Año / Trim / Mes / Semana) ---------- */

export type EstadoPeriodo = "pasado" | "actual" | "futuro";

/** Decide si un periodo está antes / contiene / después de la fecha `hoy`. */
export function estadoPeriodo(
  vista: VistaPeriodoArbol,
  periodoKey: string,
  anio: number,
  hoy: Date = new Date(),
): EstadoPeriodo {
  const hoyKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  if (vista === "anio") {
    if (anio < hoy.getFullYear()) return "pasado";
    if (anio > hoy.getFullYear()) return "futuro";
    return "actual";
  }
  if (vista === "trimestre") {
    const [yRaw, qRaw] = periodoKey.split("-Q");
    const y = parseInt(yRaw, 10);
    const q = parseInt(qRaw, 10);
    const start = new Date(y, (q - 1) * 3, 1);
    const end = new Date(y, q * 3, 0, 23, 59, 59);
    if (hoy < start) return "futuro";
    if (hoy > end) return "pasado";
    return "actual";
  }
  if (vista === "mes") {
    const [yRaw, mRaw] = periodoKey.split("-");
    const y = parseInt(yRaw, 10);
    const m = parseInt(mRaw, 10);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);
    if (hoy < start) return "futuro";
    if (hoy > end) return "pasado";
    return "actual";
  }
  // semana: comparamos contra el lunes siguiente y el domingo de la propia semana
  const mon = parseLocalDateKey(periodoKey);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59);
  if (hoy < mon) return "futuro";
  if (hoy > sun) return "pasado";
  void hoyKey;
  return "actual";
}

/** Devuelve la `periodoKey` desplazada un año atrás manteniendo periodo equivalente.
 *  - anio: "2026" -> "2025"
 *  - trimestre: "2026-Q1" -> "2025-Q1"
 *  - mes: "2026-03" -> "2025-03"
 *  - semana: usa la misma semana ISO en el año anterior si existe; si no, el último lunes activo. */
export function desplazarPeriodoUnAnio(
  periodoTipo: RegistroNodo["periodoTipo"],
  periodoKey: string,
): string {
  if (periodoTipo === "anio") {
    const y = parseInt(periodoKey, 10);
    return String(Number.isFinite(y) ? y - 1 : NaN);
  }
  if (periodoTipo === "trimestre") {
    const [y, q] = periodoKey.split("-Q");
    return `${parseInt(y, 10) - 1}-Q${q}`;
  }
  if (periodoTipo === "mes") {
    const [y, m] = periodoKey.split("-");
    return `${parseInt(y, 10) - 1}-${m}`;
  }
  // semana: tomamos número ISO y buscamos lunes equivalente en año-1.
  const isoLabel = isoWeekLabelFromMondayKey(periodoKey); // "S## · YYYY"
  const [sPart] = isoLabel.split(" · ");
  const weekNum = parseInt(sPart.slice(1), 10);
  const yPrev = parseLocalDateKey(periodoKey).getFullYear() - 1;
  const candidates = mondaysInCalendarYear(yPrev);
  // buscamos el lunes cuya semana ISO sea weekNum.
  const match = candidates.find((mk) => {
    const lab = isoWeekLabelFromMondayKey(mk);
    return lab.startsWith(`S${String(weekNum).padStart(2, "0")} `);
  });
  return match ?? candidates[0] ?? periodoKey;
}

/** Suma `RegistroNodo` del nodo `nodoId` desplazado un año atrás (mismo periodo equivalente). */
export function sumarRegistrosNodoAnioAnterior(
  registros: RegistroNodo[],
  nodoId: string,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  year: number,
): number {
  const yearPrev = year - 1;
  const periodoTipo = vista === "semana" ? "semana" : vista === "mes" ? "mes" : vista === "trimestre" ? "trimestre" : "anio";
  const keyPrev = desplazarPeriodoUnAnio(periodoTipo, periodoKey);
  return sumarRegistrosNodoSimple(registros, nodoId, vista, keyPrev, yearPrev);
}

/** Cuota ajustada: reparte lo que falta entre los días laborables restantes del año (lun–vie sin descanso ni festivo). */
export function cuotaAjustada(opts: {
  metaAnual: number;
  realHastaHoy: number;
  anio: number;
  config: PlanArbolConfigAnio | undefined;
  hoy?: Date;
}): {
  faltaTotal: number;
  /** Días laborables desde hoy (inclusive) hasta fin de año. */
  diasLaborablesRestantes: number;
  /** Equivalente semanal lineal: falta × 5 / días restantes. */
  semanaRestante: number;
  mesRestante: (mesKey: string) => number;
  trimRestante: (qKey: string) => number;
} {
  const hoy = opts.hoy ?? new Date();
  const anio = opts.anio;
  const hoyNorm = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const startYear = new Date(anio, 0, 1);
  const endYear = new Date(anio, 11, 31);
  const desde = hoyNorm < startYear ? startYear : hoyNorm;
  const config = opts.config;

  const diasRestantesKeys: string[] = [];
  for (let d = new Date(desde); d <= endYear; d.setDate(d.getDate() + 1)) {
    const dk = fechaKeyDesdeDate(d);
    if (parseLocalDateKey(dk).getFullYear() !== anio) continue;
    if (!esDiaLaborable(dk, anio, config)) continue;
    diasRestantesKeys.push(dk);
  }

  const diasLaborablesRestantes = diasRestantesKeys.length;
  const faltaTotal = Math.max(0, opts.metaAnual - opts.realHastaHoy);
  const semanaRestante =
    diasLaborablesRestantes > 0 ? (faltaTotal * 5) / diasLaborablesRestantes : 0;

  const restantesByMes = new Map<string, number>();
  const restantesByTrim = new Map<string, number>();
  for (const dk of diasRestantesKeys) {
    const dd = parseLocalDateKey(dk);
    const m = mesKeyFromDate(dd);
    restantesByMes.set(m, (restantesByMes.get(m) ?? 0) + 1);
    const q = trimestreKeyFromMesKey(m);
    restantesByTrim.set(q, (restantesByTrim.get(q) ?? 0) + 1);
  }

  return {
    faltaTotal,
    diasLaborablesRestantes,
    semanaRestante,
    mesRestante: (mesKey: string) =>
      diasLaborablesRestantes > 0 ? (faltaTotal * (restantesByMes.get(mesKey) ?? 0)) / diasLaborablesRestantes : 0,
    trimRestante: (qKey: string) =>
      diasLaborablesRestantes > 0 ? (faltaTotal * (restantesByTrim.get(qKey) ?? 0)) / diasLaborablesRestantes : 0,
  };
}

/** Hijos directos de `parentId` ordenados por `orden`. */
export function ramasDirectas(nodos: NodoArbol[], parentId: string, anio: number): NodoArbol[] {
  return nodos
    .filter((n) => n.anio === anio && n.parentId === parentId)
    .sort((a, b) => a.orden - b.orden);
}
