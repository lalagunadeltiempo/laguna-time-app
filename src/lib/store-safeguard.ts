import type { AppState, NodoArbol } from "./types";

/**
 * Resultado del chequeo anti-pisada que se hace ANTES de hacer upsert
 * a la nube. Si `aborta` es true, el caller NO debe hacer el upsert y
 * debe notificar a la usuaria con `motivo`.
 */
export interface ResultadoSalvaguarda {
  aborta: boolean;
  motivo?: string;
  diagnostico?: {
    nodosAntes: number;
    nodosDespues: number;
    nodosConMetaAntes: number;
    nodosConMetaDespues: number;
    relacionesEntregableHojaAntes: number;
    relacionesEntregableHojaDespues: number;
    tombstonesArbolNodos: number;
  };
}

function nodoTieneMeta(n: NodoArbol): boolean {
  if (typeof n.metaValor === "number" && Number.isFinite(n.metaValor) && n.metaValor > 0) {
    return true;
  }
  if (n.metaPorTrimestre) {
    for (const v of Object.values(n.metaPorTrimestre)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return true;
    }
  }
  return false;
}

function contarRelacionesEntregableHoja(nodos: NodoArbol[]): number {
  let total = 0;
  for (const n of nodos) {
    total += n.entregableIds?.length ?? 0;
  }
  return total;
}

/**
 * Detecta pérdida masiva no justificada entre `snapshot` (lo que ahora
 * mismo está en la nube, recién leído) y `stateToSave` (lo que vamos a
 * upsertear). Justifica las pérdidas si los IDs eliminados están
 * presentes en `stateToSave.deleted.arbolNodos` (tombstones).
 *
 * Reglas (cualquiera dispara el bloqueo):
 * 1. `nodosDespues < nodosAntes - 2` y la diferencia NO está cubierta
 *    por tombstones.
 * 2. `nodosConMetaDespues < nodosConMetaAntes * 0.5` (perder >50 % de
 *    nodos con meta).
 * 3. `relacionesEntregableHojaDespues < relacionesEntregableHojaAntes
 *    * 0.5` (perder >50 % de vínculos MAPA→Árbol).
 *
 * Si el snapshot es null/undefined o si el snapshot no tiene árbol
 * (caso bootstrap), nunca bloquea.
 *
 * Es una función pura: no toca network, no muta argumentos.
 */
export function detectarPerdidaInjustificada(
  snapshot: AppState | null | undefined,
  stateToSave: AppState,
): ResultadoSalvaguarda {
  if (!snapshot) return { aborta: false };

  const nodosSnap = snapshot.arbol?.nodos ?? [];
  const nodosNew = stateToSave.arbol?.nodos ?? [];

  const nodosAntes = nodosSnap.length;
  const nodosDespues = nodosNew.length;

  // Si el snapshot está vacío (bootstrap) no podemos hablar de pérdida.
  if (nodosAntes === 0) return { aborta: false };

  const nodosConMetaAntes = nodosSnap.filter(nodoTieneMeta).length;
  const nodosConMetaDespues = nodosNew.filter(nodoTieneMeta).length;

  const relacionesEntregableHojaAntes = contarRelacionesEntregableHoja(nodosSnap);
  const relacionesEntregableHojaDespues = contarRelacionesEntregableHoja(nodosNew);

  const tombstones = new Set(stateToSave.deleted?.arbolNodos ?? []);
  const idsAntes = new Set(nodosSnap.map((n) => n.id));
  const idsDespues = new Set(nodosNew.map((n) => n.id));
  const desaparecidos: string[] = [];
  for (const id of idsAntes) {
    if (!idsDespues.has(id)) desaparecidos.push(id);
  }
  const desaparecidosSinTombstone = desaparecidos.filter((id) => !tombstones.has(id));

  const diagnostico: ResultadoSalvaguarda["diagnostico"] = {
    nodosAntes,
    nodosDespues,
    nodosConMetaAntes,
    nodosConMetaDespues,
    relacionesEntregableHojaAntes,
    relacionesEntregableHojaDespues,
    tombstonesArbolNodos: tombstones.size,
  };

  if (
    nodosDespues < nodosAntes - 2 &&
    desaparecidosSinTombstone.length > 2
  ) {
    return {
      aborta: true,
      motivo: `Perdería ${desaparecidosSinTombstone.length} nodos del árbol sin tombstone (antes ${nodosAntes}, después ${nodosDespues})`,
      diagnostico,
    };
  }

  if (
    nodosConMetaAntes > 0 &&
    nodosConMetaDespues < nodosConMetaAntes * 0.5
  ) {
    // Calculamos cuántas metas se "perderían" descontando las que están
    // legítimamente justificadas por tombstones en `arbolNodos`. Aun así,
    // si los nodos siguen ahí pero se les ha quitado la meta (caso típico
    // de pisada de la usuaria), no hay tombstone que lo justifique.
    const nodosConMetaPerdidosLegit = nodosSnap.filter(
      (n) => nodoTieneMeta(n) && tombstones.has(n.id),
    ).length;
    const perdidaNetaMetas = nodosConMetaAntes - nodosConMetaDespues - nodosConMetaPerdidosLegit;
    if (perdidaNetaMetas > 0) {
      return {
        aborta: true,
        motivo: `Perdería más del 50% de los nodos con meta (antes ${nodosConMetaAntes}, después ${nodosConMetaDespues})`,
        diagnostico,
      };
    }
  }

  if (
    relacionesEntregableHojaAntes > 0 &&
    relacionesEntregableHojaDespues < relacionesEntregableHojaAntes * 0.5
  ) {
    return {
      aborta: true,
      motivo: `Perdería más del 50% de las relaciones MAPA→Árbol (antes ${relacionesEntregableHojaAntes}, después ${relacionesEntregableHojaDespues})`,
      diagnostico,
    };
  }

  return { aborta: false, diagnostico };
}

/**
 * Versión "invertida" para detectar si entre dos estados ha habido un
 * cambio significativo que justifique materializar una entrada en el
 * historial cloud (ver Bloque 4: `appendHistoryEntry`).
 *
 * Devuelve true si:
 *  - cambia el número de nodos en >2 (alta o baja),
 *  - cambia el número de nodos con meta en >0,
 *  - cambia el número de relaciones entregable→hoja en >0.
 *
 * Es una heurística barata para hacer "snapshots cuando hay miga".
 */
export function detectarCambioSignificativo(
  prev: AppState | null | undefined,
  next: AppState,
): boolean {
  if (!prev) return true;
  const nodosPrev = prev.arbol?.nodos ?? [];
  const nodosNext = next.arbol?.nodos ?? [];
  if (Math.abs(nodosPrev.length - nodosNext.length) > 2) return true;
  const metaPrev = nodosPrev.filter(nodoTieneMeta).length;
  const metaNext = nodosNext.filter(nodoTieneMeta).length;
  if (metaPrev !== metaNext) return true;
  const relPrev = contarRelacionesEntregableHoja(nodosPrev);
  const relNext = contarRelacionesEntregableHoja(nodosNext);
  if (relPrev !== relNext) return true;
  return false;
}
