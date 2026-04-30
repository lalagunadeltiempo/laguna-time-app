import type { AppState, Nota, PlanArbolConfigAnio } from "./types";
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preferPaso = (x: any, y: any) => {
    if (x.finTs && !y.finTs) return x;
    if (y.finTs && !x.finTs) return y;
    return (x.inicioTs ?? "") >= (y.inicioTs ?? "") ? x : y;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preferMore = (x: any, y: any) => {
    if ((x.diasHechos ?? 0) > (y.diasHechos ?? 0)) return x;
    if ((y.diasHechos ?? 0) > (x.diasHechos ?? 0)) return y;
    return x;
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
  };

  const delNotas = new Set(deleted.notas ?? []);

  const delProj = new Set(deleted.proyectos);
  const delRes = new Set(deleted.resultados);
  const delEnt = new Set(deleted.entregables);
  const delPas = new Set(deleted.pasos);
  const delPl = new Set(deleted.plantillas);
  const delArbolNodos = new Set(deleted.arbolNodos);
  const delArbolRegs = new Set(deleted.arbolRegistros);

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
  if ((a.arbol?.reflexiones?.length ?? 0) !== (b.arbol?.reflexiones?.length ?? 0)) return true;

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
  }
  return false;
}
