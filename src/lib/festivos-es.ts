import Holidays from "date-holidays";
import type { PlanArbolConfigAnio } from "./types";

const holidaysCache = new Map<string, Holidays>();

/** Instancia cacheada: país ES + comunidad autónoma (opcional). Sin CCAA = solo festivos aplicables a nivel estatal en el dataset. */
export function getHolidaysEs(comunidadAutonoma?: string): Holidays {
  const key = comunidadAutonoma ?? "";
  let hd = holidaysCache.get(key);
  if (!hd) {
    hd = comunidadAutonoma ? new Holidays("ES", comunidadAutonoma) : new Holidays("ES");
    holidaysCache.set(key, hd);
  }
  return hd;
}

/** Lista CCAA para selector (códigos date-holidays / ES). */
export const COMUNIDADES_AUTONOMAS_OPCIONES: { id: string; nombre: string }[] = (() => {
  const hd = new Holidays("ES");
  const states = hd.getStates("ES") as Record<string, string> | undefined;
  const entries = states ? Object.entries(states).map(([id, nombre]) => ({ id, nombre })) : [];
  entries.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return [{ id: "", nombre: "Solo festivos nacionales" }, ...entries];
})();

function parseLocalDateKey(key: string): Date {
  const [y, mo, d] = key.split("-").map((s) => parseInt(s, 10));
  return new Date(y, mo - 1, d);
}

/** Lunes ISO local como YYYY-MM-DD */
export function lunesDeFechaLocal(d: Date): string {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function fechaKeyDesdeDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Festivo público en ES (nacional + CCAA si aplica), según date-holidays. */
export function esFestivo(date: Date, comunidadAutonoma?: string): boolean {
  const hd = getHolidaysEs(comunidadAutonoma);
  const r = hd.isHoliday(date);
  return Array.isArray(r) ? r.length > 0 : !!r;
}

/**
 * Lun–vie, no en semana de descanso (lunes en `semanasNoActivas`), no festivo.
 */
export function esDiaLaborable(dateKey: string, anio: number, config: PlanArbolConfigAnio | undefined): boolean {
  const d = parseLocalDateKey(dateKey);
  if (d.getFullYear() !== anio) return false;
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  const noAct = new Set(config?.semanasNoActivas ?? []);
  const lunes = lunesDeFechaLocal(d);
  if (noAct.has(lunes)) return false;
  if (esFestivo(d, config?.comunidadAutonoma)) return false;
  return true;
}
