"use client";

/**
 * Selector multi-hoja para asociar un entregable a hojas del Árbol del año.
 *
 * Reutilizable entre HOY (`EntregableActivoCard`) y MAPA (`EntregableBlock`):
 * la lógica de derivar el año, leer la raíz/ramas/hojas y persistir vía
 * `SET_HOJAS_DE_ENTREGABLE` es idéntica. El prop `layout` solo cambia
 * paddings/contornos para integrarse en cada superficie.
 *
 * Comportamiento:
 *   - Año del entregable: primer entry de `semanasActivas` (YYYY-MM-DD) o
 *     año actual como fallback.
 *   - Raíz: nodo anual con `metaValor` definido o, si no hay, el primer
 *     root del año.
 *   - Estructura: raíz → ramas (hijos suma) → hojas (hijos suma de cada
 *     rama). Solo se listan ramas con al menos una hoja.
 *   - Persistencia: el draft local se sincroniza con la selección actual
 *     al abrir, y se vuelca al estado global al cerrar el desplegable o
 *     al pulsar Guardar (si hay cambios respecto a la selección actual).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { hijosSumaDirectos, parseLocalDateKey } from "@/lib/arbol-tiempo";
import type { Entregable } from "@/lib/types";
import { LazyDetails } from "./arbol-comunes";

type Layout = "card" | "inline";

interface Props {
  entregable: Entregable;
  /** Solo afecta a paddings/clases del contenedor; la lógica es la misma. */
  layout?: Layout;
}

export function EntregableHojasArbolPicker({ entregable, layout = "card" }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);

  const anioArbol = useMemo(() => {
    const primeraSemana = entregable.semanasActivas?.[0];
    if (primeraSemana) {
      const fecha = parseLocalDateKey(primeraSemana);
      if (Number.isFinite(fecha.getTime())) return fecha.getFullYear();
    }
    return new Date().getFullYear();
  }, [entregable.semanasActivas]);

  const nodosAnio = useMemo(
    () => (state.arbol?.nodos ?? []).filter((n) => n.anio === anioArbol),
    [state.arbol?.nodos, anioArbol],
  );
  const roots = useMemo(
    () => nodosAnio.filter((n) => !n.parentId).sort((a, b) => a.orden - b.orden),
    [nodosAnio],
  );
  const raiz = useMemo(
    () => roots.find((r) => r.cadencia === "anual" && r.metaValor !== undefined) ?? roots[0],
    [roots],
  );
  const ramasConHojas = useMemo(() => {
    if (!raiz) return [];
    return hijosSumaDirectos(nodosAnio, raiz.id, anioArbol)
      .map((rama) => ({
        rama,
        hojas: hijosSumaDirectos(nodosAnio, rama.id, anioArbol),
      }))
      .filter((entry) => entry.hojas.length > 0);
  }, [raiz, nodosAnio, anioArbol]);
  const hojasDisponibles = useMemo(
    () => ramasConHojas.flatMap((entry) => entry.hojas),
    [ramasConHojas],
  );

  const seleccionActual = useMemo(
    () =>
      hojasDisponibles
        .filter((hoja) => hoja.entregableIds?.includes(entregable.id))
        .map((hoja) => hoja.id)
        .sort(),
    [hojasDisponibles, entregable.id],
  );

  // Sincronizamos el draft con la selección actual cada vez que se abre el
  // panel o cambia el año (puede suceder si `semanasActivas` cambia mientras
  // está abierto, p. ej. al moverlo de semana en otra pantalla).
  useEffect(() => {
    if (!open) return;
    setDraft(seleccionActual);
  }, [open, seleccionActual, anioArbol]);

  const draftSorted = useMemo(() => [...new Set(draft)].sort(), [draft]);
  const dirty = useMemo(() => {
    if (draftSorted.length !== seleccionActual.length) return true;
    return draftSorted.some((id, idx) => id !== seleccionActual[idx]);
  }, [draftSorted, seleccionActual]);

  const guardar = useCallback(() => {
    if (!dirty) return;
    dispatch({
      type: "SET_HOJAS_DE_ENTREGABLE",
      entregableId: entregable.id,
      hojaIds: draftSorted,
      anio: anioArbol,
    });
  }, [dirty, dispatch, entregable.id, draftSorted, anioArbol]);

  const containerClass =
    layout === "card"
      ? "rounded-lg border border-border/60 bg-surface/20"
      : "rounded-lg border border-border/50 bg-surface/30";

  return (
    <LazyDetails
      className={containerClass}
      open={open}
      onToggle={(nextOpen) => {
        if (!nextOpen && open) guardar();
        setOpen(nextOpen);
      }}
      summary={(
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="text-[10px] transition-transform">{open ? "▼" : "▶"}</span>
          Hojas del árbol asociadas
        </summary>
      )}
    >
      <div className="space-y-2 border-t border-border/60 px-2.5 py-2">
        {!raiz ? (
          <p className="text-[11px] text-muted">
            Crea primero la raíz del Árbol del año {anioArbol}
          </p>
        ) : ramasConHojas.length === 0 ? (
          <p className="text-[11px] text-muted">
            No hay hojas disponibles en el árbol del año {anioArbol}.
          </p>
        ) : (
          <>
            {ramasConHojas.map(({ rama, hojas }) => (
              <div key={rama.id} className="space-y-1">
                <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{rama.nombre}</p>
                <div className="space-y-0.5 pl-2">
                  {hojas.map((hoja) => {
                    const checked = draft.includes(hoja.id);
                    return (
                      <label
                        key={hoja.id}
                        className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setDraft((prev) => {
                              if (e.target.checked) return [...new Set([...prev, hoja.id])];
                              return prev.filter((id) => id !== hoja.id);
                            });
                          }}
                        />
                        <span>{hoja.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={guardar}
                disabled={!dirty}
                className="rounded border border-border px-2 py-1 text-[11px] text-zinc-700 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-200"
              >
                Guardar
              </button>
            </div>
          </>
        )}
      </div>
    </LazyDetails>
  );
}
