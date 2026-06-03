/**
 * Planificador puro de la migración v30: saneo de `semanasActivas` en rutinas.
 *
 * Una rutina debe estar activa en TODAS las semanas (lunes ISO) que tocan su
 * `mesActivoRutina`. Hasta v30 ni la conversión ni el rolado tocaban
 * `semanasActivas`, así que las rutinas arrastraban semanas de meses antiguos
 * "pegadas" o se quedaban sin ninguna, rompiendo Plan-Semana / Hoy / Mes.
 *
 * Esta función calcula, para cada entregable de tipo rutina con mes activo,
 * el conjunto correcto de semanas (= `semanasDeMes(mesActivoRutina)`) y emite
 * un cambio sólo cuando difiere del actual. Es pura e idempotente.
 */
import type { Entregable } from "./types";
import { semanasDeMes } from "./semana-utils";

export interface CambioRutinaSemanas {
  id: string;
  semanasActivas: string[];
}

export function planearSaneoRutinaSemanas(entregables: Entregable[]): CambioRutinaSemanas[] {
  const cambios: CambioRutinaSemanas[] = [];
  for (const ent of entregables) {
    if (ent.tipo !== "rutina" || !ent.mesActivoRutina) continue;
    const objetivo = [...semanasDeMes(ent.mesActivoRutina)].sort();
    const actual = [...(ent.semanasActivas ?? [])].sort();
    const igual =
      actual.length === objetivo.length && actual.every((s, i) => s === objetivo[i]);
    if (igual) continue;
    cambios.push({ id: ent.id, semanasActivas: objetivo });
  }
  return cambios;
}
