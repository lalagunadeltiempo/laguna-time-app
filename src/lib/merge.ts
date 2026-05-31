import type {
  AppState,
  MensajeEntregable,
  NodoArbol,
  Nota,
  PlanArbolConfigAnio,
  SesionEntregable,
  TrimestreKey,
} from "./types";
import { EMPTY_ARBOL } from "./types";
import { legacySesionId } from "./sesion-id";
import { dedupSesionesEntregable } from "./sesion-dedup";

/** Clave canónica del tombstone de relación MAPA→Árbol (entregable ↔ hoja). */
export function entregableHojaTombstoneKey(hojaId: string, entregableId: string): string {
  return `${hojaId}::${entregableId}`;
}

/**
 * Une dos copias del mismo `NodoArbol` viniendo de clientes distintos
 * sin perder los campos rellenados por el más reciente. Patrón análogo
 * al que ya se usa para `mesesCerradosTs` y `semanasNoActivasTs` en
 * `unionConfigs`, pero a nivel de nodo entero.
 *
 * Reglas:
 * 1. Si AMBOS nodos tienen `actualizado`, gana el más reciente (string
 *    ISO se compara directamente). El ganador aporta TODOS sus campos
 *    (incluyendo `entregableIds`) — el reducer ahora sella `actualizado`
 *    en cada mutación, así que cualquier copia "sin un campo" tras una
 *    edición legítima ya viaja con su nuevo `actualizado`.
 * 2. Si SOLO UNO tiene `actualizado`, gana ese (mismo razonamiento).
 * 3. Si NINGUNO tiene `actualizado` (caso legacy: estados anteriores a
 *    este bloque o tests viejos), no podemos comparar tiempos, así que
 *    hacemos un merge campo a campo conservador donde para cada campo
 *    crítico gana el que NO sea `undefined`. Si ambos están definidos
 *    pero distintos, gana `y` (segundo argumento). Documentamos por qué:
 *      - `mergeStates(stateToSave, cloudState)` desde `saveStateCloud`:
 *        `y` = cloudState (remoto). Desde el punto de vista de la
 *        usuaria, lo que ya estaba en cloud cuando hicimos el GET es
 *        información que pudo aportar otra sesión; preferimos no
 *        sobrescribirla con un estado local viejo.
 *      - `mergeStates(cloudResult.data, localState)` desde `init`:
 *        `y` = localState. Si el local tiene un valor (no undefined)
 *        que cloud no tenía, es porque la usuaria lo escribió antes
 *        en esta sesión y aún no se subió.
 *      - `mergeStates(stateRef.current, result.data)` desde
 *        `pullAndMerge` y `mergeStates(merged, _lastCloudSnapshot)`
 *        desde `flushPendingCloudSave`: `y` es cloud/snapshot remoto,
 *        misma lógica que `saveStateCloud`.
 *    En todos los casos, dar preferencia a `y` sobre `x` cuando ambos
 *    están definidos es defensivo: en ausencia de `actualizado` no
 *    podemos saber quién es más reciente, así que damos prioridad al
 *    lado que `mergeStates` históricamente "perdía" para no replicar
 *    el bug §1 del audit.
 *
 * NOTA: para `entregableIds` aplicamos los tombstones de
 * `deleted.entregableHojaLinks` (Bloque 3) tanto en el camino LWW como
 * en el camino conservador, para que un borrado de vínculo no se
 * resucite al unir.
 */
export function preferNodoLWW(
  x: NodoArbol,
  y: NodoArbol,
  tombstoneTsByLink: Map<string, string>,
): NodoArbol {
  const tx = x.actualizado;
  const ty = y.actualizado;

  // Caso 1 + 2: al menos uno tiene `actualizado`. Gana el más reciente.
  if (tx || ty) {
    let winner: NodoArbol;
    if (tx && ty) winner = tx >= ty ? x : y;
    else if (tx) winner = x;
    else winner = y;
    // Filtrar entregableIds del ganador respetando tombstones más recientes.
    const filtered = filtrarEntregableIdsConTombstones(
      winner.id,
      winner.entregableIds,
      winner.actualizado,
      tombstoneTsByLink,
    );
    if (filtered === winner.entregableIds) return winner;
    return { ...winner, entregableIds: filtered };
  }

  // Caso 3: ninguno tiene `actualizado` → merge campo a campo conservador.
  const merged: NodoArbol = { ...x };
  // Campos donde "ambos definidos pero distintos → gana y" / "uno definido → gana ese".
  const preferDefined = <K extends keyof NodoArbol>(key: K): void => {
    const vx = x[key];
    const vy = y[key];
    if (vy !== undefined) merged[key] = vy;
    else if (vx !== undefined) merged[key] = vx;
  };
  preferDefined("nombre");
  preferDefined("descripcion");
  preferDefined("notaAnioAnterior");
  preferDefined("metaValor");
  preferDefined("metaUnidad");
  preferDefined("parentId");
  preferDefined("orden");
  preferDefined("tipo");
  preferDefined("cadencia");
  preferDefined("relacionConPadre");
  preferDefined("contadorModo");
  preferDefined("anio");
  // `creado` no se toca: se mantiene el del primer arg (`x`), idéntico
  // al del segundo en condiciones normales (es el ts de creación del
  // nodo). En estados legacy con timestamps distintos preferimos no
  // alterarlo para no inventar fechas.

  // metaPorTrimestre: unión por trimestre, gana el `y` cuando ambos definen el mismo Q.
  const mptX = x.metaPorTrimestre;
  const mptY = y.metaPorTrimestre;
  if (mptX || mptY) {
    const out: Partial<Record<TrimestreKey, number>> = {};
    const keys = new Set<TrimestreKey>([
      ...Object.keys(mptX ?? {}) as TrimestreKey[],
      ...Object.keys(mptY ?? {}) as TrimestreKey[],
    ]);
    for (const k of keys) {
      const vx = mptX?.[k];
      const vy = mptY?.[k];
      if (vy !== undefined) out[k] = vy;
      else if (vx !== undefined) out[k] = vx;
    }
    merged.metaPorTrimestre = Object.keys(out).length > 0 ? out : undefined;
  }

  // entregableIds y proyectoIds: UNIÓN. Para entregableIds aplicamos
  // tombstones; para proyectoIds aún no hay tombstones (no es un path
  // observado de pérdida en producción), conservar la unión simple.
  const unionEnt = unirIds(x.entregableIds, y.entregableIds);
  const filteredEnt = filtrarEntregableIdsConTombstones(
    x.id,
    unionEnt,
    undefined, // sin actualizado conocido: todo tombstone gana.
    tombstoneTsByLink,
  );
  merged.entregableIds = filteredEnt && filteredEnt.length > 0 ? filteredEnt : undefined;
  const unionPr = unirIds(x.proyectoIds, y.proyectoIds);
  if (unionPr && unionPr.length > 0) merged.proyectoIds = unionPr;

  return merged;
}

function unirIds(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  const sa = a ?? [];
  const sb = b ?? [];
  if (sa.length === 0 && sb.length === 0) return undefined;
  return Array.from(new Set([...sa, ...sb]));
}

/**
 * Filtra `entregableIds` quitando aquellos cuyo tombstone
 * `${nodoId}::${entregableId}` tiene fecha posterior a la marca
 * `nodoActualizado`. Si el nodo no tiene `actualizado`, cualquier
 * tombstone gana (no podemos saber si el vínculo se reañadió después
 * del borrado).
 *
 * Devuelve la misma referencia que el input cuando nada se filtra,
 * para que el caller pueda detectar "no cambió" sin allocar.
 */
function filtrarEntregableIdsConTombstones(
  nodoId: string,
  entregableIds: string[] | undefined,
  nodoActualizado: string | undefined,
  tombstoneTsByLink: Map<string, string>,
): string[] | undefined {
  if (!entregableIds || entregableIds.length === 0) return entregableIds;
  if (tombstoneTsByLink.size === 0) return entregableIds;
  let cambiado = false;
  const out: string[] = [];
  for (const eid of entregableIds) {
    const ts = tombstoneTsByLink.get(entregableHojaTombstoneKey(nodoId, eid));
    if (!ts) {
      out.push(eid);
      continue;
    }
    // Si el nodo no tiene `actualizado` o el tombstone es estrictamente
    // posterior, el borrado gana. En empate exacto (improbable) gana
    // también el tombstone: si la usuaria desvinculó al mismo ms, mejor
    // no resucitar nada.
    if (!nodoActualizado || ts >= nodoActualizado) {
      cambiado = true;
      continue;
    }
    out.push(eid);
  }
  return cambiado ? out : entregableIds;
}

/**
 * Une dos `Record<string, string>` con LWW por clave: para cada clave
 * presente en alguno de los dos, gana el ts más reciente (string ISO).
 * Usado para `deleted.entregableHojaLinks` y, si hiciese falta, otros
 * registros de tombstones con timestamp.
 */
function mergeTsRecords(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!a && !b) return undefined;
  const out: Record<string, string> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) {
    const prev = out[k];
    if (!prev || v >= prev) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function stripNotasTombstones<T extends { notas?: Nota[] }>(item: T, delNotas: Set<string>): T {
  const arr = item.notas;
  if (!arr?.length) return item;
  const next = arr.filter((n) => !delNotas.has(n.id));
  if (next.length === arr.length) return item;
  return { ...item, notas: next };
}

/** Combina dos versiones del campo `contexto.notas` (string libre) sin
 *  perder contenido. Si son iguales, devolvemos uno. Si uno es prefijo o
 *  contiene al otro, nos quedamos con el más completo (asumimos que quien
 *  escribió más aún conserva lo anterior). En cualquier otro caso, los
 *  concatenamos con un separador para que el usuario vea ambas versiones
 *  y decida a mano cuál conservar. Mejor ruido que pérdida silenciosa. */
export function combinarNotasTexto(a: string, b: string): string {
  const ta = (a ?? "").trim();
  const tb = (b ?? "").trim();
  if (ta === tb) return a.length >= b.length ? a : b;
  if (!ta) return b;
  if (!tb) return a;
  if (ta.startsWith(tb) || ta.endsWith(tb) || ta.includes(tb)) return a;
  if (tb.startsWith(ta) || tb.endsWith(ta) || tb.includes(ta)) return b;
  // Los dos textos aportan información única: los concatenamos en el
  // orden winner→loser con una separación visible. Evitamos duplicar un
  // separador ya presente para no crecer en cada merge.
  const sep = "\n\n--- (también) ---\n\n";
  if (a.includes(sep) && a.includes(b)) return a;
  if (b.includes(sep) && b.includes(a)) return b;
  return `${a}${sep}${b}`;
}

/**
 * Promueve `mesesCerrados: string[]` (legacy pre-migración 22) a
 * `mesesCerradosTs` con timestamp epoch, para que la lógica LWW funcione
 * de forma uniforme cuando un cliente sin migrar pushea estado a la nube.
 * No muta la entrada.
 */
function readMesesCerradosTs(c: PlanArbolConfigAnio): Record<string, string> {
  const ts: Record<string, string> = { ...(c.mesesCerradosTs ?? {}) };
  for (const mk of c.mesesCerrados ?? []) {
    if (!ts[mk]) ts[mk] = "1970-01-01T00:00:00.000Z";
  }
  return ts;
}

/**
 * Análogo a `readMesesCerradosTs` para semanas no activas: promueve
 * `semanasNoActivas: string[]` (legacy pre-migración 25) a ts epoch, así
 * un toggle posterior siempre gana en LWW.
 */
function readSemanasNoActivasTs(c: PlanArbolConfigAnio): Record<string, string> {
  const ts: Record<string, string> = { ...(c.semanasNoActivasTs ?? {}) };
  for (const mk of c.semanasNoActivas ?? []) {
    if (!ts[mk]) ts[mk] = "1970-01-01T00:00:00.000Z";
  }
  return ts;
}

function unionConfigs(a: PlanArbolConfigAnio[], b: PlanArbolConfigAnio[]): PlanArbolConfigAnio[] {
  const map = new Map<number, PlanArbolConfigAnio>();
  for (const c of [...a, ...b]) {
    const prev = map.get(c.anio);
    if (!prev) {
      map.set(c.anio, { ...c });
    } else {
      // Cierres: LWW por mes. Para cada mesKey de la unión de cierres y
      // aperturas, gana el ts más reciente; si la apertura es estrictamente
      // posterior al cierre, el mes queda abierto.
      const cerradosPrev = readMesesCerradosTs(prev);
      const cerradosCur = readMesesCerradosTs(c);
      const aperturasPrev = prev.mesesAbiertosTs ?? {};
      const aperturasCur = c.mesesAbiertosTs ?? {};

      const mesesCerradosTs: Record<string, string> = {};
      const mesesAbiertosTs: Record<string, string> = {};

      const todos = new Set<string>([
        ...Object.keys(cerradosPrev),
        ...Object.keys(cerradosCur),
        ...Object.keys(aperturasPrev),
        ...Object.keys(aperturasCur),
      ]);

      for (const mk of todos) {
        const cierreTs = (() => {
          const t1 = cerradosPrev[mk];
          const t2 = cerradosCur[mk];
          if (t1 && t2) return t1 >= t2 ? t1 : t2;
          return t1 ?? t2;
        })();
        const aperturaTs = (() => {
          const t1 = aperturasPrev[mk];
          const t2 = aperturasCur[mk];
          if (t1 && t2) return t1 >= t2 ? t1 : t2;
          return t1 ?? t2;
        })();
        if (cierreTs && aperturaTs) {
          if (aperturaTs >= cierreTs) {
            // La apertura es más reciente: tombstone gana, mes abierto.
            mesesAbiertosTs[mk] = aperturaTs;
          } else {
            mesesCerradosTs[mk] = cierreTs;
          }
        } else if (cierreTs) {
          mesesCerradosTs[mk] = cierreTs;
        } else if (aperturaTs) {
          mesesAbiertosTs[mk] = aperturaTs;
        }
      }

      // Semanas no activas: LWW por mondayKey, mismo patrón que cierres
      // de mes. Sin esto, desmarcar un descanso en local resucitaba al
      // primer pull porque la unión de strings no expresa eliminaciones.
      const semCerradosPrev = readSemanasNoActivasTs(prev);
      const semCerradosCur = readSemanasNoActivasTs(c);
      const semAperturasPrev = prev.semanasActivasTs ?? {};
      const semAperturasCur = c.semanasActivasTs ?? {};

      const semanasNoActivasTs: Record<string, string> = {};
      const semanasActivasTs: Record<string, string> = {};
      const todosSem = new Set<string>([
        ...Object.keys(semCerradosPrev),
        ...Object.keys(semCerradosCur),
        ...Object.keys(semAperturasPrev),
        ...Object.keys(semAperturasCur),
      ]);
      for (const mk of todosSem) {
        const cierreTs = (() => {
          const t1 = semCerradosPrev[mk];
          const t2 = semCerradosCur[mk];
          if (t1 && t2) return t1 >= t2 ? t1 : t2;
          return t1 ?? t2;
        })();
        const aperturaTs = (() => {
          const t1 = semAperturasPrev[mk];
          const t2 = semAperturasCur[mk];
          if (t1 && t2) return t1 >= t2 ? t1 : t2;
          return t1 ?? t2;
        })();
        if (cierreTs && aperturaTs) {
          if (aperturaTs >= cierreTs) semanasActivasTs[mk] = aperturaTs;
          else semanasNoActivasTs[mk] = cierreTs;
        } else if (cierreTs) {
          semanasNoActivasTs[mk] = cierreTs;
        } else if (aperturaTs) {
          semanasActivasTs[mk] = aperturaTs;
        }
      }

      // Piso mensual: LWW por mesKey sin tombstones. Tratamos
      // 0/undefined/no-presente como "sin piso" (semánticamente equivalente).
      // Si un cliente A pone 5_000 y otro B pone 8_000 sin ts, gana B (cur)
      // por simplicidad — la concurrencia en este campo es muy baja porque
      // se configura una vez al año.
      const pisoPrev = prev.pisoMensual ?? {};
      const pisoCur = c.pisoMensual ?? {};
      const pisoMensual: Record<string, number> = {};
      for (const mk of new Set([...Object.keys(pisoPrev), ...Object.keys(pisoCur)])) {
        const vCur = pisoCur[mk];
        const vPrev = pisoPrev[mk];
        const valor = vCur !== undefined && Number.isFinite(vCur) && vCur > 0
          ? vCur
          : vPrev !== undefined && Number.isFinite(vPrev) && vPrev > 0
            ? vPrev
            : undefined;
        if (valor !== undefined) pisoMensual[mk] = valor;
      }

      // Distribución mensual: sin tombstones. La concurrencia es muy baja
      // (la usuaria la cambia al planificar el año) y "ausente" significa
      // "diasLaborables" (default histórico), por lo que conservar el
      // valor non-undefined del más reciente (cur) es suficiente.
      const distribucionMensual = c.distribucionMensual ?? prev.distribucionMensual;

      map.set(c.anio, {
        anio: c.anio,
        comunidadAutonoma: c.comunidadAutonoma ?? prev.comunidadAutonoma,
        ...(Object.keys(mesesCerradosTs).length > 0 ? { mesesCerradosTs } : {}),
        ...(Object.keys(mesesAbiertosTs).length > 0 ? { mesesAbiertosTs } : {}),
        ...(Object.keys(semanasNoActivasTs).length > 0 ? { semanasNoActivasTs } : {}),
        ...(Object.keys(semanasActivasTs).length > 0 ? { semanasActivasTs } : {}),
        ...(Object.keys(pisoMensual).length > 0 ? { pisoMensual } : {}),
        ...(distribucionMensual !== undefined ? { distribucionMensual } : {}),
      });
    }
  }
  return [...map.values()].sort((x, y) => x.anio - y.anio);
}

/**
 * Une dos estados por id, respetando tombstones (`deleted`).
 * - proyectos, resultados, entregables, pasos, plantillas, pasosActivos se filtran por la unión de tombstones.
 * - entregables prefieren el que más días hechos tenga (merge conservador).
 * - pasos prefieren el que esté cerrado; a igualdad, el de inicioTs más reciente.
 * - tombstones se unen.
 */
export function mergeStates(a: AppState, b: AppState): AppState {
  function unionById<T extends { id: string }>(arrA: T[], arrB: T[], prefer?: (x: T, y: T) => T): T[] {
    const map = new Map<string, T>();
    for (const item of arrA) map.set(item.id, item);
    for (const item of arrB) {
      const existing = map.get(item.id);
      if (!existing) { map.set(item.id, item); continue; }
      map.set(item.id, prefer ? prefer(existing, item) : existing);
    }
    return Array.from(map.values());
  }

  /**
   * Merge profundo: garantiza que ningún campo con id (notas, review, sesiones, implicados)
   * se pierda porque el objeto al que pertenece "pierde" el prefer top-level. El ganador del
   * prefer aporta el resto de campos escalares (nombre, estado, diasHechos, fechas, etc.).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unirNotas = (a: any, b: any) => {
    const mA: Nota[] = Array.isArray(a) ? a : [];
    const mB: Nota[] = Array.isArray(b) ? b : [];
    const map = new Map<string, Nota>();
    for (const n of mA) map.set(n.id, n);
    for (const n of mB) {
      const prev = map.get(n.id);
      // Si ya existe, nos quedamos con el más reciente por creadoTs.
      if (!prev || (n.creadoTs ?? "") > (prev.creadoTs ?? "")) map.set(n.id, n);
    }
    return Array.from(map.values()).sort((x, y) => (x.creadoTs ?? "").localeCompare(y.creadoTs ?? ""));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unirPorClave = (a: any, b: any, keyFn: (x: any) => string) => {
    const arrA: unknown[] = Array.isArray(a) ? a : [];
    const arrB: unknown[] = Array.isArray(b) ? b : [];
    const map = new Map<string, unknown>();
    for (const it of arrA) map.set(keyFn(it), it);
    for (const it of arrB) if (!map.has(keyFn(it))) map.set(keyFn(it), it);
    return Array.from(map.values());
  };

  /**
   * Une las preparaciones de trabajo por usuario sin pisarlas, para que si un
   * cliente añade días y otro cierra pasos (sube `diasHechos`), al mergear no
   * se pierda la preparación semanal del primero.
   */
  const elegirPorUsuarioRespetandoWinner = <T,>(
    winner: Record<string, T> | undefined,
    loser: Record<string, T> | undefined,
  ): Record<string, T> | undefined => {
    const w = winner ?? {};
    const l = loser ?? {};
    const users = new Set<string>([...Object.keys(w), ...Object.keys(l)]);
    if (users.size === 0) return undefined;
    const out: Record<string, T> = {};
    for (const u of users) {
      if (Object.prototype.hasOwnProperty.call(w, u)) out[u] = w[u];
      else out[u] = l[u];
    }
    return out;
  };

  const unirDiasPorUsuario = (
    winner: Record<string, string[]> | undefined,
    loser: Record<string, string[]> | undefined,
  ): Record<string, string[]> | undefined => {
    const selected = elegirPorUsuarioRespetandoWinner(winner, loser);
    if (!selected) return undefined;
    const out: Record<string, string[]> = {};
    for (const [u, dias] of Object.entries(selected)) {
      out[u] = Array.from(new Set(dias ?? [])).sort();
    }
    return out;
  };

  const unirPlanInicioPorUsuario = (
    winner: Record<string, string | null> | undefined,
    loser: Record<string, string | null> | undefined,
  ): Record<string, string | null> | undefined => {
    return elegirPorUsuarioRespetandoWinner(winner, loser);
  };

  const mergeSesiones = (
    entregableId: string,
    winnerSesiones: SesionEntregable[] | undefined,
    loserSesiones: SesionEntregable[] | undefined,
  ): SesionEntregable[] => {
    const out = new Map<string, SesionEntregable>();
    const canonicalId = (s: SesionEntregable): string => s.id ?? legacySesionId(entregableId, s);
    for (const s of winnerSesiones ?? []) {
      out.set(canonicalId(s), { ...s, id: canonicalId(s) });
    }
    for (const s of loserSesiones ?? []) {
      const id = canonicalId(s);
      if (!out.has(id)) out.set(id, { ...s, id });
    }
    const unidas = Array.from(out.values()).sort((a, b) => a.inicioTs.localeCompare(b.inicioTs));
    // Tras unir por id canónico, pasamos un dedup heurístico para
    // colapsar copias huérfanas legacy: sesiones cuyo `inicioTs` cambió
    // tras una edición pre-fix y por tanto generan ids distintos en
    // local y en la nube. Sin esto el bug de "Preparación de Taller"
    // sigue apareciendo aunque ya nadie genere nuevos duplicados.
    return dedupSesionesEntregable(entregableId, unidas).sesiones;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preferMore = (x: any, y: any) => {
    const winner = (x.diasHechos ?? 0) >= (y.diasHechos ?? 0) ? x : y;
    const loser = winner === x ? y : x;
    // Si `winner` no tiene review y `loser` sí, lo adoptamos; si ambos tienen, gana la fecha más reciente.
    const reviewW = winner.review;
    const reviewL = loser.review;
    const review =
      reviewW && reviewL
        ? (reviewW.fecha ?? "") >= (reviewL.fecha ?? "")
          ? reviewW
          : reviewL
        : reviewW ?? reviewL ?? undefined;
    const notas = unirNotas(x.notas, y.notas);
    const winnerEsX = winner === x;
    const sesiones = mergeSesiones(
      winner.id,
      winnerEsX ? x.sesiones : y.sesiones,
      winnerEsX ? y.sesiones : x.sesiones,
    );
    const implicados = unirPorClave(x.implicados, y.implicados, (i) => (i as { nombre?: string }).nombre ?? "");
    // contexto escalar (notas:string): antes guardábamos el MÁS LARGO y
    // descartábamos el otro, lo que podía hacer desaparecer texto escrito
    // por el otro cliente. Ahora, si ambos textos son distintos, los
    // CONSERVAMOS concatenados con un separador para no perder trabajo.
    // Si uno es prefijo del otro, nos quedamos con el más completo.
    const ctxW = winner.contexto;
    const ctxL = loser.contexto;
    let contexto = ctxW;
    if (ctxW && ctxL) {
      const tW = String(ctxW.notas ?? "");
      const tL = String(ctxL.notas ?? "");
      const notasCombinadas = combinarNotasTexto(tW, tL);
      contexto = {
        urls: unirPorClave(ctxW.urls, ctxL.urls, (u) => (u as { url?: string }).url ?? JSON.stringify(u)),
        apps: Array.from(new Set([...(ctxW.apps ?? []), ...(ctxL.apps ?? [])])),
        notas: notasCombinadas,
      };
    }
    // Pizarras por usuario: merge por clave, conservando el texto más largo por miembro.
    const pizW: Record<string, string> = winner.pizarraByUser ?? {};
    const pizL: Record<string, string> = loser.pizarraByUser ?? {};
    let pizarraByUser: Record<string, string> | undefined;
    const users = new Set([...Object.keys(pizW), ...Object.keys(pizL)]);
    if (users.size > 0) {
      pizarraByUser = {};
      for (const u of users) {
        const tW = String(pizW[u] ?? "");
        const tL = String(pizL[u] ?? "");
        pizarraByUser[u] = tW.length >= tL.length ? tW : tL;
      }
    }
    // Preparación semanal por usuario: nunca debe perderse. El ganador
    // top-level puede traer `diasHechos` mayor sin traer los días que el
    // otro cliente preparó (preparación semanal vs. trabajo diario son
    // acciones desacopladas).
    const diasPlanificadosByUser = unirDiasPorUsuario(winner.diasPlanificadosByUser, loser.diasPlanificadosByUser);
    const planInicioTsByUser = unirPlanInicioPorUsuario(winner.planInicioTsByUser, loser.planInicioTsByUser);
    const semanasActivasRaw = Array.isArray(winner.semanasActivas)
      ? winner.semanasActivas
      : Array.isArray(loser.semanasActivas)
        ? loser.semanasActivas
        : [];
    const semanasActivas = Array.from(new Set<string>(semanasActivasRaw)).sort();
    const semana = winner.semana !== undefined ? winner.semana : (loser.semana ?? null);

    return {
      ...winner,
      semana,
      semanasActivas,
      ...(diasPlanificadosByUser ? { diasPlanificadosByUser } : {}),
      ...(planInicioTsByUser ? { planInicioTsByUser } : {}),
      ...(notas.length || winner.notas ? { notas } : {}),
      ...(review ? { review } : {}),
      ...(sesiones.length ? { sesiones } : {}),
      ...(implicados.length ? { implicados } : {}),
      ...(contexto ? { contexto } : {}),
      ...(pizarraByUser ? { pizarraByUser } : {}),
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preferPaso = (x: any, y: any) => {
    let winner: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (x.finTs && !y.finTs) winner = x;
    else if (y.finTs && !x.finTs) winner = y;
    else winner = (x.inicioTs ?? "") >= (y.inicioTs ?? "") ? x : y;
    const loser = winner === x ? y : x;
    const notas = unirNotas(x.notas, y.notas);
    const implicados = unirPorClave(x.implicados, y.implicados, (i) => (i as { nombre?: string }).nombre ?? "");
    // contexto escalar (notas:string): mismo criterio que para entregables —
    // concatenamos si son distintos para no perder texto escrito en paralelo.
    const ctxW = winner.contexto;
    const ctxL = loser.contexto;
    let contexto = ctxW;
    if (ctxW && ctxL) {
      const tW = String(ctxW.notas ?? "");
      const tL = String(ctxL.notas ?? "");
      const notasCombinadas = combinarNotasTexto(tW, tL);
      contexto = {
        urls: unirPorClave(ctxW.urls, ctxL.urls, (u) => (u as { url?: string }).url ?? JSON.stringify(u)),
        apps: Array.from(new Set([...(ctxW.apps ?? []), ...(ctxL.apps ?? [])])),
        notas: notasCombinadas,
      };
    }
    return {
      ...winner,
      ...(notas.length || winner.notas ? { notas } : {}),
      ...(implicados.length ? { implicados } : {}),
      ...(contexto ? { contexto } : {}),
    };
  };

  const emptyDel = {
    proyectos: [] as string[],
    resultados: [] as string[],
    entregables: [] as string[],
    pasos: [] as string[],
    plantillas: [] as string[],
    notas: [] as string[],
    arbolNodos: [] as string[],
    arbolRegistros: [] as string[],
    mensajes: [] as string[],
    implicados: [] as string[],
  };
  const delA = { ...emptyDel, ...(a.deleted ?? {}) };
  const delB = { ...emptyDel, ...(b.deleted ?? {}) };
  const entregableHojaLinks = mergeTsRecords(
    a.deleted?.entregableHojaLinks,
    b.deleted?.entregableHojaLinks,
  );
  const deleted = {
    proyectos: Array.from(new Set([...(delA.proyectos ?? []), ...(delB.proyectos ?? [])])),
    resultados: Array.from(new Set([...(delA.resultados ?? []), ...(delB.resultados ?? [])])),
    entregables: Array.from(new Set([...(delA.entregables ?? []), ...(delB.entregables ?? [])])),
    pasos: Array.from(new Set([...(delA.pasos ?? []), ...(delB.pasos ?? [])])),
    plantillas: Array.from(new Set([...(delA.plantillas ?? []), ...(delB.plantillas ?? [])])),
    notas: Array.from(new Set([...(delA.notas ?? []), ...(delB.notas ?? [])])),
    arbolNodos: Array.from(new Set([...(delA.arbolNodos ?? []), ...(delB.arbolNodos ?? [])])),
    arbolRegistros: Array.from(new Set([...(delA.arbolRegistros ?? []), ...(delB.arbolRegistros ?? [])])),
    mensajes: Array.from(new Set([...(delA.mensajes ?? []), ...(delB.mensajes ?? [])])),
    implicados: Array.from(new Set([...(delA.implicados ?? []), ...(delB.implicados ?? [])])),
    ...(entregableHojaLinks ? { entregableHojaLinks } : {}),
  };

  // Tombstones de relaciones MAPA→Árbol indexados por clave para que
  // `preferNodoLWW` pueda filtrar `entregableIds` sin volver a recorrer
  // el record por cada nodo. Se calcula UNA vez por `mergeStates`.
  const tombstoneTsByLink = new Map<string, string>(
    Object.entries(entregableHojaLinks ?? {}),
  );
  const preferNodoLWWBound = (x: NodoArbol, y: NodoArbol): NodoArbol =>
    preferNodoLWW(x, y, tombstoneTsByLink);
  // Adicionalmente, cualquier nodo (con o sin empate) puede tener un
  // entregableId con tombstone más reciente que su `actualizado`. El
  // postProcesado quita esas relaciones de los nodos que sobreviven al
  // unionById, cubriendo el caso "nodo sin par en el otro lado pero con
  // un vínculo borrado en el segundo cliente".
  const aplicarTombstonesEntregableIds = (n: NodoArbol): NodoArbol => {
    const filtered = filtrarEntregableIdsConTombstones(
      n.id,
      n.entregableIds,
      n.actualizado,
      tombstoneTsByLink,
    );
    if (filtered === n.entregableIds) return n;
    return { ...n, entregableIds: filtered && filtered.length > 0 ? filtered : undefined };
  };

  const delNotas = new Set(deleted.notas ?? []);

  const delProj = new Set(deleted.proyectos);
  const delRes = new Set(deleted.resultados);
  const delEnt = new Set(deleted.entregables);
  const delPas = new Set(deleted.pasos);
  const delPl = new Set(deleted.plantillas);
  const delArbolNodos = new Set(deleted.arbolNodos);
  const delArbolRegs = new Set(deleted.arbolRegistros);
  const delMensajes = new Set(deleted.mensajes);

  const preferMensaje = (x: MensajeEntregable, y: MensajeEntregable): MensajeEntregable => {
    // Base: la copia con timestamp de edición (o creación) más reciente.
    const eX = x.editado ?? x.creado ?? "";
    const eY = y.editado ?? y.creado ?? "";
    const base = eX >= eY ? x : y;

    // Merge de leídos: unión, nadie debería "desleer" lo que ya vio.
    const leidoPor = Array.from(new Set([...(x.leidoPor ?? []), ...(y.leidoPor ?? [])]));

    // Merge de destinatarios: si uno es broadcast (undefined/[]) y el otro
    // explicita destinatarios, gana el que explicita. Si ambos explícitos,
    // gana el más reciente (el que marcamos como base).
    const paraQuienBase = base.paraQuien;
    const paraX = x.paraQuien && x.paraQuien.length > 0 ? x.paraQuien : undefined;
    const paraY = y.paraQuien && y.paraQuien.length > 0 ? y.paraQuien : undefined;
    const paraQuien = paraQuienBase && paraQuienBase.length > 0
      ? paraQuienBase
      : (paraX ?? paraY);

    // Resolución: gana el `resueltoTs` más reciente (sea resuelto o reabierto).
    const rX = x.resueltoTs ?? "";
    const rY = y.resueltoTs ?? "";
    let estado: MensajeEntregable["estado"] = base.estado;
    let resueltoPor: string | undefined = base.resueltoPor;
    let resueltoTs: string | undefined = base.resueltoTs;
    if (rX || rY) {
      const ganador = rX >= rY ? x : y;
      estado = ganador.estado ?? "abierto";
      resueltoPor = ganador.resueltoPor;
      resueltoTs = ganador.resueltoTs;
    }

    return {
      ...base,
      leidoPor,
      paraQuien,
      estado,
      resueltoPor,
      resueltoTs,
    };
  };

  const reflA = a.arbol?.reflexiones ?? [];
  const reflB = b.arbol?.reflexiones ?? [];
  const reflKey = (r: { anio: number; trimestreKey: string }) => `${r.anio}|${r.trimestreKey}`;
  const reflMap = new Map<string, (typeof reflA)[number]>();
  for (const r of reflA) reflMap.set(reflKey(r), r);
  for (const r of reflB) {
    const k = reflKey(r);
    const existing = reflMap.get(k);
    if (!existing || (r.actualizado ?? "") > (existing.actualizado ?? "")) reflMap.set(k, r);
  }

  const merged: AppState = {
    ...a,
    proyectos: unionById(a.proyectos, b.proyectos)
      .filter((p) => !delProj.has(p.id))
      .map((p) => stripNotasTombstones(p, delNotas)),
    resultados: unionById(a.resultados, b.resultados)
      .filter((r) => !delRes.has(r.id))
      .map((r) => stripNotasTombstones(r, delNotas)),
    entregables: unionById(a.entregables, b.entregables, preferMore)
      .filter((e) => !delEnt.has(e.id))
      .map((e) => stripNotasTombstones(e, delNotas))
      .map((e) => {
        // Lápidas de implicados: si en algún cliente se quitó
        // explícitamente `nombre` del entregable `e.id`, el merge no lo
        // resucita aunque el otro cliente aún lo tuviera.
        const lapidas = new Set(deleted.implicados ?? []);
        if (lapidas.size === 0) return e;
        const implicados = (e.implicados ?? []).filter(
          (i: { nombre: string }) => !lapidas.has(`${e.id}::${i.nombre}`),
        );
        if (implicados.length === (e.implicados?.length ?? 0)) return e;
        return { ...e, implicados };
      }),
    pasos: unionById(a.pasos, b.pasos, preferPaso)
      .filter((p) => !delPas.has(p.id))
      .map((p) => stripNotasTombstones(p, delNotas)),
    contactos: unionById(a.contactos ?? [], b.contactos ?? []),
    inbox: unionById(a.inbox ?? [], b.inbox ?? []),
    plantillas: unionById(a.plantillas, b.plantillas)
      .filter((p) => !delPl.has(p.id))
      .map((p) => stripNotasTombstones(p, delNotas)),
    ejecuciones: unionById(a.ejecuciones ?? [], b.ejecuciones ?? []),
    miembros: unionById(a.miembros ?? [], b.miembros ?? []),
    activityLog: unionById(a.activityLog ?? [], b.activityLog ?? []),
    mensajes: unionById(a.mensajes ?? [], b.mensajes ?? [], preferMensaje)
      .filter((m) => !delMensajes.has(m.id) && !delEnt.has(m.entregableId)),
    arbol: {
      // Usamos `preferNodoLWW` para que en empate de id no se descarte
      // el lado con `actualizado` más reciente (bug §1 del audit). El
      // post-`map(aplicarTombstonesEntregableIds)` cubre además el caso
      // donde un nodo sólo aparece en uno de los dos estados pero su
      // vínculo MAPA→Árbol fue borrado en el otro.
      nodos: unionById(
        a.arbol?.nodos ?? EMPTY_ARBOL.nodos,
        b.arbol?.nodos ?? EMPTY_ARBOL.nodos,
        preferNodoLWWBound,
      )
        .filter((n) => !delArbolNodos.has(n.id))
        .map(aplicarTombstonesEntregableIds),
      // Registros: LWW por `actualizado` (campo obligatorio en `RegistroNodo`).
      registros: unionById(
        a.arbol?.registros ?? EMPTY_ARBOL.registros,
        b.arbol?.registros ?? EMPTY_ARBOL.registros,
        (x, y) => ((x.actualizado ?? "") >= (y.actualizado ?? "") ? x : y),
      ).filter((r) => !delArbolRegs.has(r.id) && !delArbolNodos.has(r.nodoId)),
      configs: unionConfigs(a.arbol?.configs ?? EMPTY_ARBOL.configs, b.arbol?.configs ?? EMPTY_ARBOL.configs),
      reflexiones: [...reflMap.values()].sort(
        (x, y) => x.anio - y.anio || x.trimestreKey.localeCompare(y.trimestreKey),
      ),
    },
    pasosActivos: Array.from(new Set([...a.pasosActivos, ...b.pasosActivos])).filter((id) => !delPas.has(id)),
    // Franjas de time blocking: unión por id. En conflicto de id gana la
    // copia de `a` (en `saveStateCloud`, `a` = estado local: las ediciones
    // locales de una franja prevalecen sobre la copia de la nube).
    ...((a.franjas?.length || b.franjas?.length)
      ? { franjas: unionById(a.franjas ?? [], b.franjas ?? []) }
      : {}),
    // Registros de productividad: unión por id con LWW por `actualizado`.
    ...((a.productividadFranjas?.length || b.productividadFranjas?.length)
      ? {
          productividadFranjas: unionById(
            a.productividadFranjas ?? [],
            b.productividadFranjas ?? [],
            (x, y) => ((x.actualizado ?? "") >= (y.actualizado ?? "") ? x : y),
          ),
        }
      : {}),
    deleted,
    _migrationVersion: Math.max(a._migrationVersion ?? 0, b._migrationVersion ?? 0),
  };
  return merged;
}

/** Compara dos estados y devuelve true si difieren en aspectos relevantes:
 *  - conteos de entidades principales,
 *  - tombstones (presencia exacta de IDs, no solo conteos),
 *  - sets de IDs (detecta cambios de membresía aun cuando los conteos coincidan,
 *    p.ej. un cliente añadió X y otro borró Y → mismos conteos pero IDs distintos).
 */
export function statesDiffer(a: AppState, b: AppState): boolean {
  if (a.pasos.length !== b.pasos.length) return true;
  if (a.entregables.length !== b.entregables.length) return true;
  if (a.proyectos.length !== b.proyectos.length) return true;
  if (a.resultados.length !== b.resultados.length) return true;
  if (a.plantillas.length !== b.plantillas.length) return true;
  if ((a.contactos?.length ?? 0) !== (b.contactos?.length ?? 0)) return true;
  if ((a.inbox?.length ?? 0) !== (b.inbox?.length ?? 0)) return true;
  if ((a.mensajes?.length ?? 0) !== (b.mensajes?.length ?? 0)) return true;

  const idSetEq = (xs: { id: string }[], ys: { id: string }[]): boolean => {
    if (xs.length !== ys.length) return false;
    const setX = new Set(xs.map((x) => x.id));
    for (const y of ys) if (!setX.has(y.id)) return false;
    return true;
  };
  if (!idSetEq(a.pasos, b.pasos)) return true;
  if (!idSetEq(a.entregables, b.entregables)) return true;
  if (!idSetEq(a.proyectos, b.proyectos)) return true;
  if (!idSetEq(a.resultados, b.resultados)) return true;
  if (!idSetEq(a.plantillas, b.plantillas)) return true;
  if (!idSetEq(a.arbol?.nodos ?? [], b.arbol?.nodos ?? [])) return true;
  if (!idSetEq(a.arbol?.registros ?? [], b.arbol?.registros ?? [])) return true;
  if (!idSetEq(a.mensajes ?? [], b.mensajes ?? [])) return true;
  if ((a.arbol?.reflexiones?.length ?? 0) !== (b.arbol?.reflexiones?.length ?? 0)) return true;
  if (configsFingerprint(a) !== configsFingerprint(b)) return true;

  // Huellas de contenido: detectan cambios dentro de notas y mensajes aunque los IDs
  // sean los mismos (el merge profundo puede añadir notas/mensajes del otro cliente).
  if (notasFingerprint(a) !== notasFingerprint(b)) return true;
  if (mensajesFingerprint(a) !== mensajesFingerprint(b)) return true;
  if (contextoFingerprint(a) !== contextoFingerprint(b)) return true;
  if (planPorUsuarioFingerprint(a) !== planPorUsuarioFingerprint(b)) return true;

  const dA = a.deleted, dB = b.deleted;
  if (!!dA !== !!dB) return true;
  if (dA && dB) {
    const arrEq = (xs: string[] | undefined, ys: string[] | undefined): boolean => {
      const xsa = xs ?? [];
      const ysa = ys ?? [];
      if (xsa.length !== ysa.length) return false;
      const sx = new Set(xsa);
      for (const y of ysa) if (!sx.has(y)) return false;
      return true;
    };
    if (!arrEq(dA.proyectos, dB.proyectos)) return true;
    if (!arrEq(dA.resultados, dB.resultados)) return true;
    if (!arrEq(dA.entregables, dB.entregables)) return true;
    if (!arrEq(dA.pasos, dB.pasos)) return true;
    if (!arrEq(dA.plantillas, dB.plantillas)) return true;
    if (!arrEq(dA.arbolNodos, dB.arbolNodos)) return true;
    if (!arrEq(dA.arbolRegistros, dB.arbolRegistros)) return true;
    if (!arrEq(dA.notas, dB.notas)) return true;
    if (!arrEq(dA.mensajes, dB.mensajes)) return true;
    if (!arrEq(dA.implicados, dB.implicados)) return true;
  }
  return false;
}

/**
 * Huella textual barata del contenido de las notas de cada entidad con notas.
 * Sirve para que `statesDiffer` detecte cuando el merge añade notas dentro de
 * entidades existentes (mismo ID pero contenido distinto). Basta con concatenar
 * IDs de notas ordenados por entidad: si cambia cualquier id, cambia el hash.
 */
function notasFingerprint(s: AppState): string {
  const chunks: string[] = [];
  const pushArr = (prefix: string, arr: { id: string; notas?: Nota[] }[] | undefined) => {
    if (!arr) return;
    for (const it of arr) {
      const ids = (it.notas ?? []).map((n) => n.id).sort().join(",");
      if (ids) chunks.push(`${prefix}:${it.id}=${ids}`);
    }
  };
  pushArr("pr", s.proyectos);
  pushArr("rs", s.resultados);
  pushArr("en", s.entregables);
  pushArr("pa", s.pasos);
  pushArr("pl", s.plantillas);
  return chunks.sort().join("|");
}

function mensajesFingerprint(s: AppState): string {
  const arr = s.mensajes ?? [];
  return arr
    .map((m) => `${m.id}:${m.editado ?? m.creado ?? ""}:${(m.leidoPor ?? []).slice().sort().join(",")}`)
    .sort()
    .join("|");
}

/**
 * Huella del contenido textual que no tiene id (contexto.notas de entregable y paso).
 * Al ser `string`, el único modo de saber si cambió es comparar el texto literal.
 * Longitud + hash simple es suficiente: ya no volvemos a considerar los estados
 * "iguales" cuando el único cambio es un edit en la pizarra de contexto.
 */
function contextoFingerprint(s: AppState): string {
  const chunks: string[] = [];
  for (const e of s.entregables) {
    const n = e.contexto?.notas;
    if (n !== undefined) chunks.push(`e:${e.id}:${n.length}:${hashStr(n)}`);
  }
  for (const p of s.pasos) {
    const n = p.contexto?.notas;
    if (n !== undefined) chunks.push(`p:${p.id}:${n.length}:${hashStr(n)}`);
  }
  return chunks.sort().join("|");
}

/**
 * Huella ligera de la config por año del árbol (semanasNoActivas, CCAA y
 * `mesesCerrados`). Sin esto, dos clientes con el mismo número de configs
 * pero un cierre de mes distinto pasaban como "iguales" y no se aplicaba
 * el merge en el cliente local tras el pull.
 */
function configsFingerprint(s: AppState): string {
  const cfgs = s.arbol?.configs ?? [];
  const fmtTs = (rec: Record<string, string> | undefined): string => {
    if (!rec) return "";
    return Object.entries(rec)
      .map(([k, v]) => `${k}@${v}`)
      .sort()
      .join(",");
  };
  const fmtNum = (rec: Record<string, number> | undefined): string => {
    if (!rec) return "";
    return Object.entries(rec)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join(",");
  };
  return cfgs
    .map((c) => {
      const sem = (c.semanasNoActivas ?? []).slice().sort().join(",");
      const legacy = (c.mesesCerrados ?? []).slice().sort().join(",");
      const cer = fmtTs(c.mesesCerradosTs);
      const abi = fmtTs(c.mesesAbiertosTs);
      const semCer = fmtTs(c.semanasNoActivasTs);
      const semAbi = fmtTs(c.semanasActivasTs);
      const pisos = fmtNum(c.pisoMensual);
      return `${c.anio}|${c.comunidadAutonoma ?? ""}|S:${sem}|C:${cer}|L:${legacy}|A:${abi}|SC:${semCer}|SA:${semAbi}|P:${pisos}`;
    })
    .sort()
    .join("|");
}

/**
 * Huella de la preparación semanal por miembro de cada entregable. Garantiza
 * que, tras un merge en la nube, el cliente local vuelva a dispatchar el
 * estado unido aunque los IDs y conteos coincidan. Sin esto, un merge que
 * añade días planificados del otro cliente podía pasar inadvertido y perderse
 * en el siguiente save local.
 */
function planPorUsuarioFingerprint(s: AppState): string {
  const chunks: string[] = [];
  for (const e of s.entregables) {
    const dias = e.diasPlanificadosByUser ?? {};
    const horas = e.planInicioTsByUser ?? {};
    const semanas = e.semanasActivas ?? [];
    const users = Array.from(new Set([...Object.keys(dias), ...Object.keys(horas)])).sort();
    const partes: string[] = [];
    for (const u of users) {
      const d = (dias[u] ?? []).slice().sort().join(",");
      const h = horas[u] ?? "";
      partes.push(`${u}:${d}@${h}`);
    }
    const sem = semanas.slice().sort().join(",");
    if (partes.length || sem) chunks.push(`e:${e.id}:${partes.join(";")}|S:${sem}`);
  }
  return chunks.sort().join("|");
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}
