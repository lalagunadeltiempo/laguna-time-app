"use client";

import { useMemo } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { generateId } from "@/lib/store";
import type { NodoArbol, PlanArbolConfigAnio, RegistroNodo } from "@/lib/types";
import {
  isoWeekLabelFromMondayKey,
  metaParaVista,
  planAgregadoEnPeriodo,
  realEfectivoEnPeriodo,
  tieneHijosSuma,
  type VistaPeriodoArbol,
  formatWeekRange,
} from "@/lib/arbol-tiempo";
import { RegistroInput } from "./RegistroInput";
import { CADENCIA_UI, TIPO_UI } from "./arbol-copy";

function cuadreMetaHijos(
  parent: NodoArbol,
  children: NodoArbol[],
  allNodes: NodoArbol[],
  vista: VistaPeriodoArbol,
  periodoKey: string,
  year: number,
  config: PlanArbolConfigAnio | undefined,
): string | null {
  const sumadores = children.filter((c) => c.relacionConPadre === "suma");
  if (sumadores.length === 0) return null;
  const pm = planAgregadoEnPeriodo(parent, allNodes, vista, periodoKey, year, config);
  if (pm === undefined) return null;
  let s = 0;
  for (const ch of sumadores) {
    const m = planAgregadoEnPeriodo(ch, allNodes, vista, periodoKey, year, config);
    if (m !== undefined) s += m;
  }
  if (Math.abs(s - pm) > 0.02) return `Σ hijos ${s.toFixed(2)} ≠ ${pm.toFixed(2)}`;
  return null;
}

const TIPO_CHIP: Record<NodoArbol["tipo"], string> = {
  resultado: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  palanca: "bg-sky-500/15 text-sky-900 dark:text-sky-100",
  accion: "bg-violet-500/15 text-violet-900 dark:text-violet-100",
};

export function NodoRow({
  node,
  depth,
  allNodes,
  registros,
  vista,
  year,
  periodoTipo,
  periodoKey,
  vacacionDisabled,
  expandedIds,
  toggleExpanded,
  onEdit,
  config,
}: {
  node: NodoArbol;
  depth: number;
  allNodes: NodoArbol[];
  registros: RegistroNodo[];
  vista: VistaPeriodoArbol;
  year: number;
  periodoTipo: RegistroNodo["periodoTipo"];
  periodoKey: string;
  vacacionDisabled: boolean;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  onEdit: (n: NodoArbol) => void;
  config: PlanArbolConfigAnio | undefined;
}) {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const children = useMemo(
    () => allNodes.filter((n) => n.parentId === node.id).sort((a, b) => a.orden - b.orden),
    [allNodes, node.id],
  );
  const hasChildren = children.length > 0;
  const open = expandedIds.has(node.id);
  const realSoloEnHijos = useMemo(() => tieneHijosSuma(allNodes, node.id, year), [allNodes, node.id, year]);
  const warn = useMemo(
    () =>
      hasChildren ? cuadreMetaHijos(node, children, allNodes, vista, periodoKey, year, config) : null,
    [node, children, allNodes, vista, periodoKey, year, config, hasChildren],
  );

  const metaShow = planAgregadoEnPeriodo(node, allNodes, vista, periodoKey, year, config);
  const realShow = realEfectivoEnPeriodo(registros, allNodes, node.id, vista, periodoKey, year);
  const existing = registros.find(
    (r) => r.nodoId === node.id && r.periodoTipo === periodoTipo && r.periodoKey === periodoKey,
  );

  const pct =
    metaShow !== undefined && metaShow > 0
      ? Math.min(100, Math.round((realShow / metaShow) * 100))
      : metaShow === 0
        ? 100
        : 0;

  const proyectosVinculados = useMemo(() => {
    if (!node.proyectoIds?.length) return [];
    const ids = new Set(node.proyectoIds);
    return state.proyectos.filter((p) => ids.has(p.id));
  }, [node.proyectoIds, state.proyectos]);

  const realDelta = metaShow !== undefined ? realShow - metaShow : undefined;

  return (
    <div className="select-none">
      <div
        className="flex flex-col gap-2 border-b border-border/40 py-2 pl-1 sm:flex-row sm:flex-wrap sm:items-start"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpanded(node.id)}
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-surface"
              aria-expanded={open}
              aria-label={open ? "Cerrar rama" : "Abrir rama"}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className={`transition-transform ${open ? "rotate-90" : ""}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : (
            <span className="inline-block w-7 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${TIPO_CHIP[node.tipo]}`}>
                {TIPO_UI[node.tipo]}
              </span>
              <span className="font-medium text-foreground">{node.nombre}</span>
              {node.metaValor !== undefined && (
                <span className="text-[10px] text-muted">
                  Objetivo: {node.metaValor}
                  {node.metaUnidad ? ` ${node.metaUnidad}` : ""} · {CADENCIA_UI[node.cadencia]}
                </span>
              )}
              {warn && (
                <span
                  className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-900 dark:text-amber-100"
                  title={warn}
                >
                  Revisa números
                </span>
              )}
            </div>
            {proyectosVinculados.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {proyectosVinculados.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"
                    title={`Proyecto vinculado: ${p.nombre}`}
                  >
                    Proy: {p.nombre}
                  </span>
                ))}
              </div>
            )}
            {node.notaAnioAnterior && (
              <p className="mt-1 max-w-prose text-[11px] italic text-muted">
                Año pasado: {node.notaAnioAnterior}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-muted">
                Hecho / objetivo:{" "}
                <strong className="tabular-nums text-foreground">{realShow.toFixed(2)}</strong>
                {metaShow !== undefined && (
                  <>
                    {" "}/ <span className="tabular-nums">{metaShow.toFixed(2)}</span>{" "}
                    <span className="tabular-nums text-muted">({pct}%)</span>
                  </>
                )}
              </span>
              {realDelta !== undefined && metaShow !== undefined && metaShow > 0 && (
                <span
                  className={`tabular-nums text-[10px] ${
                    realDelta >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
                  }`}
                >
                  {realDelta >= 0 ? "+" : ""}
                  {realDelta.toFixed(2)}
                </span>
              )}
              <div className="h-2 w-32 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2 sm:shrink-0">
          <RegistroInput
            nodoId={node.id}
            cadencia={node.cadencia}
            vista={vista}
            periodoTipo={periodoTipo}
            periodoKey={periodoKey}
            existing={existing}
            disabled={vacacionDisabled || realSoloEnHijos}
            onCommit={(patch) => {
              dispatch({
                type: "UPSERT_REGISTRO_NODO",
                payload: {
                  id: existing?.id ?? generateId(),
                  nodoId: node.id,
                  periodoTipo,
                  periodoKey,
                  valor: patch.valor,
                  nota: patch.nota,
                  estadoRealidad: patch.estadoRealidad,
                  realidadPorQue: patch.realidadPorQue,
                  creado: existing?.creado ?? new Date().toISOString(),
                  actualizado: new Date().toISOString(),
                },
              });
            }}
          />
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => onEdit(node)}
              className="min-h-[32px] rounded border border-border px-2 py-1 text-[11px] text-muted hover:bg-surface"
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={() => {
                dispatch({
                  type: "ADD_NODO_ARBOL",
                  payload: {
                    id: generateId(),
                    anio: node.anio,
                    parentId: node.id,
                    orden: children.length > 0 ? Math.max(...children.map((c) => c.orden)) + 1 : 0,
                    nombre: "Nuevo",
                    tipo: "accion",
                    cadencia: "semanal",
                    relacionConPadre: "explica",
                    contadorModo: "manual",
                    creado: new Date().toISOString(),
                  },
                });
              }}
              className="min-h-[32px] rounded border border-border px-2 py-1 text-[11px] text-muted hover:bg-surface"
              title="Añadir una meta dentro de esta"
            >
              + Aquí
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "¿Eliminar este nodo y todo lo que cuelga de él? El borrado se conserva al sincronizar.",
                  )
                )
                  dispatch({ type: "DELETE_NODO_ARBOL", id: node.id });
              }}
              className="min-h-[32px] rounded px-2 py-1 text-[11px] text-muted hover:text-red-600"
              aria-label="Eliminar"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
      {hasChildren && open && (
        <div>
          {children.map((ch) => (
            <NodoRow
              key={ch.id}
              node={ch}
              depth={depth + 1}
              allNodes={allNodes}
              registros={registros}
              vista={vista}
              year={year}
              periodoTipo={periodoTipo}
              periodoKey={periodoKey}
              vacacionDisabled={vacacionDisabled}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
              onEdit={onEdit}
              config={config}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Cabecera de periodo secundaria (solo etiqueta). */
export function PeriodoLabel({
  vista,
  weekMonday,
  mesKey,
  trimestreKey,
  year,
}: {
  vista: VistaPeriodoArbol;
  weekMonday?: string;
  mesKey?: string;
  trimestreKey?: string;
  year: number;
}) {
  if (vista === "semana" && weekMonday) {
    return (
      <span className="text-sm text-muted">
        {isoWeekLabelFromMondayKey(weekMonday)} · {formatWeekRange(weekMonday)}
      </span>
    );
  }
  if (vista === "mes" && mesKey) return <span className="text-sm text-muted">Mes {mesKey}</span>;
  if (vista === "trimestre" && trimestreKey) return <span className="text-sm text-muted">{trimestreKey}</span>;
  if (vista === "anio") return <span className="text-sm text-muted">Año {year}</span>;
  // Fallback que utiliza metaParaVista (legacy) — evita warning si se importa por error.
  void metaParaVista;
  return null;
}
