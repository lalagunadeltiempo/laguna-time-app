"use client";

/**
 * Selector multi-hoja para asociar un entregable a hojas del Árbol del año.
 *
 * Reutilizable entre HOY (`EntregableActivoCard`) y MAPA (`EntregableBlock`):
 * la lógica de derivar el año, leer la raíz/ramas/hojas y persistir vía
 * `SET_HOJAS_DE_ENTREGABLE` es idéntica. El prop `layout` solo cambia
 * paddings/contornos para integrarse en cada superficie y el prop `mode`
 * decide si se renderiza expandido (sección dedicada con título "Hojas
 * del árbol asociadas") o como popover compacto activable desde la fila
 * superior de MAPA con un disparador "Árbol · N".
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
import { hijosSumaDirectos, ordenarHojasAlfabetico, parseLocalDateKey } from "@/lib/arbol-tiempo";
import type { Entregable } from "@/lib/types";
import { LazyDetails } from "./arbol-comunes";

type Layout = "card" | "inline";
type Mode = "expanded" | "popover";

interface Props {
  entregable: Entregable;
  /** Solo afecta a paddings/clases del contenedor; la lógica es la misma. */
  layout?: Layout;
  /**
   * "expanded" (por defecto): bloque dedicado con título completo.
   * "popover": disparador compacto "Árbol · N" en línea, con el panel
   * flotando absolutamente debajo (pensado para la fila superior de MAPA).
   */
  mode?: Mode;
}

export function EntregableHojasArbolPicker({ entregable, layout = "card", mode = "expanded" }: Props) {
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
        hojas: ordenarHojasAlfabetico(hijosSumaDirectos(nodosAnio, rama.id, anioArbol)),
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

  const todasMarcadas =
    hojasDisponibles.length > 0 && draft.length >= hojasDisponibles.length &&
    hojasDisponibles.every((hoja) => draft.includes(hoja.id));
  const marcarTodas = useCallback(() => {
    setDraft(hojasDisponibles.map((hoja) => hoja.id));
  }, [hojasDisponibles]);
  const quitarTodas = useCallback(() => setDraft([]), []);

  const containerClass =
    mode === "popover"
      ? "relative inline-block"
      : layout === "card"
        ? "rounded-lg border border-border/60 bg-surface/20"
        : "rounded-lg border border-border/50 bg-surface/30";

  const summaryNode = mode === "popover" ? (
    <summary
      onClick={(e) => e.stopPropagation()}
      className={`flex h-6 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-[10px] font-medium transition-colors marker:content-none [&::-webkit-details-marker]:hidden ${
        seleccionActual.length > 0
          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "text-muted opacity-60 hover:bg-surface hover:text-foreground hover:opacity-100"
      }`}
      title="Hojas del árbol asociadas"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.8 2c.5 5 0 11-7.8 14" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6" />
      </svg>
      <span>Árbol{seleccionActual.length > 0 ? ` · ${seleccionActual.length}` : ""}</span>
    </summary>
  ) : (
    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">
      <span aria-hidden className="text-[10px] transition-transform">{open ? "▼" : "▶"}</span>
      Hojas del árbol asociadas
    </summary>
  );

  const panelInner = (
    <>
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
          <div className="flex items-center justify-between gap-2 pb-1">
            <span className="text-[10px] text-muted">
              {draft.length} de {hojasDisponibles.length}
            </span>
            <button
              type="button"
              onClick={todasMarcadas ? quitarTodas : marcarTodas}
              className="rounded border border-border px-2 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-surface dark:text-zinc-200"
            >
              {todasMarcadas ? "Quitar todas" : "Marcar todas"}
            </button>
          </div>
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
    </>
  );

  const panelNode = mode === "popover" ? (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute left-0 top-full z-20 mt-1 w-[260px] space-y-2 rounded-lg border border-border/70 bg-background px-2.5 py-2 shadow-lg"
    >
      {panelInner}
    </div>
  ) : (
    <div className="space-y-2 border-t border-border/60 px-2.5 py-2">
      {panelInner}
    </div>
  );

  return (
    <LazyDetails
      className={containerClass}
      open={open}
      onToggle={(nextOpen) => {
        if (!nextOpen && open) guardar();
        setOpen(nextOpen);
      }}
      summary={summaryNode}
    >
      {panelNode}
    </LazyDetails>
  );
}
