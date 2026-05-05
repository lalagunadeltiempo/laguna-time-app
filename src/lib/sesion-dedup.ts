import type { AppState, Entregable, SesionEntregable } from "./types";
import { legacySesionId } from "./sesion-id";

/**
 * Antes del fix de `id` estable en `SesionEntregable`, el merge cloud↔local
 * identificaba sesiones por `inicioTs`. Cuando la usuaria editaba la hora
 * de inicio en local, la copia de la nube seguía con el `inicioTs` viejo;
 * al traerla, ambas pasaban como sesiones distintas y quedaban duplicadas
 * en el historial.
 *
 * El fix nuevo (id determinista) impide que el bug se repita, pero no
 * limpia los duplicados ya persistidos en la nube. Este helper hace la
 * limpieza retroactiva con heurísticas conservadoras: preferimos dejar
 * dos sesiones reales antes que tirar una de verdad.
 *
 * Reglas de detección (una pareja sólo se marca como duplicado si se
 * cumple alguna):
 *   - Comparten `finTs` con tolerancia de 1 minuto Y al menos un indicio
 *     extra (mismo autor o duraciones que se solapan). Mismo final exacto
 *     pero sin nada más en común no basta: dos miembros pueden cerrar a
 *     la misma hora dos sesiones distintas.
 *   - Una de las dos tiene duración >= 6h (heurística "rango imposible":
 *     las sesiones reales casi nunca pasan de 4h, los rangos largos casi
 *     siempre vienen de una hora editada mal) Y comparten algún indicio
 *     directo: mismo `finTs` (1 min) o intervalos que se solapan en
 *     tiempo. Sin solape ni mismo final no la tocamos: puede ser una
 *     sesión real distinta del mismo entregable.
 *
 * Tras detectar una pareja, decidimos quién sobrevive:
 *   - Si una tiene duración >= 6h, gana la otra (heurística rango raro).
 *   - Si las dos tienen duración razonable, gana la de menor duración:
 *     `SesionEntregable` no guarda `creado` ts, así que usamos la
 *     duración como proxy ("la edición posterior suele acortar").
 */

const ONE_MINUTE_MS = 60_000;
const SEIS_HORAS_MS = 6 * 60 * 60 * 1_000;

interface DedupResult {
  sesiones: SesionEntregable[];
  eliminadas: number;
}

interface PairDecision {
  drop: SesionEntregable;
  keep: SesionEntregable;
}

function tsMs(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Duración efectiva de la sesión en ms; `null` si no es comparable
 *  (sesión abierta o timestamps inválidos). Las pausas no se descuentan
 *  aquí: para detectar el bug nos basta con la ventana bruta
 *  `inicioTs → finTs`, que es exactamente lo que la usuaria mira y edita. */
function duracionMs(s: SesionEntregable): number | null {
  const ini = tsMs(s.inicioTs);
  const fin = tsMs(s.finTs);
  if (ini === null || fin === null) return null;
  if (fin <= ini) return null;
  return fin - ini;
}

function mismoFin(a: SesionEntregable, b: SesionEntregable): boolean {
  const fa = tsMs(a.finTs);
  const fb = tsMs(b.finTs);
  if (fa === null || fb === null) return false;
  return Math.abs(fa - fb) <= ONE_MINUTE_MS;
}

function haySolape(a: SesionEntregable, b: SesionEntregable): boolean {
  const ai = tsMs(a.inicioTs);
  const af = tsMs(a.finTs);
  const bi = tsMs(b.inicioTs);
  const bf = tsMs(b.finTs);
  if (ai === null || af === null || bi === null || bf === null) return false;
  return ai < bf && bi < af;
}

function mismoAutor(a: SesionEntregable, b: SesionEntregable): boolean {
  const xa = (a.autor ?? "").trim();
  const xb = (b.autor ?? "").trim();
  if (!xa || !xb) return false;
  return xa === xb;
}

/**
 * Decide si dos sesiones podrían pertenecer al mismo miembro. Vale para
 * "ambas explícitas con el mismo `autor`" o "al menos una sin autor"
 * (sesiones legacy anteriores a la migración que añadió el campo). El
 * caso que NO queremos colapsar es "autores explícitos distintos":
 * representa trabajo paralelo de dos miembros y debe mantenerse.
 */
function autorCompatible(a: SesionEntregable, b: SesionEntregable): boolean {
  const xa = (a.autor ?? "").trim();
  const xb = (b.autor ?? "").trim();
  if (!xa || !xb) return true;
  return xa === xb;
}

function decidirPareja(a: SesionEntregable, b: SesionEntregable): PairDecision | null {
  // Sesiones en curso (sin finTs) no se tocan: son el cronómetro vivo.
  if (a.finTs === null || b.finTs === null) return null;

  const dA = duracionMs(a);
  const dB = duracionMs(b);
  if (dA === null || dB === null) return null;

  const finIgual = mismoFin(a, b);
  const solapan = haySolape(a, b);
  const autorIgual = mismoAutor(a, b);
  const autorOk = autorCompatible(a, b);

  // Si los autores son explícitamente distintos no tocamos la pareja:
  // representa trabajo paralelo de dos miembros y queremos preservarlo
  // aunque cierren a la misma hora o solapen unos minutos.
  if (!autorOk) return null;

  // Heurística "rango imposible": una de las dos pasa de 6h.
  // Sólo aplica si comparten algún indicio temporal directo, para no
  // tirar sesiones largas que pertenecen a momentos distintos del día.
  const aLarga = dA >= SEIS_HORAS_MS;
  const bLarga = dB >= SEIS_HORAS_MS;
  if (aLarga !== bLarga && (finIgual || solapan)) {
    return aLarga ? { drop: a, keep: b } : { drop: b, keep: a };
  }

  // Mismo `finTs` (con tolerancia) más al menos un indicio extra:
  // mismo autor o duraciones que se solapan. Mismo `finTs` ya implica
  // solape geométrico (los dos intervalos comparten su instante final),
  // pero la regla queda explícita para legibilidad.
  if (finIgual && (autorIgual || solapan)) {
    // Sin `creado` ts en la sesión: usamos duración como proxy. La de
    // duración menor suele ser la versión "real" tras la edición.
    if (dA <= dB) return { drop: b, keep: a };
    return { drop: a, keep: b };
  }

  return null;
}

/**
 * Asigna `id` determinista a las sesiones que no lo tengan, calculado
 * con `legacySesionId` sobre los timestamps finales (post-dedup). Las
 * que ya tienen id se conservan tal cual: no las reescribimos para no
 * romper merges futuros.
 */
function asegurarIds(entregableId: string, sesiones: SesionEntregable[]): SesionEntregable[] {
  return sesiones.map((s) => {
    if (s.id) return s;
    return { ...s, id: legacySesionId(entregableId, s) };
  });
}

export function dedupSesionesEntregable(
  entregableId: string,
  sesiones: SesionEntregable[] | undefined,
): DedupResult {
  const lista: SesionEntregable[] = Array.isArray(sesiones) ? [...sesiones] : [];
  if (lista.length <= 1) {
    return { sesiones: asegurarIds(entregableId, lista), eliminadas: 0 };
  }

  const eliminadas = new Set<number>();
  for (let i = 0; i < lista.length; i++) {
    if (eliminadas.has(i)) continue;
    for (let j = i + 1; j < lista.length; j++) {
      if (eliminadas.has(j)) continue;
      const decision = decidirPareja(lista[i], lista[j]);
      if (!decision) continue;
      // Identificamos al perdedor por referencia para mapearlo a su
      // índice en la lista actual (no podemos mutar la lista durante
      // la iteración: necesitamos los índices estables para la O(n²)).
      const idxDrop = decision.drop === lista[i] ? i : j;
      eliminadas.add(idxDrop);
      if (idxDrop === i) break;
    }
  }

  if (eliminadas.size === 0) {
    return { sesiones: asegurarIds(entregableId, lista), eliminadas: 0 };
  }

  const supervivientes = lista.filter((_, idx) => !eliminadas.has(idx));
  return {
    sesiones: asegurarIds(entregableId, supervivientes),
    eliminadas: eliminadas.size,
  };
}

/**
 * Versión "para reducer/migración" del dedup. Devuelve la lista de
 * entregables con cambios y cuántas sesiones se eliminaron en total.
 * Pura: no muta `state`, no mira al reloj. Sirve tanto para la
 * migración v27 como para tests aislados sin tocar `runMigrations`.
 */
export interface DedupEnEstadoResultado {
  cambios: { id: string; sesiones: SesionEntregable[] }[];
  eliminadasTotal: number;
}

export function planearDedupSesionesEnEstado(state: AppState): DedupEnEstadoResultado {
  const cambios: { id: string; sesiones: SesionEntregable[] }[] = [];
  let eliminadasTotal = 0;
  for (const ent of state.entregables as Entregable[]) {
    const sesiones = ent.sesiones ?? [];
    if (sesiones.length <= 1) continue;
    const r = dedupSesionesEntregable(ent.id, sesiones);
    if (r.eliminadas === 0) continue;
    eliminadasTotal += r.eliminadas;
    cambios.push({ id: ent.id, sesiones: r.sesiones });
  }
  return { cambios, eliminadasTotal };
}
