import type { Proyecto, Resultado, Entregable, Paso, PlanConfig } from "./types";
import { PLAN_CONFIG_DEFAULT } from "./types";
import { sesionesAutomaticas, type PlanSugerido } from "./auto-planner";
import { mesesDeTrimestre } from "./semana-utils";

export interface FechaEfectiva {
  inicio: string | null;
  fin: string | null;
  fuente: "propia" | "auto-plan" | "padre" | "ninguna";
}

/**
 * Devuelve la ventana efectiva de un resultado:
 *   - propia (sus fechas) > auto-plan (calculada) > padre (proyecto) > ninguna
 */
export function fechaEfectivaResultado(
  resultado: Resultado,
  proyecto: Proyecto | undefined | null,
  planSugerido?: PlanSugerido | null,
): FechaEfectiva {
  if (resultado.fechaInicio || resultado.fechaLimite) {
    return {
      inicio: resultado.fechaInicio,
      fin: resultado.fechaLimite,
      fuente: "propia",
    };
  }
  const auto = planSugerido?.ventanas[resultado.id];
  if (auto) {
    return { inicio: auto.inicio, fin: auto.fin, fuente: "auto-plan" };
  }
  if (proyecto) {
    return {
      inicio: proyecto.fechaInicio ?? null,
      fin: proyecto.fechaLimite ?? null,
      fuente: "padre",
    };
  }
  return { inicio: null, fin: null, fuente: "ninguna" };
}

/**
 * Devuelve la ventana efectiva de un entregable:
 *   - propia > resultado efectiva > proyecto > ninguna
 */
export function fechaEfectivaEntregable(
  entregable: Entregable,
  resultado: Resultado | undefined | null,
  proyecto: Proyecto | undefined | null,
  planSugerido?: PlanSugerido | null,
): FechaEfectiva {
  if (entregable.fechaInicio || entregable.fechaLimite) {
    return {
      inicio: entregable.fechaInicio,
      fin: entregable.fechaLimite,
      fuente: "propia",
    };
  }
  if (resultado) {
    const r = fechaEfectivaResultado(resultado, proyecto ?? null, planSugerido);
    if (r.inicio || r.fin) return { inicio: r.inicio, fin: r.fin, fuente: r.fuente === "propia" ? "padre" : r.fuente };
  }
  if (proyecto) {
    return {
      inicio: proyecto.fechaInicio ?? null,
      fin: proyecto.fechaLimite ?? null,
      fuente: "padre",
    };
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

/* ============================================================
   Rangos derivados para MAPA (basados en planning de unidades:
   trimestres / mesesActivos / semanasActivas / ent.semana).
   Se ignoran las fechaInicio/fechaLimite explícitas salvo fallback.
   ============================================================ */

export interface Rango {
  inicio: string | null;
  fin: string | null;
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
 * Rango derivado para un entregable. Usa primero `ent.semana` (lunes→domingo),
 * y si no, hace fallback a sus fechas explícitas.
 */
export function rangoEntregableMapa(ent: Entregable): Rango {
  if (ent.semana) {
    return { inicio: ent.semana, fin: addDaysIso(ent.semana, 6) };
  }
  return { inicio: ent.fechaInicio ?? null, fin: ent.fechaLimite ?? null };
}

/**
 * Rango derivado para un resultado. Combina:
 *  - `res.semanasActivas` (o `res.semana` legada) expandidas a [lunes, domingo].
 *  - Rango de cada entregable vía `rangoEntregableMapa`.
 * Ignora `res.fechaInicio`/`res.fechaLimite`.
 */
export function rangoResultadoMapa(res: Resultado, entregables: Entregable[]): Rango {
  let inicio: string | null = null;
  let fin: string | null = null;

  const semanas = (res.semanasActivas && res.semanasActivas.length > 0)
    ? res.semanasActivas
    : (res.semana ? [res.semana] : []);
  for (const monday of semanas) {
    inicio = minIso(inicio, monday);
    fin = maxIso(fin, addDaysIso(monday, 6));
  }

  for (const ent of entregables) {
    const r = rangoEntregableMapa(ent);
    inicio = minIso(inicio, r.inicio);
    fin = maxIso(fin, r.fin);
  }

  return { inicio, fin };
}

/**
 * Rango derivado para un proyecto. Combina:
 *  - `proy.mesesActivos` (o `proy.trimestresActivos` convertido a meses) expandidos a [1, último día].
 *  - Rango de cada resultado vía `rangoResultadoMapa`.
 * Ignora `proy.fechaInicio`/`proy.fechaLimite`.
 */
export function rangoProyectoMapa(proy: Proyecto, resultados: Resultado[], entregables: Entregable[]): Rango {
  let inicio: string | null = null;
  let fin: string | null = null;

  const meses = new Set<string>(proy.mesesActivos ?? []);
  if (meses.size === 0) {
    for (const t of proy.trimestresActivos ?? []) {
      for (const m of mesesDeTrimestre(t)) meses.add(m);
    }
  }
  for (const mesK of meses) {
    inicio = minIso(inicio, primerDiaMes(mesK));
    fin = maxIso(fin, ultimoDiaMes(mesK));
  }

  for (const res of resultados) {
    const entsRes = entregables.filter((e) => e.resultadoId === res.id);
    const r = rangoResultadoMapa(res, entsRes);
    inicio = minIso(inicio, r.inicio);
    fin = maxIso(fin, r.fin);
  }

  return { inicio, fin };
}
