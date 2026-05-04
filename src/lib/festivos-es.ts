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
 * Caché de "días laborables del año". Para cada combinación
 * (año, CCAA, huella de `semanasNoActivas`) calculamos UNA vez un
 * Set<YYYY-MM-DD> con los días laborables, y todas las llamadas a
 * `esDiaLaborable` del árbol se resuelven con `set.has(dateKey)`.
 *
 * Antes: cada llamada creaba un Set nuevo de `semanasNoActivas` y,
 * peor, pasaba por `hd.isHoliday(date)` (date-holidays construye
 * reglas cada vez) — con cientos de tarjetas × 365 días, eso
 * colgaba la pestaña durante varios segundos al tocar cualquier
 * input del Árbol de objetivos.
 */
const diasLaborablesSetCache = new Map<string, ReadonlySet<string>>();

function claveAnioConfig(anio: number, config: PlanArbolConfigAnio | undefined): string {
  const ccaa = config?.comunidadAutonoma ?? "";
  // No usamos Array.prototype.sort directamente porque podría mutar el array
  // original del estado; hacemos una copia defensiva.
  const semanas = (config?.semanasNoActivas ?? []).slice().sort().join(",");
  return `${anio}|${ccaa}|${semanas}`;
}

export function diasLaborablesSetDelAnio(
  anio: number,
  config: PlanArbolConfigAnio | undefined,
): ReadonlySet<string> {
  const key = claveAnioConfig(anio, config);
  const cached = diasLaborablesSetCache.get(key);
  if (cached) return cached;
  const set = new Set<string>();
  const noAct = new Set(config?.semanasNoActivas ?? []);
  const ccaa = config?.comunidadAutonoma;
  const hd = getHolidaysEs(ccaa);
  // Recorremos el año entero una sola vez.
  const d = new Date(anio, 0, 1);
  while (d.getFullYear() === anio) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      const lunes = lunesDeFechaLocal(d);
      if (!noAct.has(lunes)) {
        const r = hd.isHoliday(d);
        const festivo = Array.isArray(r) ? r.length > 0 : !!r;
        if (!festivo) set.add(fechaKeyDesdeDate(d));
      }
    }
    d.setDate(d.getDate() + 1);
  }
  diasLaborablesSetCache.set(key, set);
  return set;
}

/** Invalidar la caché (tests o cambios mayores). */
export function limpiarCacheDiasLaborables(): void {
  diasLaborablesSetCache.clear();
}

/**
 * Lun–vie, no en semana de descanso, no festivo.
 * Resuelve vía Set cacheado por año+config, en O(1).
 */
export function esDiaLaborable(dateKey: string, anio: number, config: PlanArbolConfigAnio | undefined): boolean {
  return diasLaborablesSetDelAnio(anio, config).has(dateKey);
}
