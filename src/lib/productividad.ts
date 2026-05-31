import type { FranjaDia, RegistroProductividad } from "./types";

/** ¿Están las tres dimensiones puntuadas (1..5)? La productividad solo existe
 *  cuando hay energía, foco y ánimo. */
export function registroCompleto(r: RegistroProductividad): boolean {
  return r.energia > 0 && r.foco > 0 && r.animo > 0;
}

/** Productividad derivada de un registro: media de energía, foco y ánimo (1..5). */
export function productividadDeRegistro(r: RegistroProductividad): number {
  return (r.energia + r.foco + r.animo) / 3;
}

/** Clamp de una puntuación al rango 1..5 (entero). */
export function clampPuntuacion(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/** Busca el registro de una franja en un día concreto para un autor. */
export function registroDe(
  registros: RegistroProductividad[],
  fecha: string,
  franjaId: string,
  autor: string,
): RegistroProductividad | undefined {
  return registros.find(
    (r) => r.fecha === fecha && r.franjaId === franjaId && r.autor === autor,
  );
}

export interface CeldaProductividad {
  franjaId: string;
  /** Día de la semana 1=lunes .. 7=domingo. */
  diaSemana: number;
  /** Media de productividad en esa celda (1..5) o null si no hay registros. */
  media: number | null;
  /** Número de registros agregados. */
  n: number;
}

/** Día de la semana 1=lunes..7=domingo de una clave "YYYY-MM-DD" (hora local). */
export function diaSemanaDeFecha(fecha: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return 0;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getDay() || 7;
}

/**
 * Construye la matriz franja × día de la semana con la media de productividad
 * de cada celda. Filtra por autor si se indica.
 */
export function matrizFranjaPorDia(
  registros: RegistroProductividad[],
  franjas: FranjaDia[],
  autor?: string | null,
): CeldaProductividad[][] {
  const relevantes = (autor ? registros.filter((r) => r.autor === autor) : registros).filter(registroCompleto);
  const acc = new Map<string, { suma: number; n: number }>();
  for (const r of relevantes) {
    const dia = diaSemanaDeFecha(r.fecha);
    if (dia === 0) continue;
    const key = `${r.franjaId}|${dia}`;
    const prev = acc.get(key) ?? { suma: 0, n: 0 };
    prev.suma += productividadDeRegistro(r);
    prev.n += 1;
    acc.set(key, prev);
  }
  return franjas.map((f) =>
    [1, 2, 3, 4, 5, 6, 7].map((dia) => {
      const cell = acc.get(`${f.id}|${dia}`);
      return {
        franjaId: f.id,
        diaSemana: dia,
        media: cell && cell.n > 0 ? cell.suma / cell.n : null,
        n: cell?.n ?? 0,
      };
    }),
  );
}

/** Media de productividad por franja (a lo largo de todos los días registrados). */
export function promedioPorFranja(
  registros: RegistroProductividad[],
  franjas: FranjaDia[],
  autor?: string | null,
): { franjaId: string; media: number | null; n: number }[] {
  const relevantes = (autor ? registros.filter((r) => r.autor === autor) : registros).filter(registroCompleto);
  return franjas.map((f) => {
    const delaFranja = relevantes.filter((r) => r.franjaId === f.id);
    if (delaFranja.length === 0) return { franjaId: f.id, media: null, n: 0 };
    const suma = delaFranja.reduce((acc, r) => acc + productividadDeRegistro(r), 0);
    return { franjaId: f.id, media: suma / delaFranja.length, n: delaFranja.length };
  });
}
