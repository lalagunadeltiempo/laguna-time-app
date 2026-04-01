"use client";

import { useMemo } from "react";
import { useAppState } from "@/lib/context";
import { AREAS_PERSONAL, AREAS_EMPRESA, AREA_COLORS, type Area } from "@/lib/types";

interface AreaSummary {
  area: Area;
  label: string;
  total: number;
  completados: number;
  enProceso: number;
  sinEmpezar: number;
  percent: number;
}

interface ProjectSummary {
  id: string;
  nombre: string;
  area: Area;
  total: number;
  completados: number;
  percent: number;
  status: "completado" | "en_curso" | "sin_empezar";
}

export function PlanAnio() {
  const state = useAppState();
  const year = new Date().getFullYear();

  const areaSummaries = useMemo(() => {
    const areas = [...AREAS_EMPRESA, ...AREAS_PERSONAL];
    return areas.map(({ id, label }): AreaSummary => {
      const projs = state.proyectos.filter((p) => p.area === id);
      const results = state.resultados.filter((r) => projs.some((p) => p.id === r.proyectoId));
      const entregs = state.entregables.filter((e) => results.some((r) => r.id === e.resultadoId));

      const completados = entregs.filter((e) => e.estado === "hecho").length;
      const enProceso = entregs.filter((e) => e.estado === "en_proceso").length;
      const total = entregs.length;

      return {
        area: id,
        label,
        total,
        completados,
        enProceso,
        sinEmpezar: total - completados - enProceso,
        percent: total > 0 ? Math.round((completados / total) * 100) : 0,
      };
    });
  }, [state]);

  const projectSummaries = useMemo(() => {
    return state.proyectos.map((proj): ProjectSummary => {
      const results = state.resultados.filter((r) => r.proyectoId === proj.id);
      const entregs = state.entregables.filter((e) => results.some((r) => r.id === e.resultadoId));
      const completados = entregs.filter((e) => e.estado === "hecho").length;
      const total = entregs.length;
      const percent = total > 0 ? Math.round((completados / total) * 100) : 0;

      let status: "completado" | "en_curso" | "sin_empezar" = "sin_empezar";
      if (total > 0 && completados === total) status = "completado";
      else if (entregs.some((e) => e.estado === "en_proceso")) status = "en_curso";

      return { id: proj.id, nombre: proj.nombre, area: proj.area, total, completados, percent, status };
    }).sort((a, b) => b.percent - a.percent);
  }, [state]);

  const totalEntregables = areaSummaries.reduce((s, a) => s + a.total, 0);
  const totalCompletados = areaSummaries.reduce((s, a) => s + a.completados, 0);
  const globalPercent = totalEntregables > 0 ? Math.round((totalCompletados / totalEntregables) * 100) : 0;

  const completadosProj = projectSummaries.filter((p) => p.status === "completado").length;
  const enCursoProj = projectSummaries.filter((p) => p.status === "en_curso").length;
  const sinEmpezarProj = projectSummaries.filter((p) => p.status === "sin_empezar").length;

  const BORDER_HEX: Record<string, string> = {
    fisico: "#f43f5e", emocional: "#ec4899", mental: "#6366f1", espiritual: "#8b5cf6",
    financiera: "#10b981", operativa: "#3b82f6", comercial: "#f59e0b", administrativa: "#a855f6",
  };

  return (
    <div className="flex-1">
      <p className="mb-6 text-sm font-medium text-muted">{year} · Resumen ejecutivo</p>

      {/* Global progress */}
      <div className="mb-8 rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-sm text-muted">Progreso global</p>
            <p className="text-4xl font-bold text-foreground">{globalPercent}%</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>{totalCompletados} de {totalEntregables} entregables</p>
            <p>{state.proyectos.length} proyectos</p>
          </div>
        </div>
        <div className="h-3 rounded-full bg-border">
          <div className="h-3 rounded-full bg-accent transition-all" style={{ width: `${globalPercent}%` }} />
        </div>
      </div>

      {/* Project status counts */}
      <div className="mb-8 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{completadosProj}</p>
          <p className="text-xs text-green-600">Completados</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{enCursoProj}</p>
          <p className="text-xs text-amber-600">En curso</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-bold text-muted">{sinEmpezarProj}</p>
          <p className="text-xs text-muted">Sin empezar</p>
        </div>
      </div>

      {/* By area */}
      <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted">Por área</h3>
      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {areaSummaries.map((a) => {
          const c = AREA_COLORS[a.area];
          return (
            <div key={a.area} className="rounded-xl border border-border bg-background p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white ${c.dot}`}>
                  {c.initial}
                </span>
                <span className="text-sm font-semibold text-foreground">{a.label}</span>
                <span className="ml-auto text-sm font-bold text-foreground">{a.percent}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface">
                <div className="h-2 rounded-full transition-all" style={{ width: `${a.percent}%`, backgroundColor: BORDER_HEX[a.area] }} />
              </div>
              <div className="mt-2 flex gap-3 text-xs text-muted">
                <span>{a.completados} hechos</span>
                <span>{a.enProceso} en curso</span>
                <span>{a.sinEmpezar} pend.</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* All projects */}
      <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted">Todos los proyectos</h3>
      <div className="space-y-2">
        {projectSummaries.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: BORDER_HEX[p.area] }}
            />
            <span className="flex-1 truncate text-sm font-medium text-foreground">{p.nombre}</span>
            <div className="h-1.5 w-20 rounded-full bg-surface">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${p.percent}%`, backgroundColor: BORDER_HEX[p.area] }}
              />
            </div>
            <span className="w-10 text-right text-xs font-bold text-muted">{p.percent}%</span>
            <span className={`text-xs ${p.status === "completado" ? "text-green-600" : p.status === "en_curso" ? "text-amber-600" : "text-muted"}`}>
              {p.status === "completado" ? "✓" : p.status === "en_curso" ? "●" : "○"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
