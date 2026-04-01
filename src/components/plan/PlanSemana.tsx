"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/lib/context";
import { USUARIO_ACTUAL } from "@/lib/usuario";
import { type Area } from "@/lib/types";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const BORDER_HEX: Record<string, string> = {
  fisico: "#f43f5e", emocional: "#ec4899", mental: "#6366f1", espiritual: "#8b5cf6",
  financiera: "#10b981", operativa: "#3b82f6", comercial: "#f59e0b", administrativa: "#a855f6",
};

function getWeekDates(): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface WeekBlock {
  id: string;
  area: Area;
  title: string;
  subtitle: string;
  dateKey: string;
  type: "done" | "active" | "programado" | "sop";
}

export function PlanSemana() {
  const state = useAppState();
  const [viewMode, setViewMode] = useState<"yo" | "equipo">("yo");

  const todayKey = useMemo(() => dateKey(new Date()), []);
  const weekDates = useMemo(() => getWeekDates(), [todayKey]);

  const blocks = useMemo(() => {
    const result: WeekBlock[] = [];

    for (const paso of state.pasos) {
      if (!paso.inicioTs) continue;
      const pasoDate = paso.inicioTs.slice(0, 10);
      const isInWeek = weekDates.some((d) => dateKey(d) === pasoDate);
      if (!isInWeek) continue;

      const ent = state.entregables.find((e) => e.id === paso.entregableId);
      if (!ent) continue;
      if (viewMode === "yo" && ent.responsable !== USUARIO_ACTUAL) continue;

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
        fp = dateKey(finDate);
      }

      const isInWeek = weekDates.some((d) => dateKey(d) === fp);
      if (!isInWeek) continue;
      if (result.some((b) => b.id === paso.id)) continue;

      const ent = state.entregables.find((e) => e.id === paso.entregableId);
      if (!ent) continue;
      if (viewMode === "yo" && ent.responsable !== USUARIO_ACTUAL) continue;

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

    return result;
  }, [state, weekDates, viewMode]);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, WeekBlock[]>();
    for (const d of weekDates) {
      map.set(dateKey(d), []);
    }
    for (const b of blocks) {
      const arr = map.get(b.dateKey);
      if (arr) arr.push(b);
    }
    return map;
  }, [blocks, weekDates]);

  const totalHoursAvailable = 8;

  return (
    <div className="flex-1">
      {/* Toggle */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setViewMode("yo")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "yo" ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"}`}
        >
          Mi semana
        </button>
        <button
          onClick={() => setViewMode("equipo")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "equipo" ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"}`}
        >
          Equipo
        </button>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-2">
        {weekDates.map((date, i) => {
          const key = dateKey(date);
          const isToday = key === todayKey;
          const dayBlocks = blocksByDay.get(key) ?? [];
          const loadPercent = Math.min(100, (dayBlocks.length / totalHoursAvailable) * 100);

          return (
            <div key={key} className="flex flex-col">
              {/* Day header */}
              <div className={`mb-2 rounded-lg px-2 py-2 text-center ${isToday ? "bg-accent text-white" : "bg-surface"}`}>
                <div className={`text-xs font-bold ${isToday ? "text-white" : "text-foreground"}`}>{DAYS[i]}</div>
                <div className={`text-lg font-bold ${isToday ? "text-white" : "text-foreground"}`}>{date.getDate()}</div>
              </div>

              {/* Load indicator */}
              <div className="mb-2 h-1 rounded-full bg-surface">
                <div
                  className={`h-1 rounded-full transition-all ${loadPercent > 80 ? "bg-red-500" : loadPercent > 50 ? "bg-amber-500" : "bg-green-500"}`}
                  style={{ width: `${loadPercent}%` }}
                />
              </div>

              {/* Blocks */}
              <div className="flex flex-1 flex-col gap-1">
                {dayBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="rounded-lg border-l-[3px] bg-surface px-2 py-1.5 transition-colors hover:bg-surface-hover"
                    style={{ borderLeftColor: BORDER_HEX[block.area] ?? "#f59e0b" }}
                  >
                    <p className={`text-xs font-medium leading-tight ${block.type === "done" ? "text-muted line-through" : "text-foreground"}`}>
                      {block.title}
                    </p>
                    <p className="text-[10px] text-muted">{block.subtitle}</p>
                  </div>
                ))}
                {dayBlocks.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-4">
                    <span className="text-xs text-muted/50">—</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
