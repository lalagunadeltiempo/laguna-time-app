"use client";

import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { NotasSection } from "../shared/NotasSection";
import { EditableText } from "../shared/EditableText";
import { ReviewBadge } from "../shared/ReviewBadge";
import ProgramacionPicker from "../shared/ProgramacionPicker";
import HierarchyPicker from "../shared/HierarchyPicker";
import MoveInlinePanel from "../shared/MoveInlinePanel";
import { RegistrarSesionIconButton } from "../shared/RegistrarSesionPopover";
import { ProyectoTimeline } from "../plan/ProyectoTimeline";
import { computeProyectoRitmo, ritmoColor, ritmoLabel, ritmoLabelCorto, ritmoExplicacion, inferDateRange, type DateRange } from "@/lib/proyecto-stats";
import { rangoProyectoMapa } from "@/lib/fechas-efectivas";
import { mesesDeTrimestre, semanasDeMeses, etiquetaSemanaIso, etiquetaMesCorta, rangoSemanaCorto } from "@/lib/semana-utils";
import { COLOR_TRIMESTRE, colorMes, colorSemana, chipStylesFromHex } from "@/lib/colores-tiempo";
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

export function formatFechaInicio(f: string, planNivel?: PlanNivel): string {
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

function formatDateRange(inicio: string | null | undefined, fin: string | null | undefined): string | null {
  if (!inicio && !fin) return null;
  const fmt = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };
  if (inicio && fin) return `${fmt(inicio)} – ${fmt(fin)}`;
  if (inicio) return `Desde ${fmt(inicio)}`;
  return `Hasta ${fmt(fin!)}`;
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
      <div className="flex flex-wrap items-center gap-2">
        {showDayLevel && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-accent/50 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20">
            <span>Fecha exacta:</span>
            <input
              ref={customDateRef}
              type="date"
              onChange={(e) => selectExactDate(e.target.value)}
              onClick={(e) => {
                const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                if (typeof el.showPicker === "function") {
                  try { el.showPicker(); } catch { /* fallback to default click */ }
                }
              }}
              className="bg-transparent text-xs text-accent outline-none"
            />
          </label>
        )}
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground">Cancelar</button>
      </div>
    </div>
  );
}

export interface VisibleFilter {
  proyectos: Set<string>;
  resultados: Set<string>;
  entregables: Set<string>;
  pasos: Set<string>;
}
export const MapaFilterCtx = createContext<VisibleFilter | null>(null);
export function useMapaFilter() { return useContext(MapaFilterCtx); }

export function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface HighlightInfo {
  targetId: string;
  ancestors: Set<string>;
}
export const HighlightCtx = createContext<HighlightInfo | null>(null);
export function useHighlight() { return useContext(HighlightCtx); }

export const ShowTimelineCtx = createContext(false);
export const HideFilteredCtx = createContext(false);
export const ShowRitmoCtx = createContext(false);

export interface NotaSheetData {
  title: string;
  nivel: "paso" | "entregable" | "resultado" | "proyecto" | "plantilla";
  targetId: string;
  contextoNotas?: string;
  urls?: { nombre: string; url: string }[];
}
export const NotaSheetCtx = createContext<{ open: (data: NotaSheetData) => void }>({ open: () => {} });
export function useNotaSheet() { return useContext(NotaSheetCtx); }

export function buildHighlightAncestors(state: { pasos: Paso[]; entregables: Entregable[]; resultados: Resultado[]; proyectos: Proyecto[] }, targetId: string): Set<string> {
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

export function NotaSheet({ data, onClose }: { data: NotaSheetData; onClose: () => void }) {
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

export function toggleOrSheet(
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

export const EMPRESA_ORDER: AreaEmpresa[] = ["financiera", "operativa", "comercial", "administrativa"];
export const PERSONAL_ORDER: AreaPersonal[] = ["fisico", "emocional", "mental", "espiritual"];

export function areaLabel(id: Area): string {
  return [...AREAS_EMPRESA, ...AREAS_PERSONAL].find((a) => a.id === id)?.label ?? id;
}

/* ============================================================
   MAIN
   ============================================================ */

export { NotasSection, EditableText };


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
  return (
    <div
      onClick={onToggle}
      className="group/row flex min-h-[48px] min-w-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface"
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        aria-label={open ? "Contraer" : "Expandir"}
        title={open ? "Contraer" : "Expandir"}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-foreground"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {children}
    </div>
  );
}

/* ============================================================
   TIMELINE INLINE (shown when ShowTimelineCtx is true)
   ============================================================ */

function TimelineInline({ proyecto, resultados, entregables }: { proyecto: Proyecto; resultados: Resultado[]; entregables: Entregable[] }) {
  const show = useContext(ShowTimelineCtx);
  const [hoy] = useState(() => new Date());
  if (!show || resultados.length === 0) return null;
  const areaColor = AREA_COLORS[proyecto.area]?.hex ?? "#888";
  const inferred = inferDateRange([...resultados, ...entregables]);
  const range: DateRange = {
    inicio: proyecto.fechaInicio ?? inferred.inicio,
    fin: proyecto.fechaLimite ?? inferred.fin,
  };
  return (
    <div className="mb-3 rounded-lg border border-border/50 overflow-hidden">
      <ProyectoTimeline range={range} resultados={resultados} entregables={entregables} hoy={hoy} areaColor={areaColor} />
    </div>
  );
}

/* ============================================================
   AREA SECTION
   ============================================================ */

export function AreaSection({ areaId, hideSops, forceOpen }: { areaId: Area; hideSops?: boolean; forceOpen?: boolean }) {
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
  const hideFiltered = useContext(HideFilteredCtx);
  const [showInactive, setShowInactive] = useState(false);
  const visibleProyectos = showInactive ? allProyectos : allProyectos.filter((p) => { const e = p.estado ?? "plan"; return e !== "completado" && e !== "pausado"; });
  const hiddenCount = allProyectos.length - visibleProyectos.length;
  const filteredCount = filter ? visibleProyectos.filter((p) => filter.proyectos.has(p.id)).length : visibleProyectos.length;
  const [open, setOpen] = useState(false);
  const [openProj, setOpenProj] = useState(false);
  const [openSOP, setOpenSOP] = useState(false);

  useEffect(() => {
    if (highlight?.ancestors.has(areaId)) { setOpen(true); setOpenProj(true); }
  }, [highlight, areaId]);
  useEffect(() => {
    if (forceOpen) { setOpen(true); setOpenProj(true); }
  }, [forceOpen]);
  const sops = state.plantillas.filter((pl) => pl.area === areaId);

  return (
    <section id={`mapa-area-${areaId}`} className="mb-6 scroll-mt-20">
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
                {visibleProyectos.length > 0 ? (
                  <div className="space-y-2">
                    {(() => {
                      // Orden: 1) estado (en_marcha → plan → pausado → completado),
                      //        2) alfabético por nombre,
                      //        3) orden manual (posición original, desempate final).
                      const ESTADO_ORDER: Record<string, number> = { en_marcha: 0, plan: 1, pausado: 2, completado: 3 };
                      const indexed = visibleProyectos.map((p, idx) => ({ p, idx }));
                      indexed.sort((a, b) => {
                        const ea = ESTADO_ORDER[a.p.estado ?? "plan"] ?? 1;
                        const eb = ESTADO_ORDER[b.p.estado ?? "plan"] ?? 1;
                        if (ea !== eb) return ea - eb;
                        const nameCmp = a.p.nombre.localeCompare(b.p.nombre, "es", { sensitivity: "base" });
                        if (nameCmp !== 0) return nameCmp;
                        return a.idx - b.idx;
                      });
                      return indexed.map(({ p: proj }, i) => (
                        <ProyectoBlock key={proj.id} proyecto={proj} index={i} total={visibleProyectos.length} />
                      ));
                    })()}
                  </div>
                ) : (
                  <p className="py-3 text-base italic text-muted">Sin proyectos</p>
                )}
                {!isMentor && (
                  <AddButton label="Proyecto" onAdd={(nombre) =>
                    dispatch({ type: "ADD_PROYECTO", payload: { id: generateId(), nombre, descripcion: null, area: areaId, creado: new Date().toISOString(), fechaInicio: null, estado: "plan" } })
                  } />
                )}
                {hiddenCount > 0 && (
                  <button onClick={() => setShowInactive(!showInactive)}
                    className="mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] text-muted transition-colors hover:bg-surface hover:text-foreground">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      {showInactive ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></> : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>}
                    </svg>
                    {showInactive ? "Ocultar" : `Mostrar ${hiddenCount}`} completado{hiddenCount !== 1 ? "s" : ""}/pausado{hiddenCount !== 1 ? "s" : ""}
                  </button>
                )}
              </>
            )}
          </div>

          {/* PROCESOS */}
          {!hideSops && <div className="mb-4">
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
                    dispatch({ type: "ADD_PLANTILLA", payload: { id: generateId(), nombre, area: areaId, objetivo: "", disparador: "", programacion: null, proyectoId: null, resultadoId: null, responsableDefault: currentUser, pasos: [], herramientas: [], excepciones: "", dependeDeIds: [], creado: new Date().toISOString() } })
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
   RITMO BANNER (compact, shown via ShowRitmoCtx)
   ============================================================ */

function RitmoBanner({ ritmo, deadline }: { ritmo: import("@/lib/proyecto-stats").ProyectoRitmo; deadline?: string | null }) {
  const color = ritmoColor(ritmo.estadoRitmo);
  const pct = Math.min(100, Math.round(ritmo.porcentaje * 100));
  const mostrarMotivo = ritmo.estadoRitmo === "rojo" || ritmo.estadoRitmo === "imposible";
  return (
    <div className="mx-3 mb-2 rounded-lg px-3 py-1.5 sm:mx-5 sm:ml-8 md:ml-14" style={{ backgroundColor: color + "0a" }}>
      <div className="flex items-center gap-3">
        <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
        <span className="text-[11px] font-semibold" style={{ color }}>{pct}%</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: color + "18", color }}>
          {ritmoLabelCorto(ritmo.estadoRitmo)}
        </span>
        <span className="text-[10px] text-muted">{ritmoLabel(ritmo)}</span>
        {deadline && (
          <span className="ml-auto shrink-0 text-[10px] text-muted">
            Deadline: {new Date(deadline + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
      {mostrarMotivo && (
        <p className="mt-1 text-[10px] leading-snug" style={{ color }}>
          {ritmoExplicacion(ritmo)}
        </p>
      )}
    </div>
  );
}

/* ============================================================
   COMPONENTES DE CHIPS DE PLANIFICACIÓN (TRIMESTRE / MES / SEMANA)
   ============================================================ */

function OnOffToggle({ on, onToggle, disabled, titleOn, titleOff }: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  titleOn?: string;
  titleOff?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(); }}
      className={`flex h-6 items-center rounded-md px-2 text-[10px] font-bold tracking-wide transition-colors ${
        on
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
          : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
      } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:brightness-95"}`}
      title={on ? (titleOn ?? "Pausar") : (titleOff ?? "Reactivar")}
    >
      {on ? "ON" : "OFF"}
    </button>
  );
}

function QuarterChips({ proyecto }: { proyecto: Proyecto }) {
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const activos = useMemo(
    () => new Set<string>(proyecto.trimestresActivos ?? []),
    [proyecto.trimestresActivos]
  );
  const [year, setYear] = useState<number>(() => {
    if (activos.size > 0) {
      const first = [...activos].sort()[0];
      const y = parseInt(first.slice(0, 4), 10);
      if (Number.isFinite(y)) return y;
    }
    return new Date().getFullYear();
  });

  const otrosAnios = useMemo(
    () => [...activos].filter((k) => !k.startsWith(`${year}-`)).sort(),
    [activos, year]
  );

  if (isMentor) {
    if (activos.size === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {[...activos].sort().map((k) => {
          const q = parseInt(k.slice(-1), 10) as 1 | 2 | 3 | 4;
          return (
            <span
              key={k}
              className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold"
              style={chipStylesFromHex(COLOR_TRIMESTRE[q], true)}
              title={`${k}`}
            >
              Q{q}{k.slice(2, 4) !== String(new Date().getFullYear()).slice(2) ? `'${k.slice(2, 4)}` : ""}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setYear((y) => y - 1)}
        className="rounded px-1 text-[10px] text-muted hover:text-foreground"
        title="Año anterior"
      >‹</button>
      <span className="text-[10px] text-muted tabular-nums">{year}</span>
      <button
        type="button"
        onClick={() => setYear((y) => y + 1)}
        className="rounded px-1 text-[10px] text-muted hover:text-foreground"
        title="Año siguiente"
      >›</button>
      {[1, 2, 3, 4].map((q) => {
        const key = `${year}-Q${q}`;
        const active = activos.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => dispatch({ type: "TOGGLE_PROYECTO_TRIMESTRE", id: proyecto.id, trimestre: key })}
            className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition-colors"
            style={chipStylesFromHex(COLOR_TRIMESTRE[q as 1 | 2 | 3 | 4], active)}
            title={`${active ? "Quitar" : "Activar"} Q${q} ${year}`}
          >
            Q{q}
          </button>
        );
      })}
      {otrosAnios.map((k) => {
        const q = parseInt(k.slice(-1), 10) as 1 | 2 | 3 | 4;
        const y2 = k.slice(0, 4);
        return (
          <button
            key={k}
            type="button"
            onClick={() => dispatch({ type: "TOGGLE_PROYECTO_TRIMESTRE", id: proyecto.id, trimestre: k })}
            className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition-colors"
            style={chipStylesFromHex(COLOR_TRIMESTRE[q], true)}
            title={`Quitar Q${q} ${y2}`}
          >
            {`Q${q}'${y2.slice(2)}`}
          </button>
        );
      })}
    </div>
  );
}

function MesChips({ resultado, proyecto }: { resultado: Resultado; proyecto: Proyecto | null | undefined }) {
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const mesesPermitidos = useMemo<string[]>(() => {
    const base = new Set<string>();
    for (const q of proyecto?.trimestresActivos ?? []) {
      for (const m of mesesDeTrimestre(q)) base.add(m);
    }
    for (const m of proyecto?.mesesActivos ?? []) base.add(m);
    return [...base].sort();
  }, [proyecto?.trimestresActivos, proyecto?.mesesActivos]);
  const activos = new Set(resultado.mesesActivos ?? []);

  if (mesesPermitidos.length === 0) {
    if (isMentor) return null;
    return (
      <span className="text-[10px] italic text-muted/80">
        Asigna trimestres al proyecto para planificar meses
      </span>
    );
  }

  if (isMentor) {
    if (activos.size === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {mesesPermitidos.filter((m) => activos.has(m)).map((m) => (
          <span
            key={m}
            className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase"
            style={chipStylesFromHex(colorMes(m), true)}
          >
            {etiquetaMesCorta(m)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {mesesPermitidos.map((m) => {
        const active = activos.has(m);
        return (
          <button
            key={m}
            type="button"
            onClick={() => dispatch({ type: "TOGGLE_RESULTADO_MES", id: resultado.id, mes: m })}
            className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase transition-colors"
            style={chipStylesFromHex(colorMes(m), active)}
            title={`${active ? "Quitar" : "Activar"} ${etiquetaMesCorta(m, false)} en este resultado`}
          >
            {etiquetaMesCorta(m)}
          </button>
        );
      })}
    </div>
  );
}

function SemanaIsoChips({ entregable, resultado }: { entregable: Entregable; resultado: Resultado | null | undefined }) {
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const semanasPermitidas = useMemo<string[]>(() => {
    const meses = resultado?.mesesActivos ?? [];
    return semanasDeMeses(meses);
  }, [resultado?.mesesActivos]);
  const activos = useMemo(() => new Set<string>(entregable.semanasActivas ?? []), [entregable.semanasActivas]);
  const semanasActivasOrdenadas = useMemo(
    () => semanasPermitidas.filter((m) => activos.has(m)),
    [semanasPermitidas, activos],
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [pickerOpen]);

  if (semanasPermitidas.length === 0) {
    if (isMentor) return null;
    return (
      <span className="text-[10px] italic text-muted/80">
        Asigna meses al resultado para planificar semanas
      </span>
    );
  }

  // Vista mentor: solo lectura, chips activos.
  if (isMentor) {
    if (activos.size === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {semanasActivasOrdenadas.map((monday) => (
          <span
            key={monday}
            className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
            style={chipStylesFromHex(colorSemana(monday), true)}
            title={rangoSemanaCorto(monday)}
          >
            {etiquetaSemanaIso(monday)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1">
        {semanasActivasOrdenadas.length === 0 && !pickerOpen && (
          <span className="text-[10px] italic text-muted/80">Sin semanas asignadas</span>
        )}
        {semanasActivasOrdenadas.map((monday) => (
          <button
            key={monday}
            type="button"
            onClick={() => dispatch({ type: "TOGGLE_ENTREGABLE_SEMANA", id: entregable.id, semana: monday })}
            className="rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums transition-colors"
            style={chipStylesFromHex(colorSemana(monday), true)}
            title={`Quitar ${etiquetaSemanaIso(monday)} (${rangoSemanaCorto(monday)})`}
          >
            {etiquetaSemanaIso(monday)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className={`flex h-[22px] items-center justify-center rounded-md border px-1.5 text-[11px] font-bold leading-none transition-colors ${
            pickerOpen
              ? "border-accent bg-accent/10 text-accent"
              : "border-dashed border-border text-muted hover:border-accent hover:text-accent"
          }`}
          title={pickerOpen ? "Cerrar selector" : "Elegir semanas"}
        >
          {pickerOpen ? "×" : "+"}
        </button>
      </div>
      {pickerOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[18rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-3 shadow-lg sm:w-[22rem]">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-muted">
            Semanas disponibles · {semanasPermitidas.length}
          </p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {semanasPermitidas.map((monday) => {
              const active = activos.has(monday);
              return (
                <button
                  key={monday}
                  type="button"
                  onClick={() => dispatch({ type: "TOGGLE_ENTREGABLE_SEMANA", id: entregable.id, semana: monday })}
                  className="w-full rounded-md border px-1.5 py-1 text-center text-[10px] font-bold leading-none tabular-nums transition-colors"
                  style={chipStylesFromHex(colorSemana(monday), active)}
                  title={`${active ? "Quitar" : "Activar"} ${etiquetaSemanaIso(monday)} (${rangoSemanaCorto(monday)})`}
                >
                  {etiquetaSemanaIso(monday)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FechaCompromisoChip({ entregable }: { entregable: Entregable }) {
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const [editing, setEditing] = useState(false);
  const fc = entregable.fechaCompromiso ?? null;
  const label = fc
    ? `Compromiso: ${new Date(fc + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`
    : "Compromiso";

  if (isMentor) {
    if (!fc) return null;
    return (
      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
        {label}
      </span>
    );
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          value={fc ?? ""}
          autoFocus
          onChange={(e) =>
            dispatch({ type: "SET_ENTREGABLE_FECHA_COMPROMISO", id: entregable.id, fecha: e.target.value || null })
          }
          onBlur={() => setEditing(false)}
          className="h-6 rounded-md border border-border bg-background px-1 text-[10px]"
        />
        {fc && (
          <button
            onClick={() => {
              dispatch({ type: "SET_ENTREGABLE_FECHA_COMPROMISO", id: entregable.id, fecha: null });
              setEditing(false);
            }}
            className="rounded px-1 text-[10px] text-red-500 hover:bg-red-50"
            title="Quitar compromiso"
          >×</button>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
        fc
          ? "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300"
          : "text-muted opacity-60 hover:opacity-100 hover:bg-surface"
      }`}
      title="Compromiso (informativo, no afecta a la planificación)"
    >
      {label}
    </button>
  );
}

/* ============================================================
   PROYECTO
   ============================================================ */

function ProyectoBlock({ proyecto, index, total }: { proyecto: Proyecto; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const { nombre: currentUser } = useUsuario();
  const filter = useMapaFilter();
  const highlight = useHighlight();
  const hideFiltered = useContext(HideFilteredCtx);
  const showRitmo = useContext(ShowRitmoCtx);
  const { open: openSheet } = useNotaSheet();
  const isAncestor = !!highlight?.ancestors.has(proyecto.id);
  const isTarget = highlight?.targetId === proyecto.id;
  const inFilter = !filter || filter.proyectos.has(proyecto.id);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showNotas, setShowNotas] = useState(false);
  const [showMoveArea, setShowMoveArea] = useState(false);
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
  const notasCount = (proyecto.notas ?? []).length;
  const projEstado = proyecto.estado ?? "plan";
  const isOff = projEstado === "pausado";
  const objetivoProyecto = state.objetivos.find((o) => o.id === proyecto.objetivoId && o.nivel === "anio");
  const objetivosAnualesProyecto = useMemo(() => {
    const year = String(new Date().getFullYear());
    return (state.objetivos ?? []).filter((o) => {
      if (o.nivel !== "anio" || o.periodo !== year) return false;
      if (!o.area) return true;
      return o.area === proyecto.area;
    });
  }, [state.objetivos, proyecto.area]);

  // Y/X: Y = resultados con todos sus entregables en estado "hecho" (y al menos uno).
  const resultadosCompletados = useMemo(() => {
    return allResultados.filter((r) => {
      const ents = projEntregables.filter((e) => e.resultadoId === r.id);
      return ents.length > 0 && ents.every((e) => e.estado === "hecho");
    }).length;
  }, [allResultados, projEntregables]);
  const totalResultados = allResultados.length;
  const proyectoCompletado = totalResultados > 0 && resultadosCompletados === totalResultados;
  const isInactive = isOff || proyectoCompletado;

  const ritmo = useMemo(() => showRitmo ? computeProyectoRitmo(proyecto, projEntregables, allResultados, new Date(), state.miembros, state.pasos, state.planConfig) : null, [showRitmo, proyecto, projEntregables, allResultados, state.miembros, state.pasos, state.planConfig]);

  // Rango efectivo derivado del planning (trimestres, semanas, entregables) — sólo informativo en RitmoBanner.
  const rangoProy = useMemo(() => rangoProyectoMapa(proyecto, allResultados, projEntregables), [proyecto, allResultados, projEntregables]);

  if (hideFiltered && !inFilter) return null;

  return (
    <div ref={hlRef} className={`rounded-xl border border-border bg-background transition-all duration-700${filter && !inFilter && !hideFiltered ? " opacity-40" : ""}${isInactive ? " opacity-50" : ""}${isTarget ? " ring-2 ring-accent ring-offset-2 animate-pulse" : ""}`}>
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        {isMentor
          ? <span className={`text-lg font-semibold ${isInactive ? "text-muted line-through" : "text-foreground"}`}>{proyecto.nombre}</span>
          : <EditableText value={proyecto.nombre} onChange={(v) => dispatch({ type: "RENAME_PROYECTO", id: proyecto.id, nombre: v })} className={`text-lg font-semibold ${isInactive ? "text-muted" : "text-foreground"}`} />
        }
        {objetivoProyecto && (
          <span
            className="max-w-[220px] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: (AREA_COLORS[proyecto.area]?.hex ?? "#888") + "18", color: AREA_COLORS[proyecto.area]?.hex ?? "#888" }}
            title={`Objetivo anual: ${objetivoProyecto.texto}`}
          >
            Obj: {objetivoProyecto.texto}
          </span>
        )}
        <ReviewBadge review={proyecto.review} nivel="proyecto" targetId={proyecto.id} />
        <OnOffToggle
          on={!isOff}
          disabled={isMentor}
          onToggle={() => dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { estado: isOff ? "en_marcha" : "pausado" } })}
          titleOn="Pausar proyecto"
          titleOff="Reactivar proyecto"
        />
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            proyectoCompletado
              ? "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400"
              : "bg-surface text-muted"
          }`}
          title="Resultados completados / totales"
        >
          {resultadosCompletados}/{totalResultados}
        </span>
        <QuarterChips proyecto={proyecto} />
        {ambitoDeArea(proyecto.area) === "empresa" && (
          <ResponsableBadge
            nombre={proyecto.responsable}
            editable={!isMentor}
            miembros={state.miembros}
            onChange={(v) => dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { responsable: v || undefined } })}
            placeholder="+ Lead"
            showUnassigned
          />
        )}
        {isMentor
          ? <CommentIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: proyecto.nombre, nivel: "proyecto", targetId: proyecto.id })} />
          : <NotasIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: proyecto.nombre, nivel: "proyecto", targetId: proyecto.id })} />}
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

      {ritmo && (
        <RitmoBanner ritmo={ritmo} deadline={rangoProy.fin ?? proyecto.fechaLimite} />
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
          {!isMentor ? (
            <EditableText value={proyecto.descripcion ?? ""} onChange={(v) => dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { descripcion: v || null } })}
              className="mb-4 text-sm italic text-muted" placeholder="Objetivo del proyecto..." multiline />
          ) : proyecto.descripcion ? (
            <p className="mb-4 text-sm italic text-muted">{proyecto.descripcion}</p>
          ) : null}

          {!isMentor && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Objetivo anual</span>
              <select
                value={proyecto.objetivoId ?? ""}
                onChange={(e) => dispatch({
                  type: "UPDATE_PROYECTO",
                  id: proyecto.id,
                  changes: { objetivoId: e.target.value || undefined },
                })}
                className="rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground"
              >
                <option value="">Sin objetivo</option>
                {objetivosAnualesProyecto.map((o) => (
                  <option key={o.id} value={o.id}>{o.texto}</option>
                ))}
              </select>
            </div>
          )}

          {rangoProy.inicio && (
            <p className="mb-3 text-xs text-muted">
              Inicio: {new Date(rangoProy.inicio + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}

          <TimelineInline proyecto={proyecto} resultados={allResultados} entregables={projEntregables} />

          <div className="space-y-2">
            {allResultados.map((res, i) => (
              <ResultadoBlock key={res.id} resultado={res} index={i} total={allResultados.length} />
            ))}
          </div>

          {!isMentor && (
            <AddButton label="Resultado" onAdd={(nombre) =>
              dispatch({ type: "ADD_RESULTADO", payload: { id: generateId(), nombre, descripcion: null, proyectoId: proyecto.id, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null, responsable: ambitoDeArea(proyecto.area) === "empresa" ? currentUser : undefined } })
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
  const hideFiltered = useContext(HideFilteredCtx);
  const { open: openSheet } = useNotaSheet();
  const isAncestor = !!highlight?.ancestors.has(resultado.id);
  const isTarget = highlight?.targetId === resultado.id;
  const inFilter = !filter || filter.resultados.has(resultado.id);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showNotas, setShowNotas] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const hlRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (isAncestor || isTarget) setOpen(true); }, [isAncestor, isTarget]);
  useEffect(() => {
    if (isTarget && hlRef.current) hlRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isTarget]);

  const allEntregables = state.entregables.filter((e) => e.resultadoId === resultado.id);
  const hechos = allEntregables.filter((e) => e.estado === "hecho").length;
  const totalEnts = allEntregables.length;
  const completado = totalEnts > 0 && hechos === totalEnts;
  const isInactive = completado;
  const parentProj = state.proyectos.find((p) => p.id === resultado.proyectoId);
  const isEmpresa = parentProj ? ambitoDeArea(parentProj.area) === "empresa" : false;
  const notasCount = (resultado.notas ?? []).length;

  if (hideFiltered && !inFilter) return null;

  return (
    <div ref={hlRef} className={`rounded-xl border border-border/50 bg-surface/30 transition-all duration-700${filter && !inFilter && !hideFiltered ? " opacity-40" : ""}${isInactive ? " opacity-60" : ""}${isTarget ? " ring-2 ring-accent ring-offset-2 animate-pulse" : ""}`}>
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        {isMentor
          ? <span className={`text-base font-medium ${completado ? "text-muted line-through" : "text-foreground"}`}>{resultado.nombre}</span>
          : <EditableText value={resultado.nombre} onChange={(v) => dispatch({ type: "RENAME_RESULTADO", id: resultado.id, nombre: v })} className={`text-base font-medium ${completado ? "text-muted line-through" : "text-foreground"}`} />
        }
        <ReviewBadge review={resultado.review} nivel="resultado" targetId={resultado.id} />
        {isEmpresa && <ResponsableBadge nombre={resultado.responsable ?? parentProj?.responsable} editable={!isMentor} miembros={state.miembros} onChange={(v) => dispatch({ type: "UPDATE_RESULTADO", id: resultado.id, changes: { responsable: v || undefined } })} showUnassigned />}
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            completado
              ? "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400"
              : "bg-surface text-muted"
          }`}
          title="Entregables hechos / totales"
        >
          {hechos}/{totalEnts}
        </span>
        <MesChips resultado={resultado} proyecto={parentProj} />
        {isMentor
          ? <CommentIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: resultado.nombre, nivel: "resultado", targetId: resultado.id })} />
          : <NotasIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: resultado.nombre, nivel: "resultado", targetId: resultado.id })} />}
        {!isMentor && (
          <button onClick={(e) => { e.stopPropagation(); setShowMove((v) => !v); }}
            className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] text-muted transition-colors hover:bg-surface hover:text-foreground" title="Mover a otro proyecto">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        )}
        {!isMentor && <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_RESULTADO", id: resultado.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_RESULTADO", id: resultado.id, direction: "down" })} />}
        {!isMentor && <DeleteBtn onDelete={() => setConfirm(true)} />}
      </ToggleRow>

      {showMove && (
        <MoveInlinePanel
          target={{ kind: "resultado", id: resultado.id, currentProyectoId: resultado.proyectoId }}
          onDone={() => setShowMove(false)}
        />
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
  const { nombre: currentUser } = useUsuario();
  const filter = useMapaFilter();
  const highlight = useHighlight();
  const hideFiltered = useContext(HideFilteredCtx);
  const { open: openSheet } = useNotaSheet();
  const isAncestor = !!highlight?.ancestors.has(entregable.id);
  const isTarget = highlight?.targetId === entregable.id;
  const inFilter = !filter || filter.entregables.has(entregable.id);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [synced, setSynced] = useState(false);
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const syncedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevEstadoRef = useRef(entregable.estado);
  const hlRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => { clearTimeout(syncedTimer.current); }, []);

  useEffect(() => {
    if (prevEstadoRef.current !== "hecho" && entregable.estado === "hecho" && entregable.plantillaId) {
      const plantilla = state.plantillas.find((pl) => pl.id === entregable.plantillaId);
      if (plantilla) {
        const entPasoNames = state.pasos.filter((p) => p.entregableId === entregable.id).map((p) => p.nombre.toLowerCase().trim());
        const templateNames = plantilla.pasos.map((p) => p.nombre.toLowerCase().trim());
        const differ = entPasoNames.length !== templateNames.length || entPasoNames.some((n, i) => n !== templateNames[i]);
        if (differ) setShowSyncPrompt(true);
      }
    }
    prevEstadoRef.current = entregable.estado;
  }, [entregable.estado, entregable.plantillaId, entregable.id, state.plantillas, state.pasos]);

  useEffect(() => { if (isAncestor || isTarget) setOpen(true); }, [isAncestor, isTarget]);
  useEffect(() => {
    if (isTarget && hlRef.current) hlRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isTarget]);

  const allPasos = state.pasos
    .filter((p) => p.entregableId === entregable.id)
    .sort((a, b) => { if (!a.inicioTs) return 1; if (!b.inicioTs) return -1; return a.inicioTs.localeCompare(b.inicioTs); });

  const [showNotas, setShowNotas] = useState(false);

  if (hideFiltered && !inFilter) return null;

  const tipoTag = entregable.tipo !== "raw" ? entregable.tipo.toUpperCase() : null;
  const isDone = entregable.estado === "hecho";
  const dotColor = isDone ? "bg-green-500" : entregable.estado === "en_proceso" ? "bg-amber-500" : entregable.estado === "planificado" ? "bg-blue-400" : "bg-border";
  const parentRes = state.resultados.find((r) => r.id === entregable.resultadoId);
  const parentProj = parentRes ? state.proyectos.find((p) => p.id === parentRes.proyectoId) : undefined;
  const entAreaHex = parentProj ? (AREA_COLORS[parentProj.area]?.hex ?? "#888") : "#888";
  const isEmpresa = parentProj ? ambitoDeArea(parentProj.area) === "empresa" : false;
  const notasCount = (entregable.notas ?? []).length;


  return (
    <div ref={hlRef} className={`transition-all duration-700${filter && !inFilter && !hideFiltered ? " opacity-40" : ""}${isDone ? " opacity-60" : ""}${isTarget ? " rounded-lg ring-2 ring-accent ring-offset-2 animate-pulse" : ""}`}>
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        {!isMentor ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes: { estado: isDone ? "planificado" : "hecho" } });
            }}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all ${isDone ? "border-green-500 bg-green-500 text-white" : "border-border hover:border-green-400"}`}
            title={isDone ? "Revertir (no hecho)" : "Marcar como hecho"}>
            {isDone && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
          </button>
        ) : (
          <span className={`h-3 w-3 shrink-0 rounded-full ${dotColor}`} />
        )}
        {isMentor
          ? <span className={`text-sm ${isDone ? "text-muted line-through" : "text-foreground"}`}>{entregable.nombre}</span>
          : <EditableText value={entregable.nombre} onChange={(v) => dispatch({ type: "RENAME_ENTREGABLE", id: entregable.id, nombre: v })} className={`text-sm ${isDone ? "text-muted line-through" : "text-foreground"}`} />
        }
        <ReviewBadge review={entregable.review} nivel="entregable" targetId={entregable.id} />
        {tipoTag && <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: entAreaHex + "15", color: entAreaHex }}>{tipoTag}</span>}
        {isDone && <span className="rounded-md bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400">Hecho</span>}
        {isEmpresa && <ResponsableBadge nombre={entregable.responsable} editable={!isMentor} miembros={state.miembros} onChange={(v) => dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes: { responsable: v || undefined } })} showUnassigned />}
        <SemanaIsoChips entregable={entregable} resultado={parentRes} />
        <FechaCompromisoChip entregable={entregable} />
        {!isMentor && (
          <DaysInput value={entregable.diasEstimados} onChange={(v) => dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes: { diasEstimados: v } })} />
        )}
        {isMentor && entregable.diasEstimados > 0 && <span className="text-[10px] text-muted">{entregable.diasEstimados}d</span>}
        {allPasos.length > 0 && <span className="text-xs text-muted">{allPasos.length}p</span>}
        {isMentor
          ? <CommentIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: entregable.nombre, nivel: "entregable", targetId: entregable.id })} />
          : <NotasIcon count={notasCount} onClick={() => toggleOrSheet(showNotas, setShowNotas, openSheet, { title: entregable.nombre, nivel: "entregable", targetId: entregable.id })} />}
        {!isMentor && (
          <RegistrarSesionIconButton
            entregableId={entregable.id}
            title="Ya lo hice · registrar sesión"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted opacity-60 transition-all hover:bg-accent-soft hover:text-accent hover:opacity-100"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
              <path d="M19 4v4M17 6h4" />
            </svg>
          </RegistrarSesionIconButton>
        )}
        {!isMentor && (
          <button onClick={(e) => { e.stopPropagation(); setShowMove((v) => !v); }}
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
        <MoveInlinePanel
          target={{ kind: "entregable", id: entregable.id, currentResultadoId: entregable.resultadoId }}
          onDone={() => setShowMove(false)}
        />
      )}

      {confirm && <ConfirmDelete label={entregable.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_ENTREGABLE", id: entregable.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {showSyncPrompt && (
        <div className="mx-2 mb-3 ml-4 sm:mx-5 sm:ml-10 md:ml-16 flex items-center gap-3 rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800/30 dark:bg-blue-500/10">
          <span className="text-blue-700 dark:text-blue-400">Los pasos han cambiado. ¿Actualizar la plantilla para futuras ejecuciones?</span>
          <button onClick={() => {
            dispatch({ type: "SYNC_ENTREGABLE_TO_PLANTILLA", entregableId: entregable.id });
            setShowSyncPrompt(false);
            setSynced(true);
            clearTimeout(syncedTimer.current);
            syncedTimer.current = setTimeout(() => setSynced(false), 2500);
          }} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700">Sí</button>
          <button onClick={() => setShowSyncPrompt(false)} className="text-xs text-muted hover:text-foreground">No</button>
        </div>
      )}

      {showNotas && (
        <div className="mx-2 mb-3 ml-4 sm:mx-5 sm:ml-10 md:ml-16">
          <NotasSection notas={entregable.notas ?? []} nivel="entregable" targetId={entregable.id} />
        </div>
      )}

      {open && (
        <div className="pb-2 pl-4 sm:pl-10 md:pl-16">
          {allPasos.map((paso, i) => <PasoLine key={paso.id} paso={paso} index={i} total={allPasos.length} isEmpresa={isEmpresa} />)}
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
                responsable: isEmpresa ? currentUser : undefined,
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

function PasoLine({ paso, index, total, isEmpresa }: { paso: Paso; index: number; total: number; isEmpresa: boolean }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const filter = useMapaFilter();
  const highlight = useHighlight();
  const hideFiltered = useContext(HideFilteredCtx);
  const { open: openSheet } = useNotaSheet();
  const isTarget = highlight?.targetId === paso.id;
  const inFilter = !filter || filter.pasos.has(paso.id);
  const [showNotas, setShowNotas] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showDonePicker, setShowDonePicker] = useState(false);
  const [showMove, setShowMove] = useState(false);
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

  if (hideFiltered && !inFilter) return null;

  function toggleNotas() {
    toggleOrSheet(showNotas, setShowNotas, openSheet, {
      title: paso.nombre, nivel: "paso", targetId: paso.id,
      contextoNotas: paso.contexto.notas || undefined,
      urls: paso.contexto.urls.map((u) => ({ nombre: u.nombre, url: u.url })),
    });
  }

  return (
    <div ref={hlRef} className={`mb-1 transition-all duration-700${filter && !inFilter && !hideFiltered ? " opacity-40" : ""}${isTarget ? " rounded-lg ring-2 ring-accent ring-offset-2 animate-pulse" : ""}`}>
      <div className="group/row flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface">
        {isMentor ? (
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${done ? "bg-green-500" : "bg-border"}`} />
        ) : (
          <button
            type="button"
            onClick={() => dispatch({ type: done ? "UNCHECK_PASO" : "CHECK_PASO", id: paso.id })}
            className="h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors"
            style={{
              borderColor: done ? "#22c55e" : "#d4d4d8",
              backgroundColor: done ? "#22c55e" : "transparent",
            }}
            aria-label={done ? "Marcar como pendiente" : "Marcar como hecho"}
            title={done ? "Marcar como pendiente" : "Marcar como hecho"}
          >
            {done && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        )}
        {isMentor
          ? <span className={`text-sm ${done ? "text-muted line-through" : "text-foreground"}`}>{paso.nombre}</span>
          : <EditableText value={paso.nombre} onChange={(v) => dispatch({ type: "RENAME_PASO", id: paso.id, nombre: v })} className={`text-sm ${done ? "text-muted line-through" : "text-foreground"}`} />
        }
        {isEmpresa && (
          <ResponsableBadge
            nombre={paso.responsable}
            editable={!isMentor}
            miembros={state.miembros}
            onChange={(v) => dispatch({ type: "UPDATE_PASO", id: paso.id, changes: { responsable: v || undefined } })}
            placeholder="+ Responsable"
            showUnassigned
          />
        )}
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
        {!isMentor && (
          <button onClick={() => setShowMove((v) => !v)}
            className="flex h-6 items-center gap-0.5 rounded px-1.5 text-[10px] text-muted opacity-0 transition-all group-hover/row:opacity-100 hover:bg-surface hover:text-foreground" title="Mover a otro entregable">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        )}
        {!isMentor && <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_PASO", id: paso.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_PASO", id: paso.id, direction: "down" })} />}
        {!isMentor && <DeleteBtn onDelete={() => setConfirmDel(true)} />}
      </div>

      {showMove && (
        <MoveInlinePanel
          target={{ kind: "paso", id: paso.id, currentEntregableId: paso.entregableId }}
          onDone={() => setShowMove(false)}
          className="ml-2 mb-2 sm:ml-6 md:ml-12"
        />
      )}

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
  const [showDetail, setShowDetail] = useState(false);
  const [urlDraft, setUrlDraft] = useState({ nombre: "", url: "" });

  const urls = paso.urls ?? [];
  const hasNotas = !!paso.descripcion;
  const hasUrls = urls.length > 0;
  const detailCount = (hasNotas ? 1 : 0) + urls.length;

  function updatePaso(changes: Partial<PlantillaProceso["pasos"][number]>) {
    dispatch({ type: "UPDATE_PASO_PLANTILLA", plantillaId: sop.id, pasoId: paso.id, changes });
  }

  function removePaso() {
    dispatch({ type: "DELETE_PASO_PLANTILLA", plantillaId: sop.id, pasoId: paso.id });
  }

  function addUrl() {
    if (!urlDraft.url.trim()) return;
    const newUrls = [...urls, { nombre: urlDraft.nombre.trim() || urlDraft.url.trim(), descripcion: "", url: urlDraft.url.trim() }];
    updatePaso({ urls: newUrls });
    setUrlDraft({ nombre: "", url: "" });
  }

  function removeUrl(i: number) {
    updatePaso({ urls: urls.filter((_, idx) => idx !== i) });
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
        <button onClick={(e) => { e.stopPropagation(); setShowDetail(!showDetail); }}
          className={`flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs transition-all hover:bg-accent-soft ${detailCount > 0 ? "text-accent" : "text-muted opacity-50 hover:opacity-100"}`}
          title="Notas y enlaces">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          {detailCount > 0 && <span className="font-medium">{detailCount}</span>}
        </button>
        {!isMentor && <DeleteBtn onDelete={() => setConfirmDel(true)} />}
      </div>

      {showDetail && (
        <div className="ml-8 mr-3 mb-2 space-y-2 rounded-lg border border-border/50 bg-surface/30 px-3 py-2">
          {!isMentor ? (
            <EditableText
              value={paso.descripcion || ""}
              onChange={(v) => updatePaso({ descripcion: v })}
              className="block text-sm text-muted"
              placeholder="Notas del paso..."
              multiline
            />
          ) : paso.descripcion ? (
            <p className="text-sm text-muted whitespace-pre-wrap">{paso.descripcion}</p>
          ) : null}

          {hasUrls && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Enlaces</p>
              {urls.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <a href={u.url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 truncate text-xs text-accent underline hover:text-accent/80">
                    {u.nombre || u.url}
                  </a>
                  {!isMentor && (
                    <button onClick={() => removeUrl(i)} className="text-[10px] text-red-400 hover:text-red-600">×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!isMentor && (
            <div className="flex items-center gap-1.5">
              <input
                value={urlDraft.nombre}
                onChange={(e) => setUrlDraft((d) => ({ ...d, nombre: e.target.value }))}
                placeholder="Nombre..."
                className="w-24 rounded border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-accent"
              />
              <input
                value={urlDraft.url}
                onChange={(e) => setUrlDraft((d) => ({ ...d, url: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addUrl(); }}
                placeholder="https://..."
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-accent"
              />
              <button onClick={addUrl} disabled={!urlDraft.url.trim()}
                className="rounded bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-30">
                +
              </button>
            </div>
          )}
        </div>
      )}

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

function DaysInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = useCallback(() => {
    const n = parseInt(draft, 10);
    onChange(isNaN(n) || n < 0 ? 0 : n);
    setEditing(false);
  }, [draft, onChange]);

  if (editing) {
    return (
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <input ref={ref} type="number" min="0" value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-10 rounded border-2 border-accent bg-background px-1 py-0.5 text-[11px] text-foreground outline-none" />
        <span className="text-[10px] text-muted">d</span>
      </div>
    );
  }

  return (
    <button onClick={(e) => { e.stopPropagation(); setDraft(String(value)); setEditing(true); }}
      className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-muted opacity-60 transition-all hover:bg-surface-hover hover:text-foreground hover:opacity-100"
      title="Sesiones estimadas (1 sesión ≈ 1-3h)">
      {value > 0 ? <>{value}s</> : <>+s</>}
    </button>
  );
}

const MESES_BATCH = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function getMonday(d: Date): Date {
  const day = d.getDay() || 7;
  const mon = new Date(d);
  mon.setDate(d.getDate() - day + 1);
  return mon;
}

function padBatch(n: number) { return String(n).padStart(2, "0"); }
function dateKeyBatch(d: Date) { return `${d.getFullYear()}-${padBatch(d.getMonth() + 1)}-${padBatch(d.getDate())}`; }
function weekNum(d: Date) {
  const oneJan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
}

function SOPBatchDialog({ sop, onConfirm, onCancel }: { sop: PlantillaProceso; onConfirm: (items: { name: string; dateKey: string }[]) => void; onCancel: () => void }) {
  const tipo = sop.programacion?.tipo ?? "demanda";
  const [now] = useState(() => new Date());
  const [count, setCount] = useState(tipo === "diario" ? 7 : tipo === "semanal" ? 4 : tipo === "mensual" ? 3 : tipo === "trimestral" ? 4 : 1);

  const items = useMemo(() => {
    const result: { name: string; dateKey: string }[] = [];

    if (tipo === "semanal") {
      const baseDay = sop.programacion?.diaSemana ?? 1;
      let monday = getMonday(now);
      for (let i = 0; i < count; i++) {
        const target = new Date(monday);
        target.setDate(monday.getDate() + (baseDay === 0 ? 6 : baseDay - 1));
        const wn = weekNum(target);
        result.push({ name: `${sop.nombre} S${wn}`, dateKey: dateKeyBatch(target) });
        monday = new Date(monday);
        monday.setDate(monday.getDate() + 7);
      }
    } else if (tipo === "mensual") {
      const baseDay = sop.programacion?.diaMes ?? 1;
      for (let i = 0; i < count; i++) {
        const m = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const day = baseDay === -1 ? new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate() : Math.min(baseDay, new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate());
        const target = new Date(m.getFullYear(), m.getMonth(), day);
        result.push({ name: `${sop.nombre} ${MESES_BATCH[target.getMonth()]}`, dateKey: dateKeyBatch(target) });
      }
    } else if (tipo === "trimestral") {
      const currentQ = Math.floor(now.getMonth() / 3);
      for (let i = 0; i < count; i++) {
        const q = currentQ + i;
        const yr = now.getFullYear() + Math.floor(q / 4);
        const qn = (q % 4) + 1;
        const firstMonth = (q % 4) * 3;
        const target = new Date(yr, firstMonth, 1);
        result.push({ name: `${sop.nombre} Q${qn} ${yr}`, dateKey: dateKeyBatch(target) });
      }
    } else if (tipo === "diario") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      for (let i = 0; i < count; i++) {
        const target = new Date(start);
        target.setDate(start.getDate() + i);
        const dayLabel = `${padBatch(target.getDate())}/${padBatch(target.getMonth() + 1)}`;
        result.push({ name: `${sop.nombre} ${dayLabel}`, dateKey: dateKeyBatch(target) });
      }
    } else {
      result.push({ name: sop.nombre, dateKey: dateKeyBatch(now) });
    }
    return result;
  }, [tipo, count, sop.nombre, sop.programacion, now]);

  const [names, setNames] = useState<string[]>([]);
  const [dates, setDates] = useState<string[]>([]);

  useEffect(() => {
    setNames(items.map((i) => i.name));
    setDates(items.map((i) => i.dateKey));
  }, [items]);

  const linkedProj = sop.proyectoId ? `→ Proyecto configurado` : "";

  return (
    <div className="mx-2 mb-3 ml-3 sm:mx-5 sm:ml-8 md:ml-14 rounded-lg border border-border bg-surface/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Planificar en lote</p>
        {linkedProj && <span className="text-[10px] text-muted">{linkedProj}</span>}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-[11px] text-muted">Repeticiones:</label>
        <input type="number" min="1" max="52" value={count} onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-14 rounded border border-border bg-background px-2 py-1 text-sm text-foreground" />
        <span className="text-[11px] text-muted">
          {tipo === "semanal" ? "semanas (1 por semana)" : tipo === "mensual" ? "meses (1 por mes)" : tipo === "trimestral" ? "trimestres (1 por trimestre)" : tipo === "diario" ? "días (1 por día)" : "veces"}
        </span>
      </div>

      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-background px-3 py-1.5">
            <input type="date" value={dates[i] ?? item.dateKey}
              onChange={(e) => { const d = [...dates]; d[i] = e.target.value; setDates(d); }}
              className="rounded border border-border bg-surface px-2 py-0.5 text-[11px] text-foreground" />
            <input value={names[i] ?? item.name}
              onChange={(e) => { const n = [...names]; n[i] = e.target.value; setNames(n); }}
              className="flex-1 rounded border border-border bg-surface px-2 py-0.5 text-[11px] text-foreground outline-none focus:border-accent" />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => {
          const final = items.map((item, i) => ({
            name: names[i] ?? item.name,
            dateKey: dates[i] ?? item.dateKey,
          }));
          onConfirm(final);
        }} className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent/90">
          Crear {items.length} entregable{items.length !== 1 ? "s" : ""}
        </button>
        <button onClick={onCancel} className="text-xs text-muted hover:text-foreground">Cancelar</button>
      </div>
    </div>
  );
}

function SOPDestinoPicker({ sop }: { sop: PlantillaProceso }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);

  const linkedProj = sop.proyectoId ? state.proyectos.find((p) => p.id === sop.proyectoId) : null;
  const linkedRes = sop.resultadoId ? state.resultados.find((r) => r.id === sop.resultadoId) : null;

  if (!editing) {
    return (
      <div className="mb-3 flex items-center gap-2 text-sm text-muted">
        <span className="text-[10px] font-semibold uppercase tracking-wider">Destino:</span>
        {linkedProj && linkedRes ? (
          <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] text-foreground">
            {linkedProj.nombre} → {linkedRes.nombre}
          </span>
        ) : linkedProj ? (
          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            {linkedProj.nombre} (sin resultado)
          </span>
        ) : (
          <span className="text-[11px] text-muted">Sin configurar</span>
        )}
        <button onClick={() => setEditing(true)} className="rounded px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent-soft">
          {linkedProj ? "Cambiar" : "Configurar"}
        </button>
      </div>
    );
  }

  return <SOPDestinoEditor sop={sop} onClose={() => setEditing(false)} />;
}

function SOPDestinoEditor({ sop, onClose }: { sop: PlantillaProceso; onClose: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const [selProyectoId, setSelProyectoId] = useState<string | null>(sop.proyectoId);
  const [selResultadoId, setSelResultadoId] = useState<string | null>(sop.resultadoId);
  const [newProjName, setNewProjName] = useState("");
  const [newResName, setNewResName] = useState("");
  const [creatingProj, setCreatingProj] = useState(false);
  const [creatingRes, setCreatingRes] = useState(false);

  const proyectos = state.proyectos.filter((p) => p.area === sop.area && (p.estado ?? "plan") !== "completado");
  const resultados = selProyectoId ? state.resultados.filter((r) => r.proyectoId === selProyectoId) : [];

  function save() {
    dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { proyectoId: selProyectoId, resultadoId: selResultadoId } });
    onClose();
  }

  function createProj() {
    if (!newProjName.trim()) return;
    const id = generateId();
    dispatch({ type: "ADD_PROYECTO", payload: { id, nombre: newProjName.trim(), descripcion: null, area: sop.area, creado: new Date().toISOString(), fechaInicio: null, estado: "plan" } });
    setSelProyectoId(id);
    setSelResultadoId(null);
    setNewProjName("");
    setCreatingProj(false);
  }

  function createRes() {
    if (!newResName.trim() || !selProyectoId) return;
    const id = generateId();
    dispatch({ type: "ADD_RESULTADO", payload: { id, nombre: newResName.trim(), descripcion: null, proyectoId: selProyectoId, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null, responsable: ambitoDeArea(sop.area) === "empresa" ? currentUser : undefined } });
    setSelResultadoId(id);
    setNewResName("");
    setCreatingRes(false);
  }

  return (
    <div className="mb-3 rounded-lg border border-border bg-surface/50 p-3 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Destino de ejecuciones</p>

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted">Proyecto:</p>
        <div className="flex flex-wrap gap-1">
          {proyectos.map((p) => (
            <button key={p.id} onClick={() => { setSelProyectoId(p.id); setSelResultadoId(null); }}
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${selProyectoId === p.id ? "border-accent bg-accent/10 text-accent font-semibold" : "border-border text-foreground hover:border-accent"}`}>
              {p.nombre}
            </button>
          ))}
          {!creatingProj ? (
            <button onClick={() => setCreatingProj(true)} className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent">+ Nuevo</button>
          ) : (
            <div className="flex items-center gap-1">
              <input autoFocus value={newProjName} onChange={(e) => setNewProjName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createProj(); if (e.key === "Escape") setCreatingProj(false); }}
                placeholder="Nombre..."
                className="w-32 rounded border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-accent" />
              <button onClick={createProj} className="text-[10px] text-accent hover:underline">Crear</button>
            </div>
          )}
        </div>
      </div>

      {selProyectoId && (
        <div>
          <p className="mb-1 text-[11px] font-medium text-muted">Resultado:</p>
          <div className="flex flex-wrap gap-1">
            {resultados.map((r) => (
              <button key={r.id} onClick={() => setSelResultadoId(r.id)}
                className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${selResultadoId === r.id ? "border-accent bg-accent/10 text-accent font-semibold" : "border-border text-foreground hover:border-accent"}`}>
                {r.nombre}
              </button>
            ))}
            {!creatingRes ? (
              <button onClick={() => setCreatingRes(true)} className="rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent">+ Nuevo</button>
            ) : (
              <div className="flex items-center gap-1">
                <input autoFocus value={newResName} onChange={(e) => setNewResName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createRes(); if (e.key === "Escape") setCreatingRes(false); }}
                  placeholder="Nombre..."
                  className="w-32 rounded border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-accent" />
                <button onClick={createRes} className="text-[10px] text-accent hover:underline">Crear</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={save} disabled={!selProyectoId || !selResultadoId}
          className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-40">
          Guardar destino
        </button>
        <button onClick={onClose} className="text-xs text-muted hover:text-foreground">Cancelar</button>
      </div>
    </div>
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
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [showNeedResultado, setShowNeedResultado] = useState(false);
  const hasDestino = !!sop.resultadoId;

  const resultadosParaVincular = useMemo(
    () => (sop.proyectoId ? state.resultados.filter((r) => r.proyectoId === sop.proyectoId) : []),
    [sop.proyectoId, state.resultados],
  );

  function handleSOPPlanSelect(fechaInicio: string, _nivel: PlanNivel) {
    if (hasDestino) {
      setShowDatePicker(false);
      setShowBatchDialog(true);
    } else if (sop.proyectoId) {
      setShowDatePicker(false);
      setShowNeedResultado(true);
    } else {
      setSOPPendingDate(fechaInicio);
      setShowDatePicker(false);
      setSOPDestPicker(true);
    }
  }

  function linkResultadoAndBatch(resultadoId: string) {
    dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { resultadoId } });
    setShowNeedResultado(false);
    setShowBatchDialog(true);
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

  function materializeBatch(items: { name: string; dateKey: string }[]) {
    for (const item of items) {
      dispatch({
        type: "MATERIALIZE_SOP",
        plantillaId: sop.id,
        area: sop.area,
        responsable: sop.responsableDefault ?? currentUser,
        currentUser,
        dateKey: item.dateKey,
        ids: { resultado: generateId(), entregable: generateId(), paso: generateId(), proyecto: generateId() },
        proyectoId: sop.proyectoId ?? undefined,
        resultadoId: sop.resultadoId ?? undefined,
        autoStart: false,
        customName: item.name,
      });
    }
    setJustCreated(true);
    clearTimeout(justCreatedTimer.current);
    justCreatedTimer.current = setTimeout(() => setJustCreated(false), 2500);
    setShowBatchDialog(false);
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

      {showNeedResultado && (
        <div className="mx-2 mb-3 ml-3 sm:mx-5 sm:ml-8 md:ml-14 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
          <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-200">
            Este SOP tiene proyecto pero no resultado vinculado. Selecciona un resultado para planificar en lote:
          </p>
          {resultadosParaVincular.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {resultadosParaVincular.map((r) => (
                <button key={r.id} onClick={() => linkResultadoAndBatch(r.id)}
                  className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent">
                  {r.nombre}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-amber-700 dark:text-amber-300">
              No hay resultados en este proyecto. Crea uno primero desde Mapa.
            </p>
          )}
          <button
            onClick={() => setShowNeedResultado(false)}
            className="mt-2 text-xs text-muted hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
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

      {showBatchDialog && (
        <SOPBatchDialog
          sop={sop}
          onConfirm={materializeBatch}
          onCancel={() => setShowBatchDialog(false)}
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
          {!isMentor && <SOPDestinoPicker sop={sop} />}
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

function ResponsableBadge({ nombre, editable, miembros, onChange, placeholder = "+ Responsable", showUnassigned = false }: { nombre?: string; editable?: boolean; miembros?: { id: string; nombre: string }[]; onChange?: (v: string) => void; placeholder?: string; showUnassigned?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!nombre && !editable) {
    return showUnassigned
      ? <span className="rounded-md bg-surface/60 px-2 py-0.5 text-[10px] italic text-muted/70" title="Sin responsable asignado">(sin asignar)</span>
      : null;
  }
  if (!editable || !miembros || !onChange) {
    return nombre
      ? <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-muted" title="Responsable">{nombre}</span>
      : (showUnassigned ? <span className="rounded-md bg-surface/60 px-2 py-0.5 text-[10px] italic text-muted/70" title="Sin responsable asignado">(sin asignar)</span> : null);
  }
  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)}
        className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${nombre ? "bg-surface text-muted hover:bg-accent-soft hover:text-accent" : "bg-accent-soft/50 text-accent/70 hover:bg-accent-soft"}`}
        title="Cambiar responsable">
        {nombre || placeholder}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          <button onClick={() => { onChange(""); setOpen(false); }}
            className={`block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs italic transition-colors hover:bg-accent-soft ${!nombre ? "font-bold text-accent" : "text-muted"}`}>
            (sin asignar)
          </button>
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
