"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/lib/context";
import { AREAS_PERSONAL, AREAS_EMPRESA, AREA_COLORS, ambitoDeArea, type Area, type Ambito } from "@/lib/types";
import { AmbitoToggle } from "./PlanMes";

type AmbitoFilter = "todo" | Ambito;

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

interface Props {
  selectedDate: Date;
}

export function PlanAnio({ selectedDate }: Props) {
  const state = useAppState();
  const [filtro, setFiltro] = useState<AmbitoFilter>("todo");
  const year = selectedDate.getFullYear();

  const allAreas = useMemo(() => {
    const areas = [...AREAS_EMPRESA, ...AREAS_PERSONAL];
    if (filtro === "todo") return areas;
    return areas.filter((a) => ambitoDeArea(a.id) === filtro);
  }, [filtro]);

  const areaSummaries = useMemo(() => {
    return allAreas.map(({ id, label }): AreaSummary => {
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
  }, [state, allAreas]);

  const projectSummaries = useMemo(() => {
    return state.proyectos
      .filter((p) => filtro === "todo" || ambitoDeArea(p.area) === filtro)
      .filter((p) => {
        if (!p.fechaInicio) return true;
        const projYear = new Date(p.fechaInicio).getFullYear();
        if (projYear === year) return true;
        if (projYear < year) {
          const ents = state.entregables.filter((e) => {
            const r = state.resultados.find((rr) => rr.id === e.resultadoId);
            return r?.proyectoId === p.id;
          });
          return ents.some((e) => e.estado !== "hecho" && e.estado !== "cancelada");
        }
        return false;
      })
      .map((proj): ProjectSummary => {
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
  }, [state, filtro, year]);

  const totalEntregables = areaSummaries.reduce((s, a) => s + a.total, 0);
  const totalCompletados = areaSummaries.reduce((s, a) => s + a.completados, 0);
  const globalPercent = totalEntregables > 0 ? Math.round((totalCompletados / totalEntregables) * 100) : 0;

  const completadosProj = projectSummaries.filter((p) => p.status === "completado").length;
  const enCursoProj = projectSummaries.filter((p) => p.status === "en_curso").length;
  const sinEmpezarProj = projectSummaries.filter((p) => p.status === "sin_empezar").length;

  const areaHex = (a: Area) => AREA_COLORS[a]?.hex ?? "#888";

  return (
    <div className="flex-1">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{year} · Resumen ejecutivo</p>
        <AmbitoToggle value={filtro} onChange={setFiltro} />
      </div>

      <div className="mb-8 rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-sm text-muted">Progreso global</p>
            <p className="text-4xl font-bold text-foreground">{globalPercent}%</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>{totalCompletados} de {totalEntregables} entregables</p>
            <p>{projectSummaries.length} proyectos</p>
          </div>
        </div>
        <div className="h-3 rounded-full bg-border">
          <div className="h-3 rounded-full bg-accent transition-all" style={{ width: `${globalPercent}%` }} />
        </div>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: "#22c55e15", border: "1px solid #22c55e40" }}>
          <p className="text-2xl font-bold" style={{ color: "#22c55e" }}>{completadosProj}</p>
          <p className="text-xs" style={{ color: "#22c55e" }}>Completados</p>
        </div>
        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: "#f59e0b15", border: "1px solid #f59e0b40" }}>
          <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{enCursoProj}</p>
          <p className="text-xs" style={{ color: "#f59e0b" }}>En curso</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-bold text-muted">{sinEmpezarProj}</p>
          <p className="text-xs text-muted">Sin empezar</p>
        </div>
      </div>

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
                <div className="h-2 rounded-full transition-all" style={{ width: `${a.percent}%`, backgroundColor: areaHex(a.area) }} />
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

      <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted">Todos los proyectos</h3>
      <div className="space-y-2">
        {projectSummaries.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: areaHex(p.area) }} />
            <span className="flex-1 truncate text-sm font-medium text-foreground">{p.nombre}</span>
              <div className="h-1.5 w-20 rounded-full bg-surface">
              <div className="h-1.5 rounded-full" style={{ width: `${p.percent}%`, backgroundColor: areaHex(p.area) }} />
            </div>
            <span className="w-10 text-right text-xs font-bold text-muted">{p.percent}%</span>
            <span className="text-xs" style={{ color: p.status === "completado" ? "#22c55e" : p.status === "en_curso" ? "#f59e0b" : undefined }}>
              {p.status === "completado" ? "✓" : p.status === "en_curso" ? "●" : "○"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
