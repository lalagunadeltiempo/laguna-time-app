"use client";

import { useMemo } from "react";
import { useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import type { NodoArbol, RegistroNodo } from "@/lib/types";
import {
  isoWeekLabelFromMondayKey,
  metaParaVista,
  sumarRegistrosNodoSimple,
  type VistaPeriodoArbol,
  formatWeekRange,
} from "@/lib/arbol-tiempo";
import { RegistroInput } from "./RegistroInput";
import { CADENCIA_UI, TIPO_UI } from "./arbol-copy";

function cuadreMetaHijos(parent: NodoArbol, children: NodoArbol[], vista: VistaPeriodoArbol): string | null {
  const sumadores = children.filter((c) => c.relacionConPadre === "suma");
  if (sumadores.length === 0) return null;
  const pm = metaParaVista(parent.cadencia, parent.metaValor, vista);
  if (pm === undefined) return null;
  let s = 0;
  for (const ch of sumadores) {
    const m = metaParaVista(ch.cadencia, ch.metaValor, vista);
    if (m !== undefined) s += m;
  }
  if (Math.abs(s - pm) > 0.02) return `Σ meta hijos ${s.toFixed(2)} ≠ meta ${pm.toFixed(2)}`;
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
}) {
  const dispatch = useAppDispatch();
  const children = useMemo(
    () => allNodes.filter((n) => n.parentId === node.id).sort((a, b) => a.orden - b.orden),
    [allNodes, node.id],
  );
  const hasChildren = children.length > 0;
  const open = expandedIds.has(node.id);
  const warn = useMemo(() => (hasChildren ? cuadreMetaHijos(node, children, vista) : null), [node, children, vista, hasChildren]);

  const metaShow = metaParaVista(node.cadencia, node.metaValor, vista);
  const realShow = sumarRegistrosNodoSimple(registros, node.id, vista, periodoKey, year);
  const existing = registros.find((r) => r.nodoId === node.id && r.periodoTipo === periodoTipo && r.periodoKey === periodoKey);

  const pct =
    metaShow !== undefined && metaShow > 0 ? Math.min(100, Math.round((realShow / metaShow) * 100)) : metaShow === 0 ? 100 : 0;

  return (
    <div className="select-none">
      <div
        className="flex flex-wrap items-start gap-2 border-b border-border/40 py-2 pl-1"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggleExpanded(node.id)}
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-surface"
            aria-expanded={open}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${open ? "rotate-90" : ""}`}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <span className="inline-block w-6 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${TIPO_CHIP[node.tipo]}`}>{TIPO_UI[node.tipo]}</span>
            <span className="font-medium text-foreground">{node.nombre}</span>
            {node.metaValor !== undefined && (
              <span className="text-[10px] text-muted">
                Objetivo: {node.metaValor}
                {node.metaUnidad ? ` ${node.metaUnidad}` : ""} · {CADENCIA_UI[node.cadencia]}
              </span>
            )}
            {warn && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-900 dark:text-amber-100" title={warn}>
                Revisa números
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
            <span className="text-muted">
              Hecho / objetivo: <strong className="tabular-nums text-foreground">{realShow.toFixed(2)}</strong>
              {metaShow !== undefined && (
                <>
                  {" "}
                  / {metaShow.toFixed(2)}{" "}
                  <span className="text-muted">({pct}%)</span>
                </>
              )}
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <RegistroInput
          nodoId={node.id}
          cadencia={node.cadencia}
          vista={vista}
          periodoTipo={periodoTipo}
          periodoKey={periodoKey}
          existing={existing}
          disabled={vacacionDisabled}
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
          <button type="button" onClick={() => onEdit(node)} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface">
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
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:bg-surface"
            title="Añadir una meta dentro de esta"
          >
            + Aquí
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("¿Eliminar este nodo y todo lo que cuelga de él?")) dispatch({ type: "DELETE_NODO_ARBOL", id: node.id });
            }}
            className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:text-red-600"
          >
            ✕
          </button>
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
  return null;
}
