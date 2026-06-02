import type { NodoArbol, PlanArbolConfigAnio, RegistroNodo, TrimestreKey } from "./types";
import { esDiaLaborable, fechaKeyDesdeDate } from "./festivos-es";

const TRIMESTRES: TrimestreKey[] = ["Q1", "Q2", "Q3", "Q4"];

/**
 * Ordena un grupo de nodos hermanos por su porcentaje sobre el padre, de mayor a menor.
 *
 * Como el modelo no almacena `metaPct` explícito, se deriva del cociente entre
 * `metaValor` propio y el del padre. Dentro del mismo padre el divisor es
 * constante, así que ordenar por `metaValor` desc equivale a ordenar por % desc.
 *
 * Nodos sin `metaValor` (o con valor 0/no finito) se consideran 0 % y van al
 * final, ordenados estable por `orden` y luego `nombre`. Esto evita que ramas
 * sin meta tapen a las que sí cuentan, sin perderlas de vista.
 */
export function ordenarPorPctDesc(nodos: NodoArbol[]): NodoArbol[] {
  const score = (n: NodoArbol): number => {
    const v = n.metaValor;
    if (v === undefined || !Number.isFinite(v)) return 0;
    return v;
  };
  return [...nodos].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sb !== sa) return sb - sa;
    if (a.orden !== b.orden) return a.orden - b.orden;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

/**
 * Ordena una lista de HOJAS alfabéticamente por `nombre`, de forma
 * case-insensitive y tolerante a acentos. Pensado para la capa de
 * presentación: NO altera el orden manual (`orden`) de las ramas, que se
 * sigue gestionando con `ordenarPorPctDesc` / el orden de hijos del índice.
 */
export function ordenarHojasAlfabetico(hojas: NodoArbol[]): NodoArbol[] {
  return [...hojas].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
  );
}

/** Hijos directos que suman al padre (ramas y hojas), ordenados por % desc. */
export function hijosSumaDirectos(nodos: NodoArbol[], parentId: string, anio: number): NodoArbol[] {
  return ordenarPorPctDesc(
    nodos.filter((n) => n.anio === anio && n.parentId === parentId && n.relacionConPadre === "suma"),
  );
}

export function tieneHijosSuma(nodos: NodoArbol[], nodoId: string, anio: number): boolean {
  return hijosSumaDirectos(nodos, nodoId, anio).length > 0;
}

/** Indica si el nodo tiene al menos un trimestre planificado explícitamente. */
export function nodoTieneMetaPorTrimestre(nodo: NodoArbol): boolean {
  const mt = nodo.metaPorTrimestre;
  if (!mt) return false;
  return TRIMESTRES.some((q) => mt[q] !== undefined && Number.isFinite(mt[q]!));
}

/**
 * Meta anual efectiva de un nodo tomando en cuenta `metaPorTrimestre`.
 * - Si hay `metaValor` lo respeta (los trimestres son una distribución dentro de ese anual).
 * - Si no hay `metaValor` pero sí trimestres, devuelve la suma de los trimestres definidos.
 * - Si no hay ninguno, undefined.
 */
export function metaAnualEfectivaDeNodo(nodo: NodoArbol): number | undefined {
  if (nodo.metaValor !== undefined && Number.isFinite(nodo.metaValor)) return nodo.metaValor;
  if (!nodoTieneMetaPorTrimestre(nodo)) return undefined;
  const mt = nodo.metaPorTrimestre!;
  return TRIMESTRES.reduce((acc, q) => acc + (Number.isFinite(mt[q]!) ? (mt[q] as number) : 0), 0);
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
  return metaAnualEfectivaDeNodo(nodo);
}

/** Plan del periodo agregando hijos que suman (o el plan del nodo hoja). */
export function planAgregadoEnPeriodo(
  nodo: NodoArbol,
  nodos: NodoArbol[],
  vista: VistaPeriodoArbol,
  periodoKey: string,
  anio: number,
  config: PlanArbolConfigAnio | undefined,
  idx?: ArbolIndices,
): number | undefined {
  const hijos = hijosSumaDirectos(nodos, nodo.id, anio);
  if (hijos.length === 0) {
    return metaParaNodoEnPeriodo(nodo, vista, periodoKey, anio, config, idx);
  }
  let sum = 0;
  let any = false;
  for (const h of hijos) {
    const p = planAgregadoEnPeriodo(h, nodos, vista, periodoKey, anio, config, idx);
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

/** Normaliza el nombre de un nodo para comparaciones tolerantes (tildes, case, plural simple). */
export function normalizarNombreNodo(nombre: string | undefined | null): string {
  if (!nombre) return "";
  const sinTildes = nombre.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const lower = sinTildes.trim().toLowerCase().replace(/\s+/g, " ");
  return lower.endsWith("s") ? lower.slice(0, -1) : lower;
}

function pathDeNodoDesdeMap(nodoId: string, nodosByIdAll: Map<string, NodoArbol>): string {
  const parts: string[] = [];
  let cur: NodoArbol | undefined = nodosByIdAll.get(nodoId);
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    parts.unshift(normalizarNombreNodo(cur.nombre));
    if (!cur.parentId) break;
    cur = nodosByIdAll.get(cur.parentId);
  }
  return parts.join("/");
}

/** Índices precalculados para evitar barridos lineales sobre todos los registros/nodos en la UI. */
export type ArbolIndices = {
  regsPorNodo: Map<string, RegistroNodo[]>;
  nodosPorParent: Map<string, NodoArbol[]>;
  nodosById: Map<string, NodoArbol>;
  year: number;
  /** Path normalizado (raiz/rama/.../nodo) para cualquier nodoId, de cualquier año. */
  pathByNodoId: Map<string, string>;
  /** path normalizado → nodoId, indexado por año. Permite resolver equivalentes entre árboles de años distintos. */
  nodoIdPorPathByAnio: Map<number, Map<string, string>>;
  /** Mapa completo por id, de cualquier año (para poder resolver equivalentes). */
  nodosByIdAll: Map<string, NodoArbol>;
  /** Hijos directos por parentId, considerando cualquier año (para recursión cross-año). */
  nodosPorParentAll: Map<string, NodoArbol[]>;
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
  const nodosByIdAll = new Map<string, NodoArbol>();
  const nodosPorParentAll = new Map<string, NodoArbol[]>();
  for (const n of nodos) {
    nodosByIdAll.set(n.id, n);
    const pid = n.parentId ?? "";
    const listAll = nodosPorParentAll.get(pid);
    if (listAll) listAll.push(n);
    else nodosPorParentAll.set(pid, [n]);
    if (n.anio === year) {
      nodosById.set(n.id, n);
      const list = nodosPorParent.get(pid);
      if (list) list.push(n);
      else nodosPorParent.set(pid, [n]);
    }
  }
  for (const [pid, list] of nodosPorParent) {
    nodosPorParent.set(pid, ordenarPorPctDesc(list));
  }
  for (const [pid, list] of nodosPorParentAll) {
    nodosPorParentAll.set(pid, ordenarPorPctDesc(list));
  }

  const pathByNodoId = new Map<string, string>();
  const nodoIdPorPathByAnio = new Map<number, Map<string, string>>();
  for (const n of nodos) {
    const p = pathDeNodoDesdeMap(n.id, nodosByIdAll);
    pathByNodoId.set(n.id, p);
    let mapAnio = nodoIdPorPathByAnio.get(n.anio);
    if (!mapAnio) {
      mapAnio = new Map();
      nodoIdPorPathByAnio.set(n.anio, mapAnio);
    }
    // Si hay colisiones de path (dos nodos con mismo path en el mismo año), prevalece el primero (orden estable).
    if (!mapAnio.has(p)) mapAnio.set(p, n.id);
  }

  return {
    regsPorNodo,
    nodosPorParent,
    nodosById,
    year,
    pathByNodoId,
    nodoIdPorPathByAnio,
    nodosByIdAll,
    nodosPorParentAll,
  };
}

/** Devuelve el nodoId del nodo con mismo path normalizado en el año indicado, o null si no existe. */
export function resolverNodoEquivalenteEnAnio(
  idx: ArbolIndices,
  nodoId: string,
  anio: number,
): string | null {
  const path = idx.pathByNodoId.get(nodoId);
  if (!path) return null;
  const byPath = idx.nodoIdPorPathByAnio.get(anio);
  if (!byPath) return null;
  return byPath.get(path) ?? null;
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
  return metaAnualEfectivaDeNodo(nodo);
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
    return metaParaNodoEnPeriodo(nodo, vista, periodoKey, idx.year, config, idx);
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

/**
 * Suma real recursivamente para un nodo cualquiera en su propio año (no necesariamente `idx.year`).
 * Usado internamente para computar el "año pasado" cuando se cruza por path a un nodo del año anterior.
 */
function realRecursivoEnAnio(
  idx: ArbolIndices,
  nodoId: string,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  year: number,
): number {
  const nodo = idx.nodosByIdAll.get(nodoId);
  const regs = idx.regsPorNodo.get(nodoId);
  if (!nodo || nodo.anio !== year) {
    return sumarRegistrosNodoSimpleLista(regs, vista, periodoKey, year);
  }
  const hijos = (idx.nodosPorParentAll.get(nodoId) ?? []).filter(
    (n) => n.anio === year && n.relacionConPadre === "suma",
  );
  if (hijos.length === 0) {
    return sumarRegistrosNodoSimpleLista(regs, vista, periodoKey, year);
  }
  const sumHijos = hijos.reduce(
    (acc, h) => acc + realRecursivoEnAnio(idx, h.id, vista, periodoKey, year),
    0,
  );
  if (sumHijos > 0) return sumHijos;
  // Fallback: si los hijos no aportan, mostramos los registros directos del nodo padre
  // (rescata apuntes rápidos hechos al total cuando las hojas aún no están cargadas).
  return sumarRegistrosNodoSimpleLista(regs, vista, periodoKey, year);
}

export function realEfectivoEnPeriodoIdx(
  idx: ArbolIndices,
  nodoId: string,
  vista: VistaPeriodoArbol,
  periodoKey: string,
): number {
  return realRecursivoEnAnio(idx, nodoId, vista, periodoKey, idx.year);
}

/**
 * Real anual de un nodo en el año al que pertenece (suma recursiva por
 * hijos suma con fallback a registros directos, igual que
 * `realEfectivoEnPeriodoIdx` pero permitiendo nodos de cualquier año del
 * índice). Útil para clonar estructura usando proporciones reales del
 * año anterior.
 */
export function realDeNodoEnSuPropioAnio(
  idx: ArbolIndices,
  nodoId: string,
): number {
  const nodo = idx.nodosByIdAll.get(nodoId);
  if (!nodo) return 0;
  return realRecursivoEnAnio(idx, nodoId, "anio", String(nodo.anio), nodo.anio);
}

/**
 * Calcula el "año pasado" del nodo.
 * Cascada de resolución (prioridad descendente):
 *   1. Suma recursiva por hijos suma (con periodoKey desplazada 1 año).
 *   2. Registros directos del propio nodo con periodoKey desplazada (apuntes manuales en la raíz).
 *   3. Registros del nodo equivalente por nombre/path en el año anterior (suma recursiva).
 * Devuelve `undefined` cuando NINGUNA fuente aporta datos (producto nuevo sin histórico).
 */
export function realAnioPasadoAgregadoIdx(
  idx: ArbolIndices,
  nodoId: string,
  vista: VistaPeriodoArbol,
  periodoKey: string,
): number | undefined {
  const nodo = idx.nodosById.get(nodoId);
  const regs = idx.regsPorNodo.get(nodoId);
  const directoDesplazado = regs && regs.length > 0
    ? sumarRegistrosNodoAnioAnteriorLista(regs, vista, periodoKey, idx.year)
    : undefined;

  if (!nodo || nodo.anio !== idx.year) {
    return directoDesplazado;
  }

  // Recursión por hijos suma (nivel rama/raíz).
  if (tieneHijosSumaIdx(idx, nodoId)) {
    const hijos = hijosSumaDirectosIdx(idx, nodoId);
    let sum = 0;
    let anyChild = false;
    for (const h of hijos) {
      const v = realAnioPasadoAgregadoIdx(idx, h.id, vista, periodoKey);
      if (v !== undefined) {
        sum += v;
        anyChild = true;
      }
    }
    if (anyChild && sum > 0) return sum;
    // Fallback: apuntes directos en el propio nodo (p.ej. manual en la raíz con periodoKey año anterior).
    if (directoDesplazado !== undefined && directoDesplazado > 0) return directoDesplazado;
    // Fallback 2: equivalente por path en el año anterior (suma recursiva en ese subárbol).
    const eq = realAnioPasadoViaEquivalente(idx, nodo, vista, periodoKey);
    if (eq !== undefined) return eq;
    if (anyChild) return 0;
    return directoDesplazado;
  }

  // Hoja sin hijos suma: intentamos en orden directos → equivalente por path.
  if (directoDesplazado !== undefined && directoDesplazado > 0) return directoDesplazado;
  const eq = realAnioPasadoViaEquivalente(idx, nodo, vista, periodoKey);
  if (eq !== undefined) return eq;
  return directoDesplazado;
}

function realAnioPasadoViaEquivalente(
  idx: ArbolIndices,
  nodo: NodoArbol,
  vista: VistaPeriodoArbol,
  periodoKey: string,
): number | undefined {
  const equivId = resolverNodoEquivalenteEnAnio(idx, nodo.id, nodo.anio - 1);
  if (!equivId) return undefined;
  const periodoTipo =
    vista === "semana" ? "semana" : vista === "mes" ? "mes" : vista === "trimestre" ? "trimestre" : "anio";
  const keyPrev = desplazarPeriodoUnAnio(periodoTipo, periodoKey);
  return realRecursivoEnAnio(idx, equivId, vista, keyPrev, nodo.anio - 1);
}

/**
 * Real del año anterior agregado en un mes concreto del año destino.
 *
 * Versión simplificada de `realAnioPasadoAgregadoIdx` para vista "mes":
 * dado un `mesKey` del año actual del índice (`YYYY-MM`), devuelve cuánto
 * facturó el nodo (o su equivalente por path en el año anterior) en el
 * MISMO mes del año pasado. Devuelve `undefined` cuando no hay ninguna
 * fuente con datos para ese par (nodo, mes AY).
 *
 * Lo aislamos en su propio helper porque la UI de Mensual tiene que
 * mostrar este número como referencia ("AY abr 2025: 38.420 €"), y
 * llamar a `realAnioPasadoAgregadoIdx(... "mes", periodoKey)` ya hace lo
 * correcto. Se expone como API explícita para que los call-sites no
 * tengan que recordar el contrato y para reusarlo desde
 * `proporcionesMensualesAYParaNodo`.
 */
export function realAnioPasadoEnMesIdx(
  idx: ArbolIndices,
  nodoId: string,
  mesKey: string,
): number | undefined {
  return realAnioPasadoAgregadoIdx(idx, nodoId, "mes", mesKey);
}

/** Resultado de comparar el real del año actual con el del año anterior. */
export type CrecimientoVsAY = {
  deltaEur: number;
  /** % interanual; ausente si el producto es nuevo (AY = 0). */
  deltaPct: number | undefined;
  esNuevo: boolean;
};

/**
 * Variación interanual (real actual − año anterior).
 * - `ay` ausente se trata como 0.
 * - Si ambos son 0 → `null` (no mostrar línea).
 * - Si `ay = 0` y `real > 0` → `esNuevo: true` (sin %).
 */
export function crecimientoVsAY(real: number, ay: number | undefined): CrecimientoVsAY | null {
  const ayEff = ay ?? 0;
  if (ayEff === 0 && real === 0) return null;
  if (ayEff === 0 && real > 0) {
    return { deltaEur: real, deltaPct: undefined, esNuevo: true };
  }
  const deltaEur = real - ayEff;
  const deltaPct = (deltaEur / ayEff) * 100;
  return { deltaEur, deltaPct, esNuevo: false };
}

/** Meses del año destino con actividad: real > 0 o mes cerrado en config. */
export function mesesActivosEnAnio(
  idx: ArbolIndices,
  nodoId: string,
  config: PlanArbolConfigAnio | undefined,
): string[] {
  const cerrados = mesesCerradosSet(config);
  const out: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const mk = `${idx.year}-${String(i).padStart(2, "0")}`;
    const realActual = realEfectivoEnPeriodoIdx(idx, nodoId, "mes", mk);
    if (realActual > 0 || cerrados.has(mk)) out.push(mk);
  }
  return out;
}

/** Real acumulado del año destino solo en meses con actividad (YTD operativo). */
export function realYTDEnMesesActivosIdx(
  idx: ArbolIndices,
  nodoId: string,
  config: PlanArbolConfigAnio | undefined,
): number {
  let sum = 0;
  for (const mk of mesesActivosEnAnio(idx, nodoId, config)) {
    sum += realEfectivoEnPeriodoIdx(idx, nodoId, "mes", mk);
  }
  return sum;
}

/**
 * Real del año anterior en el mismo tramo que el YTD actual: suma el real
 * AY de cada mes donde 2026 tiene actividad (real > 0 o mes cerrado).
 */
export function realAnioPasadoYTDIdx(
  idx: ArbolIndices,
  nodoId: string,
  config: PlanArbolConfigAnio | undefined,
): number | undefined {
  const meses = mesesActivosEnAnio(idx, nodoId, config);
  if (meses.length === 0) return undefined;
  let sum = 0;
  let any = false;
  for (const mk of meses) {
    const ay = realAnioPasadoEnMesIdx(idx, nodoId, mk);
    if (ay !== undefined && ay > 0) {
      sum += ay;
      any = true;
    } else {
      const realActual = realEfectivoEnPeriodoIdx(idx, nodoId, "mes", mk);
      if (realActual > 0) any = true;
    }
  }
  return any ? sum : undefined;
}

/**
 * Proporciones mensuales del REAL del año anterior para un nodo del año
 * destino. Devuelve un `Record<mesKey_destino, propMes>` donde `mesKey`
 * es del año destino (`YYYY-MM`) y `propMes ∈ [0, 1]`.
 *
 * Casos:
 *  - Si no hay ningún match (nodo sin equivalente AY ni registros AY
 *    por path), devuelve `{}`.
 *  - Si la suma del real AY es <= 0, devuelve `{}` (señal de "fallback
 *    al método por días laborables").
 *  - En otro caso, divide el real AY de cada mes por la suma anual AY
 *    del nodo. Las claves son meses del año destino (mismo mes del año
 *    pasado): `YYYY-01`..`YYYY-12`.
 *
 * El helper queda puro y trabaja sobre `ArbolIndices` para evitar
 * recomputar paths/registros desde cero en la UI o en los tests.
 */
export function proporcionesMensualesAYParaNodo(
  idx: ArbolIndices,
  nodoId: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  const realPorMes = new Map<string, number>();
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    const mk = `${idx.year}-${String(m).padStart(2, "0")}`;
    const v = realAnioPasadoEnMesIdx(idx, nodoId, mk);
    if (v !== undefined && Number.isFinite(v) && v > 0) {
      realPorMes.set(mk, v);
      total += v;
    }
  }
  if (total <= 0) return {};
  for (const [mk, v] of realPorMes) {
    out[mk] = v / total;
  }
  return out;
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

/**
 * Domingo de Pascua (Computus, algoritmo "Anonymous"/Meeus 1990). Devuelve
 * la fecha local del año `year`. Cubre rangos válidos del calendario
 * gregoriano sin depender de librerías externas.
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Lunes ISO de la semana que contiene el Domingo de Pascua (Semana Santa).
 * Por defecto es la semana de descanso típica en España: Lunes Santo,
 * Jueves Santo, Viernes Santo y Domingo de Resurrección viven en ella.
 */
export function easterVacationMonday(year: number): string {
  const sunday = easterSunday(year);
  return toMondayDateKeyLocal(sunday);
}

/** Agosto completo + dos semanas de Navidad + una semana de Semana Santa (lunes ISO). */
export function defaultSemanasNoActivas(anio: number): string[] {
  const set = new Set<string>();
  for (const mk of mondaysInCalendarYear(anio)) {
    if (weekTouchesAugust(mk, anio)) set.add(mk);
  }
  for (const mk of christmasVacationMondays(anio)) set.add(mk);
  set.add(easterVacationMonday(anio));
  return [...set].sort();
}

/** Comunidad autónoma por defecto cuando se crea una config nueva (date-holidays). */
export const DEFAULT_COMUNIDAD_AUTONOMA = "MD";

export function ensureConfigAnio(configs: PlanArbolConfigAnio[], anio: number): PlanArbolConfigAnio[] {
  if (configs.some((c) => c.anio === anio)) return configs;
  return [
    ...configs,
    {
      anio,
      semanasNoActivas: defaultSemanasNoActivas(anio),
      comunidadAutonoma: DEFAULT_COMUNIDAD_AUTONOMA,
      pisoMensual: { [`${anio}-08`]: 10000 },
    },
  ].sort((a, b) => a.anio - b.anio);
}

/**
 * Set de meses cerrados leyendo `mesesCerradosTs` (modelo nuevo) y, como
 * fallback de compatibilidad, `mesesCerrados` (modelo legacy pre-migración 22).
 * Centraliza la lectura para que ningún componente trate los dos campos
 * por su cuenta.
 */
export function mesesCerradosSet(config: PlanArbolConfigAnio | undefined): Set<string> {
  if (!config) return new Set();
  if (config.mesesCerradosTs && Object.keys(config.mesesCerradosTs).length > 0) {
    return new Set(Object.keys(config.mesesCerradosTs));
  }
  return new Set(config.mesesCerrados ?? []);
}

/**
 * Set de mondayKey marcadas como descanso, resolviendo LWW con los
 * tombstones de "esta semana ya no es descanso" (`semanasActivasTs`).
 *
 * Lectores que antes accedían a `config.semanasNoActivas` deben usar este
 * helper: si no, una semana que la usuaria acaba de desmarcar puede
 * resucitar en el siguiente render porque el array legacy todavía la
 * lista. Ver migración v25 y `unionConfigs` para el LWW completo.
 */
export function semanasNoActivasSet(config: PlanArbolConfigAnio | undefined): Set<string> {
  if (!config) return new Set();
  const out = new Set<string>();
  if (config.semanasNoActivasTs && Object.keys(config.semanasNoActivasTs).length > 0) {
    for (const mk of Object.keys(config.semanasNoActivasTs)) out.add(mk);
  } else {
    for (const mk of config.semanasNoActivas ?? []) out.add(mk);
  }
  const aperturas = config.semanasActivasTs ?? {};
  const cierres = config.semanasNoActivasTs ?? {};
  for (const mk of Object.keys(aperturas)) {
    const tApertura = aperturas[mk];
    const tCierre = cierres[mk];
    if (!tCierre || tApertura >= tCierre) out.delete(mk);
  }
  return out;
}

export function semanasActivasCount(anio: number, config: PlanArbolConfigAnio | undefined): number {
  const noAct = semanasNoActivasSet(config);
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
  const noAct = semanasNoActivasSet(config);
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

/** ¿El lunes `mondayKey` pertenece al mes `YYYY-MM`?
 *
 *  Comparación textual para evitar `parseLocalDateKey` por llamada: en los
 *  bloques densos del Árbol esta función puede llamarse decenas de miles
 *  de veces (52 semanas × hojas × meses) durante un único render. La
 *  forma `YYYY-MM-DD` siempre comparte los 7 primeros caracteres con
 *  `YYYY-MM`, así que el slice basta.
 */
export function mondayEnMes(mondayKey: string, mesKey: string): boolean {
  return mondayKey.length >= 7 && mondayKey.slice(0, 7) === mesKey;
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

/**
 * Clona el subárbol de la raíz "equivalente" del año anterior bajo la raíz destino.
 *
 * Pensado para "empezar año nuevo": la usuaria crea la raíz 2027 con su nuevo objetivo
 * (€), pulsa "Traer estructura del año anterior" y se copian las ramas y hojas con sus
 * porcentajes; los € de cada nodo se recalculan contra el nuevo objetivo anual.
 *
 * Reglas:
 * - Si no existe una raíz del mismo "ámbito" (mismo nombre normalizado, sin parentId)
 *   en `anioDestino - 1`, devuelve `{ nuevosNodos: [], copiados: 0 }` (no-op).
 * - La raíz destino NO se duplica: los hijos directos del origen se reparentan a ella.
 * - De cada nodo origen se conserva: nombre, descripcion, tipo, cadencia,
 *   relacionConPadre, orden, metaUnidad, contadorModo. Se descartan registros,
 *   metaPorTrimestre, proyectoIds/entregableIds y notaAnioAnterior (datos del año
 *   pasado).
 * - El `metaValor` del destino se calcula como
 *   `metaValor_origen / metaValor_raizOrigen * metaValor_raizDestino`. Se redondea a
 *   dos decimales para mantener coherencia con la edición vía %.
 * - Si el origen no tiene meta o la raíz origen no tiene total, el destino queda con
 *   `metaValor` undefined y la usuaria lo afina luego en el bloque Anual.
 *
 * Modo "estructura":
 *  - La raíz destino NO se toca (ni su `metaValor`).
 *  - Las ramas/hojas se copian con sus nombres pero SIEMPRE con `metaValor`
 *    undefined. Útil cuando la usuaria quiere reusar la forma del árbol del
 *    año pasado y planificar manualmente desde cero el reparto.
 */
/**
 * Modo de importación al "Traer estructura del año anterior":
 *  - "plan": copia ramas/hojas usando el `metaValor` planificado del año
 *    anterior como proporción y recalcula los € contra la meta de la raíz
 *    destino (default histórico).
 *  - "real": ídem pero las proporciones se derivan del REAL del año
 *    anterior (lo que de verdad pasó). Si no hay reales, cae a "plan".
 *  - "estructura": copia sólo la forma del árbol (ramas y hojas con sus
 *    nombres). NO toca la raíz destino y deja todas las copias con
 *    `metaValor` undefined (y sin `metaPorTrimestre`). Pensado para
 *    "empezar a planificar 2026 desde cero apoyándome en la estructura
 *    de 2025".
 */
export type ModoImportSubarbol = "plan" | "real" | "estructura";

/**
 * Encuentra la raíz del año anterior que se va a usar como origen para
 * "Traer estructura de {año-1}". Prioriza match por nombre normalizado;
 * si no lo hay, devuelve la única (o la primera por orden y luego
 * `creado` ascendente) raíz disponible. Si no hay ninguna raíz en
 * `anioActual - 1`, devuelve `undefined`.
 *
 * Aquí relajamos la búsqueda original (estricta por nombre) porque la
 * usuaria suele renombrar la raíz cada año ("FACTURACIÓN 2026" vs
 * "Facturación") y antes los botones de importar desaparecían.
 */
export function findRaizOrigenAnioAnterior(
  nodos: NodoArbol[],
  anioActual: number,
  raizDestinoId?: string,
): NodoArbol | undefined {
  const anioOrigen = anioActual - 1;
  const candidatas = nodos.filter((n) => !n.parentId && n.anio === anioOrigen);
  if (candidatas.length === 0) return undefined;
  if (raizDestinoId !== undefined) {
    const raizDestino = nodos.find((n) => n.id === raizDestinoId);
    if (raizDestino) {
      const objetivo = normalizarNombreNodo(raizDestino.nombre);
      const match = candidatas.find((n) => normalizarNombreNodo(n.nombre) === objetivo);
      if (match) return match;
    }
  }
  const ordenadas = [...candidatas].sort((a, b) => {
    if (a.orden !== b.orden) return a.orden - b.orden;
    return (a.creado ?? "").localeCompare(b.creado ?? "");
  });
  return ordenadas[0];
}

export function clonarEstructuraDeAnioAnterior(opts: {
  nodos: NodoArbol[];
  anioDestino: number;
  raizDestinoId: string;
  generateId: () => string;
  /** "plan" (defecto): usa metaValor del año anterior como proporción.
   *  "real": usa el real agregado del año anterior. */
  modo?: ModoImportSubarbol;
  /** Registros del árbol completos. Solo necesario cuando `modo === "real"`. */
  registros?: RegistroNodo[];
}): {
  nuevosNodos: NodoArbol[];
  copiados: number;
  modoEfectivo: ModoImportSubarbol;
  /** Nombre de la raíz origen elegida; útil para que el caller pregunte
   *  cuando difiere del destino antes de aplicar el clon. */
  nombreOrigen?: string;
} {
  const { nodos, anioDestino, raizDestinoId, generateId } = opts;
  const modoSolicitado: ModoImportSubarbol = opts.modo ?? "plan";
  const raizDestino = nodos.find((n) => n.id === raizDestinoId);
  if (!raizDestino || raizDestino.anio !== anioDestino) {
    return { nuevosNodos: [], copiados: 0, modoEfectivo: modoSolicitado };
  }

  const raizOrigen = findRaizOrigenAnioAnterior(nodos, anioDestino, raizDestinoId);
  if (!raizOrigen) return { nuevosNodos: [], copiados: 0, modoEfectivo: modoSolicitado };
  const anioOrigen = raizOrigen.anio;

  // Mapa hijo→padre por id para todo el año origen, para recorrer el subárbol.
  const hijosPorParent = new Map<string, NodoArbol[]>();
  for (const n of nodos) {
    if (n.anio !== anioOrigen) continue;
    if (!n.parentId) continue;
    const list = hijosPorParent.get(n.parentId);
    if (list) list.push(n);
    else hijosPorParent.set(n.parentId, [n]);
  }

  const metaRaizOrigen = raizOrigen.metaValor;
  const metaRaizDestino = raizDestino.metaValor;
  const puedeDerivarPctPorPlan =
    metaRaizOrigen !== undefined && Number.isFinite(metaRaizOrigen) && metaRaizOrigen > 0;
  const puedePropagar =
    metaRaizDestino !== undefined && Number.isFinite(metaRaizDestino);

  // Real total de la raíz origen para proporciones por real. Solo se usa
  // cuando el modo solicitado es "real" y se han pasado los registros.
  let realPorOrigenId: Map<string, number> | undefined;
  let realRaizOrigen = 0;
  if (modoSolicitado === "real" && opts.registros) {
    const idx = buildArbolIndices(opts.registros, nodos, anioDestino);
    realRaizOrigen = realDeNodoEnSuPropioAnio(idx, raizOrigen.id);
    if (realRaizOrigen > 0) {
      realPorOrigenId = new Map();
      // BFS sobre origen para precomputar reales de cada nodo.
      const stack: NodoArbol[] = [...(hijosPorParent.get(raizOrigen.id) ?? [])];
      while (stack.length > 0) {
        const cur = stack.shift()!;
        realPorOrigenId.set(cur.id, realDeNodoEnSuPropioAnio(idx, cur.id));
        const hijos = hijosPorParent.get(cur.id) ?? [];
        for (const h of hijos) stack.push(h);
      }
    }
  }
  // Si pidieron "real" pero la raíz origen no tiene real (o faltan registros),
  // caemos al modo "plan" en silencio: es la opción más útil para la usuaria
  // (estructura intacta) y el caller puede leer `modoEfectivo` para avisar.
  // El modo "estructura" se respeta tal cual: no depende de plan ni real
  // del origen, sólo copia nombres y forma.
  const modoEfectivo: ModoImportSubarbol =
    modoSolicitado === "estructura"
      ? "estructura"
      : modoSolicitado === "real" && realPorOrigenId !== undefined
        ? "real"
        : "plan";

  const idMap = new Map<string, string>();
  idMap.set(raizOrigen.id, raizDestinoId);
  const nuevosNodos: NodoArbol[] = [];
  const ahora = new Date().toISOString();

  // BFS en orden estable (por orden, luego nombre) para que los nuevos `orden`
  // mantengan la misma secuencia visual que la del año anterior.
  const queue: NodoArbol[] = [...(hijosPorParent.get(raizOrigen.id) ?? [])];
  while (queue.length > 0) {
    const origen = queue.shift()!;
    const newId = generateId();
    idMap.set(origen.id, newId);

    let metaPct: number | undefined;
    // Modo "estructura": ni siquiera intentamos derivar % — el copión
    // queda con metaValor undefined (la usuaria afina luego en ANUAL).
    if (modoEfectivo === "estructura") {
      // metaPct intencionalmente undefined.
    } else if (modoEfectivo === "real" && realPorOrigenId) {
      const realNodo = realPorOrigenId.get(origen.id);
      if (realNodo !== undefined && Number.isFinite(realNodo) && realRaizOrigen > 0) {
        metaPct = (realNodo / realRaizOrigen) * 100;
      }
    } else if (
      puedeDerivarPctPorPlan &&
      origen.metaValor !== undefined &&
      Number.isFinite(origen.metaValor)
    ) {
      metaPct = (origen.metaValor / (metaRaizOrigen as number)) * 100;
    }
    let metaValorNuevo: number | undefined;
    if (metaPct !== undefined && puedePropagar) {
      const v = ((metaRaizDestino as number) * metaPct) / 100;
      metaValorNuevo = Math.round(v * 100) / 100;
    }

    const newParentId = idMap.get(origen.parentId ?? "") ?? raizDestinoId;
    const copia: NodoArbol = {
      id: newId,
      anio: anioDestino,
      parentId: newParentId,
      orden: origen.orden,
      nombre: origen.nombre,
      tipo: origen.tipo,
      cadencia: origen.cadencia,
      relacionConPadre: origen.relacionConPadre,
      contadorModo: origen.contadorModo,
      creado: ahora,
    };
    if (origen.descripcion) copia.descripcion = origen.descripcion;
    if (origen.metaUnidad !== undefined) copia.metaUnidad = origen.metaUnidad;
    if (metaValorNuevo !== undefined) copia.metaValor = metaValorNuevo;
    nuevosNodos.push(copia);

    const hijos = hijosPorParent.get(origen.id) ?? [];
    for (const h of hijos) queue.push(h);
  }

  return {
    nuevosNodos,
    copiados: nuevosNodos.length,
    modoEfectivo,
    nombreOrigen: raizOrigen.nombre,
  };
}

/**
 * Reescala recursivamente las metas de los descendientes "suma" del nodo
 * `rootId` para que sigan sumando `nuevaMetaRoot`, manteniendo las
 * proporciones relativas actuales en cada nivel.
 *
 * Pensado para el bloque ANUAL: cuando la usuaria cambia la meta€ (o el
 * % equivalente) de una rama tras "Traer estructura del año anterior",
 * sus hojas tienen que recalcularse sin que tenga que entrar a editarlas
 * una a una; idem cuando cambia el objetivo anual de la raíz vs sus
 * ramas. Si los descendientes a su vez tienen sub-hojas que suman, el
 * factor se aplica en cascada para no descuadrar ningún nivel.
 *
 * Reglas de seguridad:
 * - Sólo se consideran hijos cuyo `relacionConPadre === "suma"` (las
 *   ramas "no suman, sólo informa" se respetan tal cual).
 * - Sólo se reescalan los hijos con `metaValor` definido y finito; los
 *   que están sin meta no se inventan (la usuaria los completará).
 * - Si la suma actual de los hijos con meta es <= 0, no hay proporción
 *   conocida: no devolvemos cambios para esa subrama (caso típico:
 *   rama recién creada sin hojas con valor todavía).
 * - Si `nuevaMetaRoot === 0`, todos los descendientes con meta pasan a
 *   0; este caso es deseable (la usuaria quiso "vaciar" esa rama).
 * - Se redondea a dos decimales para mantener coherencia con el resto
 *   de cálculos del bloque (ver `clonarEstructuraDeAnioAnterior`).
 *
 * Devuelve un `Map<idNodo, nuevaMeta>` con sólo los descendientes a
 * actualizar (NO incluye al propio `rootId`; ése lo gestiona el caller).
 */
export function reescalarSubarbolProporcional(opts: {
  nodos: NodoArbol[];
  rootId: string;
  nuevaMetaRoot: number;
}): Map<string, number> {
  const { nodos, rootId, nuevaMetaRoot } = opts;
  const out = new Map<string, number>();
  const root = nodos.find((n) => n.id === rootId);
  if (!root) return out;
  if (!Number.isFinite(nuevaMetaRoot)) return out;

  const hijosPorParent = new Map<string, NodoArbol[]>();
  for (const n of nodos) {
    if (n.anio !== root.anio) continue;
    if (!n.parentId) continue;
    if (n.relacionConPadre !== "suma") continue;
    const list = hijosPorParent.get(n.parentId);
    if (list) list.push(n);
    else hijosPorParent.set(n.parentId, [n]);
  }

  const recurse = (parentId: string, metaPadreNueva: number) => {
    const hijos = hijosPorParent.get(parentId) ?? [];
    if (hijos.length === 0) return;
    const conMeta = hijos.filter(
      (h) => h.metaValor !== undefined && Number.isFinite(h.metaValor),
    );
    const sumaActual = conMeta.reduce((acc, h) => acc + (h.metaValor as number), 0);
    if (sumaActual <= 0) return;
    const factor = metaPadreNueva / sumaActual;
    for (const h of conMeta) {
      const nuevo = (h.metaValor as number) * factor;
      const redondeado = Math.round(nuevo * 100) / 100;
      out.set(h.id, redondeado);
      recurse(h.id, redondeado);
    }
  };

  recurse(rootId, nuevaMetaRoot);
  return out;
}

/**
 * Reajusta los porcentajes de hermanos NO pinados (`metaPctFijo !== true`)
 * para que, junto con el nodo cambiado (`cambioId`) y los pinados, vuelvan a
 * cuadrar al 100% del padre.
 *
 * Reglas de negocio:
 * - Sólo toca hijos directos `relacionConPadre === "suma"` del `parentId`.
 * - Nunca toca pinados.
 * - Reparte en pasos de 0.5% para mantener una UX estable y predecible.
 * - Devuelve sólo los hermanos no pinados que realmente cambian, como
 *   `Map<idNodo, nuevoMetaValor>` (meta en € u otra unidad del padre).
 *
 * Ejemplo 1 (alta de rama): si había 4 hermanas al 25% y entra una nueva al
 * 10%, `pctDisponible` para las 4 antiguas pasa a 90% y el algoritmo baja
 * 2.5% a cada una (22.5%).
 *
 * Ejemplo 2 (pin): si hay {50% pinado, 25%, 25%} y entra otra al 10%,
 * `pctDisponible` para no-pinadas es 40%. El 50% pinado no se toca y sólo se
 * recortan las otras dos.
 */
export function reajustarHermanosPorPin(opts: {
  nodos: NodoArbol[];
  parentId: string;
  cambioId: string;
  nuevoPctCambio: number;
  metaPadre: number;
}): Map<string, number> {
  const { nodos, parentId, cambioId, nuevoPctCambio, metaPadre } = opts;
  const out = new Map<string, number>();
  if (!Number.isFinite(metaPadre) || metaPadre <= 0) return out;

  const hermanos = nodos.filter(
    (n) =>
      n.parentId === parentId &&
      n.relacionConPadre === "suma" &&
      n.id !== cambioId,
  );
  if (hermanos.length === 0) return out;

  type Entry = { nodo: NodoArbol; pct: number };
  const entries: Entry[] = hermanos.map((n) => {
    const base = n.metaValor ?? 0;
    const pct = Number.isFinite(base) ? (base / metaPadre) * 100 : 0;
    return { nodo: n, pct: Number.isFinite(pct) ? pct : 0 };
  });
  const pinados = entries.filter((e) => e.nodo.metaPctFijo === true);
  const noPinados = entries.filter((e) => e.nodo.metaPctFijo !== true);
  const sumaPinados = pinados.reduce((acc, e) => acc + e.pct, 0);
  const pctDisponible = 100 - nuevoPctCambio - sumaPinados;

  if (noPinados.length === 0) {
    console.warn(
      `[reajustarHermanosPorPin] No hay hermanos no pinados para reajustar (parentId=${parentId}, cambioId=${cambioId}).`,
    );
    return out;
  }

  const sumNoPinadosActual = noPinados.reduce((acc, e) => acc + e.pct, 0);
  if (
    nuevoPctCambio === 0 &&
    Math.abs(sumNoPinadosActual) < 1e-9 &&
    Math.abs(sumaPinados) < 1e-9
  ) {
    return out;
  }

  if (pctDisponible < 0) {
    console.warn(
      `[reajustarHermanosPorPin] El cambio pisa porcentajes pinados; se ponen a 0 las ramas no pinadas (parentId=${parentId}, cambioId=${cambioId}, pctDisponible=${pctDisponible.toFixed(2)}).`,
    );
    for (const e of noPinados) e.pct = 0;
  } else {
    let delta = pctDisponible - sumNoPinadosActual;
    if (Math.abs(delta) < 1e-9) return out;

    const pickMayor = () =>
      [...noPinados].sort(
        (a, b) => b.pct - a.pct || a.nodo.orden - b.nodo.orden,
      );
    const pickMenor = () =>
      [...noPinados].sort(
        (a, b) => a.pct - b.pct || a.nodo.orden - b.nodo.orden,
      );

    let guard = 0;
    while (Math.abs(delta) >= 0.5 - 1e-9 && guard < 10000) {
      guard += 1;
      if (delta < 0) {
        const objetivo = pickMayor().find((e) => e.pct > 0);
        if (!objetivo) break;
        const paso = Math.min(0.5, objetivo.pct);
        objetivo.pct -= paso;
        delta += paso;
      } else {
        const objetivo = pickMenor()[0];
        if (!objetivo) break;
        objetivo.pct += 0.5;
        delta -= 0.5;
      }
    }

    if (Math.abs(delta) > 1e-9) {
      if (delta < 0) {
        const objetivo = pickMayor().find((e) => e.pct > 0);
        if (objetivo) {
          const recorte = Math.min(Math.abs(delta), objetivo.pct);
          objetivo.pct -= recorte;
          delta += recorte;
        }
      } else {
        const objetivo = pickMenor()[0];
        if (objetivo) {
          objetivo.pct += delta;
          delta = 0;
        }
      }
    }

    // Snap duro a múltiplos de 0.5 para robustez frente a flotantes.
    const snapHalf = (v: number) => Math.round(v * 2) / 2;
    for (const e of noPinados) {
      e.pct = Math.max(0, snapHalf(e.pct));
    }

    // Reconciliación final para que cierre exacto contra `pctDisponible`.
    let dif = pctDisponible - noPinados.reduce((acc, e) => acc + e.pct, 0);
    guard = 0;
    while (Math.abs(dif) >= 0.5 - 1e-9 && guard < 10000) {
      guard += 1;
      if (dif > 0) {
        const objetivo = pickMenor()[0];
        if (!objetivo) break;
        objetivo.pct += 0.5;
        dif -= 0.5;
      } else {
        const objetivo = pickMayor().find((e) => e.pct > 0);
        if (!objetivo) break;
        const paso = Math.min(0.5, objetivo.pct);
        objetivo.pct -= paso;
        dif += paso;
      }
    }
    if (Math.abs(dif) > 1e-9) {
      if (dif > 0) {
        const objetivo = pickMenor()[0];
        if (objetivo) objetivo.pct = Math.max(0, objetivo.pct + dif);
      } else {
        const objetivo = pickMayor().find((e) => e.pct > 0);
        if (objetivo) objetivo.pct = Math.max(0, objetivo.pct + dif);
      }
    }
    for (const e of noPinados) {
      e.pct = Math.max(0, Math.round(e.pct * 2) / 2);
    }
  }

  for (const e of noPinados) {
    const nuevoMeta = Math.round((((e.pct * metaPadre) / 100) * 100)) / 100;
    const actual = e.nodo.metaValor ?? 0;
    if (Math.abs(actual - nuevoMeta) > 1e-9) {
      out.set(e.nodo.id, nuevoMeta);
    }
  }
  return out;
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
 * Reparto del plan anual respetando los pisos mensuales declarados en
 * config. Aislado en su propia función para mantener `metaParaPeriodo`
 * legible. La invariante por construcción: la suma de planes mensuales
 * cuadra con `metaValor` cuando la suma de pisos no lo excede; si lo
 * excede, los pisos absorben todo el plan (clamp por mes) y los meses
 * sin piso quedan en 0.
 */
function metaParaPeriodoAnual(
  metaValor: number,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  anio: number,
  config: PlanArbolConfigAnio | undefined,
  totalDias: number,
  pisoScale: number = 1,
): number {
  const rawPisos = config?.pisoMensual ?? {};
  // El piso mensual se declara a nivel del TOTAL (raíz). Para que no se
  // aplique entero a cada nodo por separado (lo que tragaba hojas pequeñas
  // enteras en el mes con piso), lo escalamos por el peso del nodo respecto
  // a la raíz. Con pisoScale=1 (raíz o llamadas sin idx) el comportamiento
  // es idéntico al histórico.
  const scale = Number.isFinite(pisoScale) ? Math.min(1, Math.max(0, pisoScale)) : 1;
  const pisos: Record<string, number> = Object.fromEntries(
    Object.entries(rawPisos).map(([k, v]) => [k, (Number.isFinite(v) ? (v as number) : 0) * scale]),
  );
  const sumPisos = Object.values(pisos).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const tienePisos = sumPisos > 0;
  if (!tienePisos) {
    if (vista === "semana") return (metaValor * diasLaborablesEnSemanaISO(periodoKey, anio, config)) / totalDias;
    if (vista === "mes") return (metaValor * diasLaborablesEnMes(periodoKey, anio, config)) / totalDias;
    if (vista === "trimestre")
      return (metaValor * diasLaborablesEnTrimestre(periodoKey, anio, config)) / totalDias;
    return metaValor;
  }
  const metaRestante = Math.max(0, metaValor - sumPisos);
  let diasMesesPiso = 0;
  for (const mk of Object.keys(pisos)) diasMesesPiso += diasLaborablesEnMes(mk, anio, config);
  const diasRestantes = Math.max(1, totalDias - diasMesesPiso);
  // Si los pisos exceden la meta anual, los recortamos prorrateados al
  // entrar a cada mes para no devolver más de `metaValor` agregado.
  const factorClamp = sumPisos > metaValor ? metaValor / sumPisos : 1;
  const pisoEfectivoMes = (mk: string): number | undefined => {
    const v = pisos[mk];
    if (v === undefined || !Number.isFinite(v)) return undefined;
    return v * factorClamp;
  };

  if (vista === "anio") return metaValor;

  if (vista === "mes") {
    const piso = pisoEfectivoMes(periodoKey);
    if (piso !== undefined) return piso;
    return (metaRestante * diasLaborablesEnMes(periodoKey, anio, config)) / diasRestantes;
  }

  if (vista === "trimestre") {
    let sum = 0;
    for (const mk of mesKeysEnTrimestre(periodoKey)) {
      const piso = pisoEfectivoMes(mk);
      if (piso !== undefined) sum += piso;
      else sum += (metaRestante * diasLaborablesEnMes(mk, anio, config)) / diasRestantes;
    }
    return sum;
  }

  // vista === "semana"
  const mkSemana = mesKeyFromDate(parseLocalDateKey(periodoKey));
  const piso = pisoEfectivoMes(mkSemana);
  if (piso !== undefined) {
    const semActivas = semanasActivasEnMes(mkSemana, anio, config);
    if (semActivas <= 0) return 0;
    return piso / semActivas;
  }
  return (metaRestante * diasLaborablesEnSemanaISO(periodoKey, anio, config)) / diasRestantes;
}

/**
 * Cuota real para un periodo concreto teniendo en cuenta las semanas activas reales del año.
 * Cuando hay info suficiente (cadencia anual + config + periodoKey), reparte proporcional a las semanas activas
 * del periodo. Si no, vuelve al cálculo simple de `metaParaVista`.
 *
 * Piso mensual: si `config.pisoMensual` declara un mínimo (€) por mesKey,
 * ese mes recibe exactamente el piso (caso típico: agosto 100% descanso
 * con ingresos pasivos), y el resto de la meta anual se prorratea entre
 * los meses sin piso por sus días laborables. Sólo se aplica a cadencia
 * anual. La vista semanal reparte el piso del mes uniformemente entre
 * sus semanas activas.
 */
export function metaParaPeriodo(
  cadencia: import("./types").NodoCadencia,
  metaValor: number | undefined,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  anio: number,
  config: PlanArbolConfigAnio | undefined,
  pisoScale: number = 1,
): number | undefined {
  if (metaValor === undefined) return undefined;
  const totalDias = diasLaborablesEnAnio(anio, config);
  if (cadencia === "anual" && totalDias > 0) {
    return metaParaPeriodoAnual(metaValor, vista, periodoKey, anio, config, totalDias, pisoScale);
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

/**
 * Replan mes a mes: para cada mes M del año, calcula cuánto debería
 * facturarse en M asumiendo que los meses anteriores a M aportan al
 * acumulado o bien su real (si están **cerrados**) o bien su plan lineal
 * (si están abiertos), y que lo que falta para llegar a `metaAnual` se
 * reparte entre los días laborables de M..Diciembre.
 *
 * El concepto de "mes cerrado" lo activa el usuario explícitamente; sin
 * cierre, un mes con real=0 podría ser sólo "aún no apunté", lo cual no
 * debería penalizar el replan de los meses posteriores.
 *
 * Pisos mensuales: un mes con `pisoMensual[mk]` declarado se considera
 * compromiso fijo. Su replan = piso (no se replanifica) y su aporte al
 * acumulado del mes siguiente es el piso (incluso si el mes está abierto
 * y aún no se apuntó nada). Si el mes está cerrado, gana el real (que es
 * el dato de la realidad).
 *
 * Independiente de la fecha "hoy": funciona igual para años pasados,
 * actual o futuros.
 */
export function replanMensualSerie(opts: {
  metaAnual: number;
  realPorMes: ReadonlyMap<string, number>;
  mesesCerrados?: ReadonlySet<string>;
  anio: number;
  config: PlanArbolConfigAnio | undefined;
  /**
   * Proporciones por mesKey (`YYYY-MM`) usadas como peso para el reparto
   * cuando `config.distribucionMensual === "patronAnioAnterior"`. No
   * tienen que sumar exactamente 1: la lógica las normaliza dentro del
   * subconjunto de meses sin piso. Si está vacío o ausente, se usa el
   * peso por días laborables (comportamiento histórico).
   */
  proporcionesAY?: Readonly<Record<string, number>>;
}): Map<string, number> {
  const result = new Map<string, number>();
  const cerrados = opts.mesesCerrados ?? new Set<string>();
  const pisos = opts.config?.pisoMensual ?? {};
  const sumPisos = Object.values(pisos).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const mesKeys: string[] = Array.from(
    { length: 12 },
    (_, i) => `${opts.anio}-${String(i + 1).padStart(2, "0")}`,
  );
  const diasMes = mesKeys.map((k) => diasLaborablesEnMes(k, opts.anio, opts.config));
  // Pesos por mes para el reparto del residuo. Cuando el modo es
  // "patronAnioAnterior" y hay proporciones AY no vacías, los pesos son
  // las propias proporciones AY; en otro caso, días laborables.
  const usaPatronAY =
    opts.config?.distribucionMensual === "patronAnioAnterior" &&
    opts.proporcionesAY !== undefined &&
    Object.keys(opts.proporcionesAY).length > 0;
  const pesoMes = mesKeys.map((k, i) => {
    if (usaPatronAY) {
      const p = opts.proporcionesAY?.[k];
      return Number.isFinite(p) && (p as number) > 0 ? (p as number) : 0;
    }
    return diasMes[i];
  });
  // Pesos descontando los meses con piso, que no entran al reparto del
  // residuo (su contribución la fija el piso).
  const metaRestanteAnual = Math.max(0, opts.metaAnual - sumPisos);
  const denomTotalNoPiso = Math.max(
    1e-9,
    pesoMes.reduce((a, _, j) => a + (pisos[mesKeys[j]] !== undefined ? 0 : pesoMes[j]), 0),
  );
  // Plan lineal del mes con pisos absorbidos: para meses con piso vale el
  // piso; para meses sin piso, prorrateo de la meta restante por peso
  // (días laborables o proporción AY) sin contar los meses con piso.
  const planLinealMes = mesKeys.map((k, i) => {
    if (pisos[k] !== undefined && Number.isFinite(pisos[k])) return pisos[k];
    if (denomTotalNoPiso <= 0) return 0;
    return (metaRestanteAnual * pesoMes[i]) / denomTotalNoPiso;
  });
  // Pesos RESTANTES (mes i .. dic) excluyendo meses con piso, para que
  // el reparto del residuo en el replan del propio mes i no se diluya en
  // el denominador con meses que ya están comprometidos por piso.
  const pesoDesdeSinPiso: number[] = new Array(12).fill(0);
  let acumSinPiso = 0;
  for (let i = 11; i >= 0; i--) {
    if (pisos[mesKeys[i]] === undefined) acumSinPiso += pesoMes[i];
    pesoDesdeSinPiso[i] = acumSinPiso;
  }

  let realAcumAntes = 0;
  for (let i = 0; i < 12; i++) {
    const k = mesKeys[i];
    if (pisos[k] !== undefined && Number.isFinite(pisos[k])) {
      result.set(k, pisos[k]);
    } else {
      // Falta hasta la meta anual descontando lo ya acumulado y el resto de
      // pisos que aún están por venir (compromisos fijos futuros).
      const pisosFuturos = mesKeys
        .slice(i + 1)
        .reduce((a, mk) => a + (pisos[mk] !== undefined && Number.isFinite(pisos[mk]) ? pisos[mk] : 0), 0);
      const falta = Math.max(0, opts.metaAnual - realAcumAntes - pisosFuturos);
      const replanI = pesoDesdeSinPiso[i] > 0 ? (falta * pesoMes[i]) / pesoDesdeSinPiso[i] : 0;
      result.set(k, replanI);
    }
    // Aportación al acumulado del siguiente mes:
    //  - mes cerrado: real (incluso 0).
    //  - mes abierto sin piso: plan lineal (no penalizar el futuro).
    //  - mes abierto con piso: piso (compromiso fijo).
    const aporte = cerrados.has(k)
      ? opts.realPorMes.get(k) ?? 0
      : planLinealMes[i];
    realAcumAntes += aporte;
  }
  return result;
}

/**
 * Replan trimestre a trimestre: misma lógica que `replanMensualSerie` pero
 * agregando por trimestre. Requiere `realPorMes` (no por trimestre) porque
 * el cierre se decide al nivel del mes y necesita sumar mes a mes. Los
 * pisos mensuales se respetan: en el reparto del residuo se descuentan
 * los meses con piso del numerador y del denominador, y luego se suman.
 */
export function replanTrimestralSerie(opts: {
  metaAnual: number;
  realPorMes: ReadonlyMap<string, number>;
  mesesCerrados?: ReadonlySet<string>;
  anio: number;
  config: PlanArbolConfigAnio | undefined;
  /** Mismo contrato que en `replanMensualSerie`: peso por mesKey cuando
   *  el modo es "patronAnioAnterior". Se agrega trimestralmente. */
  proporcionesAY?: Readonly<Record<string, number>>;
}): Map<string, number> {
  const result = new Map<string, number>();
  const cerrados = opts.mesesCerrados ?? new Set<string>();
  const pisos = opts.config?.pisoMensual ?? {};
  const sumPisos = Object.values(pisos).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const metaRestanteAnual = Math.max(0, opts.metaAnual - sumPisos);
  const trimKeys = [1, 2, 3, 4].map((q) => `${opts.anio}-Q${q}`);
  // Mapas auxiliares por mes: peso (días laborables o AY) y plan lineal (con pisos absorbidos).
  const mesKeysAll: string[] = Array.from(
    { length: 12 },
    (_, i) => `${opts.anio}-${String(i + 1).padStart(2, "0")}`,
  );
  const diasMesAll = mesKeysAll.map((k) => diasLaborablesEnMes(k, opts.anio, opts.config));
  const usaPatronAY =
    opts.config?.distribucionMensual === "patronAnioAnterior" &&
    opts.proporcionesAY !== undefined &&
    Object.keys(opts.proporcionesAY).length > 0;
  const pesoMesAll = mesKeysAll.map((k, i) => {
    if (usaPatronAY) {
      const p = opts.proporcionesAY?.[k];
      return Number.isFinite(p) && (p as number) > 0 ? (p as number) : 0;
    }
    return diasMesAll[i];
  });
  const pesoMesesNoPiso = pesoMesAll.reduce(
    (a, d, j) => a + (pisos[mesKeysAll[j]] !== undefined ? 0 : d),
    0,
  );
  const denomNoPiso = Math.max(1e-9, pesoMesesNoPiso);
  const planLinMes: Record<string, number> = {};
  for (let i = 0; i < 12; i++) {
    const mk = mesKeysAll[i];
    if (pisos[mk] !== undefined && Number.isFinite(pisos[mk])) planLinMes[mk] = pisos[mk];
    else planLinMes[mk] = (metaRestanteAnual * pesoMesAll[i]) / denomNoPiso;
  }

  // Pesos sin piso DESDE el trimestre q hasta Q4, para el denominador del
  // replan de cada trimestre.
  const pesoDesdeQNoPiso: number[] = new Array(4).fill(0);
  for (let q = 3; q >= 0; q--) {
    const acum = mesKeysEnTrimestre(trimKeys[q]).reduce(
      (a, mk, idx) => a + (pisos[mk] !== undefined ? 0 : pesoMesAll[q * 3 + idx]),
      0,
    );
    pesoDesdeQNoPiso[q] = (q < 3 ? pesoDesdeQNoPiso[q + 1] : 0) + acum;
  }

  let realAcumAntes = 0;
  for (let q = 0; q < 4; q++) {
    const qKey = trimKeys[q];
    const meses = mesKeysEnTrimestre(qKey);
    // Pisos comprometidos en el propio trimestre y en los siguientes (para
    // restarlos del "lo que falta repartir").
    const pisosTrimActual = meses.reduce(
      (a, mk) => a + (pisos[mk] !== undefined && Number.isFinite(pisos[mk]) ? pisos[mk] : 0),
      0,
    );
    const pisosFuturos = trimKeys
      .slice(q + 1)
      .reduce(
        (acc, qK) =>
          acc +
          mesKeysEnTrimestre(qK).reduce(
            (a, mk) => a + (pisos[mk] !== undefined && Number.isFinite(pisos[mk]) ? pisos[mk] : 0),
            0,
          ),
        0,
      );
    const pesoNoPisoTrim = meses.reduce(
      (a, mk, idx) => a + (pisos[mk] !== undefined ? 0 : pesoMesAll[q * 3 + idx]),
      0,
    );
    const falta = Math.max(0, opts.metaAnual - realAcumAntes - pisosTrimActual - pisosFuturos);
    const repartoSinPiso = pesoDesdeQNoPiso[q] > 0 ? (falta * pesoNoPisoTrim) / pesoDesdeQNoPiso[q] : 0;
    result.set(qKey, pisosTrimActual + repartoSinPiso);
    for (const mk of meses) {
      const aporte = cerrados.has(mk) ? opts.realPorMes.get(mk) ?? 0 : planLinMes[mk];
      realAcumAntes += aporte;
    }
  }
  return result;
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

/** Hijos directos de `parentId` ordenados por % de la meta del padre, descendente. */
export function ramasDirectas(nodos: NodoArbol[], parentId: string, anio: number): NodoArbol[] {
  return ordenarPorPctDesc(
    nodos.filter((n) => n.anio === anio && n.parentId === parentId),
  );
}

/** Devuelve el trimestre `Q1..Q4` que contiene el periodoKey de un mes (`YYYY-MM`). */
export function trimestreKeyDesdeMes(mesKey: string): TrimestreKey | null {
  const [, m] = mesKey.split("-").map((s) => parseInt(s, 10));
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  const n = Math.floor((m - 1) / 3) + 1;
  return `Q${n}` as TrimestreKey;
}

/** Extrae `Q1..Q4` de un periodoKey `YYYY-Qn`. */
export function trimestreKeyDesdeQ(qKey: string): TrimestreKey | null {
  const [, q] = qKey.split("-Q");
  const n = parseInt(q, 10);
  if (!Number.isFinite(n) || n < 1 || n > 4) return null;
  return `Q${n}` as TrimestreKey;
}

/**
 * Distribución efectiva por trimestre de un nodo.
 * - Si el nodo no tiene `metaPorTrimestre`, devuelve `null` (no hay distribución explícita).
 * - Si hay trimestres definidos y `metaValor` > suma definidos, el residuo se reparte entre los
 *   trimestres no definidos proporcional a días laborables (o equitativo si no hay config).
 */
const TRIMESTRE_KEYS_SET = new Set<TrimestreKey>(TRIMESTRES);

/** Normaliza `trimestresPlan` a claves Q1–Q4 únicas y ordenadas. */
export function sanitizarTrimestresPlan(raw: unknown): TrimestreKey[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: TrimestreKey[] = [];
  for (const v of raw) {
    if (typeof v === "string" && TRIMESTRE_KEYS_SET.has(v as TrimestreKey) && !out.includes(v as TrimestreKey)) {
      out.push(v as TrimestreKey);
    }
  }
  if (out.length === 0) return undefined;
  out.sort((a, b) => TRIMESTRES.indexOf(a) - TRIMESTRES.indexOf(b));
  return out;
}

/**
 * Distribución trimestral derivada de `trimestresPlan`: reparte `metaValor`
 * entre los trimestres elegidos por días laborables. Devuelve null si no hay
 * plan válido (0, 4 trimestres, o sin meta).
 */
export function distribucionDesdeTrimestresPlan(
  nodo: NodoArbol,
  anio: number,
  config: PlanArbolConfigAnio | undefined,
): Record<TrimestreKey, number> | null {
  const plan = sanitizarTrimestresPlan(nodo.trimestresPlan);
  if (!plan || plan.length === 0 || plan.length >= 4) return null;
  const meta = nodo.metaValor;
  if (meta === undefined || !Number.isFinite(meta) || meta <= 0) return null;

  const asignado: Record<TrimestreKey, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  const pesos = plan.map((q) => {
    const diasQ = diasLaborablesEnTrimestre(`${anio}-${q}`, anio, config);
    return diasQ > 0 ? diasQ : 1;
  });
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  if (sumaPesos <= 0) return null;
  plan.forEach((q, i) => {
    asignado[q] = (meta * pesos[i]) / sumaPesos;
  });
  return asignado;
}

export function distribucionTrimestralEfectiva(
  nodo: NodoArbol,
  anio: number,
  config: PlanArbolConfigAnio | undefined,
): Record<TrimestreKey, number> | null {
  if (!nodoTieneMetaPorTrimestre(nodo)) return null;
  const mt = nodo.metaPorTrimestre!;
  const asignado: Record<TrimestreKey, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  const faltantes: TrimestreKey[] = [];
  for (const q of TRIMESTRES) {
    const v = mt[q];
    if (v !== undefined && Number.isFinite(v)) {
      asignado[q] = v;
    } else {
      faltantes.push(q);
    }
  }
  const definidosSum = TRIMESTRES.reduce((a, q) => a + asignado[q], 0);
  // Si la distribución trimestral está toda a 0 (todos los trimestres
  // explícitamente a 0 sin faltantes), descartamos `metaPorTrimestre`
  // y volvemos al cálculo derivado de `metaValor`. Sin esto, un
  // `metaPorTrimestre = {Q1:0,Q2:0,Q3:0,Q4:0}` que pueda quedar como
  // residuo de operaciones (reescalados, importaciones legacy, edición
  // parcial) anula por completo el plan aunque `metaValor` sea > 0.
  if (faltantes.length === 0 && definidosSum <= 0) {
    return null;
  }
  const residuo = (nodo.metaValor ?? 0) - definidosSum;
  if (faltantes.length > 0 && residuo > 0) {
    const pesos = faltantes.map((q) => {
      const diasQ = diasLaborablesEnTrimestre(`${anio}-${q}`, anio, config);
      return diasQ > 0 ? diasQ : 1;
    });
    const sumaPesos = pesos.reduce((a, b) => a + b, 0);
    faltantes.forEach((q, i) => {
      asignado[q] = (residuo * pesos[i]) / sumaPesos;
    });
  }
  return asignado;
}

/**
 * Plan del periodo para un nodo, teniendo en cuenta `metaPorTrimestre` si está definido.
 *
 * Cascada de resolución:
 *  1. Si el nodo tiene `trimestresPlan` (1–3 trimestres), reparte
 *     `metaValor` solo entre esos trimestres. Es el ÚNICO mecanismo de
 *     "cuándo": el antiguo `metaPorTrimestre` ya no influye en el reparto
 *     (un residuo legacy no concentra nada; ver `distribucionTrimestralEfectiva`).
 *  2. Si `config.distribucionMensual === "patronAnioAnterior"` y se
 *     proporciona `idx` y el nodo tiene cadencia anual con datos AY
 *     suficientes, el reparto mensual sigue las proporciones del real
 *     del MISMO nodo (o equivalente por path) en el año anterior. La
 *     suma de meses ≡ meta anual; el trimestre es la suma de sus 3
 *     meses; la semana se prorratea por días laborables dentro del mes.
 *  3. En cualquier otro caso, fallback al cálculo clásico por días
 *     laborables (`metaParaPeriodo`).
 *
 * `idx` es opcional: las llamadas que no lo pasan (p. ej. test legacy o
 * `planAgregadoEnPeriodo` sin índice) se quedan en el comportamiento
 * histórico aunque la config pida "patronAnioAnterior".
 */
export function metaParaNodoEnPeriodo(
  nodo: NodoArbol,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  anio: number,
  config: PlanArbolConfigAnio | undefined,
  idx?: ArbolIndices,
): number | undefined {
  // El "cuándo" de una hoja lo fija EXCLUSIVAMENTE `trimestresPlan`
  // (control "¿Cuándo?"). El antiguo `metaPorTrimestre` ya NO concentra el
  // reparto: una hoja con residuo legacy pero sin `trimestresPlan` cae al
  // reparto lineal por días laborables (rama final `metaParaPeriodo`).
  const distTrim = distribucionDesdeTrimestresPlan(nodo, anio, config);
  if (distTrim) {
    if (vista === "anio") {
      return TRIMESTRES.reduce((acc, q) => acc + distTrim[q], 0);
    }
    if (vista === "trimestre") {
      const q = trimestreKeyDesdeQ(periodoKey);
      if (!q) return undefined;
      return distTrim[q];
    }
    if (vista === "mes") {
      const q = trimestreKeyDesdeMes(periodoKey);
      if (!q) return undefined;
      const diasMes = diasLaborablesEnMes(periodoKey, anio, config);
      const diasTrim = diasLaborablesEnTrimestre(`${anio}-${q}`, anio, config);
      if (diasTrim <= 0) return diasMes > 0 ? distTrim[q] / 3 : 0;
      return (distTrim[q] * diasMes) / diasTrim;
    }
    if (vista === "semana") {
      const mk = mesKeyFromDate(parseLocalDateKey(periodoKey));
      const q = trimestreKeyDesdeMes(mk);
      if (!q) return undefined;
      const diasSem = diasLaborablesEnSemanaISO(periodoKey, anio, config);
      const diasTrim = diasLaborablesEnTrimestre(`${anio}-${q}`, anio, config);
      if (diasTrim <= 0) return 0;
      return (distTrim[q] * diasSem) / diasTrim;
    }
  }
  const metaAnual = metaAnualEfectivaDeNodo(nodo);
  if (
    metaAnual !== undefined &&
    Number.isFinite(metaAnual) &&
    nodo.cadencia === "anual" &&
    config?.distribucionMensual === "patronAnioAnterior" &&
    idx
  ) {
    const proporciones = proporcionesMensualesAYParaNodo(idx, nodo.id);
    if (Object.keys(proporciones).length > 0) {
      if (vista === "anio") return metaAnual;
      if (vista === "mes") return metaAnual * (proporciones[periodoKey] ?? 0);
      if (vista === "trimestre") {
        let sum = 0;
        for (const mk of mesKeysEnTrimestre(periodoKey)) {
          sum += metaAnual * (proporciones[mk] ?? 0);
        }
        return sum;
      }
      if (vista === "semana") {
        // Dentro del mes seguimos repartiendo por días laborables: la
        // granularidad del patrón AY es mensual, no semanal.
        const mk = mesKeyFromDate(parseLocalDateKey(periodoKey));
        const propMes = proporciones[mk] ?? 0;
        const metaMes = metaAnual * propMes;
        const diasMesTotal = diasLaborablesEnMes(mk, anio, config);
        if (diasMesTotal <= 0) return 0;
        const diasSem = diasLaborablesEnSemanaISO(periodoKey, anio, config);
        return (metaMes * diasSem) / diasMesTotal;
      }
    }
    // Si proporciones está vacío, caemos al cálculo clásico abajo.
  }
  // El piso mensual (config.pisoMensual) está declarado a nivel del TOTAL
  // (raíz). Para que cada nodo reciba sólo la parte del piso que le
  // corresponde por su peso, escalamos el piso por metaAnual / metaRaiz.
  // Así la suma de las hojas en el mes con piso reconstituye el piso global
  // y ninguna hoja pequeña se traga el piso entero. Con trimestresPlan ese
  // camino ya retornó arriba y nunca llega aquí (el "¿Cuándo?" tiene
  // prioridad y sigue ignorando el piso).
  let pisoScale = 1;
  if (idx && metaAnual != null && Number.isFinite(metaAnual)) {
    const raiz = raizDeNodo(nodo, idx);
    const rootMeta = raiz ? metaAnualEfectivaDeNodo(raiz) : undefined;
    if (rootMeta != null && Number.isFinite(rootMeta) && rootMeta > 0) {
      pisoScale = Math.min(1, Math.max(0, metaAnual / rootMeta));
    }
  }
  return metaParaPeriodo(nodo.cadencia, metaAnual, vista, periodoKey, anio, config, pisoScale);
}

/** Camina `parentId` con el índice hasta encontrar la raíz (nodo sin parentId). */
function raizDeNodo(nodo: NodoArbol, idx: ArbolIndices): NodoArbol | undefined {
  let actual: NodoArbol | undefined = nodo;
  const visitados = new Set<string>();
  while (actual && actual.parentId) {
    if (visitados.has(actual.id)) return undefined; // ciclo defensivo
    visitados.add(actual.id);
    const padre: NodoArbol | undefined =
      idx.nodosById.get(actual.parentId) ?? idx.nodosByIdAll.get(actual.parentId);
    if (!padre) break;
    actual = padre;
  }
  return actual;
}
