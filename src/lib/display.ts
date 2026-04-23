import type { AppState, Entregable } from "./types";
import { AREA_COLORS } from "./types";

/**
 * Subtítulo completo "Q · Proyecto · Resultado" para usar en Plan Hoy.
 * Si falta alguna pieza, se omite respetando los separadores.
 */
export function subtituloEntregable(ent: Entregable, state: Pick<AppState, "resultados" | "proyectos">): string {
  const res = state.resultados.find((r) => r.id === ent.resultadoId);
  const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
  const initial = proj ? AREA_COLORS[proj.area]?.initial ?? "" : "";
  const parts: string[] = [];
  if (initial) parts.push(initial);
  if (proj?.nombre) parts.push(proj.nombre);
  if (res?.nombre) parts.push(res.nombre);
  return parts.join(" · ");
}

/**
 * Subtítulo corto "Q · Proyecto" para listados densos tipo Plan Semana.
 */
export function subtituloCorto(ent: Entregable, state: Pick<AppState, "resultados" | "proyectos">): string {
  const res = state.resultados.find((r) => r.id === ent.resultadoId);
  const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
  const initial = proj ? AREA_COLORS[proj.area]?.initial ?? "" : "";
  const parts: string[] = [];
  if (initial) parts.push(initial);
  if (proj?.nombre) parts.push(proj.nombre);
  return parts.join(" · ");
}
