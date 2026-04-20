"use client";

import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { NotasSection } from "./shared/NotasSection";
import { EditableText } from "./shared/EditableText";
import { ReviewBadge } from "./shared/ReviewBadge";
import ProgramacionPicker from "./shared/ProgramacionPicker";
import HierarchyPicker from "./shared/HierarchyPicker";
export { NotasSection, EditableText };
import {
  AREAS_PERSONAL,
  AREAS_EMPRESA,
  AREA_COLORS,
  ambitoDeArea,
  type Area,
  type AreaPersonal,
  type AreaEmpresa,
  type Proyecto,
  type Resultado,
  type Entregable,
  type Paso,
  type PlantillaProceso,
  type TipoEntregable,
  type PlanNivel,
  type EstadoEntregable,
  type Programacion,
} from "@/lib/types";

const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function formatFechaInicio(f: string, planNivel?: PlanNivel): string {
  const d = new Date(f + "T12:00:00");
  if (isNaN(d.getTime())) return f;
  if (planNivel === "trimestre") {
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `T${q} ${d.getFullYear()}`;
  }
  if (planNivel === "mes") {
    return MESES_LARGOS[d.getMonth()];
  }
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function computeEstadoOnPlan(planNivel: PlanNivel, fechaInicio: string, currentEstado: EstadoEntregable): EstadoEntregable {
  if (currentEstado === "hecho" || currentEstado === "cancelada" || currentEstado === "en_espera") return currentEstado;
  if (planNivel === "trimestre") return "planificado";
  const now = new Date();
  const target = new Date(fechaInicio + "T12:00:00");
  if (planNivel === "mes") {
    const isCurrent = target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth();
    return isCurrent ? "en_proceso" : "planificado";
  }
  if (planNivel === "semana") {
    const dow = now.getDay() || 7;
    const monday = new Date(now); monday.setDate(now.getDate() - dow + 1); monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59);
    return target >= monday && target <= sunday ? "en_proceso" : "planificado";
  }
  // dia
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return fechaInicio <= todayStr ? "en_proceso" : "planificado";
}

function PlanPicker({ onSelect, onCancel, showDayLevel = true }: {
  onSelect: (fechaInicio: string, planNivel: PlanNivel) => void;
  onCancel: () => void;
  showDayLevel?: boolean;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentQ = Math.floor(currentMonth / 3);
  const customDateRef = useRef<HTMLInputElement>(null);

  function pad(n: number) { return String(n).padStart(2, "0"); }

  function selectMonth(m: number) {
    onSelect(`${currentYear}-${pad(m + 1)}-01`, "mes");
  }
  function selectQuarter(q: number) {
    const firstMonth = q * 3;
    onSelect(`${currentYear}-${pad(firstMonth + 1)}-01`, "trimestre");
  }
  function selectToday() {
    onSelect(`${currentYear}-${pad(currentMonth + 1)}-${pad(now.getDate())}`, "dia");
  }
  function selectThisWeek() {
    const dow = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - dow + 1);
    onSelect(`${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`, "semana");
  }
  function selectExactDate(dateStr: string) {
    if (dateStr) onSelect(dateStr, "dia");
  }

  return (
    <div className="ml-2 mb-2 space-y-2 px-3 sm:ml-6 md:ml-12">
      {showDayLevel && (
        <div className="flex flex-wrap gap-2">
          <button onClick={selectToday}
            className="rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20">Hoy</button>
          <button onClick={selectThisWeek}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:bg-accent-soft">Esta semana</button>
        </div>
      )}
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Mes</p>
        <div className="grid grid-cols-6 gap-1">
          {MESES_CORTOS.map((label, i) => (
            <button key={i} onClick={() => selectMonth(i)}
              className={`rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors ${
                i === currentMonth ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground hover:border-accent hover:bg-accent-soft"
              }`}>{label}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Trimestre</p>
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((q) => (
            <button key={q} onClick={() => selectQuarter(q)}
              className={`rounded-md border px-3 py-1 text-[11px] font-medium transition-colors ${
                q === currentQ ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground hover:border-accent hover:bg-accent-soft"
              }`}>Q{q + 1}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {showDayLevel && (
          <>
            <button onClick={() => customDateRef.current?.showPicker()}
              className="rounded-lg border border-accent/50 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20">Fecha exacta...</button>
            <input ref={customDateRef} type="date" onChange={(e) => selectExactDate(e.target.value)}
              className="sr-only" tabIndex={-1} aria-hidden="true" />
          </>
        )}
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground">Cancelar</button>
      </div>
    </div>
  );
}

interface VisibleFilter {
  proyectos: Set<string>;
  resultados: Set<string>;
  entregables: Set<string>;
  pasos: Set<string>;
}
const MapaFilterCtx = createContext<VisibleFilter | null>(null);
function useMapaFilter() { return useContext(MapaFilterCtx); }

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  onOpenDetalle?: (resultadoId: string) => void;
  highlightId?: string | null;
  onClearHighlight?: () => void;
}

/* ---- highlight helpers ---- */
interface HighlightInfo {
  targetId: string;
  ancestors: Set<string>;
}
const HighlightCtx = createContext<HighlightInfo | null>(null);
function useHighlight() { return useContext(HighlightCtx); }

interface NotaSheetData {
  title: string;
  nivel: "paso" | "entregable" | "resultado" | "proyecto" | "plantilla";
  targetId: string;
  contextoNotas?: string;
  urls?: { nombre: string; url: string }[];
}
const NotaSheetCtx = createContext<{ open: (data: NotaSheetData) => void }>({ open: () => {} });
function useNotaSheet() { return useContext(NotaSheetCtx); }

function buildHighlightAncestors(state: { pasos: Paso[]; entregables: Entregable[]; resultados: Resultado[]; proyectos: Proyecto[] }, targetId: string): Set<string> {
  const a = new Set<string>();

  const paso = state.pasos.find(p => p.id === targetId);
  if (paso) {
    a.add(paso.entregableId);
    const ent = state.entregables.find(e => e.id === paso.entregableId);
    if (ent) { a.add(ent.resultadoId); const res = state.resultados.find(r => r.id === ent.resultadoId); if (res) { a.add(res.proyectoId); const proj = state.proyectos.find(p => p.id === res.proyectoId); if (proj) a.add(proj.area); } }
    return a;
  }
  const ent = state.entregables.find(e => e.id === targetId);
  if (ent) {
    a.add(ent.resultadoId);
    const res = state.resultados.find(r => r.id === ent.resultadoId);
    if (res) { a.add(res.proyectoId); const proj = state.proyectos.find(p => p.id === res.proyectoId); if (proj) a.add(proj.area); }
    return a;
  }
  const res = state.resultados.find(r => r.id === targetId);
  if (res) {
    a.add(res.proyectoId);
    const proj = state.proyectos.find(p => p.id === res.proyectoId);
    if (proj) a.add(proj.area);
    return a;
  }
  const proj = state.proyectos.find(p => p.id === targetId);
  if (proj) { a.add(proj.area); return a; }
  return a;
}

function NotaSheet({ data, onClose }: { data: NotaSheetData; onClose: () => void }) {
  const state = useAppState();
  const backdropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const notas = useMemo(() => {
    if (data.nivel === "paso") return state.pasos.find((p) => p.id === data.targetId)?.notas ?? [];
    if (data.nivel === "entregable") return state.entregables.find((e) => e.id === data.targetId)?.notas ?? [];
    if (data.nivel === "resultado") return state.resultados.find((r) => r.id === data.targetId)?.notas ?? [];
    if (data.nivel === "proyecto") return state.proyectos.find((p) => p.id === data.targetId)?.notas ?? [];
    if (data.nivel === "plantilla") return state.plantillas.find((p) => p.id === data.targetId)?.notas ?? [];
    return [];
  }, [state, data.nivel, data.targetId]);

  return (
    <div ref={backdropRef} className="fixed inset-0 z-[80] flex items-end sm:hidden"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background px-4 pb-6 pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">{data.title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {data.contextoNotas && (
          <div className="mb-4 rounded-lg bg-surface/50 px-4 py-3">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{data.contextoNotas}</p>
            <p className="mt-1 text-xs text-muted italic">Nota de contexto</p>
          </div>
        )}
        <NotasSection notas={notas} nivel={data.nivel} targetId={data.targetId} />
        {data.urls && data.urls.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Enlaces</p>
            {data.urls.map((u, i) => (
              <a key={i} href={u.url} target="_blank" rel="noopener noreferrer"
                className="block rounded-lg bg-surface/30 px-4 py-2.5 text-sm text-accent underline hover:text-accent/80">
                {u.nombre || u.url}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function toggleOrSheet(
  current: boolean,
  toggle: (v: boolean) => void,
  openSheet: (data: NotaSheetData) => void,
  data: NotaSheetData,
) {
  if (typeof window !== "undefined" && window.innerWidth < 640) {
    openSheet(data);
  } else {
    toggle(!current);
  }
}

const EMPRESA_ORDER: AreaEmpresa[] = ["financiera", "operativa", "comercial", "administrativa"];
const PERSONAL_ORDER: AreaPersonal[] = ["fisico", "emocional", "mental", "espiritual"];

function areaLabel(id: Area): string {
  return [...AREAS_EMPRESA, ...AREAS_PERSONAL].find((a) => a.id === id)?.label ?? id;
}

/* ============================================================
   MAIN
   ============================================================ */

export function PantallaMapa({ onOpenDetalle, highlightId, onClearHighlight }: Props) {
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


/* ============================================================
   REORDER ARROWS
   ============================================================ */

function MoveArrows({ canUp, canDown, onUp, onDown }: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <button onClick={(e) => { e.stopPropagation(); onUp(); }} disabled={!canUp}
        className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-20" aria-label="Subir">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDown(); }} disabled={!canDown}
        className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-20" aria-label="Bajar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
    </span>
  );
}

/* ============================================================
   ADD BUTTON
   ============================================================ */

function AddButton({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
  const [active, setActive] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (active) ref.current?.focus(); }, [active]);

  const submit = () => {
    if (text.trim()) { onAdd(text.trim()); setText(""); }
    setActive(false);
  };

  if (active) {
    return (
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setActive(false); }}
        placeholder={`Nombre del ${label.toLowerCase()}...`}
        className="mt-3 w-full rounded-xl border-2 border-dashed border-border bg-background px-4 py-3 text-base text-foreground outline-none placeholder:text-muted focus:border-accent"
      />
    );
  }

  return (
    <button onClick={() => setActive(true)}
      className="mt-3 flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      Añadir {label.toLowerCase()}
    </button>
  );
}

/* ============================================================
   DELETE BUTTON
   ============================================================ */

function DeleteBtn({ onDelete }: { onDelete: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
      className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted opacity-40 transition-all hover:bg-red-50 hover:text-red-500 sm:opacity-0 group-hover/row:opacity-100 dark:hover:bg-red-500/10"
      aria-label="Eliminar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

/* ============================================================
   TOGGLE ROW
   ============================================================ */

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const MONTH_NAMES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function ScheduleBadge({ programacion, onClick }: { programacion: Programacion | null; onClick?: () => void }) {
  if (!programacion) return null;
  let label: string;
  switch (programacion.tipo) {
    case "diario": label = "Diario"; break;
    case "semanal": label = `Semanal${programacion.diaSemana != null ? ` · ${DAY_NAMES[programacion.diaSemana]}` : ""}`; break;
    case "mensual": {
      if (programacion.semanaMes === "primera") label = "Mensual · 1ª sem";
      else if (programacion.semanaMes === "ultima") label = "Mensual · últ. sem";
      else if (programacion.diaMes === -1) label = "Mensual · último día";
      else label = programacion.diaMes ? `Mensual · día ${programacion.diaMes}` : "Mensual";
      break;
    }
    case "trimestral": label = "Trimestral"; break;
    case "anual": label = `Anual · ${MONTH_NAMES_SHORT[programacion.mesAnual ?? 0]}`; break;
    case "demanda": label = "A demanda"; break;
    default: return null;
  }
  const isAuto = programacion.tipo !== "demanda";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag onClick={onClick ? (e: React.MouseEvent) => { e.stopPropagation(); onClick(); } : undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isAuto ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-700/20 dark:text-gray-400"
      }${onClick ? " cursor-pointer hover:ring-1 hover:ring-green-300" : ""}`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        {isAuto
          ? <><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" /></>
          : <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>
        }
      </svg>
      {label}
    </Tag>
  );
}

function ToggleRow({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: React.ReactNode }) {
  void open;
  return (
    <div
      onClick={onToggle}
      className="group/row flex min-h-[48px] min-w-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
    >
      {children}
    </div>
  );
}

/* ============================================================
   ÁMBITO HEADER
   ============================================================ */

function AmbitoHeader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-8">
      <EditableText value={value} onChange={onChange} tag="h1" className="text-3xl font-bold tracking-tight text-foreground" />
    </div>
  );
}

/* ============================================================
   AREA SECTION
   ============================================================ */

function AreaSection({ areaId }: { areaId: Area }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const { nombre: currentUser } = useUsuario();
  const filter = useMapaFilter();
  const highlight = useHighlight();
  const hasFilter = !!filter;
  const c = AREA_COLORS[areaId];
  const label = areaLabel(areaId);

  const allProyectos = state.proyectos.filter((p) => p.area === areaId);
  const filteredCount = filter ? allProyectos.filter((p) => filter.proyectos.has(p.id)).length : allProyectos.length;
  const hasMatchingProjects = !filter || filteredCount > 0;
  const [open, setOpen] = useState(hasFilter && hasMatchingProjects);
  const [openProj, setOpenProj] = useState(hasFilter && hasMatchingProjects);
  const [openSOP, setOpenSOP] = useState(false);

  useEffect(() => {
    if (hasFilter && hasMatchingProjects) { setOpen(true); setOpenProj(true); }
  }, [hasFilter, hasMatchingProjects]);

  useEffect(() => {
    if (highlight?.ancestors.has(areaId)) { setOpen(true); setOpenProj(true); }
  }, [highlight, areaId]);
  const sops = state.plantillas.filter((pl) => pl.area === areaId);

  return (
    <section className="mb-6">
      <button onClick={() => setOpen(!open)}
        className="mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-surface">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white ${c.dot}`}>{c.initial}</span>
        <h2 className={`text-xl font-bold uppercase tracking-wide ${c.text}`}>{label}</h2>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`ml-auto text-muted transition-transform ${open ? "rotate-90" : ""}`}>
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>

      {open && (
        <div className="ml-1 border-l-[3px] pl-2 sm:ml-3 sm:pl-3 md:ml-6 md:pl-6" style={{ borderColor: AREA_COLORS[areaId]?.hex ?? "#888" }}>

          {/* PROYECTOS */}
          <div className="mb-8">
            <button onClick={() => setOpenProj(!openProj)} className="mb-3 flex w-full items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted hover:text-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
              Proyectos
              <span className="text-xs font-normal">({filteredCount})</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                className={`ml-auto transition-transform ${openProj ? "rotate-90" : ""}`}>
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
            {openProj && (
              <>
                {allProyectos.length > 0 ? (
                  <div className="space-y-2">
                    {[...allProyectos].sort((a, b) => {
                      const aOp = a.tipo === "operacion" ? 0 : 1;
                      const bOp = b.tipo === "operacion" ? 0 : 1;
                      if (aOp !== bOp) return aOp - bOp;
                      const aF = a.fechaInicio ?? "9999";
                      const bF = b.fechaInicio ?? "9999";
                      return aF.localeCompare(bF);
                    }).map((proj, i) => (
                      <ProyectoBlock key={proj.id} proyecto={proj} index={i} total={allProyectos.length} />
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-base italic text-muted">Sin proyectos</p>
                )}
                {!isMentor && (
                  <AddButton label="Proyecto" onAdd={(nombre) =>
                    dispatch({ type: "ADD_PROYECTO", payload: { id: generateId(), nombre, descripcion: null, area: areaId, creado: new Date().toISOString(), fechaInicio: null } })
                  } />
                )}
              </>
            )}
          </div>

          {/* PROCESOS — hidden when date filter active */}
          {!hasFilter && <div className="mb-4">
            <button onClick={() => setOpenSOP(!openSOP)} className="mb-3 flex w-full items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted hover:text-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted">
                <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
              </svg>
              Procesos
              <span className="text-xs font-normal">({sops.length})</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                className={`ml-auto transition-transform ${openSOP ? "rotate-90" : ""}`}>
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
            {openSOP && (
              <>
                {sops.length > 0 ? (
                  <div className="space-y-2">
                    {sops.map((sop, i) => (
                      <SOPBlock key={sop.id} sop={sop} index={i} total={sops.length} />
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-base italic text-muted">Sin procesos</p>
                )}
                {!isMentor && (
                  <AddButton label="Proceso" onAdd={(nombre) =>
                    dispatch({ type: "ADD_PLANTILLA", payload: { id: generateId(), nombre, area: areaId, objetivo: "", disparador: "", programacion: null, proyectoId: null, responsableDefault: currentUser, pasos: [], herramientas: [], excepciones: "", dependeDeIds: [], creado: new Date().toISOString() } })
                  } />
                )}
              </>
            )}
          </div>}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   PROYECTO
   ============================================================ */

function ProyectoBlock({ proyecto, index, total }: { proyecto: Proyecto; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const filter = useMapaFilter();
  const highlight = useHighlight();
  const { open: openSheet } = useNotaSheet();
  const isAncestor = !!highlight?.ancestors.has(proyecto.id);
  const isTarget = highlight?.targetId === proyecto.id;
  const inFilter = !filter || filter.proyectos.has(proyecto.id);
  const [open, setOpen] = useState(filter ? inFilter : false);
  useEffect(() => { if (inFilter && filter) setOpen(true); }, [inFilter, filter]);
  const [confirm, setConfirm] = useState(false);
  const [showNotas, setShowNotas] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMoveArea, setShowMoveArea] = useState(false);
  const isEmpresa = ambitoDeArea(proyecto.area) === "empresa";
  const hlRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (isAncestor || isTarget) setOpen(true); }, [isAncestor, isTarget]);
  useEffect(() => {
    if (isTarget && hlRef.current) {
      hlRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isTarget]);

  const allResultados = state.resultados.filter((r) => r.proyectoId === proyecto.id);
  const resIds = new Set(allResultados.map((r) => r.id));
  const projEntregables = state.entregables.filter((e) => resIds.has(e.resultadoId));
  const hasActiveWork = projEntregables.some((e) => e.estado === "en_proceso" || state.pasos.some((p) => p.entregableId === e.id && p.inicioTs && !p.finTs));
  const isOperacion = proyecto.tipo === "operacion";
  const notasCount = (proyecto.notas ?? []).length;
  const isProgrammed = !!proyecto.fechaInicio;

  function handlePlanSelect(fechaInicio: string, planNivel: PlanNivel) {
    dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { fechaInicio, planNivel } });
    setShowDatePicker(false);
  }

  return (
    <div ref={hlRef} className={`rounded-xl border border-border bg-background transition-all duration-700${filter && !inFilter ? " opacity-40" : ""}${isTarget ? " ring-2 ring-accent ring-offset-2 animate-pulse" : ""}`}>
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        {isMentor
          ? <span className="text-lg font-semibold text-foreground">{proyecto.nombre}</span>
          : <EditableText value={proyecto.nombre} onChange={(v) => dispatch({ type: "RENAME_PROYECTO", id: proyecto.id, nombre: v })} className="text-lg font-semibold text-foreground" />
        }
        <ReviewBadge review={proyecto.review} nivel="proyecto" targetId={proyecto.id} />
        {isEmpresa && <ResponsableBadge nombre={proyecto.responsable} editable={!isMentor} miembros={state.miembros} onChange={(v) => dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { responsable: v } })} />}
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted">{allResultados.length} result.</span>
        {isOperacion ? (
          <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">Core</span>
        ) : (
          <>
            {hasActiveWork && (
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">En curso</span>
            )}
            {isProgrammed && !hasActiveWork && (
              <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{formatFechaInicio(proyecto.fechaInicio!, proyecto.planNivel)}</span>
            )}
          </>
        )}
        {isMentor
          ? <CommentIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: proyecto.nombre, nivel: "proyecto", targetId: proyecto.id })} />
          : <NotasIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: proyecto.nombre, nivel: "proyecto", targetId: proyecto.id })} />}
        {!isMentor && !isOperacion && (
          <button onClick={(e) => { e.stopPropagation(); setShowDatePicker(!showDatePicker); }}
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-all hover:bg-accent-soft hover:text-accent ${isProgrammed ? "text-accent" : "text-muted opacity-60 hover:opacity-100"}`}
            title="Planificar proyecto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
        )}
        {!isMentor && (
          <button onClick={(e) => { e.stopPropagation(); setShowMoveArea(!showMoveArea); }}
            className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] text-muted transition-colors hover:bg-surface hover:text-foreground" title="Mover a otra área">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        )}
        {!isMentor && <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_PROYECTO", id: proyecto.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_PROYECTO", id: proyecto.id, direction: "down" })} />}
        {!isMentor && <DeleteBtn onDelete={() => setConfirm(true)} />}
      </ToggleRow>

      {proyecto.descripcion && !open && (
        <p className="truncate px-5 pl-8 sm:pl-14 -mt-1 pb-1.5 text-xs italic text-muted">{proyecto.descripcion}</p>
      )}

      {showMoveArea && (
        <div className="mx-2 mb-3 ml-3 sm:mx-5 sm:ml-8 md:ml-14 rounded-lg border border-border bg-surface/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Mover a área:</p>
          <div className="flex flex-wrap gap-1.5">
            {[...AREAS_EMPRESA, ...AREAS_PERSONAL].filter((a) => a.id !== proyecto.area).map((a) => {
              const hex = AREA_COLORS[a.id]?.hex ?? "#888";
              return (
                <button key={a.id} onClick={() => { dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { area: a.id } }); setShowMoveArea(false); }}
                  className="rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:brightness-95"
                  style={{ borderColor: hex + "40", backgroundColor: hex + "12", color: hex }}>
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showDatePicker && (
        <PlanPicker onSelect={handlePlanSelect} onCancel={() => setShowDatePicker(false)} showDayLevel={false} />
      )}

      {confirm && <ConfirmDelete label={proyecto.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_PROYECTO", id: proyecto.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {showNotas && (
        <div className="mx-2 mb-3 ml-3 sm:mx-5 sm:ml-8 md:ml-14">
          <NotasSection notas={proyecto.notas ?? []} nivel="proyecto" targetId={proyecto.id} />
        </div>
      )}

      {open && (
        <div className="px-2 pb-5 pl-3 sm:px-5 sm:pl-8 md:pl-14">
          {!isMentor && (
            <div className="mb-3 flex items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Tipo:</span>
              {(["operacion", "proyecto"] as const).map((t) => {
                const active = (proyecto.tipo ?? "proyecto") === t;
                return (
                  <button key={t} onClick={() => dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { tipo: t } })}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                      active
                        ? t === "operacion" ? "bg-indigo-100 text-indigo-700" : "bg-zinc-200 text-zinc-700"
                        : "bg-surface text-muted hover:bg-surface-hover"
                    }`}>
                    {t === "operacion" ? "Core" : "Proyecto"}
                  </button>
                );
              })}
            </div>
          )}
          {!isMentor ? (
            <EditableText value={proyecto.descripcion ?? ""} onChange={(v) => dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { descripcion: v || null } })}
              className="mb-4 text-sm italic text-muted" placeholder="Objetivo del proyecto..." multiline />
          ) : proyecto.descripcion ? (
            <p className="mb-4 text-sm italic text-muted">{proyecto.descripcion}</p>
          ) : null}

          {!isOperacion && proyecto.fechaInicio && (
            <p className="mb-3 text-xs text-muted">
              Inicio: {new Date(proyecto.fechaInicio).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}

          <div className="space-y-2">
            {allResultados.map((res, i) => (
              <ResultadoBlock key={res.id} resultado={res} index={i} total={allResultados.length} />
            ))}
          </div>

          {!isMentor && (
            <AddButton label="Resultado" onAdd={(nombre) =>
              dispatch({ type: "ADD_RESULTADO", payload: { id: generateId(), nombre, descripcion: null, proyectoId: proyecto.id, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null } })
            } />
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   RESULTADO
   ============================================================ */

function ResultadoBlock({ resultado, index, total }: { resultado: Resultado; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();
  const filter = useMapaFilter();
  const highlight = useHighlight();
  const { open: openSheet } = useNotaSheet();
  const isAncestor = !!highlight?.ancestors.has(resultado.id);
  const isTarget = highlight?.targetId === resultado.id;
  const inFilter = !filter || filter.resultados.has(resultado.id);
  const [open, setOpen] = useState(filter ? inFilter : false);
  useEffect(() => { if (inFilter && filter) setOpen(true); }, [inFilter, filter]);
  const [confirm, setConfirm] = useState(false);
  const [showNotas, setShowNotas] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [moveStep, setMoveStep] = useState<1 | 2>(1);
  const [moveAreaId, setMoveAreaId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const hlRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (isAncestor || isTarget) setOpen(true); }, [isAncestor, isTarget]);
  useEffect(() => {
    if (isTarget && hlRef.current) hlRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isTarget]);

  const allEntregables = state.entregables.filter((e) => e.resultadoId === resultado.id);
  const hasActiveWork = allEntregables.some((e) => e.estado === "en_proceso");
  const parentProj = state.proyectos.find((p) => p.id === resultado.proyectoId);
  const isEmpresa = parentProj ? ambitoDeArea(parentProj.area) === "empresa" : false;
  const notasCount = (resultado.notas ?? []).length;
  const isProgrammed = !!resultado.fechaInicio;

  function handlePlanSelect(fechaInicio: string, planNivel: PlanNivel) {
    dispatch({ type: "UPDATE_RESULTADO", id: resultado.id, changes: { fechaInicio, planNivel } });
    setShowDatePicker(false);
  }

  return (
    <div ref={hlRef} className={`rounded-xl border border-border/50 bg-surface/30 transition-all duration-700${filter && !inFilter ? " opacity-40" : ""}${isTarget ? " ring-2 ring-accent ring-offset-2 animate-pulse" : ""}`}>
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        {isMentor
          ? <span className="text-base font-medium text-foreground">{resultado.nombre}</span>
          : <EditableText value={resultado.nombre} onChange={(v) => dispatch({ type: "RENAME_RESULTADO", id: resultado.id, nombre: v })} className="text-base font-medium text-foreground" />
        }
        <ReviewBadge review={resultado.review} nivel="resultado" targetId={resultado.id} />
        {isEmpresa && <ResponsableBadge nombre={resultado.responsable ?? parentProj?.responsable} />}
        <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-muted">{allEntregables.length} entreg.</span>
        {hasActiveWork && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">En curso</span>
        )}
        {isProgrammed && !hasActiveWork && (
          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{formatFechaInicio(resultado.fechaInicio!, resultado.planNivel)}</span>
        )}
        {isMentor
          ? <CommentIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: resultado.nombre, nivel: "resultado", targetId: resultado.id })} />
          : <NotasIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: resultado.nombre, nivel: "resultado", targetId: resultado.id })} />}
        {!isMentor && (
          <button onClick={(e) => { e.stopPropagation(); setShowDatePicker(!showDatePicker); }}
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-all hover:bg-accent-soft hover:text-accent ${isProgrammed ? "text-accent" : "text-muted opacity-60 hover:opacity-100"}`}
            title="Planificar resultado">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
        )}
        {!isMentor && (
          <button onClick={(e) => { e.stopPropagation(); setShowMove(!showMove); setMoveStep(1); setMoveAreaId(null); }}
            className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] text-muted transition-colors hover:bg-surface hover:text-foreground" title="Mover a otro proyecto">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        )}
        {!isMentor && <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_RESULTADO", id: resultado.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_RESULTADO", id: resultado.id, direction: "down" })} />}
        {!isMentor && <DeleteBtn onDelete={() => setConfirm(true)} />}
      </ToggleRow>

      {showDatePicker && (
        <PlanPicker onSelect={handlePlanSelect} onCancel={() => setShowDatePicker(false)} showDayLevel={false} />
      )}

      {showMove && (
        <div className="mx-2 mb-3 ml-3 sm:mx-5 sm:ml-8 md:ml-14 rounded-lg border border-border bg-surface/50 p-3">
          {moveStep === 1 ? (
            <>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">1. Elegir área:</p>
              <div className="flex flex-wrap gap-1.5">
                {[...AREAS_EMPRESA, ...AREAS_PERSONAL].map((a) => {
                  const hex = AREA_COLORS[a.id]?.hex ?? "#888";
                  return (
                    <button key={a.id} onClick={() => { setMoveAreaId(a.id); setMoveStep(2); }}
                      className="rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:brightness-95"
                      style={{ borderColor: hex, color: hex }}>{a.label}</button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <button onClick={() => setMoveStep(1)} className="text-[10px] text-accent hover:underline">← Atrás</button>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">2. Elegir proyecto:</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {state.proyectos.filter((p) => p.area === moveAreaId && p.id !== resultado.proyectoId).map((p) => (
                  <button key={p.id} onClick={() => { dispatch({ type: "MOVE_RESULTADO", resultadoId: resultado.id, nuevoProyectoId: p.id }); setShowMove(false); setMoveStep(1); setMoveAreaId(null); }}
                    className="rounded-md border border-border px-2 py-1 text-[10px] text-foreground hover:border-accent hover:bg-accent-soft">{p.nombre}</button>
                ))}
                {state.proyectos.filter((p) => p.area === moveAreaId && p.id !== resultado.proyectoId).length === 0 && (
                  <p className="text-[10px] italic text-muted">Sin proyectos en esta área</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {confirm && <ConfirmDelete label={resultado.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_RESULTADO", id: resultado.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {showNotas && (
        <div className="mx-2 mb-3 ml-3 sm:mx-5 sm:ml-8 md:ml-14">
          <NotasSection notas={resultado.notas ?? []} nivel="resultado" targetId={resultado.id} />
        </div>
      )}

      {open && (
        <div className="px-2 pb-5 pl-3 sm:px-5 sm:pl-8 md:pl-14">
          {resultado.descripcion && (
            <p className="mb-3 text-sm italic text-muted">{resultado.descripcion}</p>
          )}
          <div className="space-y-1">
            {allEntregables.map((ent, i) => (
              <EntregableBlock key={ent.id} entregable={ent} index={i} total={allEntregables.length} />
            ))}
          </div>
          {!isMentor && (
            <AddButton label="Entregable" onAdd={(nombre) =>
              dispatch({ type: "ADD_ENTREGABLE", payload: { id: generateId(), nombre, resultadoId: resultado.id, tipo: "raw" as TipoEntregable, plantillaId: null, diasEstimados: 3, diasHechos: 0, esDiaria: false, responsable: currentUser, estado: "a_futuro", creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null } })
            } />
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ENTREGABLE with date assignment
   ============================================================ */

function EntregableBlock({ entregable, index, total }: { entregable: Entregable; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const filter = useMapaFilter();
  const highlight = useHighlight();
  const { open: openSheet } = useNotaSheet();
  const isAncestor = !!highlight?.ancestors.has(entregable.id);
  const isTarget = highlight?.targetId === entregable.id;
  const inFilter = !filter || filter.entregables.has(entregable.id);
  const [open, setOpen] = useState(filter ? inFilter : false);
  useEffect(() => { if (inFilter && filter) setOpen(true); }, [inFilter, filter]);
  const [confirm, setConfirm] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [justAssigned, setJustAssigned] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [moveStep, setMoveStep] = useState<1 | 2 | 3>(1);
  const [moveAreaId, setMoveAreaId] = useState<string | null>(null);
  const [moveProyectoId, setMoveProyectoId] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const justAssignedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const syncedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hlRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => { clearTimeout(justAssignedTimer.current); clearTimeout(syncedTimer.current); }, []);

  useEffect(() => { if (isAncestor || isTarget) setOpen(true); }, [isAncestor, isTarget]);
  useEffect(() => {
    if (isTarget && hlRef.current) hlRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isTarget]);

  const allPasos = state.pasos
    .filter((p) => p.entregableId === entregable.id)
    .sort((a, b) => { if (!a.inicioTs) return 1; if (!b.inicioTs) return -1; return a.inicioTs.localeCompare(b.inicioTs); });

  const [showNotas, setShowNotas] = useState(false);

  const tipoTag = entregable.tipo !== "raw" ? entregable.tipo.toUpperCase() : null;
  const dotColor = entregable.estado === "hecho" ? "bg-green-500" : entregable.estado === "en_proceso" ? "bg-amber-500" : entregable.estado === "planificado" ? "bg-blue-400" : "bg-border";
  const parentRes = state.resultados.find((r) => r.id === entregable.resultadoId);
  const parentProj = parentRes ? state.proyectos.find((p) => p.id === parentRes.proyectoId) : undefined;
  const entAreaHex = parentProj ? (AREA_COLORS[parentProj.area]?.hex ?? "#888") : "#888";
  const isEmpresa = parentProj ? ambitoDeArea(parentProj.area) === "empresa" : false;
  const notasCount = (entregable.notas ?? []).length;

  const isProgrammed = !!entregable.fechaInicio;
  const programLabel = isProgrammed ? formatFechaInicio(entregable.fechaInicio!, entregable.planNivel) : null;

  function handlePlanSelect(fechaInicio: string, planNivel: PlanNivel) {
    const newEstado = computeEstadoOnPlan(planNivel, fechaInicio, entregable.estado);
    dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes: { fechaInicio, planNivel, estado: newEstado } });
    setShowDatePicker(false);
    setJustAssigned(true);
    clearTimeout(justAssignedTimer.current);
    justAssignedTimer.current = setTimeout(() => setJustAssigned(false), 2500);
  }

  return (
    <div ref={hlRef} className={`transition-all duration-700${filter && !inFilter ? " opacity-40" : ""}${isTarget ? " rounded-lg ring-2 ring-accent ring-offset-2 animate-pulse" : ""}`}>
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        <span className={`h-3 w-3 shrink-0 rounded-full ${dotColor}`} />
        {isMentor
          ? <span className="text-sm text-foreground">{entregable.nombre}</span>
          : <EditableText value={entregable.nombre} onChange={(v) => dispatch({ type: "RENAME_ENTREGABLE", id: entregable.id, nombre: v })} className="text-sm text-foreground" />
        }
        <ReviewBadge review={entregable.review} nivel="entregable" targetId={entregable.id} />
        {tipoTag && <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: entAreaHex + "15", color: entAreaHex }}>{tipoTag}</span>}
        {isEmpresa && <ResponsableBadge nombre={entregable.responsable} />}
        {programLabel && (
          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{programLabel}</span>
        )}
        {justAssigned && (
          <span className="animate-pulse rounded-md bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">Planificado</span>
        )}
        {allPasos.length > 0 && <span className="text-xs text-muted">{allPasos.length}p</span>}
        {isMentor
          ? <CommentIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: entregable.nombre, nivel: "entregable", targetId: entregable.id })} />
          : <NotasIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: entregable.nombre, nivel: "entregable", targetId: entregable.id })} />}

        {!isMentor && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDatePicker(!showDatePicker); }}
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-all hover:bg-accent-soft hover:text-accent ${isProgrammed ? "text-accent" : "text-muted opacity-60 hover:opacity-100"}`}
            title="Asignar a un periodo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
        )}

        {!isMentor && (
          <button onClick={(e) => { e.stopPropagation(); setShowMove(!showMove); setMoveStep(1); setMoveAreaId(null); setMoveProyectoId(null); }}
            className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] text-muted transition-colors hover:bg-surface hover:text-foreground" title="Mover a otro resultado">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        )}
        {!isMentor && entregable.plantillaId && (
          <button onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: "SYNC_ENTREGABLE_TO_PLANTILLA", entregableId: entregable.id });
              setSynced(true);
              clearTimeout(syncedTimer.current);
              syncedTimer.current = setTimeout(() => setSynced(false), 2500);
            }}
            className={`flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] transition-colors ${synced ? "bg-green-100 text-green-700" : "text-blue-600 hover:bg-blue-50 hover:text-blue-800"}`}
            title="Actualizar la plantilla del SOP con los pasos de este entregable">
            {synced ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                <span>Sincronizado</span>
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                <span>Sync SOP</span>
              </>
            )}
          </button>
        )}
        {!isMentor && !entregable.plantillaId && allPasos.length >= 1 && (
          <button onClick={(e) => { e.stopPropagation(); dispatch({ type: "CONVERT_ENTREGABLE_TO_SOP", entregableId: entregable.id }); }}
            className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-800" title="Convertir en SOP">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            <span>→ SOP</span>
          </button>
        )}
        {!isMentor && <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_ENTREGABLE", id: entregable.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_ENTREGABLE", id: entregable.id, direction: "down" })} />}
        {!isMentor && <DeleteBtn onDelete={() => setConfirm(true)} />}
      </ToggleRow>

      {showMove && (
        <div className="mx-2 mb-3 ml-3 sm:mx-5 sm:ml-8 md:ml-14 rounded-lg border border-border bg-surface/50 p-3">
          {moveStep === 1 ? (
            <>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">1. Elegir área:</p>
              <div className="flex flex-wrap gap-1.5">
                {[...AREAS_EMPRESA, ...AREAS_PERSONAL].map((a) => {
                  const hex = AREA_COLORS[a.id]?.hex ?? "#888";
                  return (
                    <button key={a.id} onClick={() => { setMoveAreaId(a.id); setMoveStep(2); }}
                      className="rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:brightness-95"
                      style={{ borderColor: hex, color: hex }}>{a.label}</button>
                  );
                })}
              </div>
            </>
          ) : moveStep === 2 ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                <button onClick={() => { setMoveStep(1); setMoveAreaId(null); }} className="text-[10px] text-accent hover:underline">← Atrás</button>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">2. Elegir proyecto:</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {state.proyectos.filter((p) => p.area === moveAreaId).map((p) => (
                  <button key={p.id} onClick={() => { setMoveProyectoId(p.id); setMoveStep(3); }}
                    className="rounded-md border border-border px-2 py-1 text-[10px] text-foreground hover:border-accent hover:bg-accent-soft">{p.nombre}</button>
                ))}
                {state.proyectos.filter((p) => p.area === moveAreaId).length === 0 && (
                  <p className="text-[10px] italic text-muted">Sin proyectos en esta área</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <button onClick={() => { setMoveStep(2); setMoveProyectoId(null); }} className="text-[10px] text-accent hover:underline">← Atrás</button>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">3. Elegir resultado:</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {state.resultados.filter((r) => r.proyectoId === moveProyectoId && r.id !== entregable.resultadoId).map((r) => (
                  <button key={r.id} onClick={() => { dispatch({ type: "MOVE_ENTREGABLE", entregableId: entregable.id, nuevoResultadoId: r.id }); setShowMove(false); setMoveStep(1); setMoveAreaId(null); setMoveProyectoId(null); }}
                    className="rounded-md border border-border px-2 py-1 text-[10px] text-foreground hover:border-accent hover:bg-accent-soft">{r.nombre}</button>
                ))}
                {state.resultados.filter((r) => r.proyectoId === moveProyectoId && r.id !== entregable.resultadoId).length === 0 && (
                  <p className="text-[10px] italic text-muted">Sin resultados en este proyecto</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {showDatePicker && (
        <PlanPicker onSelect={handlePlanSelect} onCancel={() => setShowDatePicker(false)} />
      )}

      {confirm && <ConfirmDelete label={entregable.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_ENTREGABLE", id: entregable.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {showNotas && (
        <div className="mx-2 mb-3 ml-4 sm:mx-5 sm:ml-10 md:ml-16">
          <NotasSection notas={entregable.notas ?? []} nivel="entregable" targetId={entregable.id} />
        </div>
      )}

      {open && (
        <div className="pb-2 pl-4 sm:pl-10 md:pl-16">
          {allPasos.map((paso, i) => <PasoLine key={paso.id} paso={paso} index={i} total={allPasos.length} isEmpresa={isEmpresa} entResponsable={entregable.responsable} />)}
          {!isMentor && (
            <AddButton label="Paso" onAdd={(nombre) =>
              dispatch({ type: "ADD_PASO", payload: {
                id: generateId(),
                nombre,
                entregableId: entregable.id,
                estado: "pendiente",
                inicioTs: null,
                finTs: null,
                contexto: { notas: "", urls: [], apps: [] },
                implicados: [],
                pausas: [],
                notas: [],
                siguientePaso: null,
              }})
            } />
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PASO
   ============================================================ */

function PasoLine({ paso, index, total, isEmpresa, entResponsable }: { paso: Paso; index: number; total: number; isEmpresa: boolean; entResponsable?: string }) {
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const filter = useMapaFilter();
  const highlight = useHighlight();
  const { open: openSheet } = useNotaSheet();
  const isTarget = highlight?.targetId === paso.id;
  const inFilter = !filter || filter.pasos.has(paso.id);
  const [showNotas, setShowNotas] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showDonePicker, setShowDonePicker] = useState(false);
  const [doneDate, setDoneDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [doneTime, setDoneTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const done = !!paso.finTs;
  const allNotas = paso.notas ?? [];
  const hasContextoNotas = !!paso.contexto.notas;
  const notasCount = allNotas.length + (hasContextoNotas ? 1 : 0);
  const hasUrls = paso.contexto.urls.length > 0;
  const hlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isTarget && hlRef.current) hlRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isTarget]);

  function toggleNotas() {
    toggleOrSheet(showNotas, setShowNotas, openSheet, {
      title: paso.nombre, nivel: "paso", targetId: paso.id,
      contextoNotas: paso.contexto.notas || undefined,
      urls: paso.contexto.urls.map((u) => ({ nombre: u.nombre, url: u.url })),
    });
  }

  return (
    <div ref={hlRef} className={`mb-1 transition-all duration-700${filter && !inFilter ? " opacity-40" : ""}${isTarget ? " rounded-lg ring-2 ring-accent ring-offset-2 animate-pulse" : ""}`}>
      <div className="group/row flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${done ? "bg-green-500" : "bg-border"}`} />
        {isMentor
          ? <span className={`text-sm ${done ? "text-muted line-through" : "text-foreground"}`}>{paso.nombre}</span>
          : <EditableText value={paso.nombre} onChange={(v) => dispatch({ type: "RENAME_PASO", id: paso.id, nombre: v })} className={`text-sm ${done ? "text-muted line-through" : "text-foreground"}`} />
        }
        {isEmpresa && <ResponsableBadge nombre={entResponsable} />}
        {paso.inicioTs && (
          <span className="text-xs text-muted">
            {new Date(paso.inicioTs).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          </span>
        )}
        {isMentor
          ? <CommentIcon count={notasCount} onClick={toggleNotas} />
          : <NotasIcon count={notasCount} onClick={toggleNotas} />}
        {hasUrls && (
          <button onClick={toggleNotas}
            className="flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs text-accent hover:bg-accent-soft" title="Ver enlaces">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
          </button>
        )}
        {!isMentor && !done && (
          <button onClick={() => setShowDonePicker(!showDonePicker)} title="Marcar hecho"
            className="h-7 w-7 shrink-0 rounded-md text-green-600 opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        )}
        {!isMentor && <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_PASO", id: paso.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_PASO", id: paso.id, direction: "down" })} />}
        {!isMentor && <DeleteBtn onDelete={() => setConfirmDel(true)} />}
      </div>

      {showDonePicker && (
        <div className="ml-2 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-900/10 px-3 py-2 sm:ml-4 md:ml-8">
          <input type="date" value={doneDate} onChange={(e) => setDoneDate(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs" />
          <input type="time" value={doneTime} onChange={(e) => setDoneTime(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs" />
          <button onClick={() => {
            const inicioTs = paso.inicioTs ?? `${doneDate}T${doneTime}:00.000Z`;
            const finTs = `${doneDate}T${doneTime}:00.000Z`;
            dispatch({ type: "UPDATE_PASO_TIMES", id: paso.id, inicioTs, finTs });
            dispatch({ type: "CLOSE_PASO", payload: { ...paso, inicioTs, finTs, estado: paso.nombre, siguientePaso: { tipo: "fin" } } });
            setShowDonePicker(false);
          }} className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700">
            Hecho
          </button>
          <button onClick={() => setShowDonePicker(false)}
            className="text-xs text-muted hover:text-foreground">Cancelar</button>
        </div>
      )}

      {confirmDel && (
        <ConfirmDelete label={paso.nombre}
          onConfirm={() => { dispatch({ type: "DELETE_PASO", id: paso.id }); setConfirmDel(false); }}
          onCancel={() => setConfirmDel(false)} />
      )}

      {showNotas && (
        <div className="ml-2 mt-1 mb-2 space-y-2 sm:ml-6 md:ml-12">
          {hasContextoNotas && (
            <div className="rounded-lg bg-surface/50 px-3 py-2">
              <p className="text-sm text-foreground whitespace-pre-wrap sm:text-xs">{paso.contexto.notas}</p>
              <p className="mt-0.5 text-xs text-muted italic sm:text-[10px]">Nota de contexto</p>
            </div>
          )}
          <NotasSection notas={allNotas} nivel="paso" targetId={paso.id} />
          {hasUrls && (
            <div className="space-y-1 rounded-lg bg-surface/30 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted sm:text-[10px]">Enlaces</p>
              {paso.contexto.urls.map((u, i) => (
                <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-accent underline hover:text-accent/80 sm:text-xs">
                  {u.nombre || u.url}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SOP
   ============================================================ */

function SOPPasoRow({ sop, paso, index }: { sop: PlantillaProceso; paso: PlantillaProceso["pasos"][number]; index: number }) {
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const [confirmDel, setConfirmDel] = useState(false);

  function updatePaso(changes: Partial<PlantillaProceso["pasos"][number]>) {
    dispatch({ type: "UPDATE_PASO_PLANTILLA", plantillaId: sop.id, pasoId: paso.id, changes });
  }

  function removePaso() {
    dispatch({ type: "DELETE_PASO_PLANTILLA", plantillaId: sop.id, pasoId: paso.id });
  }

  return (
    <div>
      <div className="group/row flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-surface">
        <span className="w-6 shrink-0 text-right text-xs font-medium text-muted">{index + 1}.</span>
        {isMentor
          ? <span className="flex-1 text-sm text-foreground">{paso.nombre}</span>
          : <EditableText value={paso.nombre} onChange={(v) => updatePaso({ nombre: v })} className="flex-1 text-sm text-foreground" />}
        {!isMentor && <DurationInput value={paso.minutosEstimados} onChange={(v) => updatePaso({ minutosEstimados: v })} />}
        {isMentor && paso.minutosEstimados && <span className="text-xs text-muted">{paso.minutosEstimados}min</span>}
        {!isMentor && <DeleteBtn onDelete={() => setConfirmDel(true)} />}
      </div>
      {confirmDel && (
        <ConfirmDelete label={paso.nombre} onConfirm={() => { removePaso(); setConfirmDel(false); }} onCancel={() => setConfirmDel(false)} />
      )}
    </div>
  );
}

function DurationInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = useCallback(() => {
    const n = parseInt(draft, 10);
    onChange(isNaN(n) || n <= 0 ? null : n);
    setEditing(false);
  }, [draft, onChange]);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input ref={ref} type="number" min="1" value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-14 rounded-md border-2 border-accent bg-background px-2 py-1 text-xs text-foreground outline-none" />
        <span className="text-xs text-muted">min</span>
      </div>
    );
  }

  return (
    <button onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
      className="flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-xs text-muted opacity-40 transition-all hover:bg-surface-hover hover:text-foreground sm:opacity-0 group-hover/row:opacity-100"
      title="Editar duración">
      {value ? <>{value}min</> : <>+min</>}
    </button>
  );
}

function SOPBlock({ sop, index, total }: { sop: PlantillaProceso; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();
  const { open: openSheet } = useNotaSheet();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [justCreated, setJustCreated] = useState(false);
  const [showNotas, setShowNotas] = useState(false);
  const [showProgPicker, setShowProgPicker] = useState(false);
  const justCreatedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(justCreatedTimer.current), []);

  const hasActiveEntregable = state.entregables.some((e) => e.plantillaId === sop.id && (e.estado === "en_proceso" || e.estado === "planificado"));

  const [sopDestPicker, setSOPDestPicker] = useState(false);
  const [sopPendingDate, setSOPPendingDate] = useState<string | null>(null);

  function handleSOPPlanSelect(fechaInicio: string, _: PlanNivel) {
    setSOPPendingDate(fechaInicio);
    setShowDatePicker(false);
    setSOPDestPicker(true);
  }

  function materializeSOP(fechaInicio: string, proyectoId?: string, resultadoId?: string) {
    dispatch({
      type: "MATERIALIZE_SOP",
      plantillaId: sop.id,
      area: sop.area,
      responsable: sop.responsableDefault ?? currentUser,
      currentUser,
      dateKey: fechaInicio,
      ids: { resultado: generateId(), entregable: generateId(), paso: generateId(), proyecto: generateId() },
      proyectoId,
      resultadoId,
      autoStart: false,
    });
    setJustCreated(true);
    clearTimeout(justCreatedTimer.current);
    justCreatedTimer.current = setTimeout(() => setJustCreated(false), 2500);
  }

  return (
    <div className="rounded-xl border bg-background" style={{ borderColor: (AREA_COLORS[sop.area]?.hex ?? "#888") + "40" }}>
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: AREA_COLORS[sop.area]?.hex ?? "#888" }} />
        {isMentor
          ? <span className="text-base font-medium text-foreground">{sop.nombre}</span>
          : <EditableText value={sop.nombre} onChange={(v) => dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { nombre: v } })}
            className="text-base font-medium text-foreground" />}
        <ReviewBadge review={sop.review} nivel="plantilla" targetId={sop.id} />
        <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: (AREA_COLORS[sop.area]?.hex ?? "#888") + "15", color: AREA_COLORS[sop.area]?.hex ?? "#888" }}>SOP · {sop.pasos.length}p</span>
        {sop.programacion ? (
          <ScheduleBadge programacion={sop.programacion} onClick={!isMentor ? () => setShowProgPicker(!showProgPicker) : undefined} />
        ) : !isMentor ? (
          <button onClick={(e) => { e.stopPropagation(); setShowProgPicker(!showProgPicker); }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-purple-300 hover:text-purple-500">
            + Frecuencia
          </button>
        ) : null}
        {hasActiveEntregable && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">En curso</span>
        )}
        {justCreated && (
          <span className="animate-pulse rounded-md bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">Entregable creado</span>
        )}
        {!isMentor && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDatePicker(!showDatePicker); }}
            className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted opacity-60 transition-all hover:bg-accent-soft hover:text-accent hover:opacity-100"
            title="Programar SOP"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
        )}
        <CommentIcon onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: sop.nombre, nivel: "plantilla", targetId: sop.id })} />
        {!isMentor && <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_PLANTILLA", id: sop.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_PLANTILLA", id: sop.id, direction: "down" })} />}
        {!isMentor && <DeleteBtn onDelete={() => setConfirm(true)} />}
      </ToggleRow>

      {showProgPicker && (
        <div className="mx-2 mb-3 ml-3 sm:mx-5 sm:ml-8 md:ml-14 rounded-lg border border-border bg-surface/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Frecuencia del proceso</p>
          <ProgramacionPicker value={sop.programacion} onChange={(p) => {
            dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { programacion: p } });
            setShowProgPicker(false);
          }} />
        </div>
      )}

      {confirm && <ConfirmDelete label={sop.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_PLANTILLA", id: sop.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {showDatePicker && (
        <PlanPicker onSelect={handleSOPPlanSelect} onCancel={() => setShowDatePicker(false)} />
      )}

      {sopDestPicker && sopPendingDate && (
        <HierarchyPicker
          depth="resultado"
          initialArea={sop.area}
          title={`Destino para "${sop.nombre}"`}
          onSelect={(sel) => {
            materializeSOP(sopPendingDate, sel.proyectoId, sel.resultadoId);
            setSOPDestPicker(false);
            setSOPPendingDate(null);
          }}
          onCancel={() => { setSOPDestPicker(false); setSOPPendingDate(null); }}
        />
      )}

      {showNotas && (
        <div className="mx-2 mb-3 ml-3 sm:mx-5 sm:ml-8 md:ml-14">
          <NotasSection notas={sop.notas ?? []} nivel="plantilla" targetId={sop.id} />
        </div>
      )}

      {open && (
        <div className="px-6 pb-6 pl-16">
          {sop.objetivo && (
            isMentor
              ? <p className="mb-2 text-sm italic text-muted">{sop.objetivo}</p>
              : <EditableText value={sop.objetivo} onChange={(v) => dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { objetivo: v } })}
                  className="mb-2 block text-sm italic text-muted" placeholder="Objetivo..." />
          )}
          <div className="mb-2 flex items-center gap-2 text-sm text-muted">
            <span>Responsable:</span>
            {isMentor
              ? <strong className="text-foreground">{sop.responsableDefault || "—"}</strong>
              : <ResponsableBadge nombre={sop.responsableDefault} editable miembros={state.miembros} onChange={(v) => dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { responsableDefault: v } })} />
            }
          </div>
          {sop.disparador && (
            isMentor
              ? <p className="mb-3 text-sm text-muted">{sop.disparador}</p>
              : <EditableText value={sop.disparador} onChange={(v) => dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { disparador: v } })}
                  className="mb-3 block text-sm text-muted" placeholder="Disparador..." />
          )}
          <div className="space-y-1">
            {sop.pasos.map((p, i) => (
              <SOPPasoRow key={p.id} sop={sop} paso={p} index={i} />
            ))}
          </div>
          {!isMentor && <AddButton label="Paso" onAdd={(nombre) => {
            dispatch({ type: "ADD_PASO_PLANTILLA", plantillaId: sop.id, paso: { id: generateId(), orden: sop.pasos.length + 1, nombre, descripcion: "", herramientas: [], tipo: "accion" as const, minutosEstimados: null } });
          }} />}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CONFIRM DELETE
   ============================================================ */

function ConfirmDelete({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mx-4 my-2 flex items-center gap-3 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-800/30 dark:bg-red-500/10">
      <span className="text-red-700 dark:text-red-400">Eliminar &ldquo;{label}&rdquo;?</span>
      <button onClick={onConfirm} className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-600">Sí</button>
      <button onClick={onCancel} className="text-sm text-muted hover:text-foreground">No</button>
    </div>
  );
}

function ResponsableBadge({ nombre, editable, miembros, onChange }: { nombre?: string; editable?: boolean; miembros?: { id: string; nombre: string }[]; onChange?: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!nombre && !editable) return null;
  if (!editable || !miembros || !onChange) {
    return nombre ? <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-muted" title="Responsable">{nombre}</span> : null;
  }
  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${nombre ? "bg-surface text-muted hover:bg-accent-soft hover:text-accent" : "bg-accent-soft/50 text-accent/70 hover:bg-accent-soft"}`}
        title="Cambiar responsable">
        {nombre || "+ Responsable"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          {miembros.map((m) => (
            <button key={m.id} onClick={() => { onChange(m.nombre); setOpen(false); }}
              className={`block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent-soft ${m.nombre === nombre ? "font-bold text-accent" : "text-foreground"}`}>
              {m.nombre}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}


function NotasIcon({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs transition-all hover:bg-accent-soft ${count > 0 ? "text-accent" : "text-muted opacity-50 hover:opacity-100"}`}
      title={`${count} nota(s)`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      {count > 0 && <span className="font-medium">{count}</span>}
    </button>
  );
}

function CommentIcon({ count, onClick }: { count?: number; onClick: () => void }) {
  const c = count ?? 0;
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs transition-all hover:bg-amber-50 dark:hover:bg-amber-500/10 ${c > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted opacity-50 hover:opacity-100"}`}
      title={`${c} comentario(s)`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {c > 0 && <span className="font-medium">{c}</span>}
    </button>
  );
}
