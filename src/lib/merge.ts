import type { AppState, MensajeEntregable, Nota, PlanArbolConfigAnio } from "./types";
import { EMPTY_ARBOL } from "./types";

function stripNotasTombstones<T extends { notas?: Nota[] }>(item: T, delNotas: Set<string>): T {
  const arr = item.notas;
  if (!arr?.length) return item;
  const next = arr.filter((n) => !delNotas.has(n.id));
  if (next.length === arr.length) return item;
  return { ...item, notas: next };
}

function unionConfigs(a: PlanArbolConfigAnio[], b: PlanArbolConfigAnio[]): PlanArbolConfigAnio[] {
  const map = new Map<number, PlanArbolConfigAnio>();
  for (const c of [...a, ...b]) {
    const prev = map.get(c.anio);
    if (!prev) {
      map.set(c.anio, { ...c });
    } else {
      map.set(c.anio, {
        anio: c.anio,
        semanasNoActivas: [...new Set([...prev.semanasNoActivas, ...c.semanasNoActivas])].sort(),
        comunidadAutonoma: c.comunidadAutonoma ?? prev.comunidadAutonoma,
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
    const sesiones = unirPorClave(x.sesiones, y.sesiones, (s) => (s as { inicioTs?: string }).inicioTs ?? "");
    const implicados = unirPorClave(x.implicados, y.implicados, (i) => (i as { nombre?: string }).nombre ?? "");
    // contexto escalar (notas:string): preservamos la versión más larga de cualquiera de los dos
    // clientes para que nadie pierda un párrafo escrito en paralelo.
    const ctxW = winner.contexto;
    const ctxL = loser.contexto;
    let contexto = ctxW;
    if (ctxW && ctxL) {
      const tW = String(ctxW.notas ?? "");
      const tL = String(ctxL.notas ?? "");
      const notasLarga = tW.length >= tL.length ? tW : tL;
      contexto = {
        urls: unirPorClave(ctxW.urls, ctxL.urls, (u) => (u as { url?: string }).url ?? JSON.stringify(u)),
        apps: Array.from(new Set([...(ctxW.apps ?? []), ...(ctxL.apps ?? [])])),
        notas: notasLarga,
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
    return {
      ...winner,
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
    // contexto escalar (notas:string): conservamos la versión con más texto para no perder trabajo.
    const ctxW = winner.contexto;
    const ctxL = loser.contexto;
    let contexto = ctxW;
    if (ctxW && ctxL) {
      const tW = String(ctxW.notas ?? "");
      const tL = String(ctxL.notas ?? "");
      const notasLarga = tW.length >= tL.length ? tW : tL;
      contexto = {
        urls: unirPorClave(ctxW.urls, ctxL.urls, (u) => (u as { url?: string }).url ?? JSON.stringify(u)),
        apps: Array.from(new Set([...(ctxW.apps ?? []), ...(ctxL.apps ?? [])])),
        notas: notasLarga,
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
  };
  const delA = { ...emptyDel, ...(a.deleted ?? {}) };
  const delB = { ...emptyDel, ...(b.deleted ?? {}) };
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
    const eX = x.editado ?? x.creado ?? "";
    const eY = y.editado ?? y.creado ?? "";
    const base = eX >= eY ? x : y;
    const leidoPor = Array.from(new Set([...(x.leidoPor ?? []), ...(y.leidoPor ?? [])]));
    return { ...base, leidoPor };
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
      .map((e) => stripNotasTombstones(e, delNotas)),
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
      nodos: unionById(a.arbol?.nodos ?? EMPTY_ARBOL.nodos, b.arbol?.nodos ?? EMPTY_ARBOL.nodos)
        .filter((n) => !delArbolNodos.has(n.id)),
      registros: unionById(a.arbol?.registros ?? EMPTY_ARBOL.registros, b.arbol?.registros ?? EMPTY_ARBOL.registros)
        .filter((r) => !delArbolRegs.has(r.id) && !delArbolNodos.has(r.nodoId)),
      configs: unionConfigs(a.arbol?.configs ?? EMPTY_ARBOL.configs, b.arbol?.configs ?? EMPTY_ARBOL.configs),
      reflexiones: [...reflMap.values()].sort(
        (x, y) => x.anio - y.anio || x.trimestreKey.localeCompare(y.trimestreKey),
      ),
    },
    pasosActivos: Array.from(new Set([...a.pasosActivos, ...b.pasosActivos])).filter((id) => !delPas.has(id)),
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

  // Huellas de contenido: detectan cambios dentro de notas y mensajes aunque los IDs
  // sean los mismos (el merge profundo puede añadir notas/mensajes del otro cliente).
  if (notasFingerprint(a) !== notasFingerprint(b)) return true;
  if (mensajesFingerprint(a) !== mensajesFingerprint(b)) return true;
  if (contextoFingerprint(a) !== contextoFingerprint(b)) return true;

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

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}
