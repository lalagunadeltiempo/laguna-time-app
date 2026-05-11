import { localDateKeyFromIso } from "@/lib/date-utils";
import type { Entregable, SesionEntregable } from "@/lib/types";

/** ¿La sesión cae en el día local `dateKey` (no comparar con prefijo UTC del ISO)? */
export function sesionMatchesDateKeyLocal(s: SesionEntregable, dateKey: string): boolean {
  return localDateKeyFromIso(s.inicioTs) === dateKey;
}

/**
 * En vista HOY con filtro de miembro: sólo sesiones "de" ese usuario.
 * `autor` explícito gana; si falta (legacy), se asume la del `responsable` del entregable.
 */
export function sesionMatchesTargetUser(
  s: SesionEntregable,
  ent: Entregable,
  targetUser: string | null,
): boolean {
  if (targetUser === null) return true;
  return (s.autor ?? ent.responsable) === targetUser;
}
