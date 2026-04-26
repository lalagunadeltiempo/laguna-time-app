import type { Proyecto, Resultado, Entregable, Paso, PlanConfig } from "./types";
import { PLAN_CONFIG_DEFAULT } from "./types";
import { sesionesAutomaticas, type PlanSugerido } from "./auto-planner";
import { mesesDeTrimestre } from "./semana-utils";

/* ============================================================
   Modelo unificado de "rango efectivo".
   Todas las funciones leen ÚNICAMENTE los chips canónicos:
     - Proyecto.trimestresActivos / mesesActivos
     - Resultado.semanasActivas / mesesActivos
     - Entregable.semanasActivas / diasPlanificados
   Las fechas legacy (fechaInicio/fechaLimite/semana) se ignoran salvo
   como fallback explícito mientras dura la migración.
   ============================================================ */

export interface Rango {
  inicio: string | null;
  fin: string | null;
}

export interface FechaEfectiva extends Rango {
  fuente: "propia" | "auto-plan" | "padre" | "ninguna";
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

function addDaysIso(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ultimoDiaMes(mesK: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mesK);
  if (!m) return mesK;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function primerDiaMes(mesK: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mesK);
  if (!m) return mesK;
  return `${mesK}-01`;
}

function minIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Rango canónico de un entregable derivado SOLO de chips:
 *   - Si tiene `semanasActivas`: rango = unión de todas las semanas.
 *   - Si no, pero tiene `diasPlanificados`: rango = [min, max] de los días.
 *   - Si nada de eso: null/null.
 *
 * Compat: si el entregable NO tiene chips pero sí `semana` (legado), la
 * usamos como semana única; si tampoco, caemos a `fechaInicio`/`fechaLimite`.
 */
export function rangoEntregableMapa(ent: Entregable): Rango {
  const semanas = (ent.semanasActivas && ent.semanasActivas.length > 0)
    ? ent.semanasActivas
    : (ent.semana ? [ent.semana] : []);
  if (semanas.length > 0) {
    let inicio: string | null = null;
    let fin: string | null = null;
    for (const monday of semanas) {
      inicio = minIso(inicio, monday);
      fin = maxIso(fin, addDaysIso(monday, 6));
    }
    return { inicio, fin };
  }
  // Unión de días planificados por todos los miembros + legacy: el rango del
  // entregable en el Mapa cubre cualquier día que haya planificado cualquiera.
  const diasSet = new Set<string>(ent.diasPlanificados ?? []);
  for (const arr of Object.values(ent.diasPlanificadosByUser ?? {})) {
    for (const k of arr ?? []) diasSet.add(k);
  }
  if (diasSet.size > 0) {
    const sorted = [...diasSet].sort();
    return { inicio: sorted[0], fin: sorted[sorted.length - 1] };
  }
  return { inicio: ent.fechaInicio ?? null, fin: ent.fechaLimite ?? null };
}

/**
 * Rango canónico de un resultado:
 *  - Si tiene `semanasActivas`: rango = unión.
 *  - Si tiene `mesesActivos` (pero no semanasActivas): rango = unión de meses.
 *  - Si nada: combinación de rangos de entregables.
 */
export function rangoResultadoMapa(res: Resultado, entregables: Entregable[]): Rango {
  const semanas = (res.semanasActivas && res.semanasActivas.length > 0)
    ? res.semanasActivas
    : (res.semana ? [res.semana] : []);

  if (semanas.length > 0) {
    let inicio: string | null = null;
    let fin: string | null = null;
    for (const monday of semanas) {
      inicio = minIso(inicio, monday);
      fin = maxIso(fin, addDaysIso(monday, 6));
    }
    return { inicio, fin };
  }

  const meses = res.mesesActivos ?? [];
  if (meses.length > 0) {
    let inicio: string | null = null;
    let fin: string | null = null;
    for (const m of meses) {
      inicio = minIso(inicio, primerDiaMes(m));
      fin = maxIso(fin, ultimoDiaMes(m));
    }
    return { inicio, fin };
  }

  let inicio: string | null = null;
  let fin: string | null = null;
  for (const ent of entregables) {
    const r = rangoEntregableMapa(ent);
    inicio = minIso(inicio, r.inicio);
    fin = maxIso(fin, r.fin);
  }
  return { inicio, fin };
}

/**
 * Rango canónico de un proyecto:
 *  - Si tiene `mesesActivos` o `trimestresActivos`: unión de los meses derivados.
 *  - Si no: combinación de rangos de resultados.
 */
export function rangoProyectoMapa(proy: Proyecto, resultados: Resultado[], entregables: Entregable[]): Rango {
  const meses = new Set<string>(proy.mesesActivos ?? []);
  if (meses.size === 0) {
    for (const t of proy.trimestresActivos ?? []) {
      for (const m of mesesDeTrimestre(t)) meses.add(m);
    }
  }

  if (meses.size > 0) {
    let inicio: string | null = null;
    let fin: string | null = null;
    for (const mesK of meses) {
      inicio = minIso(inicio, primerDiaMes(mesK));
      fin = maxIso(fin, ultimoDiaMes(mesK));
    }
    return { inicio, fin };
  }

  let inicio: string | null = null;
  let fin: string | null = null;
  for (const res of resultados) {
    const entsRes = entregables.filter((e) => e.resultadoId === res.id);
    const r = rangoResultadoMapa(res, entsRes);
    inicio = minIso(inicio, r.inicio);
    fin = maxIso(fin, r.fin);
  }
  return { inicio, fin };
}

/* ============================================================
   API histórica: `fechaEfectiva*`.
   Se mantiene para no romper imports. Internamente delega en las
   funciones canónicas de arriba; el campo `fuente` es informativo.
   ============================================================ */

export function fechaEfectivaResultado(
  resultado: Resultado,
  proyecto: Proyecto | undefined | null,
  planSugerido?: PlanSugerido | null,
): FechaEfectiva {
  // Fuente canónica de chips
  const r = rangoResultadoMapa(resultado, []);
  if (r.inicio || r.fin) return { ...r, fuente: "propia" };

  const auto = planSugerido?.ventanas[resultado.id];
  if (auto) {
    return { inicio: auto.inicio, fin: auto.fin, fuente: "auto-plan" };
  }
  if (proyecto) {
    const rp = rangoProyectoMapa(proyecto, [resultado], []);
    if (rp.inicio || rp.fin) return { ...rp, fuente: "padre" };
  }
  return { inicio: null, fin: null, fuente: "ninguna" };
}

export function fechaEfectivaEntregable(
  entregable: Entregable,
  resultado: Resultado | undefined | null,
  proyecto: Proyecto | undefined | null,
  planSugerido?: PlanSugerido | null,
): FechaEfectiva {
  const r = rangoEntregableMapa(entregable);
  if (r.inicio || r.fin) return { ...r, fuente: "propia" };
  if (resultado) {
    const rr = fechaEfectivaResultado(resultado, proyecto ?? null, planSugerido);
    if (rr.inicio || rr.fin) return { ...rr, fuente: rr.fuente === "propia" ? "padre" : rr.fuente };
  }
  if (proyecto) {
    const rp = rangoProyectoMapa(proyecto, resultado ? [resultado] : [], [entregable]);
    if (rp.inicio || rp.fin) return { ...rp, fuente: "padre" };
  }
  return { inicio: null, fin: null, fuente: "ninguna" };
}

/**
 * Devuelve las sesiones efectivas de un entregable.
 * Si el entregable tiene `diasEstimados > 0`, manda. Si no, calcula automáticamente
 * según el número de pasos.
 */
export function sesionesEfectivasEntregable(
  entregable: Entregable,
  pasos: Paso[],
  config: PlanConfig = PLAN_CONFIG_DEFAULT,
): number {
  if (entregable.diasEstimados > 0) return entregable.diasEstimados;
  const numPasos = pasos.filter((p) => p.entregableId === entregable.id).length;
  return sesionesAutomaticas(numPasos, config);
}
