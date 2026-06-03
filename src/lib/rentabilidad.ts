/**
 * Rentabilidad por línea = ventas ÷ tiempo (€/hora), a nivel MENSUAL.
 *
 * Módulo PURO y testeable: no toca React ni el estado global. Recibe las
 * hojas (con sus `entregableIds`), los entregables y el mes ("YYYY-MM") y
 * reparte el tiempo registrado en las sesiones de cada entregable entre las
 * hojas a las que está vinculado.
 *
 * Decisiones de la usuaria respetadas aquí:
 *  - Periodo MENSUAL ("YYYY-MM"); una sesión pertenece al mes de su `inicioTs`.
 *  - Un entregable vinculado a varias hojas reparte su tiempo A PARTES
 *    IGUALES entre esas hojas (minutos / nº de hojas vinculadas).
 *  - Mantenimiento (`esMantenimiento`) cuenta como horas normales de la hoja
 *    (baja su €/hora); además se lleva la cuenta de cuántas horas vienen de
 *    mantenimiento para poder mostrarlo como dato informativo.
 *  - Sesiones con cronómetro ABIERTO (`finTs === null`) se IGNORAN.
 *  - Las PAUSAS se descuentan (reutilizamos `msEfectivos` de `duration.ts`).
 */
import { msEfectivos } from "./duration";
import { localDateKeyFromIso } from "./date-utils";
import type { Entregable, PrioridadEstrategica, SesionEntregable } from "./types";

/** Mes ("YYYY-MM") al que pertenece un ISO, en hora local (igual criterio
 *  que el resto de la app, vía `localDateKeyFromIso`). */
export function mesKeyDeIso(iso: string): string {
  return localDateKeyFromIso(iso).slice(0, 7);
}

/** Minutos efectivos de una sesión CERRADA, descontando pausas. Una sesión
 *  abierta (`finTs === null`) o sin inicio devuelve 0 (se ignora). */
export function minutosEfectivosSesion(
  sesion: Pick<SesionEntregable, "inicioTs" | "finTs" | "pausas">,
): number {
  if (!sesion.finTs) return 0;
  const ms = msEfectivos({
    inicioTs: sesion.inicioTs,
    finTs: sesion.finTs,
    pausas: sesion.pausas ?? [],
  });
  if (ms === null) return 0;
  return ms / 60000;
}

/** Suma de minutos de las sesiones de un entregable cuyo `inicioTs` cae en
 *  el mes dado, ignorando las abiertas. */
export function minutosDeSesionesEnMes(
  entregable: Pick<Entregable, "sesiones">,
  mesKey: string,
): number {
  const sesiones = entregable.sesiones ?? [];
  let total = 0;
  for (const s of sesiones) {
    if (!s.finTs) continue;
    if (mesKeyDeIso(s.inicioTs) !== mesKey) continue;
    total += minutosEfectivosSesion(s);
  }
  return total;
}

/** Subconjunto de `NodoArbol` que necesita este módulo (una hoja del árbol). */
export interface HojaRentabilidad {
  id: string;
  entregableIds?: string[];
  prioridadEstrategica?: PrioridadEstrategica;
}

/** Minutos de una hoja en un mes, con el desglose de cuántos vienen de
 *  entregables de mantenimiento. */
export interface TiempoHoja {
  minutos: number;
  minutosMantenimiento: number;
}

export interface TiempoPorHojaResultado {
  /** Por hoja (clave = id de la hoja). Sólo incluye hojas con tiempo > 0. */
  porHoja: Map<string, TiempoHoja>;
  /** Tiempo de entregables que NO están vinculados a ninguna hoja. */
  sinLinea: TiempoHoja;
}

function comoMapaEntregables(
  entregables: Entregable[] | ReadonlyMap<string, Entregable>,
): ReadonlyMap<string, Entregable> {
  if (entregables instanceof Map) return entregables;
  const m = new Map<string, Entregable>();
  for (const e of entregables as Entregable[]) m.set(e.id, e);
  return m;
}

/** Cuenta a cuántas hojas está vinculado cada entregable (denominador del
 *  reparto a partes iguales). */
export function contarHojasPorEntregable(
  hojas: HojaRentabilidad[],
): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const hoja of hojas) {
    for (const id of hoja.entregableIds ?? []) {
      cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
    }
  }
  return cuenta;
}

function acumular(destino: TiempoHoja, minutos: number, esMantenimiento: boolean) {
  destino.minutos += minutos;
  if (esMantenimiento) destino.minutosMantenimiento += minutos;
}

/**
 * Tiempo por hoja en un mes. El tiempo de un entregable compartido por
 * varias hojas se reparte a partes iguales (minutos / nº de hojas). Los
 * entregables sin hoja se reportan aparte en `sinLinea`.
 */
export function tiempoPorHojaEnMes(
  hojas: HojaRentabilidad[],
  entregables: Entregable[] | ReadonlyMap<string, Entregable>,
  mesKey: string,
): TiempoPorHojaResultado {
  const entregablesById = comoMapaEntregables(entregables);
  const cuentaHojas = contarHojasPorEntregable(hojas);

  const porHoja = new Map<string, TiempoHoja>();
  for (const hoja of hojas) {
    const acc: TiempoHoja = { minutos: 0, minutosMantenimiento: 0 };
    for (const id of hoja.entregableIds ?? []) {
      const entregable = entregablesById.get(id);
      if (!entregable) continue;
      const minutosMes = minutosDeSesionesEnMes(entregable, mesKey);
      if (minutosMes === 0) continue;
      const divisor = cuentaHojas.get(id) || 1;
      acumular(acc, minutosMes / divisor, !!entregable.esMantenimiento);
    }
    if (acc.minutos > 0) porHoja.set(hoja.id, acc);
  }

  const sinLinea: TiempoHoja = { minutos: 0, minutosMantenimiento: 0 };
  for (const entregable of entregablesById.values()) {
    if (cuentaHojas.has(entregable.id)) continue;
    const minutosMes = minutosDeSesionesEnMes(entregable, mesKey);
    if (minutosMes === 0) continue;
    acumular(sinLinea, minutosMes, !!entregable.esMantenimiento);
  }

  return { porHoja, sinLinea };
}

/** Rentabilidad de una hoja en un mes. `eurosPorHora` es null si horas === 0. */
export interface RentabilidadHoja {
  ventas: number;
  horas: number;
  eurosPorHora: number | null;
  horasMantenimiento: number;
  esFlor: boolean;
}

/** Combina ventas + tiempo (minutos) → €/hora. */
export function rentabilidadHojaDesdeTiempo(
  ventas: number,
  tiempo: TiempoHoja,
  esFlor: boolean,
): RentabilidadHoja {
  const horas = tiempo.minutos / 60;
  const horasMantenimiento = tiempo.minutosMantenimiento / 60;
  const eurosPorHora = horas > 0 ? ventas / horas : null;
  return { ventas, horas, eurosPorHora, horasMantenimiento, esFlor };
}

/**
 * Rentabilidad por hoja en un mes. `ventasDeHoja(id)` devuelve las ventas
 * (€) de la hoja en el mes (típicamente `realEfectivoEnPeriodoIdx`). Las
 * hojas sin tiempo registrado aparecen con horas = 0 y `eurosPorHora` null.
 */
export function rentabilidadPorHojaEnMes(
  hojas: HojaRentabilidad[],
  entregables: Entregable[] | ReadonlyMap<string, Entregable>,
  mesKey: string,
  ventasDeHoja: (hojaId: string) => number,
): { porHoja: Map<string, RentabilidadHoja>; sinLinea: TiempoHoja } {
  const tiempo = tiempoPorHojaEnMes(hojas, entregables, mesKey);
  const porHoja = new Map<string, RentabilidadHoja>();
  for (const hoja of hojas) {
    const t = tiempo.porHoja.get(hoja.id) ?? { minutos: 0, minutosMantenimiento: 0 };
    porHoja.set(
      hoja.id,
      rentabilidadHojaDesdeTiempo(
        ventasDeHoja(hoja.id),
        t,
        hoja.prioridadEstrategica === "flor",
      ),
    );
  }
  return { porHoja, sinLinea: tiempo.sinLinea };
}

/**
 * Versión por UNA hoja (cómodo para la UI, que renderiza hoja a hoja). Pasa
 * el conjunto completo de hojas para que el reparto a partes iguales conozca
 * a cuántas hojas está vinculado cada entregable compartido.
 */
export function rentabilidadDeHojaEnMes(
  hoja: HojaRentabilidad,
  todasLasHojas: HojaRentabilidad[],
  entregables: Entregable[] | ReadonlyMap<string, Entregable>,
  mesKey: string,
  ventas: number,
): RentabilidadHoja {
  const entregablesById = comoMapaEntregables(entregables);
  const cuentaHojas = contarHojasPorEntregable(todasLasHojas);
  const acc: TiempoHoja = { minutos: 0, minutosMantenimiento: 0 };
  for (const id of hoja.entregableIds ?? []) {
    const entregable = entregablesById.get(id);
    if (!entregable) continue;
    const minutosMes = minutosDeSesionesEnMes(entregable, mesKey);
    if (minutosMes === 0) continue;
    const divisor = cuentaHojas.get(id) || 1;
    acumular(acc, minutosMes / divisor, !!entregable.esMantenimiento);
  }
  return rentabilidadHojaDesdeTiempo(ventas, acc, hoja.prioridadEstrategica === "flor");
}
