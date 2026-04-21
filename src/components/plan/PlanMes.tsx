"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import {
  ambitoDeArea, AREA_COLORS,
  type Entregable, type Proyecto, type Ambito, type MiembroInfo,
} from "@/lib/types";
import { projectSOPsForRange, summarizeSOPsByWeek, type SOPWeekSummary } from "@/lib/sop-projector";
import { computeProyectoRitmo } from "@/lib/proyecto-stats";
import { ProyectoPlanner } from "./ProyectoPlanner";
import {
  MapaFilterCtx, HighlightCtx, NotaSheetCtx, ShowTimelineCtx,
  HideFilteredCtx, ShowRitmoCtx,
  NotaSheet,
  AreaSection,
  EMPRESA_ORDER, PERSONAL_ORDER,
  type VisibleFilter, type NotaSheetData,
} from "../mapa/MapaBlocks";

export type AmbitoFilter = "todo" | Ambito;
type ViewMode = "mapa" | "semanas";
type RAG = "green" | "amber" | "red";

const RAG_HEX: Record<RAG, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };

/* ============================================================
   Shared helpers
   ============================================================ */

interface WeekDef {
  index: number;
  label: string;
  monday: string;
  mondayMs: number;
  sundayMs: number;
}

interface EntCard {
  entregable: Entregable;
  proyecto: Proyecto;
  areaHex: string;
  rag: RAG;
  arrastrado?: boolean;
}

function getWeeksOfMonth(date: Date): WeekDef[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const dayOfWeek = firstDay.getDay() || 7;
  const firstMonday = new Date(firstDay);
  firstMonday.setDate(firstDay.getDate() - dayOfWeek + 1);

  const weeks: WeekDef[] = [];
  const current = new Date(firstMonday);
  let idx = 1;

  while (current.getTime() <= lastDay.getTime()) {
    const mon = new Date(current);
    const sun = new Date(current);
    sun.setDate(sun.getDate() + 6);

    const monStr = mon.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const sunStr = sun.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

    const mondayKey = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;

    weeks.push({
      index: idx,
      label: `S${idx} · ${monStr} – ${sunStr}`,
      monday: mondayKey,
      mondayMs: mon.getTime(),
      sundayMs: sun.getTime() + 86400000 - 1,
    });

    current.setDate(current.getDate() + 7);
    idx++;
  }
  return weeks;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeRAG(ent: Entregable, nowMs: number): RAG {
  if (ent.estado === "hecho") return "green";
  if (ent.estado === "cancelada") return "green";
  if (ent.fechaLimite) {
    const dl = new Date(ent.fechaLimite + "T23:59:59").getTime();
    if (dl < nowMs) return "red";
    const daysLeft = Math.ceil((dl - nowMs) / 86400000);
    if (daysLeft <= 7) return "amber";
  }
  if (ent.estado === "en_proceso") return "green";
  if (ent.estado === "planificado") return "green";
  if (ent.estado === "a_futuro") return "amber";
  return "green";
}

/* ============================================================
   Main component
   ============================================================ */

interface Props {
  selectedDate: Date;
}

export function PlanMes({ selectedDate }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const { nombre: currentUser } = useUsuario();
  const [filtro, setFiltro] = useState<AmbitoFilter>(isMentor ? "empresa" : "todo");
  const [respFilter, setRespFilter] = useState<ResponsableFilter>("todo");
  const [showDone, setShowDone] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("mapa");
  const [plannerProyectoId, setPlannerProyectoId] = useState<string | null>(null);

  const mesLabel = useMemo(() =>
    selectedDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
  [selectedDate]);

  const weeks = useMemo(() => getWeeksOfMonth(selectedDate), [selectedDate]);
  const [nowMs] = useState<number>(() => Date.now());
  const [hoy] = useState<Date>(() => new Date());

  /* ---- Compute which projects are in month ---- */
  const proyectosMesIds = useMemo(() => {
    const selYear = selectedDate.getFullYear();
    const selMonth = selectedDate.getMonth();
    const monthStart = new Date(selYear, selMonth, 1).getTime();
    const monthEnd = new Date(selYear, selMonth + 1, 0, 23, 59, 59).getTime();

    const ids = new Set<string>();

    for (const proj of state.proyectos) {
      if (filtro !== "todo" && ambitoDeArea(proj.area) !== filtro) continue;

      const resultados = state.resultados.filter((r) => r.proyectoId === proj.id);
      const resIds = new Set(resultados.map((r) => r.id));
      const entregables = state.entregables.filter((e) => resIds.has(e.resultadoId));

      if (!showDone && entregables.every((e) => e.estado === "hecho" || e.estado === "cancelada")) continue;

      const filtered = respFilter === "todo"
        ? entregables
        : entregables.filter((e) => matchesResponsable(e.responsable, respFilter, currentUser));
      if (filtered.length === 0) continue;

      let inMonth = false;

      // Project date range overlaps month
      if (proj.fechaInicio && proj.fechaLimite) {
        const fi = new Date(proj.fechaInicio + "T12:00:00").getTime();
        const fl = new Date(proj.fechaLimite + "T12:00:00").getTime();
        if (fi <= monthEnd && fl >= monthStart) inMonth = true;
      } else if (proj.fechaInicio) {
        const fi = new Date(proj.fechaInicio + "T12:00:00").getTime();
        if (fi >= monthStart && fi <= monthEnd) inMonth = true;
      } else if (proj.fechaLimite) {
        const fl = new Date(proj.fechaLimite + "T12:00:00").getTime();
        if (fl >= monthStart && fl <= monthEnd) inMonth = true;
      }

      // Entregable dates fall in month
      if (!inMonth) {
        for (const ent of filtered) {
          if (ent.fechaInicio) {
            const fi = new Date(ent.fechaInicio + "T12:00:00").getTime();
            if (fi >= monthStart && fi <= monthEnd) { inMonth = true; break; }
          }
          if (ent.fechaLimite) {
            const fl = new Date(ent.fechaLimite + "T12:00:00").getTime();
            if (fl >= monthStart && fl <= monthEnd) { inMonth = true; break; }
          }
        }
      }

      // Pasos with activity in month
      if (!inMonth) {
        const pasoEnMes = state.pasos.some((p) => {
          if (!p.inicioTs) return false;
          const pMs = new Date(p.inicioTs).getTime();
          return pMs >= monthStart && pMs <= monthEnd && resIds.has(state.entregables.find((e) => e.id === p.entregableId)?.resultadoId ?? "");
        });
        if (pasoEnMes) inMonth = true;
      }

      if (inMonth) ids.add(proj.id);
    }

    return ids;
  }, [state, selectedDate, filtro, respFilter, currentUser, showDone]);

  /* ---- Build VisibleFilter for AreaSection ---- */
  const mapaFilter = useMemo<VisibleFilter | null>(() => {
    const projSet = proyectosMesIds;
    if (projSet.size === 0) return null;

    const resSet = new Set<string>();
    const entSet = new Set<string>();
    const pasoSet = new Set<string>();

    for (const r of state.resultados) {
      if (projSet.has(r.proyectoId)) resSet.add(r.id);
    }
    for (const e of state.entregables) {
      if (resSet.has(e.resultadoId)) entSet.add(e.id);
    }
    for (const p of state.pasos) {
      if (entSet.has(p.entregableId)) pasoSet.add(p.id);
    }

    return { proyectos: projSet, resultados: resSet, entregables: entSet, pasos: pasoSet };
  }, [proyectosMesIds, state.resultados, state.entregables, state.pasos]);

  /* ---- Carga total ---- */
  const cargaTotal = useMemo(() => {
    let total = 0;
    for (const projId of proyectosMesIds) {
      const proj = state.proyectos.find((p) => p.id === projId);
      if (!proj) continue;
      const resultados = state.resultados.filter((r) => r.proyectoId === projId);
      const resIds = new Set(resultados.map((r) => r.id));
      const entregables = state.entregables.filter((e) => resIds.has(e.resultadoId));
      const ritmo = computeProyectoRitmo(proj, entregables, resultados, hoy);
      total += ritmo.ritmoRequerido ?? 0;
    }
    return total;
  }, [proyectosMesIds, state, hoy]);

  /* ---- Areas that have projects this month ---- */
  const areasConProyectos = useMemo(() => {
    const areas = new Set<string>();
    for (const projId of proyectosMesIds) {
      const proj = state.proyectos.find((p) => p.id === projId);
      if (proj) areas.add(proj.area);
    }
    return areas;
  }, [proyectosMesIds, state.proyectos]);

  /* ---- NotaSheet state ---- */
  const [sheetData, setSheetData] = useState<NotaSheetData | null>(null);
  const notaSheetCtx = useMemo(() => ({
    open: (data: NotaSheetData) => {
      if (typeof window !== "undefined" && window.innerWidth < 640) setSheetData(data);
    },
  }), []);

  /* ---- Week view data (preserved) ---- */
  const { weekEntregables, unassigned } = useMemo(() => {
    if (viewMode !== "semanas") return { weekEntregables: new Map<number, EntCard[]>(), unassigned: [] as EntCard[] };
    const selYear = selectedDate.getFullYear();
    const selMonth = selectedDate.getMonth();
    const monthStart = new Date(selYear, selMonth, 1).getTime();
    const monthEnd = new Date(selYear, selMonth + 1, 0, 23, 59, 59).getTime();
    const gridStart = weeks[0]?.mondayMs ?? monthStart;
    const gridEnd = weeks[weeks.length - 1]?.sundayMs ?? monthEnd;

    const relevant: EntCard[] = [];

    for (const ent of state.entregables) {
      if (ent.estado === "cancelada") continue;
      if (ent.estado === "hecho" && !showDone) continue;

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      if (!proj) continue;
      if (filtro !== "todo" && ambitoDeArea(proj.area) !== filtro) continue;
      if (!matchesResponsable(ent.responsable, respFilter, currentUser)) continue;

      const areaHex = AREA_COLORS[proj.area]?.hex ?? "#888";

      let inMonth = false;

      if (ent.fechaInicio) {
        const d = new Date(ent.fechaInicio + "T12:00:00");
        if (!isNaN(d.getTime()) && d.getTime() >= gridStart && d.getTime() <= gridEnd) inMonth = true;
      }
      if (!inMonth && ent.fechaLimite) {
        const dl = new Date(ent.fechaLimite + "T12:00:00");
        if (!isNaN(dl.getTime()) && dl.getTime() >= monthStart && dl.getTime() <= monthEnd) inMonth = true;
      }
      if (!inMonth && (ent.estado === "en_proceso" || ent.estado === "planificado") && !ent.fechaInicio) inMonth = true;

      let arrastrado = false;
      if (!inMonth && ent.estado === "en_proceso" && ent.fechaInicio) {
        const fi = new Date(ent.fechaInicio + "T12:00:00").getTime();
        if (fi < monthStart) { inMonth = true; arrastrado = true; }
      }

      if (!inMonth) continue;

      relevant.push({ entregable: ent, proyecto: proj, areaHex, rag: computeRAG(ent, nowMs), arrastrado });
    }

    const byWeek = new Map<number, EntCard[]>();
    const noWeek: EntCard[] = [];

    for (const card of relevant) {
      if (!card.entregable.fechaInicio) { noWeek.push(card); continue; }
      const nivel = card.entregable.planNivel;
      if (nivel === "mes" || nivel === "trimestre") { noWeek.push(card); continue; }
      const fMs = new Date(card.entregable.fechaInicio + "T12:00:00").getTime();
      let placed = false;
      for (const w of weeks) {
        if (fMs >= w.mondayMs && fMs <= w.sundayMs) {
          if (!byWeek.has(w.index)) byWeek.set(w.index, []);
          byWeek.get(w.index)!.push(card);
          placed = true;
          break;
        }
      }
      if (!placed) noWeek.push(card);
    }

    return { weekEntregables: byWeek, unassigned: noWeek };
  }, [state, selectedDate, filtro, respFilter, currentUser, showDone, weeks, nowMs, viewMode]);

  function assignToWeek(entId: string, monday: string) {
    const today = toDateKey(new Date());
    const ent = state.entregables.find((e) => e.id === entId);
    if (!ent) return;
    const isCurrentWeek = monday <= today;
    const newEstado = (ent.estado === "hecho" || ent.estado === "cancelada" || ent.estado === "en_espera")
      ? ent.estado : isCurrentWeek ? "en_proceso" : "planificado";
    dispatch({ type: "UPDATE_ENTREGABLE", id: entId, changes: { fechaInicio: monday, planNivel: "semana", estado: newEstado } });
  }

  const sopWeekSummaries = useMemo(() => {
    if (viewMode !== "semanas") return [] as SOPWeekSummary[];
    const monthStartD = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const monthEndD = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    const sopMap = projectSOPsForRange(state, monthStartD, monthEndD, respFilter === "yo" ? currentUser : respFilter !== "todo" ? respFilter : undefined);
    return summarizeSOPsByWeek(sopMap, weeks, state.plantillas);
  }, [state, selectedDate, weeks, respFilter, currentUser, viewMode]);

  const sopTotalWeekly = useMemo(() => {
    if (sopWeekSummaries.length === 0) return { count: 0, mins: 0 };
    const mid = sopWeekSummaries[Math.floor(sopWeekSummaries.length / 2)];
    return { count: mid.totalOcurrencias, mins: mid.totalMinutos };
  }, [sopWeekSummaries]);

  const totalEntCount = viewMode === "semanas"
    ? Array.from(weekEntregables.values()).reduce((s, arr) => s + arr.length, 0) + unassigned.length
    : 0;

  const empresaAreas = EMPRESA_ORDER.filter((a) => areasConProyectos.has(a));
  const personalAreas = PERSONAL_ORDER.filter((a) => areasConProyectos.has(a));

  return (
    <div className="flex-1">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium capitalize text-muted">{mesLabel}</p>
          <p className="text-xs text-muted">
            {viewMode === "mapa"
              ? `${proyectosMesIds.size} proyecto${proyectosMesIds.size !== 1 ? "s" : ""} activo${proyectosMesIds.size !== 1 ? "s" : ""}`
              : `${totalEntCount} entregable${totalEntCount !== 1 ? "s" : ""}`}
            {viewMode === "semanas" && sopTotalWeekly.count > 0 && (
              <span className="ml-2 text-blue-500">
                + {sopTotalWeekly.count} SOP{sopTotalWeekly.count !== 1 ? "s" : ""}/sem
                {sopTotalWeekly.mins > 0 && ` (~${Math.round(sopTotalWeekly.mins / 60)}h)`}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-accent" />
            Hechos
          </label>
          {!isMentor && <ResponsableToggle value={respFilter} onChange={setRespFilter} miembros={state.miembros} />}
          {!isMentor && <AmbitoToggle value={filtro} onChange={setFiltro} />}
        </div>
      </div>

      {/* Carga total banner */}
      {proyectosMesIds.size > 0 && cargaTotal > 0 && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-2.5 ${cargaTotal > 1 ? "border-red-300 bg-red-50" : cargaTotal > 0.7 ? "border-amber-300 bg-amber-50" : "border-green-300 bg-green-50"}`}>
          <span className={`text-sm font-semibold ${cargaTotal > 1 ? "text-red-700" : cargaTotal > 0.7 ? "text-amber-700" : "text-green-700"}`}>
            Carga total: {Math.round(cargaTotal * 100)}% del día
          </span>
          {cargaTotal > 1 && (
            <span className="text-xs text-red-600">
              Sobrecarga: necesitas más de 1 día de trabajo por día calendario
            </span>
          )}
        </div>
      )}

      {viewMode === "mapa" ? (
        proyectosMesIds.size === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted">No hay proyectos activos este mes.</p>
            <p className="mt-1 text-xs text-muted">Planifica proyectos desde el Mapa o cambia los filtros.</p>
          </div>
        ) : (
          <HighlightCtx.Provider value={null}>
          <MapaFilterCtx.Provider value={mapaFilter}>
          <NotaSheetCtx.Provider value={notaSheetCtx}>
          <ShowTimelineCtx.Provider value={true}>
          <HideFilteredCtx.Provider value={true}>
          <ShowRitmoCtx.Provider value={true}>
            <div className="space-y-6">
              {empresaAreas.length > 0 && (
                <>
                  {empresaAreas.map((areaId) => (
                    <AreaSection key={areaId} areaId={areaId} />
                  ))}
                </>
              )}
              {personalAreas.length > 0 && (
                <>
                  {empresaAreas.length > 0 && <div className="border-t border-border" />}
                  {personalAreas.map((areaId) => (
                    <AreaSection key={areaId} areaId={areaId} />
                  ))}
                </>
              )}
            </div>
            {sheetData && <NotaSheet data={sheetData} onClose={() => setSheetData(null)} />}
          </ShowRitmoCtx.Provider>
          </HideFilteredCtx.Provider>
          </ShowTimelineCtx.Provider>
          </NotaSheetCtx.Provider>
          </MapaFilterCtx.Provider>
          </HighlightCtx.Provider>
        )
      ) : (
        /* Week columns view (preserved) */
        totalEntCount === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted">No hay entregables activos este mes.</p>
            <p className="mt-1 text-xs text-muted">Asigna entregables desde el Mapa con el icono de calendario.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {weeks.map((w) => {
                const cards = weekEntregables.get(w.index) ?? [];
                const sopSummary = sopWeekSummaries.find((s) => s.weekIndex === w.index);
                return (
                  <WeekColumn key={w.index} week={w} cards={cards} weeks={weeks}
                    onAssign={isMentor ? undefined : assignToWeek} sopSummary={sopSummary} />
                );
              })}
            </div>
            {unassigned.length > 0 && (
              <div className="rounded-xl border border-dashed border-border bg-surface/30 p-4">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
                  Sin asignar a semana ({unassigned.length})
                </h4>
                <div className="space-y-2">
                  {unassigned.map((card) => (
                    <EntregableCard key={card.entregable.id} card={card} weeks={weeks}
                      onAssign={isMentor ? undefined : assignToWeek} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Planner overlay */}
      {plannerProyectoId && (
        <ProyectoPlanner proyectoId={plannerProyectoId} onClose={() => setPlannerProyectoId(null)} />
      )}
    </div>
  );
}

/* ============================================================
   View mode toggle
   ============================================================ */

function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const opts: { id: ViewMode; label: string }[] = [
    { id: "mapa", label: "Mapa" },
    { id: "semanas", label: "Semanas" },
  ];
  return (
    <div className="flex gap-1 rounded-lg bg-surface p-0.5">
      {opts.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === o.id ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   Week view components (preserved)
   ============================================================ */

function WeekColumn({ week, cards, weeks, onAssign, sopSummary }: {
  week: WeekDef;
  cards: EntCard[];
  weeks: WeekDef[];
  onAssign?: (entId: string, monday: string) => void;
  sopSummary?: SOPWeekSummary;
}) {
  const [nowMs] = useState<number>(() => Date.now());
  const isCurrentWeek = nowMs >= week.mondayMs && nowMs <= week.sundayMs;

  const [showSops, setShowSops] = useState(false);

  return (
    <div className={`rounded-xl border p-4 ${isCurrentWeek ? "border-accent bg-accent/5" : "border-border bg-background"}`}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className={`text-xs font-bold uppercase tracking-wider ${isCurrentWeek ? "text-accent" : "text-muted"}`}>
          {week.label}
        </h4>
        <div className="flex items-center gap-1.5">
          {sopSummary && sopSummary.totalOcurrencias > 0 && (
            <button onClick={() => setShowSops(!showSops)}
              className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-600 transition-colors hover:bg-blue-200"
              title={sopSummary.sops.map((s) => `${s.nombre} (${s.count}×)`).join(", ")}>
              {sopSummary.totalOcurrencias} SOP
            </button>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isCurrentWeek ? "bg-accent/15 text-accent" : "bg-surface text-muted"}`}>
            {cards.length}
          </span>
        </div>
      </div>

      {showSops && sopSummary && sopSummary.sops.length > 0 && (
        <div className="mb-2 rounded-lg bg-blue-50 p-2">
          {sopSummary.sops.map((s) => (
            <p key={s.nombre} className="text-[11px] text-blue-700">
              {s.nombre} <span className="text-blue-400">({s.count}× · {s.minEstimados} min)</span>
            </p>
          ))}
        </div>
      )}

      {cards.length === 0 && (!sopSummary || sopSummary.totalOcurrencias === 0) ? (
        <p className="py-3 text-center text-xs text-muted/50">Vacía</p>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => (
            <EntregableCard key={card.entregable.id} card={card} weeks={weeks}
              onAssign={onAssign} currentWeek={week.index} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntregableCard({ card, weeks, onAssign, currentWeek }: {
  card: EntCard;
  weeks: WeekDef[];
  onAssign?: (entId: string, monday: string) => void;
  currentWeek?: number;
}) {
  const { entregable, proyecto, areaHex, rag, arrastrado } = card;
  const [showWeeks, setShowWeeks] = useState(false);
  const isDone = entregable.estado === "hecho";

  return (
    <div className={`rounded-lg border px-3 py-2.5${isDone ? " opacity-50" : ""}${arrastrado ? " border-dashed" : ""}`} style={{ borderColor: arrastrado ? "#f59e0b" : areaHex + "30", borderLeftWidth: "3px", borderLeftColor: isDone ? "#22c55e" : arrastrado ? "#f59e0b" : areaHex }}>
      <div className="flex items-center gap-2">
        {isDone
          ? <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500 text-[8px] text-white">✓</span>
          : <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: RAG_HEX[rag] }} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className={`truncate text-sm font-medium ${isDone ? "line-through text-muted" : "text-foreground"}`}>{entregable.nombre}</p>
            {arrastrado && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">Arrastrado</span>}
          </div>
          <p className="truncate text-[11px] text-muted">{proyecto.nombre}</p>
        </div>
        {onAssign && (
          <button onClick={() => setShowWeeks(!showWeeks)}
            className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold text-muted transition-colors hover:bg-surface hover:text-foreground"
            title="Asignar a semana">
            {currentWeek ? `S${currentWeek}` : "···"}
          </button>
        )}
      </div>

      {showWeeks && onAssign && (
        <div className="mt-2 flex flex-wrap gap-1">
          {weeks.map((w) => (
            <button key={w.index}
              onClick={() => { onAssign(entregable.id, w.monday); setShowWeeks(false); }}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                w.index === currentWeek
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-foreground hover:border-accent hover:bg-accent-soft"
              }`}>
              S{w.index}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Shared toggle components (exported for other plan views)
   ============================================================ */

export function AmbitoToggle({ value, onChange }: { value: AmbitoFilter; onChange: (v: AmbitoFilter) => void }) {
  const opts: { id: AmbitoFilter; label: string }[] = [
    { id: "todo", label: "Todo" },
    { id: "empresa", label: "Empresa" },
    { id: "personal", label: "Personal" },
  ];
  return (
    <div className="flex gap-1 rounded-lg bg-surface p-0.5">
      {opts.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === o.id ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type ResponsableFilter = "todo" | "yo" | string;

export function ResponsableToggle({
  value, onChange, miembros,
}: {
  value: ResponsableFilter;
  onChange: (v: ResponsableFilter) => void;
  miembros: MiembroInfo[];
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface p-0.5">
      <button onClick={() => onChange("todo")}
        className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
          value === "todo" ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"
        }`}>Todos</button>
      <button onClick={() => onChange("yo")}
        className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
          value === "yo" ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"
        }`}>Yo</button>
      <select
        value={value !== "todo" && value !== "yo" ? value : ""}
        onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
        className="rounded-md bg-transparent px-1.5 py-1.5 text-xs font-medium text-muted outline-none hover:text-foreground"
      >
        <option value="">Miembro…</option>
        {miembros.map((m) => (
          <option key={m.id} value={m.nombre}>{m.nombre}</option>
        ))}
      </select>
    </div>
  );
}

export function matchesResponsable(
  responsable: string | undefined,
  filter: ResponsableFilter,
  currentUser: string,
): boolean {
  if (filter === "todo") return true;
  if (filter === "yo") return !responsable || responsable === currentUser;
  return responsable === filter;
}
