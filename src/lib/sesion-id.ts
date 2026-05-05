import type { SesionEntregable } from "./types";

/**
 * Id determinista para sesiones legacy sin `id`.
 * Debe permanecer estable aunque luego se edite la hora, por eso se calcula
 * una sola vez (antes de modificar la sesión) y se persiste en `sesion.id`.
 */
export function legacySesionId(entregableId: string, sesion: Pick<SesionEntregable, "inicioTs" | "finTs" | "autor">): string {
  const base = [
    entregableId,
    sesion.autor ?? "",
    sesion.inicioTs ?? "",
    sesion.finTs ?? "",
  ].join("|");
  return `ses-legacy-${hash32(base)}`;
}

function hash32(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
