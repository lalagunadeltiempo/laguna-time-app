"use client";

import { useState, useMemo, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useIsMentor } from "@/lib/usuario";
import { EditableText } from "./shared/EditableText";
import {
  HighlightCtx,
  MapaFilterCtx,
  NotaSheetCtx,
  NotaSheet,
  AreaSection,
  buildHighlightAncestors,
  toDateKey,
  EMPRESA_ORDER,
  PERSONAL_ORDER,
  type VisibleFilter,
  type HighlightInfo,
  type NotaSheetData,
} from "./mapa/MapaBlocks";
export { EditableText };

interface Props {
  onOpenDetalle?: (resultadoId: string) => void;
  highlightId?: string | null;
  onClearHighlight?: () => void;
}

function AmbitoHeader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-8">
      <EditableText value={value} onChange={onChange} tag="h1" className="text-3xl font-bold tracking-tight text-foreground" />
    </div>
  );
}

export function PantallaMapa({ onOpenDetalle, highlightId, onClearHighlight }: Props) {
  void onOpenDetalle;
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();

  const highlightInfo = useMemo<HighlightInfo | null>(() => {
    if (!highlightId) return null;
    return { targetId: highlightId, ancestors: buildHighlightAncestors(state, highlightId) };
  }, [highlightId, state]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => onClearHighlight?.(), 4000);
    return () => clearTimeout(timer);
  }, [highlightId, onClearHighlight]);

  const [sheetData, setSheetData] = useState<NotaSheetData | null>(null);
  const notaSheetCtx = useMemo(() => ({
    open: (data: NotaSheetData) => {
      if (window.innerWidth < 640) setSheetData(data);
    },
  }), []);

  const [dateFilterOn, setDateFilterOn] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => toDateKey(new Date()));
  const [dateTo, setDateTo] = useState(() => toDateKey(new Date()));

  const visibleFilter = useMemo<VisibleFilter | null>(() => {
    if (!dateFilterOn) return null;
    const pasoSet = new Set<string>();
    const entSet = new Set<string>();
    const resSet = new Set<string>();
    const projSet = new Set<string>();

    for (const p of state.pasos) {
      const day = p.inicioTs?.slice(0, 10) ?? p.finTs?.slice(0, 10);
      if (!day) continue;
      if (day >= dateFrom && day <= dateTo) pasoSet.add(p.id);
    }
    for (const p of state.pasos) {
      if (!pasoSet.has(p.id)) continue;
      entSet.add(p.entregableId);
    }
    for (const e of state.entregables) {
      if (!entSet.has(e.id)) continue;
      resSet.add(e.resultadoId);
    }
    for (const r of state.resultados) {
      if (!resSet.has(r.id)) continue;
      projSet.add(r.proyectoId);
    }
    return { proyectos: projSet, resultados: resSet, entregables: entSet, pasos: pasoSet };
  }, [dateFilterOn, dateFrom, dateTo, state.pasos, state.entregables, state.resultados]);

  const setToday = () => { const t = toDateKey(new Date()); setDateFrom(t); setDateTo(t); };
  const setThisWeek = () => {
    const now = new Date();
    const dow = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - dow + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    setDateFrom(toDateKey(mon)); setDateTo(toDateKey(sun));
  };

  return (
    <HighlightCtx.Provider value={highlightInfo}>
    <MapaFilterCtx.Provider value={visibleFilter}>
    <NotaSheetCtx.Provider value={notaSheetCtx}>
      <div className="w-full px-3 py-8 sm:px-6 md:px-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setDateFilterOn(!dateFilterOn)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${dateFilterOn ? "bg-accent text-white" : "border border-border bg-background text-muted hover:bg-surface"}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            {dateFilterOn ? "Filtro activo" : "Filtrar por fechas"}
          </button>
          {dateFilterOn && (
            <>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground" />
              <span className="text-xs text-muted">—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground" />
              <button onClick={setToday} className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted hover:bg-surface">Hoy</button>
              <button onClick={setThisWeek} className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted hover:bg-surface">Esta semana</button>
              <button onClick={() => setDateFilterOn(false)} className="text-[10px] text-accent hover:underline">Quitar filtro</button>
            </>
          )}
        </div>

        {dateFilterOn && visibleFilter && visibleFilter.pasos.size === 0 && (
          <div className="mb-6 rounded-lg border border-border bg-surface/50 px-4 py-6 text-center">
            <p className="text-sm text-muted">No hay actividad registrada en este rango de fechas (los items sin actividad aparecen atenuados)</p>
          </div>
        )}

        {isMentor
          ? <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">{state.ambitoLabels.empresa}</h1>
          : <AmbitoHeader value={state.ambitoLabels.empresa} onChange={(v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { empresa: v } })} />
        }
        {EMPRESA_ORDER.map((id) => <AreaSection key={id} areaId={id} />)}

        {!isMentor && (
          <>
            <div className="my-12 border-t border-border" />
            <AmbitoHeader
              value={state.ambitoLabels.personal}
              onChange={(v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { personal: v } })}
            />
            {PERSONAL_ORDER.map((id) => <AreaSection key={id} areaId={id} />)}
          </>
        )}
      </div>
      {sheetData && <NotaSheet data={sheetData} onClose={() => setSheetData(null)} />}
    </NotaSheetCtx.Provider>
    </MapaFilterCtx.Provider>
    </HighlightCtx.Provider>
  );
}
