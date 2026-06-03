import type { Entregable } from "./types";
import { mesKey, mesesDeTrimestre } from "./semana-utils";

/** Días por defecto en los que aparece una rutina: L-V (1=lunes .. 5=viernes). */
export const DIAS_SEMANA_RUTINA_DEFAULT = [1, 2, 3, 4, 5];

/** Día de la semana 1=lunes .. 7=domingo de una clave "YYYY-MM-DD" (hora local). */
export function diaSemanaLunes1(dateKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return 0;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getDay() || 7;
}

/**
 * Expande un patrón de días de la semana (1=lunes .. 7=domingo) sobre un mes
 * "YYYY-MM" y devuelve la lista ORDENADA de dateKeys "YYYY-MM-DD" cuyos días
 * de la semana caen dentro del patrón.
 *
 * Es la lógica pura detrás de "Planificar mes": permite rellenar un entregable
 * normal "a lo rutina pero acotado" (días concretos de un mes) sin convertirlo
 * en rutina. Reutiliza `diaSemanaLunes1` para el cálculo del día de la semana.
 *
 * - `mes` mal formado, mes fuera de rango o patrón vacío → `[]`.
 * - El resultado ya viene ascendente por construcción (recorre el mes en orden).
 */
export function dateKeysDeMesPorDiaSemana(mes: string, diasSemana: number[]): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return [];
  const dias = new Set(diasSemana);
  if (dias.size === 0) return [];
  const year = Number(m[1]);
  const month = Number(m[2]); // 1..12
  if (month < 1 || month > 12) return [];
  // Día 0 del mes siguiente = último día del mes actual (hora local).
  const ultimoDia = new Date(year, month, 0).getDate();
  const result: string[] = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const dateKey = `${m[1]}-${m[2]}-${String(d).padStart(2, "0")}`;
    if (dias.has(diaSemanaLunes1(dateKey))) result.push(dateKey);
  }
  return result;
}

/**
 * Enumera N meses consecutivos en formato "YYYY-MM", empezando (incluido) en
 * `mesInicial`. Soporta el salto de año. Es la base del horizonte "durante N
 * periodos" del planificador con frecuencia MENSUAL (una aparición por mes).
 *
 * - `mesInicial` mal formado o fuera de rango → `[]`.
 * - `n <= 0` o no finito → `[]` (se trunca con `Math.floor`).
 */
export function mesesDesde(mesInicial: string, n: number): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(mesInicial);
  if (!m) return [];
  let year = Number(m[1]);
  let month = Number(m[2]); // 1..12
  if (month < 1 || month > 12) return [];
  if (!Number.isFinite(n) || n <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < Math.floor(n); i++) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return out;
}

/**
 * Enumera N trimestres consecutivos en formato "YYYY-Qx" (x = 1..4), empezando
 * (incluido) en `trimestreInicial`. Soporta el salto de año. Es la base del
 * horizonte "durante N periodos" del planificador con frecuencia TRIMESTRAL
 * (una aparición por trimestre).
 *
 * - `trimestreInicial` mal formado → `[]`.
 * - `n <= 0` o no finito → `[]`.
 */
export function trimestresDesde(trimestreInicial: string, n: number): string[] {
  const m = /^(\d{4})-Q([1-4])$/.exec(trimestreInicial);
  if (!m) return [];
  let year = Number(m[1]);
  let q = Number(m[2]); // 1..4
  if (!Number.isFinite(n) || n <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < Math.floor(n); i++) {
    out.push(`${year}-Q${q}`);
    q++;
    if (q > 4) {
      q = 1;
      year++;
    }
  }
  return out;
}

/** Rango [min, max] de dateKeys ("YYYY-MM-DD") que abarca un mes "YYYY-MM".
 *  Útil para acotar un `<input type="date">` a ese mes. `null` si el mes es inválido. */
export function rangoDeMes(mes: string): { min: string; max: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const ultimoDia = new Date(year, month, 0).getDate();
  return {
    min: `${m[1]}-${m[2]}-01`,
    max: `${m[1]}-${m[2]}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

/** Rango [min, max] de dateKeys que abarca un trimestre "YYYY-Qx" (primer día del
 *  primer mes → último día del tercer mes). `null` si el trimestre es inválido. */
export function rangoDeTrimestre(trimestre: string): { min: string; max: string } | null {
  const meses = mesesDeTrimestre(trimestre);
  if (meses.length !== 3) return null;
  const first = rangoDeMes(meses[0]);
  const last = rangoDeMes(meses[2]);
  if (!first || !last) return null;
  return { min: first.min, max: last.max };
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
