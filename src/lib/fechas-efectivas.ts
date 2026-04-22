import type { Proyecto, Resultado, Entregable, Paso, PlanConfig } from "./types";
import { PLAN_CONFIG_DEFAULT } from "./types";
import { sesionesAutomaticas, type PlanSugerido } from "./auto-planner";

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
