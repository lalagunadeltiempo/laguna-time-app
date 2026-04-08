"use client";

import { useMemo, useState, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useUsuario } from "@/lib/usuario";
import type { Area, Entregable } from "@/lib/types";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const BORDER_HEX: Record<string, string> = {
  fisico: "#f43f5e", emocional: "#ec4899", mental: "#6366f1", espiritual: "#8b5cf6",
  financiera: "#10b981", operativa: "#3b82f6", comercial: "#f59e0b", administrativa: "#a855f6",
};

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
  dateKey: string;
  type: "done" | "active" | "programado" | "sop";
}

interface Props {
  selectedDate: Date;
}

export function PlanSemana({ selectedDate }: Props) {
  const { nombre: currentUser } = useUsuario();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [viewMode, setViewMode] = useState<"yo" | "equipo">("yo");
  const [pickDay, setPickDay] = useState<string | null>(null);

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

      result.push({
        id: paso.id,
        area: proj?.area ?? "operativa",
        title: paso.nombre,
        subtitle: proj?.nombre ?? "",
        dateKey: pasoDate,
        type: paso.finTs ? "done" : state.pasosActivos.includes(paso.id) ? "active" : "programado",
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

      result.push({
        id: `next-${paso.id}`,
        area: proj?.area ?? "operativa",
        title: paso.siguientePaso.nombre ?? paso.nombre,
        subtitle: proj?.nombre ?? "",
        dateKey: fp,
        type: "programado",
      });
    }

    const entIdsWithPasos = new Set(result.map((b) => {
      const p = state.pasos.find((pp) => pp.id === b.id || b.id === `next-${pp.id}`);
      return p?.entregableId;
    }).filter(Boolean));

    for (const ent of state.entregables) {
      if (!ent.fechaInicio || !weekKeys.has(ent.fechaInicio)) continue;
      if (ent.estado === "hecho" || ent.estado === "cancelada") continue;
      if (entIdsWithPasos.has(ent.id)) continue;
      if (viewMode === "yo" && ent.responsable && ent.responsable !== currentUser) continue;

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;

      result.push({
        id: `ent-${ent.id}`,
        area: proj?.area ?? "operativa",
        title: ent.nombre,
        subtitle: proj?.nombre ?? "",
        dateKey: ent.fechaInicio,
        type: "programado",
      });
    }

    return result;
  }, [state, weekDates, viewMode, currentUser, todayKey]);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, WeekBlock[]>();
    for (const d of weekDates) map.set(toDateKey(d), []);
    for (const b of blocks) {
      const arr = map.get(b.dateKey);
      if (arr) arr.push(b);
    }
    return map;
  }, [blocks, weekDates]);

  const pendientes = useMemo(() => {
    return state.entregables.filter((e) =>
      e.estado !== "hecho" && e.estado !== "cancelada" &&
      (e.responsable === currentUser || !e.responsable)
    ).map((e) => {
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      return { entregable: e, proj };
    });
  }, [state, currentUser]);

  function assignToPlan(ent: Entregable) {
    if (!pickDay) return;
    dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { fechaInicio: pickDay, estado: ent.estado === "a_futuro" ? "en_proceso" : ent.estado } });
    setPickDay(null);
  }

  const totalHoursAvailable = 8;

  return (
    <div className="flex-1">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => setViewMode("yo")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "yo" ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"}`}>
          Mi semana
        </button>
        <button onClick={() => setViewMode("equipo")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "equipo" ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"}`}>
          Equipo
        </button>
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
                {dayBlocks.map((block) => (
                  <div key={block.id} className="rounded-lg border-l-[3px] bg-surface px-2 py-1.5 transition-colors hover:bg-surface-hover"
                    style={{ borderLeftColor: BORDER_HEX[block.area] ?? "#f59e0b" }}>
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
                    <p className="text-[10px] text-muted">{block.subtitle}</p>
                  </div>
                ))}
                {dayBlocks.length === 0 && (
                  <button
                    onClick={() => !isPast && setPickDay(key)}
                    disabled={isPast}
                    className={`flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-4 transition-colors ${!isPast ? "cursor-pointer hover:border-accent/50 hover:bg-surface/50" : ""}`}>
                    <span className="text-xs text-muted/50">{isPast ? "—" : "+"}</span>
                  </button>
                )}
                {dayBlocks.length > 0 && !isPast && (
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
          role="dialog" aria-modal="true" tabIndex={-1} ref={(el) => el?.focus()}
          onClick={(e) => { if (e.target === e.currentTarget) setPickDay(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") setPickDay(null); }}>
          <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Planificar para {new Date(pickDay + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</h3>
            <p className="mb-4 text-xs text-muted">Elige un entregable pendiente:</p>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {pendientes.length === 0 && <p className="py-4 text-center text-xs text-muted">No hay entregables pendientes</p>}
              {pendientes.map(({ entregable, proj }) => (
                <button key={entregable.id} onClick={() => assignToPlan(entregable)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: BORDER_HEX[proj?.area ?? "operativa"] }} />
                  <div className="flex-1 truncate">
                    <p className="truncate text-sm font-medium text-foreground">{entregable.nombre}</p>
                    <p className="truncate text-xs text-muted">{proj?.nombre ?? ""}</p>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setPickDay(null)} className="mt-3 w-full rounded-lg border border-border py-2 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
