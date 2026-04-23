/** Utilidades para manejar claves de trimestre tipo "2026-Q2". */

export type TrimestreKey = string;

const KEY_REGEX = /^(\d{4})-Q([1-4])$/;

export function trimestreKey(year: number, q: 1 | 2 | 3 | 4): TrimestreKey {
  return `${year}-Q${q}`;
}

export function parseTrimestreKey(key: TrimestreKey): { year: number; q: 1 | 2 | 3 | 4 } | null {
  const m = KEY_REGEX.exec(key);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const q = parseInt(m[2], 10) as 1 | 2 | 3 | 4;
  if (!Number.isFinite(year)) return null;
  return { year, q };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Devuelve el rango [inicio, fin] del trimestre en formato YYYY-MM-DD (día primero y último). */
export function trimestreRango(key: TrimestreKey): { inicio: string; fin: string } | null {
  const parsed = parseTrimestreKey(key);
  if (!parsed) return null;
  const { year, q } = parsed;
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const endDay = new Date(year, endMonth, 0).getDate();
  return {
    inicio: `${year}-${pad(startMonth)}-01`,
    fin: `${year}-${pad(endMonth)}-${pad(endDay)}`,
  };
}

/** Fecha YYYY-MM-DD → clave de su trimestre. */
export function trimestreDeFecha(fecha: string): TrimestreKey | null {
  if (!fecha || fecha.length < 7) return null;
  const year = parseInt(fecha.slice(0, 4), 10);
  const month = parseInt(fecha.slice(5, 7), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const q = (Math.ceil(month / 3) as 1 | 2 | 3 | 4);
  return trimestreKey(year, q);
}

/** Dado un rango (inicio, fin), devuelve todas las claves de trimestre que toca. */
export function trimestresEntre(inicio: string | null | undefined, fin: string | null | undefined): TrimestreKey[] {
  if (!inicio && !fin) return [];
  const start = inicio ?? fin ?? "";
  const end = fin ?? inicio ?? "";
  const first = trimestreDeFecha(start);
  const last = trimestreDeFecha(end);
  if (!first || !last) return [];
  const a = parseTrimestreKey(first)!;
  const b = parseTrimestreKey(last)!;
  const result: TrimestreKey[] = [];
  let y = a.year, q = a.q;
  while (y < b.year || (y === b.year && q <= b.q)) {
    result.push(trimestreKey(y, q as 1 | 2 | 3 | 4));
    if (q === 4) { y += 1; q = 1; } else { q = (q + 1) as 1 | 2 | 3 | 4; }
    if (result.length > 40) break;
  }
  return result;
}

/** Dadas varias claves de trimestre, devuelve el rango mínimo que las cubre. */
export function fechasDesdeTrimestres(keys: TrimestreKey[]): { fechaInicio: string | null; fechaLimite: string | null } {
  if (!keys.length) return { fechaInicio: null, fechaLimite: null };
  const rangos = keys
    .map((k) => trimestreRango(k))
    .filter((r): r is { inicio: string; fin: string } => r !== null);
  if (!rangos.length) return { fechaInicio: null, fechaLimite: null };
  const inicios = rangos.map((r) => r.inicio).sort();
  const fines = rangos.map((r) => r.fin).sort();
  return { fechaInicio: inicios[0], fechaLimite: fines[fines.length - 1] };
}

/** Etiqueta corta "Q2 2026" para UI. */
export function etiquetaTrimestre(key: TrimestreKey): string {
  const parsed = parseTrimestreKey(key);
  if (!parsed) return key;
  return `Q${parsed.q} ${parsed.year}`;
}
