import type { Entregable, SesionEntregable } from "./types";

/**
 * Planifica la migración v28: en sesiones sin `autor`, asignar `responsable`
 * del entregable. Lógica pura (sin dispatch) para tests y para `migrations.ts`.
 */
export function planearMigracionV28AutorSesiones(
  entregables: Entregable[],
): { id: string; sesiones: SesionEntregable[] }[] {
  const cambios: { id: string; sesiones: SesionEntregable[] }[] = [];
  for (const ent of entregables) {
    const sesiones = Array.isArray(ent.sesiones) ? ent.sesiones : [];
    let changed = false;
    const next = sesiones.map((s) => {
      if (s.autor) return s;
      if (!ent.responsable) return s;
      changed = true;
      return { ...s, autor: ent.responsable };
    });
    if (changed) cambios.push({ id: ent.id, sesiones: next });
  }
  return cambios;
}
