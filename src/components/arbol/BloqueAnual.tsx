"use client";

/**
 * Bloque ANUAL del Árbol de objetivos.
 *
 * Es la ÚNICA sección editable del plan: raíz del año (objetivo total),
 * sus ramas y las hojas de cada rama. Los inputs €/% están sincronizados
 * por nodo (editar uno recalcula el otro en base al padre). No forzamos
 * el cuadre: si las hojas de una rama no suman la meta de la rama, se
 * muestra un avisito en amarillo para que el usuario lo vea pero pueda
 * seguir trabajando.
 *
 * El "real" NO se introduce aquí; se hace en Mensual o Semanal.
 */
import { useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { generateId } from "@/lib/store";
import {
  type Entregable,
  type NodoArbol,
  type PlanArbolConfigAnio,
  type RegistroNodo,
} from "@/lib/types";
import {
  collectSubtreeIds,
  findRaizOrigenAnioAnterior,
  hijosSumaDirectos,
  hijosSumaDirectosIdx,
  metaEfectivaNodoIdx,
  normalizarNombreNodo,
  reajustarHermanosPorPin,
  realAnioPasadoAgregadoIdx,
  realEfectivoEnPeriodoIdx,
  type ArbolIndices,
} from "@/lib/arbol-tiempo";
import {
  LazyDetails,
  NumberInput,
  PercentInput,
  fmtNum,
  usePersistedOpen,
} from "./arbol-comunes";

/**
 * Barra fina (real / meta). Verde si llega al 100%, accent en cualquier
 * otro caso. Mismo patrón visual que en BloqueMensual para que el cerebro
 * entienda "esto mide lo que llevo".
 *
 * Se renderiza con <span> + display:block porque vive dentro de <summary>,
 * cuyo modelo de contenido sólo admite phrasing content. Un <div> aquí
 * provoca HTML inválido y, en algunos navegadores, hace que clicks sobre
 * el summary no abran/cierren el details (se queda "atascado").
 */
function BarraReal({ real, meta }: { real: number; meta: number | undefined }) {
  if (!meta || meta <= 0) return null;
  const pct = Math.max(0, Math.min(100, (real / meta) * 100));
  return (
    <span className="mt-2 flex items-center gap-2" aria-hidden>
      <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
        <span
          className={`block h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-muted">
        {pct.toFixed(0)}%
      </span>
    </span>
  );
}

interface BloqueAnualProps {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  idx: ArbolIndices;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
}

export function BloqueAnual({
  raiz,
  ramas,
  nodos,
  registros,
  idx,
  config,
  year,
  unidad,
}: BloqueAnualProps) {
  const dispatch = useAppDispatch();
  const [opcionesOpen, setOpcionesOpen] = useState(false);
  const [avisoReajuste, setAvisoReajuste] = useState<string | null>(null);
  // Toggle: si está activo (defecto), editar la meta€ o % de la raíz/rama
  // dispara reescalado proporcional automático de los hijos. Persistimos
  // la preferencia por raíz en localStorage para que la usuaria no tenga
  // que reactivarlo cada año. Si lo desactiva, los inputs vuelven al
  // comportamiento clásico (sólo cambian el nodo) y los botones
  // "Reescalar..." quedan como vía manual.
  const { open: reescaladoAuto, onToggle: setReescaladoAuto } = usePersistedOpen(
    `arbol.reescaladoAuto.${raiz.id}`,
    true,
  );

  const metaAnual = raiz.metaValor ?? 0;
  const planRamasSuma = useMemo(
    () =>
      ramas
        .filter((r) => r.relacionConPadre === "suma")
        .reduce((acc, r) => acc + (metaEfectivaNodoIdx(idx, r) ?? 0), 0),
    [ramas, idx],
  );
  // Real anual (suma de todos los registros del año bajo la raíz). Se usa
  // para la barra de avance YTD que vive solo aquí, en la vista anual.
  const realRaiz = useMemo(
    () => realEfectivoEnPeriodoIdx(idx, raiz.id, "anio", String(year)),
    [idx, raiz.id, year],
  );
  const diffRamas = metaAnual > 0 ? planRamasSuma - metaAnual : 0;
  const cuadreRamasOk = metaAnual === 0 || Math.abs(diffRamas) < 0.01;

  // Botón "Traer estructura de <año-1>": ofrecemos el botón si hay
  // CUALQUIER raíz en el año anterior. El matching exacto por nombre se
  // intenta primero pero hay fallback a la única raíz disponible (la
  // usuaria suele renombrar la raíz cada año y antes los botones no
  // aparecían).
  const anioAnterior = year - 1;
  const raizOrigenAY = useMemo(
    () => findRaizOrigenAnioAnterior(nodos, year, raiz.id),
    [nodos, year, raiz.id],
  );
  const existeAnioAnterior = raizOrigenAY !== undefined;
  const nombreOrigenDifiere =
    raizOrigenAY !== undefined &&
    normalizarNombreNodo(raizOrigenAY.nombre) !== normalizarNombreNodo(raiz.nombre);
  const handleImportar = (modo: "plan" | "real" | "estructura") => {
    if (ramas.length > 0) {
      const ok = window.confirm(
        "Ya hay ramas este año. ¿Añadir también las del año anterior?",
      );
      if (!ok) return;
    }
    if (nombreOrigenDifiere && raizOrigenAY) {
      const ok = window.confirm(
        `La raíz de ${anioAnterior} se llama «${raizOrigenAY.nombre}» (distinto a la de este año). ¿Importamos su estructura igualmente?`,
      );
      if (!ok) return;
    }
    dispatch({ type: "IMPORT_SUBARBOL_ANIO_ANTERIOR", raizId: raiz.id, modo });
  };

  // Modo de distribución mensual del plan: días laborables (default
  // histórico) o patrón del año anterior (proporciones por nodo del real
  // de año-1, con fallback a días laborables si faltan datos).
  const distribucionMensualActual: "diasLaborables" | "patronAnioAnterior" =
    config?.distribucionMensual === "patronAnioAnterior" ? "patronAnioAnterior" : "diasLaborables";
  const handleCambiarDistribucion = (
    modo: "diasLaborables" | "patronAnioAnterior",
  ) => {
    if (modo === distribucionMensualActual) return;
    dispatch({ type: "SET_DISTRIBUCION_MENSUAL", anio: year, modo });
  };

  const dispararReajuste = (opts: {
    nodosBase: NodoArbol[];
    parentId: string;
    cambioId: string;
    nuevoPctCambio: number;
    metaPadre: number;
  }) => {
    const map = reajustarHermanosPorPin({
      nodos: opts.nodosBase,
      parentId: opts.parentId,
      cambioId: opts.cambioId,
      nuevoPctCambio: opts.nuevoPctCambio,
      metaPadre: opts.metaPadre,
    });
    for (const [id, metaValor] of map.entries()) {
      dispatch({ type: "UPDATE_NODO_ARBOL", id, changes: { metaValor } });
    }

    if (map.size === 0) {
      const hermanos = opts.nodosBase.filter(
        (n) =>
          n.parentId === opts.parentId &&
          n.relacionConPadre === "suma" &&
          n.id !== opts.cambioId,
      );
      const pctHermanos = hermanos.reduce((acc, h) => {
        const pct = opts.metaPadre > 0 ? ((h.metaValor ?? 0) / opts.metaPadre) * 100 : 0;
        return acc + (Number.isFinite(pct) ? pct : 0);
      }, 0);
      const total = opts.nuevoPctCambio + pctHermanos;
      if (Math.abs(total - 100) > 0.01) {
        setAvisoReajuste("No se pudo cuadrar al 100 %, quita algún pin para reajustar.");
      }
    }
  };

  return (
    <details open className="rounded-xl border border-border bg-background">
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-base font-semibold text-foreground">
            <span aria-hidden className="mr-2 inline-block text-[10px] text-muted transition-transform">▼</span>
            ANUAL · {raiz.nombre}
          </span>
          <span className="flex flex-wrap items-baseline gap-3 text-[11px] text-muted">
            <span>
              Objetivo:{" "}
              <strong className="tabular-nums text-foreground">
                {metaAnual > 0 ? `${fmtNum(metaAnual)} ${unidad}` : "—"}
              </strong>
            </span>
            {metaAnual > 0 && (
              <span>
                Real YTD:{" "}
                <strong className="tabular-nums text-foreground">
                  {fmtNum(realRaiz)} {unidad}
                </strong>
              </span>
            )}
            <span>
              Ramas suman:{" "}
              <strong
                className={`tabular-nums ${
                  cuadreRamasOk ? "text-foreground" : "text-amber-700 dark:text-amber-200"
                }`}
              >
                {fmtNum(planRamasSuma)} {unidad}
              </strong>
              {!cuadreRamasOk && (
                <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-900 dark:text-amber-100">
                  {diffRamas > 0
                    ? `te pasas ${fmtNum(Math.abs(diffRamas))} ${unidad}`
                    : `te faltan ${fmtNum(Math.abs(diffRamas))} ${unidad}`}
                </span>
              )}
            </span>
          </span>
        </span>
        <BarraReal real={realRaiz} meta={metaAnual} />
      </summary>

      <div className="space-y-3 border-t border-border/60 p-4">
        <div className="flex flex-wrap items-center gap-2 rounded border border-border/80 bg-surface/40 px-2 py-2">
          <InlineEditableText
            value={raiz.nombre}
            onCommit={(value) => dispatch({ type: "UPDATE_NODO_ARBOL", id: raiz.id, changes: { nombre: value } })}
            className="min-w-[10rem] text-sm font-semibold text-foreground"
          />
          <input
            defaultValue={raiz.metaUnidad ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (raiz.metaUnidad ?? "")) {
                dispatch({
                  type: "UPDATE_NODO_ARBOL",
                  id: raiz.id,
                  changes: { metaUnidad: v || undefined },
                });
              }
            }}
            aria-label={`Unidad de ${raiz.nombre}`}
            className="w-16 rounded border border-border bg-background px-2 py-1 text-[12px]"
          />
          <div className="w-40">
            <NumberInput
              value={raiz.metaValor}
              onCommit={(v) => {
                if (reescaladoAuto) {
                  dispatch({ type: "UPDATE_META_NODO_RESCALAR_HIJOS", id: raiz.id, metaValor: v });
                } else {
                  dispatch({ type: "UPDATE_NODO_ARBOL", id: raiz.id, changes: { metaValor: v } });
                }
              }}
              ariaLabel={`Objetivo anual de ${raiz.nombre} ${year}`}
              unidad={unidad}
              compact
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-expanded={opcionesOpen}
              aria-controls={`anual-opciones-${raiz.id}`}
              onClick={() => setOpcionesOpen((prev) => !prev)}
              className="rounded border border-border px-2 py-1 text-[11px] text-muted hover:bg-surface"
            >
              ⚙ Opciones {opcionesOpen ? "▴" : "▾"}
            </button>
          </div>
        </div>
        <details
          id={`anual-opciones-${raiz.id}`}
          open={opcionesOpen}
          onToggle={(e) => setOpcionesOpen((e.currentTarget as HTMLDetailsElement).open)}
          className="rounded border border-accent/30 bg-accent/5"
        >
          <summary className="sr-only">Opciones</summary>
          <div className="flex flex-wrap items-center gap-2 p-2">
            <label
              className="inline-flex cursor-pointer items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted hover:bg-surface"
              title="Si está activo, editar la meta de la raíz o de una rama recalcula sus hijas manteniendo proporciones. Las hojas individuales nunca se reescalan al editarse."
            >
              <input
                type="checkbox"
                checked={reescaladoAuto}
                onChange={(e) => setReescaladoAuto(e.target.checked)}
                className="accent-accent"
              />
              Reescalar al cambiar metas
            </label>
            <label
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted"
              title={`Cómo se reparte el plan anual entre los meses. "Días laborables" prorratea por días disponibles del calendario. "Patrón ${anioAnterior}" sigue las proporciones reales del mismo nodo en ${anioAnterior}; si no hay datos AY, cae a días laborables.`}
            >
              Reparto mensual:
              <select
                value={distribucionMensualActual}
                onChange={(e) =>
                  handleCambiarDistribucion(e.target.value as typeof distribucionMensualActual)
                }
                className="rounded border border-border bg-background px-1 py-0.5 text-[11px] text-foreground"
                aria-label="Modo de reparto mensual del plan anual"
              >
                <option value="diasLaborables">días laborables</option>
                <option value="patronAnioAnterior">patrón {anioAnterior}</option>
              </select>
            </label>
            {existeAnioAnterior && (
              <>
                <button
                  type="button"
                  onClick={() => handleImportar("estructura")}
                  className="rounded border border-accent/40 bg-accent/5 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
                >
                  Traer estructura {anioAnterior}
                </button>
                <button
                  type="button"
                  onClick={() => handleImportar("plan")}
                  className="rounded border border-accent/40 bg-accent/5 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
                >
                  Traer estructura {anioAnterior} (plan)
                </button>
                <button
                  type="button"
                  onClick={() => handleImportar("real")}
                  className="rounded border border-accent/40 bg-accent/5 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
                >
                  Traer estructura {anioAnterior} (reales)
                </button>
              </>
            )}
            {ramas.length > 0 && metaAnual > 0 && (
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: "UPDATE_META_NODO_RESCALAR_HIJOS",
                    id: raiz.id,
                    metaValor: metaAnual,
                  })
                }
                className="rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface"
              >
                Reescalar ramas al objetivo
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const ok = window.confirm(
                  `¿Borrar todo el año ${year} (${raiz.nombre})? Se eliminarán la raíz, las ramas, las hojas y todos los apuntes. No se puede deshacer.`,
                );
                if (ok) dispatch({ type: "DELETE_NODO_ARBOL", id: raiz.id });
              }}
              className="rounded border border-red-400/60 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-500/10 dark:text-red-300"
            >
              Borrar año {year}
            </button>
          </div>
        </details>
        {avisoReajuste && (
          <div className="flex items-center gap-2 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-900 dark:text-amber-100">
            <span>{avisoReajuste}</span>
            <button
              type="button"
              onClick={() => setAvisoReajuste(null)}
              className="ml-auto rounded border border-amber-700/40 px-1.5 py-0.5 text-[10px] hover:bg-amber-500/20"
            >
              cerrar
            </button>
          </div>
        )}

        {/* Listado de ramas */}
        <div className="space-y-2">
          {ramas.length === 0 ? (
            <p className="rounded border border-dashed border-border px-3 py-3 text-sm text-muted">
              Todavía no has añadido ramas. Empieza por las líneas que más facturen.
            </p>
          ) : (
            ramas.map((rama) => (
              <FilaRamaEditable
                key={rama.id}
                rama={rama}
                raiz={raiz}
                idx={idx}
                nodos={nodos}
                registros={registros}
                year={year}
                unidad={unidad}
                metaAnual={metaAnual}
                reescaladoAuto={reescaladoAuto}
                onDispararReajuste={dispararReajuste}
              />
            ))
          )}
        </div>

        {/* Nueva rama */}
        <NuevaRamaInline
          raiz={raiz}
          metaPadre={metaAnual}
          onAdd={(payload) =>
            {
              const id = generateId();
              const now = new Date().toISOString();
              const nuevoMeta =
                payload.pct !== undefined && metaAnual > 0
                  ? Math.round(((metaAnual * payload.pct) / 100) * 100) / 100
                  : payload.metaValor;
              const nodoNuevo: NodoArbol = {
                ...payload,
                id,
                creado: now,
                orden: ramas.length,
                metaValor: nuevoMeta,
              };
              dispatch({ type: "ADD_NODO_ARBOL", payload: nodoNuevo });
              const pctCambio = metaAnual > 0 ? ((nuevoMeta ?? 0) / metaAnual) * 100 : 0;
              dispararReajuste({
                nodosBase: [...nodos, nodoNuevo],
                parentId: raiz.id,
                cambioId: nodoNuevo.id,
                nuevoPctCambio: pctCambio,
                metaPadre: metaAnual,
              });
            }
          }
        />
      </div>
    </details>
  );
}

function FilaRamaEditable({
  rama,
  raiz,
  idx,
  nodos,
  registros,
  year,
  unidad,
  metaAnual,
  reescaladoAuto,
  onDispararReajuste,
}: {
  rama: NodoArbol;
  raiz: NodoArbol;
  idx: ArbolIndices;
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  year: number;
  unidad: string;
  metaAnual: number;
  reescaladoAuto: boolean;
  onDispararReajuste: (opts: {
    nodosBase: NodoArbol[];
    parentId: string;
    cambioId: string;
    nuevoPctCambio: number;
    metaPadre: number;
  }) => void;
}) {
  const dispatch = useAppDispatch();
  const [formNuevaHojaOpen, setFormNuevaHojaOpen] = useState(false);
  const hojas = hijosSumaDirectosIdx(idx, rama.id);
  const tieneHojas = hojas.length > 0;
  const metaEffRama = metaEfectivaNodoIdx(idx, rama);
  const metaPlaneada = rama.metaValor;
  const pctTotal =
    metaAnual > 0 && metaEffRama !== undefined ? (metaEffRama / metaAnual) * 100 : undefined;
  const planeadaOk = metaPlaneada !== undefined && metaPlaneada > 0;
  const realRama = useMemo(
    () => realEfectivoEnPeriodoIdx(idx, rama.id, "anio", String(year)),
    [idx, rama.id, year],
  );

  // Suma de hojas vs meta planeada de la rama (para el avisito de cuadre).
  const sumaHojasEff = useMemo(
    () =>
      hojas.reduce((acc, h) => {
        const m = metaEfectivaNodoIdx(idx, h);
        return acc + (m ?? 0);
      }, 0),
    [hojas, idx],
  );
  const diffHojas = planeadaOk ? sumaHojasEff - metaPlaneada! : 0;
  const cuadreHojasOk = !planeadaOk || Math.abs(diffHojas) < 0.01;

  // Datos del año pasado por hoja para el botón "Aplicar proporción AY".
  const ayHojas = hojas.map((h) => ({
    hoja: h,
    ay: realAnioPasadoAgregadoIdx(idx, h.id, "anio", String(year)),
  }));
  const sumAy = ayHojas.reduce((acc, x) => acc + (x.ay ?? 0), 0);
  const puedeAplicarAY =
    planeadaOk && sumAy > 0 && ayHojas.some((x) => x.ay !== undefined && x.ay > 0);
  const ayYear = year - 1;

  return (
    <LazyDetails
      defaultOpen={false}
      className="rounded border border-border bg-surface/20"
      summary={
        <summary className="cursor-pointer list-none px-2 py-1.5 marker:content-none [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden className="text-[10px] text-muted">▶</span>
            <InlineEditableText
              value={rama.nombre}
              className="min-w-[8rem] text-[13px] font-medium text-foreground"
              onCommit={(v) => dispatch({ type: "UPDATE_NODO_ARBOL", id: rama.id, changes: { nombre: v } })}
            />
            <div className="w-32" onClick={stopSummaryToggle}>
              <NumberInput
                value={rama.metaValor}
                compact
                onCommit={(v) => {
                  if (reescaladoAuto && tieneHojas) {
                    dispatch({ type: "UPDATE_META_NODO_RESCALAR_HIJOS", id: rama.id, metaValor: v });
                  } else {
                    dispatch({ type: "UPDATE_NODO_ARBOL", id: rama.id, changes: { metaValor: v } });
                  }
                  const nuevoPct = metaAnual > 0 ? (((v ?? 0) / metaAnual) * 100) : 0;
                  const nodosConCambio = nodos.map((n) =>
                    n.id === rama.id ? { ...n, metaValor: v } : n,
                  );
                  onDispararReajuste({
                    nodosBase: nodosConCambio,
                    parentId: raiz.id,
                    cambioId: rama.id,
                    nuevoPctCambio: nuevoPct,
                    metaPadre: metaAnual,
                  });
                }}
                ariaLabel={`Meta anual de ${rama.nombre}`}
                unidad={unidad}
              />
            </div>
            <div className="w-24" onClick={stopSummaryToggle}>
              <PercentInput
                value={pctTotal}
                disabled={metaAnual <= 0}
                onCommit={(p) => {
                  if (metaAnual <= 0 || p === undefined) return;
                  const nuevo = Math.round(((metaAnual * p) / 100) * 100) / 100;
                  if (reescaladoAuto && tieneHojas) {
                    dispatch({ type: "UPDATE_META_NODO_RESCALAR_HIJOS", id: rama.id, metaValor: nuevo });
                  } else {
                    dispatch({ type: "UPDATE_NODO_ARBOL", id: rama.id, changes: { metaValor: nuevo } });
                  }
                  const nodosConCambio = nodos.map((n) =>
                    n.id === rama.id ? { ...n, metaValor: nuevo } : n,
                  );
                  onDispararReajuste({
                    nodosBase: nodosConCambio,
                    parentId: raiz.id,
                    cambioId: rama.id,
                    nuevoPctCambio: p,
                    metaPadre: metaAnual,
                  });
                }}
                ariaLabel={`Porcentaje de ${rama.nombre}`}
              />
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "TOGGLE_PIN_PORCENTAJE", id: rama.id });
              }}
              onMouseDown={stopSummaryToggle}
              title={
                rama.metaPctFijo
                  ? "Quitar fijación"
                  : "Fijar este % (no se ajustará al cambiar otros)"
              }
              className={`rounded p-1 ${rama.metaPctFijo ? "text-accent" : "text-muted hover:text-foreground"}`}
            >
              <PinIcon filled={!!rama.metaPctFijo} />
            </button>
            <span className="ml-auto text-[11px] text-muted">
              YTD: <strong className="tabular-nums text-foreground">{fmtNum(realRama)} {unidad}</strong>
            </span>
            <span className="text-[11px] text-muted">
              hojas: <strong className="tabular-nums text-foreground">{fmtNum(sumaHojasEff)} {unidad}</strong>
            </span>
            <button
              type="button"
              onMouseDown={stopSummaryToggle}
              onClick={(e) => {
                e.stopPropagation();
                const ok = window.confirm(`¿Eliminar la rama «${rama.nombre}» y sus hojas y apuntes?`);
                if (!ok) return;
                const idsDelete = collectSubtreeIds(nodos, rama.id);
                const nodosFiltrados = nodos.filter((n) => !idsDelete.has(n.id));
                onDispararReajuste({
                  nodosBase: nodosFiltrados,
                  parentId: raiz.id,
                  cambioId: rama.id,
                  nuevoPctCambio: 0,
                  metaPadre: metaAnual,
                });
                dispatch({ type: "DELETE_NODO_ARBOL", id: rama.id });
              }}
              title="Eliminar rama"
              className="rounded p-1 text-muted hover:text-red-600"
            >
              <DeleteIcon />
            </button>
          </div>
          {!cuadreHojasOk && planeadaOk && (
            <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-200">
              {diffHojas > 0
                ? `Las hojas se pasan ${fmtNum(Math.abs(diffHojas))} ${unidad}`
                : `A las hojas les faltan ${fmtNum(Math.abs(diffHojas))} ${unidad}`}
            </div>
          )}
        </summary>
      }
    >
      <div className="space-y-2 border-t border-border/50 px-2 py-2">
        {/* Inputs de la rama */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Cuenta para el total
            <select
              value={rama.relacionConPadre}
              onChange={(e) =>
                dispatch({
                  type: "UPDATE_NODO_ARBOL",
                  id: rama.id,
                  changes: { relacionConPadre: e.target.value as NodoArbol["relacionConPadre"] },
                })
              }
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="suma">Sí, suma al total</option>
              <option value="explica">No suma, solo informa</option>
            </select>
          </label>
        </div>

        {/* Acciones: añadir hoja, proporción AY, borrar rama */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFormNuevaHojaOpen((v) => !v)}
            className="rounded-lg border border-accent/40 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
          >
            + Añadir hoja
          </button>
          {tieneHojas && (
            <button
              type="button"
              disabled={!puedeAplicarAY}
              title={
                !puedeAplicarAY
                  ? "Necesitas meta planeada > 0 y al menos una hoja con datos del año pasado"
                  : `Reparte ${fmtNum(metaPlaneada)} ${unidad} entre las hojas usando las proporciones reales de ${ayYear}`
              }
              onClick={() => {
                if (!puedeAplicarAY || metaPlaneada === undefined) return;
                for (const { hoja, ay } of ayHojas) {
                  if (ay === undefined || !Number.isFinite(ay) || ay <= 0) continue;
                  const nuevo = metaPlaneada * (ay / sumAy);
                  dispatch({
                    type: "UPDATE_NODO_ARBOL",
                    id: hoja.id,
                    changes: { metaValor: Math.round(nuevo * 100) / 100 },
                  });
                }
              }}
              className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              Aplicar proporción del año pasado
            </button>
          )}
          {tieneHojas && metaPlaneada !== undefined && metaPlaneada > 0 && (
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "UPDATE_META_NODO_RESCALAR_HIJOS",
                  id: rama.id,
                  metaValor: metaPlaneada,
                })
              }
              title={`Reparte ${fmtNum(metaPlaneada)} ${unidad} entre las hojas manteniendo las proporciones que ya tienen. Útil tras tocar metas a mano.`}
              className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface"
            >
              Reescalar hojas a la meta
            </button>
          )}
        </div>

        {/* Formulario nueva hoja */}
        {formNuevaHojaOpen && (
          <FormNuevaHojaInline
            rama={rama}
            nodos={nodos}
            registros={registros}
            year={year}
            unidad={unidad}
            onDispararReajuste={onDispararReajuste}
            onClose={() => setFormNuevaHojaOpen(false)}
          />
        )}

        {/* Hojas */}
        {tieneHojas && (
          <div className="space-y-2 border-l-2 border-accent/20 pl-3">
            {hojas.map((hoja) => (
              <FilaHojaEditable
                key={hoja.id}
                hoja={hoja}
                rama={rama}
                idx={idx}
                year={year}
                unidad={unidad}
                nodos={nodos}
                metaRama={rama.metaValor ?? 0}
                onDispararReajuste={onDispararReajuste}
              />
            ))}
          </div>
        )}
      </div>
    </LazyDetails>
  );
}

function FilaHojaEditable({
  hoja,
  rama,
  idx,
  year,
  unidad,
  nodos,
  metaRama,
  onDispararReajuste,
}: {
  hoja: NodoArbol;
  rama: NodoArbol;
  idx: ArbolIndices;
  year: number;
  unidad: string;
  nodos: NodoArbol[];
  metaRama: number;
  onDispararReajuste: (opts: {
    nodosBase: NodoArbol[];
    parentId: string;
    cambioId: string;
    nuevoPctCambio: number;
    metaPadre: number;
  }) => void;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [showBody, setShowBody] = useState(false);
  const metaPlaneadaRama = rama.metaValor;
  const planeadaOk = metaPlaneadaRama !== undefined && metaPlaneadaRama > 0;
  const pctRama =
    planeadaOk && hoja.metaValor !== undefined
      ? (hoja.metaValor / metaPlaneadaRama!) * 100
      : undefined;
  const ayHoja = realAnioPasadoAgregadoIdx(idx, hoja.id, "anio", String(year));
  const realHoja = useMemo(
    () => realEfectivoEnPeriodoIdx(idx, hoja.id, "anio", String(year)),
    [idx, hoja.id, year],
  );
  const entregablesConectados = useMemo(
    () =>
      (hoja.entregableIds ?? [])
        .map((id) => state.entregables.find((e) => e.id === id))
        .filter(Boolean) as Entregable[],
    [hoja.entregableIds, state.entregables],
  );
  const tieneFacturacionPositiva = useMemo(() => {
    const registros = idx.regsPorNodo.get(hoja.id) ?? [];
    return registros.some((r) => {
      if (r.valor <= 0) return false;
      if (r.periodoTipo === "anio") return r.periodoKey === String(year);
      return r.periodoKey.startsWith(`${year}-`);
    });
  }, [idx.regsPorNodo, hoja.id, year]);
  const entregablesDisponibles = useMemo(
    () => [...state.entregables].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [state.entregables],
  );
  const [nuevoEntregableId, setNuevoEntregableId] = useState("");
  return (
    <LazyDetails
      defaultOpen={false}
      open={showBody}
      onToggle={(open) => setShowBody(open)}
      className="rounded border border-border/50 bg-background/60"
      summary={
        <summary className="cursor-pointer list-none px-2 py-1.5 marker:content-none [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden className="text-[10px] text-muted">▶</span>
            <InlineEditableText
              value={hoja.nombre}
              className="min-w-[7rem] text-[12px] font-medium text-foreground"
              onCommit={(v) => dispatch({ type: "UPDATE_NODO_ARBOL", id: hoja.id, changes: { nombre: v } })}
            />
            <div className="w-32" onClick={stopSummaryToggle}>
              <NumberInput
                value={hoja.metaValor}
                compact
                onCommit={(v) => {
                  dispatch({ type: "UPDATE_NODO_ARBOL", id: hoja.id, changes: { metaValor: v } });
                  const pctCambio = metaRama > 0 ? (((v ?? 0) / metaRama) * 100) : 0;
                  const nodosConCambio = nodos.map((n) =>
                    n.id === hoja.id ? { ...n, metaValor: v } : n,
                  );
                  onDispararReajuste({
                    nodosBase: nodosConCambio,
                    parentId: rama.id,
                    cambioId: hoja.id,
                    nuevoPctCambio: pctCambio,
                    metaPadre: metaRama,
                  });
                }}
                ariaLabel={`Meta de ${hoja.nombre}`}
                unidad={unidad}
              />
            </div>
            <div className="w-24" onClick={stopSummaryToggle}>
              <PercentInput
                value={pctRama}
                disabled={!planeadaOk}
                title={!planeadaOk ? "Pon primero la meta planeada de la rama" : undefined}
                onCommit={(p) => {
                  if (!planeadaOk || p === undefined || metaPlaneadaRama === undefined) return;
                  const nuevoMeta = Math.round(((metaPlaneadaRama * p) / 100) * 100) / 100;
                  dispatch({
                    type: "UPDATE_NODO_ARBOL",
                    id: hoja.id,
                    changes: { metaValor: nuevoMeta },
                  });
                  const nodosConCambio = nodos.map((n) =>
                    n.id === hoja.id ? { ...n, metaValor: nuevoMeta } : n,
                  );
                  onDispararReajuste({
                    nodosBase: nodosConCambio,
                    parentId: rama.id,
                    cambioId: hoja.id,
                    nuevoPctCambio: p,
                    metaPadre: metaPlaneadaRama,
                  });
                }}
                ariaLabel={`Porcentaje de ${hoja.nombre}`}
              />
            </div>
            <button
              type="button"
              onMouseDown={stopSummaryToggle}
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "TOGGLE_PIN_PORCENTAJE", id: hoja.id });
              }}
              title={
                hoja.metaPctFijo
                  ? "Quitar fijación"
                  : "Fijar este % (no se ajustará al cambiar otros)"
              }
              className={`rounded p-1 ${hoja.metaPctFijo ? "text-accent" : "text-muted hover:text-foreground"}`}
            >
              <PinIcon filled={!!hoja.metaPctFijo} />
            </button>
            <span className="ml-auto text-[10px] text-muted">
              YTD: <strong className="tabular-nums text-foreground">{fmtNum(realHoja)} {unidad}</strong>
            </span>
            {ayHoja !== undefined && (
              <span className="text-[10px] text-muted">
                AY {year - 1}: <strong className="tabular-nums text-foreground">{fmtNum(ayHoja)} {unidad}</strong>
              </span>
            )}
            <button
              type="button"
              onMouseDown={stopSummaryToggle}
              onClick={(e) => {
                e.stopPropagation();
                const ok = window.confirm(`¿Eliminar la hoja «${hoja.nombre}» y sus apuntes?`);
                if (!ok) return;
                const nodosFiltrados = nodos.filter((n) => n.id !== hoja.id);
                onDispararReajuste({
                  nodosBase: nodosFiltrados,
                  parentId: rama.id,
                  cambioId: hoja.id,
                  nuevoPctCambio: 0,
                  metaPadre: metaRama,
                });
                dispatch({ type: "DELETE_NODO_ARBOL", id: hoja.id });
              }}
              title="Eliminar hoja"
              className="rounded p-1 text-muted hover:text-red-600"
            >
              <DeleteIcon />
            </button>
          </div>
        </summary>
      }
    >
      <div className="space-y-2 border-t border-border/40 px-2 py-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Descripción
            <textarea
              defaultValue={hoja.descripcion ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                dispatch({
                  type: "UPDATE_NODO_ARBOL",
                  id: hoja.id,
                  changes: { descripcion: v || undefined },
                });
              }}
              rows={2}
              className="rounded border border-border bg-background px-2 py-1.5 text-[12px]"
              placeholder="Notas de esta hoja"
            />
          </label>
          <div className="space-y-1.5">
            <div className="text-[11px] text-muted">Entregables conectados</div>
            <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded border border-border/60 bg-background px-2 py-1">
              {entregablesConectados.length === 0 && (
                <span className="text-[11px] italic text-muted">sin entregables conectados</span>
              )}
              {entregablesConectados.map((ent) => (
                <span
                  key={ent.id}
                  className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] text-foreground"
                >
                  {ent.nombre}
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: "UNLINK_ENTREGABLE_HOJA", entregableId: ent.id, hojaId: hoja.id })
                    }
                    className="text-muted hover:text-red-600"
                    aria-label={`Desconectar ${ent.nombre}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">+ entregable</span>
              <select
                value={nuevoEntregableId}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  dispatch({ type: "LINK_ENTREGABLE_HOJA", entregableId: id, hojaId: hoja.id });
                  setNuevoEntregableId("");
                }}
                className="rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
              >
                <option value="">Selecciona…</option>
                {entregablesDisponibles.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.nombre}
                  </option>
                ))}
              </select>
            </div>
            {tieneFacturacionPositiva && (hoja.entregableIds?.length ?? 0) === 0 && (
              <p className="text-[11px] text-muted">
                Hoja con facturación pero sin entregables conectados.
              </p>
            )}
          </div>
        </div>
      </div>
    </LazyDetails>
  );
}

function FormNuevaHojaInline({
  rama,
  nodos,
  registros,
  year,
  unidad,
  onDispararReajuste,
  onClose,
}: {
  rama: NodoArbol;
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  year: number;
  unidad: string;
  onDispararReajuste: (opts: {
    nodosBase: NodoArbol[];
    parentId: string;
    cambioId: string;
    nuevoPctCambio: number;
    metaPadre: number;
  }) => void;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const regsEnRama = useMemo(() => registros.filter((r) => r.nodoId === rama.id), [registros, rama.id]);
  const tieneRegsPropios = regsEnRama.length > 0;
  const [nombre, setNombre] = useState(tieneRegsPropios ? "Sin asignar" : "");
  const [meta, setMeta] = useState("");
  const [pct, setPct] = useState<number | undefined>(undefined);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tieneRegsPropios) {
      if (
        !window.confirm(
          "Esta rama ya tiene apuntes propios. Se moverán a una hoja «Sin asignar» para no perderlos. ¿Continuar?",
        )
      )
        return;
    }
    const hojaNombre = tieneRegsPropios ? "Sin asignar" : nombre.trim() || "Hoja";
    const hojaId = generateId();
    const siblings = hijosSumaDirectos(nodos, rama.id, year);
    const orden = siblings.length > 0 ? Math.max(...siblings.map((s) => s.orden), 0) + 1 : 0;
    const m = parseFloat(meta.replace(",", "."));
    const metaPadre = rama.metaValor ?? 0;
    const metaDesdePct =
      pct !== undefined && metaPadre > 0
        ? Math.round(((metaPadre * pct) / 100) * 100) / 100
        : undefined;
    const metaFinal = metaDesdePct ?? (Number.isFinite(m) ? m : undefined);
    const nodoNuevo: NodoArbol = {
      id: hojaId,
      anio: year,
      parentId: rama.id,
      orden,
      nombre: hojaNombre,
      tipo: "resultado",
      cadencia: "anual",
      relacionConPadre: "suma",
      metaValor: metaFinal,
      metaUnidad: rama.metaUnidad,
      contadorModo: "manual",
      creado: new Date().toISOString(),
    };
    dispatch({
      type: "ADD_NODO_ARBOL",
      payload: nodoNuevo,
    });
    const pctCambio = metaPadre > 0 ? ((metaFinal ?? 0) / metaPadre) * 100 : 0;
    onDispararReajuste({
      nodosBase: [...nodos, nodoNuevo],
      parentId: rama.id,
      cambioId: nodoNuevo.id,
      nuevoPctCambio: pctCambio,
      metaPadre,
    });
    if (tieneRegsPropios) {
      dispatch({ type: "REASSIGN_REGISTROS_NODO", fromNodoId: rama.id, toNodoId: hojaId });
    }
    onClose();
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-2 rounded border border-accent/30 bg-accent/5 p-2 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-[11px] text-muted sm:col-span-2">
        Nombre de la hoja
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Programa anual"
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          autoFocus
          disabled={tieneRegsPropios}
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Meta anual ({unidad || "número"})
        <input
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          placeholder="0"
          inputMode="decimal"
          className="rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
          disabled={tieneRegsPropios}
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        % de la rama
        <PercentInput
          value={pct}
          onCommit={setPct}
          ariaLabel={`Porcentaje de nueva hoja en ${rama.nombre}`}
          disabled={tieneRegsPropios || (rama.metaValor ?? 0) <= 0}
        />
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
        >
          Añadir hoja
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function NuevaRamaInline({
  raiz,
  metaPadre,
  onAdd,
}: {
  raiz: NodoArbol;
  metaPadre: number;
  onAdd: (n: Omit<NodoArbol, "id" | "creado"> & { pct?: number }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [meta, setMeta] = useState("");
  const [pct, setPct] = useState<number | undefined>(undefined);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full rounded border border-dashed border-border px-3 py-2 text-left text-sm text-muted hover:bg-surface"
      >
        + Añadir rama
      </button>
    );
  }

  return (
    <form
      className="grid grid-cols-1 gap-2 rounded border border-accent/30 bg-accent/5 p-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const m = parseFloat(meta.replace(",", "."));
        onAdd({
          anio: raiz.anio,
          parentId: raiz.id,
          orden: 0,
          nombre: nombre.trim() || "Rama",
          tipo: "resultado",
          cadencia: "anual",
          relacionConPadre: "suma",
          metaValor: Number.isFinite(m) ? m : undefined,
          metaUnidad: raiz.metaUnidad,
          contadorModo: "manual",
          pct,
        });
        setNombre("");
        setMeta("");
        setPct(undefined);
        setAbierto(false);
      }}
    >
      <label className="flex flex-col gap-1 text-[11px] text-muted sm:col-span-2">
        Nombre de la rama
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Grabaciones"
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Meta anual ({raiz.metaUnidad || "número"})
        <input
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          placeholder="0"
          inputMode="decimal"
          className="rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        % del total
        <PercentInput
          value={pct}
          onCommit={setPct}
          ariaLabel="Porcentaje de nueva rama"
          disabled={metaPadre <= 0}
        />
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
        >
          Crear rama
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function InlineEditableText({
  value,
  onCommit,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  return editing ? (
    <input
      value={text}
      autoFocus
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = text.trim();
        if (next && next !== value) onCommit(next);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(value);
          setEditing(false);
        }
      }}
      className={`rounded border border-border bg-background px-1 py-0.5 ${className ?? ""}`}
    />
  ) : (
    <button
      type="button"
      title="Doble click para editar"
      onDoubleClick={() => setEditing(true)}
      onClick={(e) => e.stopPropagation()}
      className={`text-left ${className ?? ""}`}
    >
      {value}
    </button>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function stopSummaryToggle(e: MouseEvent<HTMLElement>) {
  e.stopPropagation();
}
