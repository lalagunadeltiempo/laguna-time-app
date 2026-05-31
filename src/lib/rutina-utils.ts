import type { Entregable } from "./types";
import { mesKey } from "./semana-utils";

/** Días por defecto en los que aparece una rutina: L-V (1=lunes .. 5=viernes). */
export const DIAS_SEMANA_RUTINA_DEFAULT = [1, 2, 3, 4, 5];

/** Día de la semana 1=lunes .. 7=domingo de una clave "YYYY-MM-DD" (hora local). */
export function diaSemanaLunes1(dateKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return 0;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getDay() || 7;
}

/** Días efectivos de una rutina (con fallback al default L-V). */
export function diasSemanaDeRutina(ent: Pick<Entregable, "diasSemanaRutina">): number[] {
  return ent.diasSemanaRutina && ent.diasSemanaRutina.length > 0
    ? ent.diasSemanaRutina
    : DIAS_SEMANA_RUTINA_DEFAULT;
}

/**
 * ¿Debe aparecer esta rutina en el día `dateKey`?
 * Sólo si es de tipo "rutina", su `mesActivoRutina` coincide con el mes del día
 * y el día de la semana está dentro de `diasSemanaRutina` (por defecto L-V).
 */
export function rutinaApareceEnDia(
  ent: Pick<Entregable, "tipo" | "mesActivoRutina" | "diasSemanaRutina">,
  dateKey: string,
): boolean {
  if (ent.tipo !== "rutina") return false;
  if (!ent.mesActivoRutina) return false;
  if (mesKey(dateKey) !== ent.mesActivoRutina) return false;
  const dow = diaSemanaLunes1(dateKey);
  if (dow === 0) return false;
  return diasSemanaDeRutina(ent).includes(dow);
}
