"use client";

import { useState, useMemo, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useIsMentor } from "@/lib/usuario";
import { EditableText } from "./shared/EditableText";
import { COLOR_TRIMESTRE, colorMes, colorSemana, chipStylesFromHex } from "@/lib/colores-tiempo";
import {
  etiquetaMesCorta,
  mesesDeTrimestre,
  semanasDeMes,
  semanasDeMeses,
  etiquetaSemanaIso,
  rangoSemanaCorto,
} from "@/lib/semana-utils";
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
  /** Cuando el usuario pulsa un área desde el sidebar: scrollea + abre la sección. */
  scrollToAreaId?: string | null;
  onClearScrollToArea?: () => void;
}

function AmbitoHeader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-8">
      <EditableText value={value} onChange={onChange} tag="h1" className="text-3xl font-bold tracking-tight text-foreground" />
    </div>
  );
}

function toggleIn(arr: string[], key: string): string[] {
  return arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key].sort();
}

function FiltroChipQ({ active, year, q, onToggle }: { active: boolean; year: number; q: 1 | 2 | 3 | 4; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition-colors"
      style={chipStylesFromHex(COLOR_TRIMESTRE[q], active)}
      title={`${active ? "Quitar" : "Filtrar"} Q${q} ${year}`}
    >
      Q{q}
    </button>
  );
}

function FiltroChipMes({ active, mesKey, onToggle }: { active: boolean; mesKey: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase transition-colors"
      style={chipStylesFromHex(colorMes(mesKey), active)}
      title={`${active ? "Quitar" : "Filtrar"} ${etiquetaMesCorta(mesKey, false)}`}
    >
      {etiquetaMesCorta(mesKey)}
    </button>
  );
}

function FiltroChipSemana({ active, monday, onToggle }: { active: boolean; monday: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition-colors"
      style={chipStylesFromHex(colorSemana(monday), active)}
      title={`${active ? "Quitar" : "Filtrar"} ${etiquetaSemanaIso(monday)} (${rangoSemanaCorto(monday)})`}
    >
      {etiquetaSemanaIso(monday)}
    </button>
  );
}

interface MapaFiltrosProps {
  filterQ: string[];
  setFilterQ: (q: string[]) => void;
  filterMes: string[];
  setFilterMes: (m: string[]) => void;
  filterSemana: string[];
  setFilterSemana: (s: string[]) => void;
  filterDia: string[];
  setFilterDia: (d: string[]) => void;
  onClear: () => void;
}

function MapaFiltros({
  filterQ, setFilterQ,
  filterMes, setFilterMes,
  filterSemana, setFilterSemana,
  filterDia, setFilterDia,
  onClear,
}: MapaFiltrosProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [showSemanas, setShowSemanas] = useState(false);
  const [diaInput, setDiaInput] = useState(() => toDateKey(new Date()));

  // Meses disponibles: si hay Qs filtrados, sólo esos meses; si no, los 12 del año.
  const mesesDisponibles = useMemo<string[]>(() => {
    if (filterQ.length === 0) {
      return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    }
    const set = new Set<string>();
    for (const q of filterQ) {
      for (const m of mesesDeTrimestre(q)) set.add(m);
    }
    return [...set].sort();
  }, [filterQ, year]);

  // Semanas disponibles: si hay meses filtrados, semanas de esos meses;
  // si no, semanas del mes actual.
  const semanasDisponibles = useMemo<string[]>(() => {
    if (filterMes.length > 0) return semanasDeMeses(filterMes);
    const now = new Date();
    const mesKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return semanasDeMes(mesKey);
  }, [filterMes]);

  const hasAny =
    filterQ.length + filterMes.length + filterSemana.length + filterDia.length > 0;

  return (
    <div className="mb-6 space-y-2 rounded-xl border border-border bg-surface/30 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Filtrar por</span>
        {hasAny && (
          <button
            onClick={onClear}
            className="ml-auto rounded-md px-2 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium text-muted w-16">Trimestre</span>
        <button onClick={() => setYear(year - 1)} className="rounded px-1 text-[10px] text-muted hover:text-foreground" title="Año anterior">‹</button>
        <span className="text-[10px] tabular-nums text-muted">{year}</span>
        <button onClick={() => setYear(year + 1)} className="rounded px-1 text-[10px] text-muted hover:text-foreground" title="Año siguiente">›</button>
        {[1, 2, 3, 4].map((q) => {
          const key = `${year}-Q${q}`;
          return (
            <FiltroChipQ
              key={key}
              active={filterQ.includes(key)}
              year={year}
              q={q as 1 | 2 | 3 | 4}
              onToggle={() => setFilterQ(toggleIn(filterQ, key))}
            />
          );
        })}
        {filterQ.filter((k) => !k.startsWith(`${year}-`)).map((k) => {
          const q = parseInt(k.slice(-1), 10) as 1 | 2 | 3 | 4;
          const y2 = k.slice(0, 4);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilterQ(toggleIn(filterQ, k))}
              className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition-colors"
              style={chipStylesFromHex(COLOR_TRIMESTRE[q], true)}
              title={`Quitar Q${q} ${y2}`}
            >
              {`Q${q}'${y2.slice(2)}`}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium text-muted w-16">Mes</span>
        {mesesDisponibles.map((m) => (
          <FiltroChipMes
            key={m}
            active={filterMes.includes(m)}
            mesKey={m}
            onToggle={() => setFilterMes(toggleIn(filterMes, m))}
          />
        ))}
        {filterMes.filter((m) => !mesesDisponibles.includes(m)).map((m) => (
          <FiltroChipMes
            key={m}
            active
            mesKey={m}
            onToggle={() => setFilterMes(toggleIn(filterMes, m))}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium text-muted w-16">Semana</span>
        {!showSemanas && semanasDisponibles.length > 8 ? (
          <>
            {semanasDisponibles.slice(0, 8).map((s) => (
              <FiltroChipSemana key={s} active={filterSemana.includes(s)} monday={s} onToggle={() => setFilterSemana(toggleIn(filterSemana, s))} />
            ))}
            <button
              onClick={() => setShowSemanas(true)}
              className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] text-muted hover:text-foreground"
            >
              +{semanasDisponibles.length - 8} más
            </button>
          </>
        ) : (
          semanasDisponibles.map((s) => (
            <FiltroChipSemana key={s} active={filterSemana.includes(s)} monday={s} onToggle={() => setFilterSemana(toggleIn(filterSemana, s))} />
          ))
        )}
        {filterSemana.filter((s) => !semanasDisponibles.includes(s)).map((s) => (
          <FiltroChipSemana key={s} active monday={s} onToggle={() => setFilterSemana(toggleIn(filterSemana, s))} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium text-muted w-16">Día</span>
        <input
          type="date"
          value={diaInput}
          onChange={(e) => setDiaInput(e.target.value)}
          className="h-6 rounded-md border border-border bg-background px-1 text-[10px]"
        />
        <button
          type="button"
          onClick={() => { if (diaInput) setFilterDia(toggleIn(filterDia, diaInput)); }}
          className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] text-muted hover:bg-surface hover:text-foreground"
        >
          Añadir día
        </button>
        {filterDia.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setFilterDia(toggleIn(filterDia, d))}
            className="rounded-md border border-accent bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent"
            title={`Quitar ${d}`}
          >
            {new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PantallaMapa({ onOpenDetalle, highlightId, onClearHighlight, scrollToAreaId, onClearScrollToArea }: Props) {
  void onOpenDetalle;
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();

  useEffect(() => {
    if (!scrollToAreaId) return;
    // Damos un tick para que la sección se monte/abra antes de hacer scroll.
    const t = setTimeout(() => {
      const el = document.getElementById(`mapa-area-${scrollToAreaId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      onClearScrollToArea?.();
    }, 60);
    return () => clearTimeout(t);
  }, [scrollToAreaId, onClearScrollToArea]);

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

  const [filterQ, setFilterQ] = useState<string[]>([]);
  const [filterMes, setFilterMes] = useState<string[]>([]);
  const [filterSemana, setFilterSemana] = useState<string[]>([]);
  const [filterDia, setFilterDia] = useState<string[]>([]);

  const hasAnyFilter =
    filterQ.length + filterMes.length + filterSemana.length + filterDia.length > 0;

  const visibleFilter = useMemo<VisibleFilter | null>(() => {
    if (!hasAnyFilter) return null;
    const qSet = new Set(filterQ);
    const mSet = new Set(filterMes);
    const sSet = new Set(filterSemana);
    const dSet = new Set(filterDia);

    const projDirect = new Set<string>();
    const resDirect = new Set<string>();
    const entDirect = new Set<string>();

    for (const proy of state.proyectos) {
      const tmActivos = proy.trimestresActivos ?? [];
      const mActivos = proy.mesesActivos ?? [];
      if (tmActivos.some((t) => qSet.has(t)) || mActivos.some((m) => mSet.has(m))) {
        projDirect.add(proy.id);
      }
    }
    for (const res of state.resultados) {
      const mActivos = res.mesesActivos ?? [];
      const sActivos = res.semanasActivas ?? [];
      if (mActivos.some((m) => mSet.has(m)) || sActivos.some((s) => sSet.has(s))) {
        resDirect.add(res.id);
      }
    }
    for (const ent of state.entregables) {
      const sActivos = ent.semanasActivas ?? [];
      const dActivos = ent.diasPlanificados ?? [];
      if (sActivos.some((s) => sSet.has(s)) || dActivos.some((d) => dSet.has(d))) {
        entDirect.add(ent.id);
      }
    }

    // Propagación hacia arriba: si un entregable matchea, su resultado y proyecto pasan.
    const projSet = new Set<string>(projDirect);
    const resSet = new Set<string>(resDirect);
    const entSet = new Set<string>(entDirect);

    for (const ent of state.entregables) {
      if (!entSet.has(ent.id)) continue;
      resSet.add(ent.resultadoId);
    }
    for (const res of state.resultados) {
      if (!resSet.has(res.id)) continue;
      projSet.add(res.proyectoId);
    }

    // Propagación hacia abajo: si un proyecto/resultado matchea directamente,
    // todos sus hijos son visibles para que el usuario pueda explorar.
    for (const res of state.resultados) {
      if (projDirect.has(res.proyectoId)) resSet.add(res.id);
    }
    for (const ent of state.entregables) {
      if (resDirect.has(ent.resultadoId) || projDirect.has(state.resultados.find((r) => r.id === ent.resultadoId)?.proyectoId ?? "")) {
        entSet.add(ent.id);
      }
    }

    return {
      proyectos: projSet,
      resultados: resSet,
      entregables: entSet,
      pasos: new Set<string>(),
    };
  }, [hasAnyFilter, filterQ, filterMes, filterSemana, filterDia, state.proyectos, state.resultados, state.entregables]);

  function clearFilters() {
    setFilterQ([]);
    setFilterMes([]);
    setFilterSemana([]);
    setFilterDia([]);
  }

  return (
    <HighlightCtx.Provider value={highlightInfo}>
    <MapaFilterCtx.Provider value={visibleFilter}>
    <NotaSheetCtx.Provider value={notaSheetCtx}>
      <div className="w-full px-3 py-8 sm:px-6 md:px-10">
        <MapaFiltros
          filterQ={filterQ} setFilterQ={setFilterQ}
          filterMes={filterMes} setFilterMes={setFilterMes}
          filterSemana={filterSemana} setFilterSemana={setFilterSemana}
          filterDia={filterDia} setFilterDia={setFilterDia}
          onClear={clearFilters}
        />

        {hasAnyFilter && visibleFilter && visibleFilter.proyectos.size === 0 && (
          <div className="mb-6 rounded-lg border border-border bg-surface/50 px-4 py-6 text-center">
            <p className="text-sm text-muted">No hay proyectos planificados que coincidan con los filtros seleccionados.</p>
          </div>
        )}

        {isMentor
          ? <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">{state.ambitoLabels.empresa}</h1>
          : <AmbitoHeader value={state.ambitoLabels.empresa} onChange={(v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { empresa: v } })} />
        }
        {EMPRESA_ORDER.map((id) => (
          <AreaSection key={id} areaId={id} forceOpen={scrollToAreaId === id} />
        ))}

        {!isMentor && (
          <>
            <div className="my-12 border-t border-border" />
            <AmbitoHeader
              value={state.ambitoLabels.personal}
              onChange={(v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { personal: v } })}
            />
            {PERSONAL_ORDER.map((id) => (
              <AreaSection key={id} areaId={id} forceOpen={scrollToAreaId === id} />
            ))}
          </>
        )}
      </div>
      {sheetData && <NotaSheet data={sheetData} onClose={() => setSheetData(null)} />}
    </NotaSheetCtx.Provider>
    </MapaFilterCtx.Provider>
    </HighlightCtx.Provider>
  );
}
