"use client";

import { useMemo, useState, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { ambitoDeArea, AREA_COLORS, type Area, type Entregable } from "@/lib/types";
import type { ProjectedSOP } from "@/lib/sop-projector";
import SOPLaunchDialog from "@/components/shared/SOPLaunchDialog";
import { AmbitoToggle, type AmbitoFilter } from "./PlanMes";
import { WeekBlockSheet, type WeekBlockInfo } from "./WeekBlockSheet";
import { ProyectoPlanner } from "./ProyectoPlanner";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekDates(ref: Date): Date[] {
  const dayOfWeek = ref.getDay() || 7;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

interface WeekBlock {
  id: string;
  area: Area;
  title: string;
  subtitle: string;
  responsable: string;
  dateKey: string;
  type: "done" | "active" | "programado" | "sop";
  origen: "ent" | "paso-next" | "paso";
  entregableId?: string;
  pasoId?: string;
  proyectoId?: string;
  tieneActivePaso?: boolean;
}

interface Props {
  selectedDate: Date;
}

export function PlanSemana({ selectedDate }: Props) {
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [viewMode, setViewMode] = useState<"yo" | "equipo">("yo");
  const [filtro, setFiltro] = useState<AmbitoFilter>(isMentor ? "empresa" : "todo");
  const [showDone, setShowDone] = useState(true);
  const [pickDay, setPickDay] = useState<string | null>(null);
  const [confirmSOP, setConfirmSOP] = useState<{ sop: ProjectedSOP; dateKey: string } | null>(null);

  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  useEffect(() => {
    const id = setInterval(() => {
      const k = toDateKey(new Date());
      setTodayKey((prev) => (prev !== k ? k : prev));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const blocks = useMemo(() => {
    const result: WeekBlock[] = [];
    const weekKeys = new Set(weekDates.map((d) => toDateKey(d)));

    for (const paso of state.pasos) {
      if (!paso.inicioTs) continue;
      const pasoDate = paso.inicioTs.slice(0, 10);
      if (!weekKeys.has(pasoDate)) continue;

      const ent = state.entregables.find((e) => e.id === paso.entregableId);
      if (!ent) continue;
      if (viewMode === "yo" && ent.responsable && ent.responsable !== currentUser) continue;

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      if (filtro !== "todo" && proj && ambitoDeArea(proj.area) !== filtro) continue;

      const isDone = !!paso.finTs;
      if (isDone && !showDone) continue;

      const isActive = state.pasosActivos.includes(paso.id);
      result.push({
        id: paso.id,
        area: proj?.area ?? "operativa",
        title: paso.nombre,
        subtitle: proj?.nombre ?? "",
        responsable: ent.responsable ?? "",
        dateKey: pasoDate,
        type: isDone ? "done" : isActive ? "active" : "programado",
        origen: "paso",
        entregableId: ent.id,
        pasoId: paso.id,
        proyectoId: proj?.id,
        tieneActivePaso: isActive,
      });
    }

    for (const paso of state.pasos) {
      if (!paso.finTs || !paso.siguientePaso) continue;
      if (paso.siguientePaso.tipo !== "continuar") continue;
      let fp = paso.siguientePaso.fechaProgramada;
      if (!fp) continue;

      if (fp === "manana") {
        const finDate = new Date(paso.finTs);
        finDate.setDate(finDate.getDate() + 1);
        fp = toDateKey(finDate);
      }

      if (!weekKeys.has(fp)) continue;
      if (fp < todayKey) continue;
      if (result.some((b) => b.id === `next-${paso.id}`)) continue;

      const ent = state.entregables.find((e) => e.id === paso.entregableId);
      if (!ent) continue;
      if (viewMode === "yo" && ent.responsable && ent.responsable !== currentUser) continue;

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      if (filtro !== "todo" && proj && ambitoDeArea(proj.area) !== filtro) continue;

      result.push({
        id: `next-${paso.id}`,
        area: proj?.area ?? "operativa",
        title: paso.siguientePaso.nombre ?? paso.nombre,
        subtitle: proj?.nombre ?? "",
        responsable: ent.responsable ?? "",
        dateKey: fp,
        type: "programado",
        origen: "paso-next",
        entregableId: ent.id,
        pasoId: paso.id,
        proyectoId: proj?.id,
      });
    }

    const entIdsWithPasos = new Set(result.map((b) => {
      const p = state.pasos.find((pp) => pp.id === b.id || b.id === `next-${pp.id}`);
      return p?.entregableId;
    }).filter(Boolean));

    for (const ent of state.entregables) {
      if (!ent.fechaInicio || !weekKeys.has(ent.fechaInicio)) continue;
      if (ent.planNivel === "mes" || ent.planNivel === "trimestre") continue;
      if (ent.estado === "cancelada") continue;
      if (ent.estado === "hecho" && !showDone) continue;
      if (entIdsWithPasos.has(ent.id)) continue;
      if (viewMode === "yo" && ent.responsable && ent.responsable !== currentUser) continue;

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      if (filtro !== "todo" && proj && ambitoDeArea(proj.area) !== filtro) continue;

      const hasActive = state.pasos.some((p) => p.entregableId === ent.id && state.pasosActivos.includes(p.id));

      result.push({
        id: `ent-${ent.id}`,
        area: proj?.area ?? "operativa",
        title: ent.nombre,
        subtitle: proj?.nombre ?? "",
        responsable: ent.responsable ?? "",
        dateKey: ent.fechaInicio,
        type: ent.estado === "hecho" ? "done" : "programado",
        origen: "ent",
        entregableId: ent.id,
        proyectoId: proj?.id,
        tieneActivePaso: hasActive,
      });
    }

    return result;
  }, [state, weekDates, viewMode, currentUser, todayKey, filtro, showDone]);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, WeekBlock[]>();
    for (const d of weekDates) map.set(toDateKey(d), []);
    for (const b of blocks) {
      const arr = map.get(b.dateKey);
      if (arr) arr.push(b);
    }
    return map;
  }, [blocks, weekDates]);

  const sopsByDay = useMemo(() => new Map<string, ProjectedSOP[]>(), []);

  const pendientesByProject = useMemo(() => {
    const items = state.entregables.filter((e) =>
      e.estado !== "hecho" && e.estado !== "cancelada" &&
      (e.responsable === currentUser || !e.responsable)
    ).map((e) => {
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      return { entregable: e, proj };
    }).filter(({ proj }) => {
      if (!proj) return false;
      if ((proj.estado ?? "plan") === "completado" || (proj.estado ?? "plan") === "pausado") return false;
      return filtro === "todo" || ambitoDeArea(proj.area) === filtro;
    });

    const grouped = new Map<string, { proj: typeof items[0]["proj"]; ents: typeof items }>();
    for (const item of items) {
      const pid = item.proj?.id ?? "_none";
      if (!grouped.has(pid)) grouped.set(pid, { proj: item.proj, ents: [] });
      grouped.get(pid)!.ents.push(item);
    }
    return grouped;
  }, [state, currentUser, filtro]);

  function assignToPlan(ent: Entregable) {
    if (!pickDay) return;
    const newEstado = (ent.estado === "a_futuro" || ent.estado === "planificado") ? "en_proceso" : ent.estado;
    dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { fechaInicio: pickDay, planNivel: "dia", estado: newEstado } });
    setPickDay(null);
  }

  const totalHoursAvailable = 8;

  const [selectedBlock, setSelectedBlock] = useState<WeekBlock | null>(null);
  const [plannerProyectoId, setPlannerProyectoId] = useState<string | null>(null);

  function handleBlockClick(block: WeekBlock) {
    if (isMentor) return;
    setSelectedBlock(block);
  }

  function handleMove(b: WeekBlock, newDate: string) {
    if (b.origen === "ent" && b.entregableId) {
      const isPastOrToday = newDate <= todayKey;
      dispatch({ type: "UPDATE_ENTREGABLE", id: b.entregableId,
        changes: { fechaInicio: newDate, planNivel: "dia", estado: isPastOrToday ? "en_proceso" : "planificado" } });
    } else if (b.origen === "paso-next" && b.pasoId) {
      dispatch({ type: "RESCHEDULE_NEXT_PASO", pasoId: b.pasoId, newDate });
    }
    setSelectedBlock(null);
  }

  function handleUnschedule(b: WeekBlock) {
    if (b.origen === "ent" && b.entregableId) {
      dispatch({ type: "UPDATE_ENTREGABLE", id: b.entregableId,
        changes: { fechaInicio: null, planNivel: undefined, estado: b.type === "done" ? "hecho" : "a_futuro" } });
    } else if (b.origen === "paso-next" && b.pasoId) {
      dispatch({ type: "RESCHEDULE_NEXT_PASO", pasoId: b.pasoId, newDate: null });
    }
    setSelectedBlock(null);
  }

  function handleSetResp(b: WeekBlock, nombre: string) {
    if (b.entregableId) {
      dispatch({ type: "UPDATE_ENTREGABLE", id: b.entregableId, changes: { responsable: nombre || undefined } });
    }
  }

  function handleMarkDone(b: WeekBlock) {
    if (b.entregableId) {
      dispatch({ type: "UPDATE_ENTREGABLE", id: b.entregableId, changes: { estado: "hecho" } });
    }
    setSelectedBlock(null);
  }

  function buildBlockInfo(b: WeekBlock): WeekBlockInfo {
    return {
      id: b.id, title: b.title, subtitle: b.subtitle, area: b.area,
      responsable: b.responsable, dateKey: b.dateKey, origen: b.origen,
      entregableId: b.entregableId, pasoId: b.pasoId, proyectoId: b.proyectoId,
      tieneActivePaso: b.tieneActivePaso, weekDates, miembros: state.miembros,
    };
  }

  return (
    <div className="flex-1">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setViewMode("yo")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "yo" ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"}`}>
          Mi semana
        </button>
        <button onClick={() => setViewMode("equipo")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "equipo" ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"}`}>
          Equipo
        </button>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-accent" />
            Hechos
          </label>
          {!isMentor && <AmbitoToggle value={filtro} onChange={setFiltro} />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
        {weekDates.map((date, i) => {
          const key = toDateKey(date);
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          const dayBlocks = blocksByDay.get(key) ?? [];
          const loadPercent = Math.min(100, (dayBlocks.length / totalHoursAvailable) * 100);

          return (
            <div key={key} className="flex flex-col">
              <div className={`mb-2 rounded-lg px-2 py-2 text-center ${isToday ? "bg-accent text-white" : "bg-surface"}`}>
                <div className={`text-xs font-bold ${isToday ? "text-white" : "text-foreground"}`}>{DAYS[i]}</div>
                <div className={`text-lg font-bold ${isToday ? "text-white" : "text-foreground"}`}>{date.getDate()}</div>
              </div>

              <div className="mb-2 h-1 rounded-full bg-surface">
                <div className={`h-1 rounded-full transition-all ${loadPercent > 80 ? "bg-red-500" : loadPercent > 50 ? "bg-amber-500" : "bg-green-500"}`}
                  style={{ width: `${loadPercent}%` }} />
              </div>

              <div className="flex flex-1 flex-col gap-1">
                {dayBlocks.map((block) => {
                  const hex = AREA_COLORS[block.area]?.hex ?? "#888";
                  return (
                    <button key={block.id} type="button"
                      onClick={() => handleBlockClick(block)}
                      className="w-full rounded-lg border-l-[3px] px-2 py-1.5 text-left transition-colors hover:brightness-95"
                      style={{ borderLeftColor: hex, backgroundColor: hex + "0c" }}>
                      <div className="flex items-center gap-1">
                        {block.type === "active" && (
                          <span className="relative flex h-1.5 w-1.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: "#4ade80" }} />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#22c55e" }} />
                          </span>
                        )}
                        {block.type === "done" && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                        )}
                        <p className={`text-xs font-medium leading-tight ${block.type === "done" ? "text-muted line-through" : "text-foreground"}`}>
                          {block.title}
                        </p>
                      </div>
                      <p className="text-[10px] font-medium" style={{ color: hex + "b0" }}>{block.subtitle}</p>
                      {viewMode === "equipo" && block.responsable && (
                        <p className="text-[10px] font-semibold text-muted">{block.responsable}</p>
                      )}
                    </button>
                  );
                })}
                {(sopsByDay.get(key) ?? []).map((sop) => {
                  const sopHex = AREA_COLORS[sop.area]?.hex ?? "#888";
                  return (
                    <button key={`sop-${sop.plantillaId}`} type="button"
                      onClick={() => !isPast && !isMentor && setConfirmSOP({ sop, dateKey: key })}
                      disabled={isPast}
                      className="w-full rounded-lg border border-dashed px-2 py-1.5 text-left transition-all hover:brightness-95"
                      style={{ borderColor: sopHex + "50", backgroundColor: sopHex + "10" }}>
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: sopHex }} />
                        <p className="text-xs font-medium leading-tight truncate" style={{ color: sopHex }}>{sop.nombre}</p>
                      </div>
                      <p className="text-[10px]" style={{ color: sopHex + "90" }}>{sop.pasosTotal}p · SOP · {sop.responsable}</p>
                    </button>
                  );
                })}
                {dayBlocks.length === 0 && (
                  <button
                    onClick={() => !isPast && !isMentor && setPickDay(key)}
                    disabled={isPast || isMentor}
                    className={`flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-4 transition-colors ${!isPast ? "cursor-pointer hover:border-accent/50 hover:bg-surface/50" : ""}`}>
                    <span className="text-xs text-muted/50">{isPast ? "—" : "+"}</span>
                  </button>
                )}
                {dayBlocks.length > 0 && !isPast && !isMentor && (
                  <button onClick={() => setPickDay(key)}
                    className="mt-1 flex items-center justify-center rounded-lg py-1.5 text-xs text-muted/40 transition-colors hover:bg-surface/50 hover:text-muted">
                    +
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Picker modal */}
      {pickDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
          role="dialog" aria-modal="true" tabIndex={-1}
          onClick={(e) => { if (e.target === e.currentTarget) setPickDay(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") setPickDay(null); }}>
          <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Planificar para {new Date(pickDay + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</h3>
            <p className="mb-4 text-xs text-muted">Elige un entregable pendiente (solo proyectos activos):</p>
            <div className="max-h-72 space-y-3 overflow-y-auto">
              {pendientesByProject.size === 0 && <p className="py-4 text-center text-xs text-muted">No hay entregables pendientes</p>}
              {Array.from(pendientesByProject.entries()).map(([pid, { proj, ents }]) => (
                <div key={pid}>
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: AREA_COLORS[proj?.area ?? "operativa"]?.hex ?? "#888" }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: AREA_COLORS[proj?.area ?? "operativa"]?.hex ?? "#888" }} />
                    {proj?.nombre ?? "Sin proyecto"}
                  </p>
                  <div className="space-y-0.5">
                    {ents.map(({ entregable }) => (
                      <button key={entregable.id} onClick={() => assignToPlan(entregable)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                        <p className="truncate text-sm text-foreground">{entregable.nombre}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setPickDay(null)} className="mt-3 w-full rounded-lg border border-border py-2 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
          </div>
        </div>
      )}

      {confirmSOP && (
        <SOPLaunchDialog
          plantillaId={confirmSOP.sop.plantillaId}
          plantillaNombre={confirmSOP.sop.nombre}
          area={confirmSOP.sop.area}
          responsable={confirmSOP.sop.responsable}
          dateKey={confirmSOP.dateKey}
          onClose={() => setConfirmSOP(null)}
        />
      )}

      {selectedBlock && (
        <WeekBlockSheet
          block={buildBlockInfo(selectedBlock)}
          onClose={() => setSelectedBlock(null)}
          onMove={(d) => handleMove(selectedBlock, d)}
          onUnschedule={() => handleUnschedule(selectedBlock)}
          onSetResponsable={(n) => handleSetResp(selectedBlock, n)}
          onMarkDone={() => handleMarkDone(selectedBlock)}
          onOpenProject={() => { setPlannerProyectoId(selectedBlock.proyectoId ?? null); setSelectedBlock(null); }}
        />
      )}

      {plannerProyectoId && (
        <ProyectoPlanner proyectoId={plannerProyectoId} onClose={() => setPlannerProyectoId(null)} />
      )}
    </div>
  );
}
