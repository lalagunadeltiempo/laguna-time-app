"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import {
  ambitoDeArea, AREA_COLORS,
  type Entregable, type Proyecto, type Ambito, type MiembroInfo,
} from "@/lib/types";
import { computeProyectoRitmo, ritmoColor, ritmoLabelCorto, ritmoExplicacion } from "@/lib/proyecto-stats";
import { mesKey as mesKeyOf } from "@/lib/semana-utils";
import { ProyectoPlanner } from "./ProyectoPlanner";
import { GanttMultiProyecto, type GanttProject } from "./GanttMultiProyecto";

export type AmbitoFilter = "todo" | Ambito;
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
  /** mondayKey ("YYYY-MM-DD") o null si no tiene semana asignada. */
  semanaKey: string | null;
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
   Proyecto summary card for dashboard
   ============================================================ */

interface ProjSummary {
  proyecto: Proyecto;
  resultados: { id: string; nombre: string }[];
  entregablesTotal: number;
  entregablesHechos: number;
  entregablesEnCurso: number;
  areaHex: string;
  ritmo: ReturnType<typeof computeProyectoRitmo>;
  warnings: string[];
}

/* ============================================================
   Main component
   ============================================================ */

interface Props {
  selectedDate: Date;
  onNavigateToWeek?: (date: Date) => void;
}

export function PlanMes({ selectedDate, onNavigateToWeek }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const { nombre: currentUser } = useUsuario();
  const [filtro, setFiltro] = useState<AmbitoFilter>(isMentor ? "empresa" : "todo");
  const [respFilter, setRespFilter] = useState<ResponsableFilter>("todo");
  const [showDone, setShowDone] = useState(false);
  const [plannerProyectoId, setPlannerProyectoId] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const mesLabel = useMemo(() =>
    selectedDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
  [selectedDate]);

  const weeks = useMemo(() => getWeeksOfMonth(selectedDate), [selectedDate]);
  const [nowMs] = useState<number>(() => Date.now());
  const [hoy] = useState<Date>(() => new Date());

  /* ---- Compute active projects for this month ---- */
  const projectSummaries = useMemo<ProjSummary[]>(() => {
    const selYear = selectedDate.getFullYear();
    const selMonth = selectedDate.getMonth();
    const mesK = `${selYear}-${String(selMonth + 1).padStart(2, "0")}`;
    const monthStart = new Date(selYear, selMonth, 1).getTime();
    const monthEnd = new Date(selYear, selMonth + 1, 0, 23, 59, 59).getTime();

    const summaries: ProjSummary[] = [];

    for (const proj of state.proyectos) {
      const projEstado = proj.estado ?? "plan";
      if (projEstado === "completado" || projEstado === "pausado") continue;
      if (filtro !== "todo" && ambitoDeArea(proj.area) !== filtro) continue;

      const resultados = state.resultados.filter((r) => r.proyectoId === proj.id);
      const resIds = new Set(resultados.map((r) => r.id));
      const entregables = state.entregables.filter((e) => resIds.has(e.resultadoId));

      if (!showDone && entregables.length > 0 && entregables.every((e) => e.estado === "hecho" || e.estado === "cancelada")) continue;

      const filtered = respFilter === "todo"
        ? entregables
        : entregables.filter((e) => matchesResponsable(e.responsable, respFilter, currentUser));
      if (filtered.length === 0 && entregables.length > 0) continue;

      // Regla principal: proyecto activo este mes si mesKey ∈ mesesActivos del proyecto
      // o de alguno de sus resultados, o si tiene algún entregable con semana de este mes.
      let inMonth = false;
      if ((proj.mesesActivos ?? []).includes(mesK)) inMonth = true;
      if (!inMonth && resultados.some((r) => (r.mesesActivos ?? []).includes(mesK))) inMonth = true;
      if (!inMonth) {
        for (const ent of entregables) {
          if (ent.semana && mesKeyOf(ent.semana) === mesK) { inMonth = true; break; }
        }
      }
      if (!inMonth) {
        for (const r of resultados) {
          if (r.semana && mesKeyOf(r.semana) === mesK) { inMonth = true; break; }
        }
      }
      // Fallback: actividad real (pasos) dentro del mes
      if (!inMonth) {
        const pasoEnMes = state.pasos.some((p) => {
          if (!p.inicioTs) return false;
          const pMs = new Date(p.inicioTs).getTime();
          return pMs >= monthStart && pMs <= monthEnd && resIds.has(state.entregables.find((e) => e.id === p.entregableId)?.resultadoId ?? "");
        });
        if (pasoEnMes) inMonth = true;
      }

      if (!inMonth) continue;

      const areaHex = AREA_COLORS[proj.area]?.hex ?? "#888";
      const ritmo = computeProyectoRitmo(proj, entregables, resultados, hoy, state.miembros, state.pasos, state.planConfig);
      const entHechos = entregables.filter((e) => e.estado === "hecho").length;
      const entEnCurso = entregables.filter((e) => e.estado === "en_proceso").length;

      const warnings: string[] = [];
      if (entregables.length === 0) warnings.push("Sin entregables");
      if (!proj.fechaLimite) warnings.push("Sin deadline");

      summaries.push({
        proyecto: proj,
        resultados: resultados.map((r) => ({ id: r.id, nombre: r.nombre })),
        entregablesTotal: entregables.length,
        entregablesHechos: entHechos,
        entregablesEnCurso: entEnCurso,
        areaHex,
        ritmo,
        warnings,
      });
    }

    return summaries;
  }, [state, selectedDate, filtro, respFilter, currentUser, showDone, hoy]);

  /* ---- Gantt data ---- */
  const ganttProjects = useMemo<GanttProject[]>(() => {
    return projectSummaries.map((s) => {
      const resultados = state.resultados.filter((r) => r.proyectoId === s.proyecto.id);
      const resIds = new Set(resultados.map((r) => r.id));
      const entregables = state.entregables.filter((e) => resIds.has(e.resultadoId));
      return { proyecto: s.proyecto, resultados, entregables, ritmo: s.ritmo };
    });
  }, [projectSummaries, state.resultados, state.entregables]);

  /* ---- Week view data ----
     Fuente de verdad: ent.semana (mondayKey). Un entregable se sitúa en la semana
     cuya monday coincida. Si no tiene semana pero su proyecto/resultado está activo
     en este mes → "Sin asignar a semana". */
  const { weekEntregables, unassigned } = useMemo(() => {
    const selYear = selectedDate.getFullYear();
    const selMonth = selectedDate.getMonth();
    const mesK = `${selYear}-${String(selMonth + 1).padStart(2, "0")}`;
    const activeProjectIds = new Set(projectSummaries.map((s) => s.proyecto.id));
    const weekMondays = new Set(weeks.map((w) => w.monday));
    const relevant: EntCard[] = [];

    for (const ent of state.entregables) {
      if (ent.estado === "cancelada") continue;
      if (ent.estado === "hecho" && !showDone) continue;

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      if (!proj) continue;
      if (!activeProjectIds.has(proj.id)) continue;
      if (!matchesResponsable(ent.responsable, respFilter, currentUser)) continue;

      const areaHex = AREA_COLORS[proj.area]?.hex ?? "#888";

      let semanaKey: string | null = null;
      let inMonth = false;

      if (ent.semana && weekMondays.has(ent.semana)) {
        semanaKey = ent.semana;
        inMonth = true;
      } else if (ent.semana && mesKeyOf(ent.semana) === mesK) {
        // semana fuera de la cuadrícula (por ejemplo domingo), pero del mes lógico
        semanaKey = ent.semana;
        inMonth = true;
      } else if (!ent.semana) {
        // Sin semana asignada; incluir si el proyecto/resultado está activo en el mes
        const projActivoMes = (proj.mesesActivos ?? []).includes(mesK)
          || (res?.mesesActivos ?? []).includes(mesK);
        if (projActivoMes) inMonth = true;
      }

      if (!inMonth) continue;

      relevant.push({
        entregable: ent,
        proyecto: proj,
        areaHex,
        rag: computeRAG(ent, nowMs),
        semanaKey,
      });
    }

    const byWeek = new Map<number, EntCard[]>();
    const noWeek: EntCard[] = [];

    for (const card of relevant) {
      if (card.semanaKey) {
        const w = weeks.find((w) => w.monday === card.semanaKey);
        if (w) {
          if (!byWeek.has(w.index)) byWeek.set(w.index, []);
          byWeek.get(w.index)!.push(card);
          continue;
        }
      }
      noWeek.push(card);
    }

    return { weekEntregables: byWeek, unassigned: noWeek };
  }, [state, selectedDate, weeks, nowMs, showDone, respFilter, currentUser, projectSummaries]);

  function assignToWeek(entId: string, monday: string | null) {
    dispatch({ type: "SET_ENTREGABLE_SEMANA", id: entId, semana: monday });
  }

  const toggleExpand = (projId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projId)) next.delete(projId); else next.add(projId);
      return next;
    });
  };

  const totalEntWeek = Array.from(weekEntregables.values()).reduce((s, arr) => s + arr.length, 0) + unassigned.length;

  return (
    <div className="flex-1">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium capitalize text-muted">{mesLabel}</p>
          <p className="text-xs text-muted">
            {projectSummaries.length} proyecto{projectSummaries.length !== 1 ? "s" : ""} activo{projectSummaries.length !== 1 ? "s" : ""}
            {totalEntWeek > 0 && ` · ${totalEntWeek} entregable${totalEntWeek !== 1 ? "s" : ""} asignado${totalEntWeek !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-accent" />
            Hechos
          </label>
          {!isMentor && <ResponsableToggle value={respFilter} onChange={setRespFilter} miembros={state.miembros} />}
          {!isMentor && <AmbitoToggle value={filtro} onChange={setFiltro} />}
        </div>
      </div>

      {/* Gantt multi-proyecto */}
      {ganttProjects.length > 0 && (
        <section className="mb-8">
          <GanttMultiProyecto projects={ganttProjects} hoy={hoy} selectedDate={selectedDate} />
        </section>
      )}

      {/* Section 1: Active projects this month */}
      <section className="mb-8">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Proyectos del mes</h3>

        {projectSummaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/30 py-8 text-center">
            <p className="text-sm text-muted">No hay proyectos activos este mes.</p>
            <p className="mt-1 text-xs text-muted">Planifica proyectos desde el Mapa o cambia los filtros.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projectSummaries.map((s) => {
              const pct = s.entregablesTotal > 0 ? Math.round((s.entregablesHechos / s.entregablesTotal) * 100) : 0;
              const rColor = ritmoColor(s.ritmo.estadoRitmo);
              const isExpanded = expandedProjects.has(s.proyecto.id);

              return (
                <div key={s.proyecto.id} className="rounded-xl border border-border bg-background overflow-hidden">
                  {/* Compact project row */}
                  <button onClick={() => toggleExpand(s.proyecto.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/50">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.areaHex }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{s.proyecto.nombre}</span>

                    {/* Progress bar */}
                    <div className="hidden sm:flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: rColor }} />
                      </div>
                      <span className="text-[11px] font-semibold" style={{ color: rColor }}>{pct}%</span>
                    </div>

                    {/* Status badge */}
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: rColor + "18", color: rColor }}>
                      {ritmoLabelCorto(s.ritmo.estadoRitmo)}
                    </span>

                    {/* Counts */}
                    <span className="shrink-0 text-[11px] text-muted">
                      {s.entregablesHechos}/{s.entregablesTotal}
                    </span>

                    {s.proyecto.fechaLimite && (
                      <span className="hidden sm:inline shrink-0 text-[10px] text-muted">
                        → {new Date(s.proyecto.fechaLimite + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                      </span>
                    )}

                    {/* Warnings */}
                    {s.warnings.length > 0 && (
                      <span className="shrink-0 text-amber-500" title={s.warnings.join(", ")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </span>
                    )}

                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                      className={`shrink-0 text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3">
                      {/* Motivo del ritmo cuando está en rojo/imposible */}
                      {(s.ritmo.estadoRitmo === "rojo" || s.ritmo.estadoRitmo === "imposible") && (
                        <div className="mb-3 rounded-lg px-3 py-2"
                          style={{ backgroundColor: rColor + "14", color: rColor }}>
                          <p className="text-[11px] font-semibold">
                            ⚠ {ritmoExplicacion(s.ritmo)}
                          </p>
                        </div>
                      )}

                      {/* Warnings */}
                      {s.warnings.length > 0 && (
                        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2">
                          {s.warnings.map((w, i) => (
                            <p key={i} className="text-[11px] text-amber-700">⚠ {w}</p>
                          ))}
                        </div>
                      )}

                      {/* Results and deliverables */}
                      {s.resultados.length > 0 ? (
                        <div className="space-y-2">
                          {s.resultados.map((res) => {
                            const resFull = state.resultados.find((r) => r.id === res.id);
                            const ents = state.entregables.filter((e) => e.resultadoId === res.id);
                            return (
                              <div key={res.id}>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <div className="min-w-0 flex-1">
                                    <InlineResultadoNombre resId={res.id} nombre={res.nombre} editable={!isMentor} />
                                  </div>
                                  {!isMentor && (
                                    <WeekChips
                                      weeks={weeks}
                                      current={resFull?.semana ?? null}
                                      onPick={(monday) => dispatch({ type: "SET_RESULTADO_SEMANA", id: res.id, semana: monday })}
                                    />
                                  )}
                                </div>
                                {ents.length === 0 ? (
                                  <p className="pl-2 text-[11px] italic text-muted/70">— sin entregables</p>
                                ) : (
                                  <div className="space-y-1 pl-2">
                                    {ents.map((ent) => {
                                      const isDone = ent.estado === "hecho";
                                      const isCancelled = ent.estado === "cancelada";
                                      if (!showDone && (isDone || isCancelled)) return null;
                                      return (
                                        <div key={ent.id} className="flex flex-wrap items-center gap-1.5">
                                          <div className="min-w-0 flex-1">
                                            <EntregableInlineRow ent={ent} miembros={state.miembros} editable={!isMentor} />
                                          </div>
                                          {!isMentor && (
                                            <WeekChips
                                              weeks={weeks}
                                              current={ent.semana ?? null}
                                              onPick={(monday) => dispatch({ type: "SET_ENTREGABLE_SEMANA", id: ent.id, semana: monday })}
                                            />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted italic">Sin resultados ni entregables</p>
                      )}

                      {/* Action buttons */}
                      {!isMentor && (
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => setPlannerProyectoId(s.proyecto.id)}
                            className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-surface">
                            Planificar proyecto
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Weeks of the month */}
      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Semanas del mes</h3>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {weeks.map((w) => {
            const cards = weekEntregables.get(w.index) ?? [];
            return (
              <WeekColumn key={w.index} week={w} cards={cards} weeks={weeks}
                onAssign={isMentor ? undefined : assignToWeek}
                onNavigateToWeek={onNavigateToWeek} />
            );
          })}
        </div>

        {unassigned.length > 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-surface/30 p-4">
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
      </section>

      {/* Planner overlay */}
      {plannerProyectoId && (
        <ProyectoPlanner proyectoId={plannerProyectoId} onClose={() => setPlannerProyectoId(null)} />
      )}
    </div>
  );
}

/* ============================================================
   Week column
   ============================================================ */

function WeekColumn({ week, cards, weeks, onAssign, onNavigateToWeek }: {
  week: WeekDef;
  cards: EntCard[];
  weeks: WeekDef[];
  onAssign?: (entId: string, monday: string | null) => void;
  onNavigateToWeek?: (date: Date) => void;
}) {
  const [nowMs] = useState<number>(() => Date.now());
  const isCurrentWeek = nowMs >= week.mondayMs && nowMs <= week.sundayMs;

  // Separar entregables "normales" de los materializados desde SOP para poder plegarlos
  const { normalCards, sopCards } = useMemo(() => {
    const normal: EntCard[] = [];
    const sop: EntCard[] = [];
    for (const c of cards) {
      const esSOP = c.entregable.tipo === "sop" || c.entregable.plantillaId != null;
      if (esSOP) sop.push(c); else normal.push(c);
    }
    return { normalCards: normal, sopCards: sop };
  }, [cards]);

  const byProject = useMemo(() => {
    const map = new Map<string, EntCard[]>();
    for (const c of normalCards) {
      const pid = c.proyecto.id;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(c);
    }
    return map;
  }, [normalCards]);

  return (
    <div className={`rounded-xl border p-4 ${isCurrentWeek ? "border-accent bg-accent/5" : "border-border bg-background"}`}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className={`text-xs font-bold uppercase tracking-wider ${isCurrentWeek ? "text-accent" : "text-muted"}`}>
          {week.label}
        </h4>
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isCurrentWeek ? "bg-accent/15 text-accent" : "bg-surface text-muted"}`}>
            {cards.length}
          </span>
          {onNavigateToWeek && (
            <button onClick={() => onNavigateToWeek(new Date(week.mondayMs))}
              className="rounded-md px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-surface hover:text-foreground" title="Ver semana">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          )}
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted/50">Vacía</p>
      ) : (
        <div className="space-y-3">
          {Array.from(byProject.entries()).map(([projId, projCards]) => (
            <div key={projId}>
              <p className="mb-1 truncate text-[10px] font-semibold uppercase tracking-wider" style={{ color: projCards[0].areaHex }}>
                {projCards[0].proyecto.nombre}
              </p>
              <div className="space-y-1.5">
                {projCards.map((card) => (
                  <EntregableCard key={card.entregable.id} card={card} weeks={weeks}
                    onAssign={onAssign} currentWeek={week.index} compact />
                ))}
              </div>
            </div>
          ))}

          {sopCards.length > 0 && (
            <details className="rounded-lg border border-border/60 bg-surface/40">
              <summary className="cursor-pointer select-none px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted hover:text-foreground">
                SOPs de la semana ({sopCards.length})
              </summary>
              <div className="space-y-1.5 px-2 pb-2 pt-1">
                {sopCards.map((card) => (
                  <EntregableCard key={card.entregable.id} card={card} weeks={weeks}
                    onAssign={onAssign} currentWeek={week.index} compact />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Entregable card
   ============================================================ */

function EntregableCard({ card, weeks, onAssign, currentWeek, compact }: {
  card: EntCard;
  weeks: WeekDef[];
  onAssign?: (entId: string, monday: string | null) => void;
  currentWeek?: number;
  compact?: boolean;
}) {
  const { entregable, proyecto, areaHex, rag } = card;
  const [showWeeks, setShowWeeks] = useState(false);
  const isDone = entregable.estado === "hecho";

  return (
    <div className={`rounded-lg border px-3 py-2${compact ? "" : ".5"}${isDone ? " opacity-50" : ""}`}
      style={{ borderColor: areaHex + "30", borderLeftWidth: "3px", borderLeftColor: isDone ? "#22c55e" : areaHex }}>
      <div className="flex items-center gap-2">
        {isDone
          ? <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500 text-[8px] text-white">✓</span>
          : <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: RAG_HEX[rag] }} />}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium ${isDone ? "line-through text-muted" : "text-foreground"}`}>{entregable.nombre}</p>
          {!compact && <p className="truncate text-[11px] text-muted">{proyecto.nombre}</p>}
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
          <button
            onClick={() => { onAssign(entregable.id, null); setShowWeeks(false); }}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted hover:border-red-300 hover:text-red-500"
            title="Quitar semana"
          >
            Sin
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Week chips compact: S1..S5 + "–"
   ============================================================ */

function WeekChips({ weeks, current, onPick }: {
  weeks: WeekDef[]; current: string | null; onPick: (monday: string | null) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {weeks.map((w) => {
        const active = current === w.monday;
        return (
          <button key={w.index}
            onClick={() => onPick(w.monday)}
            title={w.label}
            className={`rounded px-1 py-0.5 text-[9px] font-semibold transition-colors ${
              active ? "bg-accent text-white" : "border border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            S{w.index}
          </button>
        );
      })}
      <button
        onClick={() => onPick(null)}
        title="Sin semana"
        className={`rounded px-1 py-0.5 text-[9px] font-semibold transition-colors ${
          current == null ? "bg-surface text-foreground" : "border border-border text-muted hover:border-red-300 hover:text-red-500"
        }`}
      >
        –
      </button>
    </div>
  );
}

/* ============================================================
   Inline editors (nombre resultado, entregable, días, responsable)
   ============================================================ */

function InlineResultadoNombre({ resId, nombre, editable }: { resId: string; nombre: string; editable: boolean }) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nombre);

  if (!editable) {
    return <p className="mb-1 text-[11px] font-semibold text-muted">{nombre}</p>;
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== nombre) {
      dispatch({ type: "UPDATE_RESULTADO", id: resId, changes: { nombre: trimmed } });
    } else {
      setDraft(nombre);
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <button onClick={() => { setDraft(nombre); setEditing(true); }}
        className="mb-1 block w-full truncate rounded text-left text-[11px] font-semibold text-muted hover:bg-surface/60 hover:text-foreground"
        title="Editar nombre del resultado">
        {nombre}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); save(); }
        if (e.key === "Escape") { setDraft(nombre); setEditing(false); }
      }}
      className="mb-1 w-full rounded border border-accent/40 bg-background px-1.5 py-0.5 text-[11px] font-semibold text-foreground outline-none focus:border-accent"
    />
  );
}

function EntregableInlineRow({ ent, miembros, editable }: { ent: Entregable; miembros: MiembroInfo[]; editable: boolean }) {
  const dispatch = useAppDispatch();
  const isDone = ent.estado === "hecho";

  const [editingNombre, setEditingNombre] = useState(false);
  const [draftNombre, setDraftNombre] = useState(ent.nombre);
  const [editingDias, setEditingDias] = useState(false);
  const [draftDias, setDraftDias] = useState(String(ent.diasEstimados ?? 0));

  function saveNombre() {
    const trimmed = draftNombre.trim();
    if (trimmed && trimmed !== ent.nombre) {
      dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { nombre: trimmed } });
    } else {
      setDraftNombre(ent.nombre);
    }
    setEditingNombre(false);
  }
  function saveDias() {
    const n = Number.parseInt(draftDias, 10);
    if (Number.isFinite(n) && n >= 0 && n !== ent.diasEstimados) {
      dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { diasEstimados: n } });
    } else {
      setDraftDias(String(ent.diasEstimados ?? 0));
    }
    setEditingDias(false);
  }
  function setResponsable(v: string) {
    dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { responsable: v || undefined } });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isDone ? "bg-emerald-500" : ent.estado === "en_proceso" ? "bg-amber-500" : "bg-gray-300"}`} />

      {editable && editingNombre ? (
        <input
          autoFocus
          value={draftNombre}
          onChange={(e) => setDraftNombre(e.target.value)}
          onBlur={saveNombre}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); saveNombre(); }
            if (e.key === "Escape") { setDraftNombre(ent.nombre); setEditingNombre(false); }
          }}
          className="min-w-0 flex-1 rounded border border-accent/40 bg-background px-1.5 py-0.5 text-foreground outline-none focus:border-accent"
        />
      ) : (
        <button
          onClick={editable ? () => { setDraftNombre(ent.nombre); setEditingNombre(true); } : undefined}
          className={`min-w-0 flex-1 truncate rounded text-left ${editable ? "hover:bg-surface/60" : ""} ${isDone ? "text-muted line-through" : "text-foreground"}`}
          title={editable ? "Editar nombre" : undefined}
        >
          {ent.nombre}
        </button>
      )}

      {editable && editingDias ? (
        <input
          type="number" min={0} autoFocus
          value={draftDias}
          onChange={(e) => setDraftDias(e.target.value)}
          onBlur={saveDias}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); saveDias(); }
            if (e.key === "Escape") { setDraftDias(String(ent.diasEstimados ?? 0)); setEditingDias(false); }
          }}
          className="w-14 rounded border border-accent/40 bg-background px-1 py-0.5 text-[10px] text-foreground outline-none focus:border-accent"
        />
      ) : (
        <button
          onClick={editable ? () => { setDraftDias(String(ent.diasEstimados ?? 0)); setEditingDias(true); } : undefined}
          className={`shrink-0 rounded px-1 text-[10px] text-muted ${editable ? "hover:bg-surface/60 hover:text-foreground" : ""}`}
          title={editable ? "Editar días estimados" : undefined}
        >
          {(ent.diasEstimados ?? 0)}d
        </button>
      )}

      {ent.fechaInicio && (
        <span className="shrink-0 text-[10px] text-accent">
          {new Date(ent.fechaInicio + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
        </span>
      )}

      {editable ? (
        <select
          value={ent.responsable ?? ""}
          onChange={(e) => setResponsable(e.target.value)}
          className="shrink-0 rounded bg-surface px-1 py-0.5 text-[10px] text-muted outline-none hover:text-foreground"
          title="Responsable"
        >
          <option value="">—</option>
          {miembros.map((m) => (
            <option key={m.id} value={m.nombre}>{m.nombre}</option>
          ))}
        </select>
      ) : (
        ent.responsable && (
          <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[9px] text-muted">{ent.responsable}</span>
        )
      )}

      <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[9px] text-muted">
        {ent.estado === "hecho" ? "hecho" : ent.estado === "en_proceso" ? "en curso" : ent.estado === "planificado" ? "planif." : ent.estado === "a_futuro" ? "futuro" : ent.estado}
      </span>
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
