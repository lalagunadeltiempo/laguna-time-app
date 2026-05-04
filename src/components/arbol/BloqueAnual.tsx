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
import { useMemo, useState, type FormEvent } from "react";
import { useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { type NodoArbol, type RegistroNodo } from "@/lib/types";
import {
  hijosSumaDirectos,
  hijosSumaDirectosIdx,
  metaEfectivaNodoIdx,
  realAnioPasadoAgregadoIdx,
  type ArbolIndices,
} from "@/lib/arbol-tiempo";
import { NumberInput, PercentInput, fmtNum } from "./arbol-comunes";

interface BloqueAnualProps {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  idx: ArbolIndices;
  year: number;
  unidad: string;
}

export function BloqueAnual({ raiz, ramas, nodos, registros, idx, year, unidad }: BloqueAnualProps) {
  const dispatch = useAppDispatch();
  const [ramaHojaFormId, setRamaHojaFormId] = useState<string | null>(null);

  const metaAnual = raiz.metaValor ?? 0;
  const planRamasSuma = useMemo(
    () =>
      ramas
        .filter((r) => r.relacionConPadre === "suma")
        .reduce((acc, r) => acc + (metaEfectivaNodoIdx(idx, r) ?? 0), 0),
    [ramas, idx],
  );
  const diffRamas = metaAnual > 0 ? planRamasSuma - metaAnual : 0;
  const cuadreRamasOk = metaAnual === 0 || Math.abs(diffRamas) < 0.01;

  return (
    <details open className="rounded-xl border border-border bg-background">
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">
            <span aria-hidden className="mr-2 inline-block text-[10px] text-muted transition-transform">▼</span>
            ANUAL · {raiz.nombre}
          </h2>
          <div className="flex flex-wrap items-baseline gap-3 text-[11px] text-muted">
            <span>
              Objetivo:{" "}
              <strong className="tabular-nums text-foreground">
                {metaAnual > 0 ? `${fmtNum(metaAnual)} ${unidad}` : "—"}
              </strong>
            </span>
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
          </div>
        </div>
      </summary>

      <div className="space-y-3 border-t border-border/60 p-4">
        {/* Raíz editable: nombre, unidad y meta anual */}
        <div className="rounded border border-accent/30 bg-accent/5 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Nombre
              <input
                defaultValue={raiz.nombre}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== raiz.nombre) {
                    dispatch({ type: "UPDATE_NODO_ARBOL", id: raiz.id, changes: { nombre: v } });
                  }
                }}
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Unidad (ej. €)
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
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Objetivo anual ({unidad || "número"})
              <NumberInput
                value={raiz.metaValor}
                onCommit={(v) =>
                  dispatch({ type: "UPDATE_NODO_ARBOL", id: raiz.id, changes: { metaValor: v } })
                }
                ariaLabel={`Objetivo anual de ${raiz.nombre} ${year}`}
                unidad={unidad}
              />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-muted">
              Cambia el objetivo anual cuando quieras: el plan de trimestres, meses y semanas se recalcula solo. Lo real lo
              apuntas en las otras secciones.
            </p>
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
        </div>

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
                formAbiertoId={ramaHojaFormId}
                onToggleForm={(id) => setRamaHojaFormId((cur) => (cur === id ? null : id))}
              />
            ))
          )}
        </div>

        {/* Nueva rama */}
        <NuevaRamaInline
          raiz={raiz}
          onAdd={(payload) =>
            dispatch({
              type: "ADD_NODO_ARBOL",
              payload: {
                ...payload,
                id: generateId(),
                creado: new Date().toISOString(),
                orden: ramas.length,
              },
            })
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
  formAbiertoId,
  onToggleForm,
}: {
  rama: NodoArbol;
  raiz: NodoArbol;
  idx: ArbolIndices;
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  year: number;
  unidad: string;
  metaAnual: number;
  formAbiertoId: string | null;
  onToggleForm: (id: string) => void;
}) {
  const dispatch = useAppDispatch();
  const hojas = hijosSumaDirectosIdx(idx, rama.id);
  const tieneHojas = hojas.length > 0;
  const metaEffRama = metaEfectivaNodoIdx(idx, rama);
  const metaPlaneada = rama.metaValor;
  const cuentaParaTotal = rama.relacionConPadre === "suma";
  const pctTotal =
    metaAnual > 0 && metaEffRama !== undefined ? (metaEffRama / metaAnual) * 100 : undefined;
  const planeadaOk = metaPlaneada !== undefined && metaPlaneada > 0;

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
    <details className="rounded border border-border bg-surface/40" open={tieneHojas || formAbiertoId === rama.id}>
      <summary className="cursor-pointer list-none px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span aria-hidden className="text-[10px] text-muted">▶</span>
            <span className="text-sm font-medium text-foreground">{rama.nombre}</span>
            {!cuentaParaTotal && (
              <span className="rounded bg-surface px-1 py-0.5 text-[9px] text-muted">no suma</span>
            )}
          </div>
          <span className="text-[11px] text-muted">
            {tieneHojas ? (
              <>
                Suma hojas:{" "}
                <strong className="tabular-nums text-foreground">
                  {fmtNum(sumaHojasEff)} {unidad}
                </strong>
                {planeadaOk && !cuadreHojasOk && (
                  <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-900 dark:text-amber-100">
                    {diffHojas > 0
                      ? `te pasas ${fmtNum(Math.abs(diffHojas))}`
                      : `te faltan ${fmtNum(Math.abs(diffHojas))}`}
                  </span>
                )}
              </>
            ) : metaPlaneada !== undefined ? (
              <>
                Meta:{" "}
                <strong className="tabular-nums text-foreground">
                  {fmtNum(metaPlaneada)} {unidad}
                </strong>
              </>
            ) : (
              <span className="italic">sin meta</span>
            )}
            {cuentaParaTotal && pctTotal !== undefined && (
              <>
                {" · "}
                <strong className="tabular-nums text-foreground">
                  {pctTotal.toFixed(1).replace(".", ",")} %
                </strong>
                <span className="text-muted"> del total</span>
              </>
            )}
          </span>
        </div>
      </summary>

      <div className="space-y-3 border-t border-border/50 px-3 py-3">
        {/* Inputs de la rama */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Nombre
            <input
              defaultValue={rama.nombre}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== rama.nombre) {
                  dispatch({ type: "UPDATE_NODO_ARBOL", id: rama.id, changes: { nombre: v } });
                }
              }}
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            {tieneHojas ? `Meta planeada (${unidad || "número"})` : `Meta anual (${unidad || "número"})`}
            <NumberInput
              value={rama.metaValor}
              onCommit={(v) => dispatch({ type: "UPDATE_NODO_ARBOL", id: rama.id, changes: { metaValor: v } })}
              ariaLabel={tieneHojas ? `Meta planeada de ${rama.nombre}` : `Meta anual de ${rama.nombre}`}
              unidad={unidad}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            % del total anual
            <PercentInput
              value={pctTotal}
              disabled={metaAnual <= 0}
              title={metaAnual <= 0 ? "Pon primero el objetivo anual de la raíz" : undefined}
              onCommit={(p) => {
                if (metaAnual <= 0 || p === undefined) return;
                const nuevo = (metaAnual * p) / 100;
                dispatch({
                  type: "UPDATE_NODO_ARBOL",
                  id: rama.id,
                  changes: { metaValor: Math.round(nuevo * 100) / 100 },
                });
              }}
              ariaLabel={`Porcentaje del total anual de ${rama.nombre}`}
            />
          </label>
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
            onClick={() => onToggleForm(rama.id)}
            className="rounded-lg border border-accent/40 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
          >
            + hoja
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
          <button
            type="button"
            onClick={() => {
              const ok = window.confirm(`¿Eliminar la rama «${rama.nombre}» y sus hojas y apuntes?`);
              if (ok) dispatch({ type: "DELETE_NODO_ARBOL", id: rama.id });
            }}
            className="ml-auto rounded border border-red-400/50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-500/10 dark:text-red-300"
          >
            Borrar rama
          </button>
        </div>

        {/* Formulario nueva hoja */}
        {formAbiertoId === rama.id && (
          <FormNuevaHojaInline
            rama={rama}
            nodos={nodos}
            registros={registros}
            year={year}
            unidad={unidad}
            onClose={() => onToggleForm(rama.id)}
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
              />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function FilaHojaEditable({
  hoja,
  rama,
  idx,
  year,
  unidad,
}: {
  hoja: NodoArbol;
  rama: NodoArbol;
  idx: ArbolIndices;
  year: number;
  unidad: string;
}) {
  const dispatch = useAppDispatch();
  const metaPlaneadaRama = rama.metaValor;
  const planeadaOk = metaPlaneadaRama !== undefined && metaPlaneadaRama > 0;
  const pctRama =
    planeadaOk && hoja.metaValor !== undefined
      ? (hoja.metaValor / metaPlaneadaRama!) * 100
      : undefined;
  const ayHoja = realAnioPasadoAgregadoIdx(idx, hoja.id, "anio", String(year));

  return (
    <div className="rounded border border-border/50 bg-background/60 p-2">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground">{hoja.nombre}</span>
        <span className="text-[10px] text-muted">
          {ayHoja !== undefined && (
            <>
              AY {year - 1}:{" "}
              <strong className="tabular-nums text-foreground">
                {fmtNum(ayHoja)} {unidad}
              </strong>
            </>
          )}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Nombre
          <input
            defaultValue={hoja.nombre}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== hoja.nombre) {
                dispatch({ type: "UPDATE_NODO_ARBOL", id: hoja.id, changes: { nombre: v } });
              }
            }}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Meta anual ({unidad || "número"})
          <NumberInput
            value={hoja.metaValor}
            onCommit={(v) => dispatch({ type: "UPDATE_NODO_ARBOL", id: hoja.id, changes: { metaValor: v } })}
            ariaLabel={`Meta anual de ${hoja.nombre}`}
            unidad={unidad}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          % de la rama
          <PercentInput
            value={pctRama}
            disabled={!planeadaOk}
            title={!planeadaOk ? "Pon primero la meta planeada de la rama" : undefined}
            onCommit={(p) => {
              if (!planeadaOk || p === undefined || metaPlaneadaRama === undefined) return;
              dispatch({
                type: "UPDATE_NODO_ARBOL",
                id: hoja.id,
                changes: { metaValor: (metaPlaneadaRama * p) / 100 },
              });
            }}
            ariaLabel={`Porcentaje de ${hoja.nombre} sobre la meta de la rama`}
          />
        </label>
        <div className="flex items-end justify-end">
          <button
            type="button"
            onClick={() => {
              const ok = window.confirm(`¿Eliminar la hoja «${hoja.nombre}» y sus apuntes?`);
              if (ok) dispatch({ type: "DELETE_NODO_ARBOL", id: hoja.id });
            }}
            className="text-[11px] text-muted hover:text-red-600"
          >
            Eliminar hoja
          </button>
        </div>
      </div>
    </div>
  );
}

function FormNuevaHojaInline({
  rama,
  nodos,
  registros,
  year,
  unidad,
  onClose,
}: {
  rama: NodoArbol;
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  year: number;
  unidad: string;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const regsEnRama = useMemo(() => registros.filter((r) => r.nodoId === rama.id), [registros, rama.id]);
  const tieneRegsPropios = regsEnRama.length > 0;
  const [nombre, setNombre] = useState(tieneRegsPropios ? "Sin asignar" : "");
  const [meta, setMeta] = useState("");

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
    dispatch({
      type: "ADD_NODO_ARBOL",
      payload: {
        id: hojaId,
        anio: year,
        parentId: rama.id,
        orden,
        nombre: hojaNombre,
        tipo: "resultado",
        cadencia: "anual",
        relacionConPadre: "suma",
        metaValor: Number.isFinite(m) ? m : undefined,
        metaUnidad: rama.metaUnidad,
        contadorModo: "manual",
        creado: new Date().toISOString(),
      },
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
  onAdd,
}: {
  raiz: NodoArbol;
  onAdd: (n: Omit<NodoArbol, "id" | "creado">) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [meta, setMeta] = useState("");

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
        });
        setNombre("");
        setMeta("");
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
