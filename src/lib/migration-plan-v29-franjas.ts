import type { FranjaDia } from "./types";
import { FRANJAS_DEFAULT } from "./franjas";

/**
 * Planifica la migración v29: si el estado todavía no tiene franjas de time
 * blocking, sembrar las 8 por defecto. Lógica pura (sin dispatch) para tests
 * y para `migrations.ts`. Devuelve `null` cuando no hay nada que sembrar.
 */
export function planearSeedFranjasV29(franjas: FranjaDia[] | undefined): FranjaDia[] | null {
  if (Array.isArray(franjas) && franjas.length > 0) return null;
  return FRANJAS_DEFAULT.map((f) => ({ ...f }));
}
