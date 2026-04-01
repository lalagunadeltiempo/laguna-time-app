"use client";

import { useMemo } from "react";
import { useAppState } from "@/lib/context";
import type { Proyecto } from "@/lib/types";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const BORDER_HEX: Record<string, string> = {
  fisico: "#f43f5e", emocional: "#ec4899", mental: "#6366f1", espiritual: "#8b5cf6",
  financiera: "#10b981", operativa: "#3b82f6", comercial: "#f59e0b", administrativa: "#a855f6",
};

interface ProjectBar {
  proyecto: Proyecto;
  totalResultados: number;
  completados: number;
  percent: number;
  rag: "green" | "amber" | "red";
  startMonth: number;
  spanMonths: number;
}

export function PlanTrimestre() {
  const state = useAppState();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);

  const quarters = [1, 2, 3, 4].map((q) => ({
    q,
    label: `Q${q} ${currentYear}`,
    months: [0, 1, 2].map((i) => (q - 1) * 3 + i),
    isCurrent: q === currentQuarter,
  }));

  const allMonths = quarters.flatMap((q) => q.months);

  const projects = useMemo(() => {
    const items: ProjectBar[] = [];

    for (const proj of state.proyectos) {
      const resultados = state.resultados.filter((r) => r.proyectoId === proj.id);
      if (resultados.length === 0) continue;

      const entregs = state.entregables.filter((e) =>
        resultados.some((r) => r.id === e.resultadoId),
      );

      const completados = entregs.filter((e) => e.estado === "hecho").length;
      const total = entregs.length;
      const percent = total > 0 ? Math.round((completados / total) * 100) : 0;

      let rag: "green" | "amber" | "red" = "green";
      if (percent === 0 && total > 0) rag = "amber";
      if (proj.fechaInicio) {
        const start = new Date(proj.fechaInicio);
        const monthsElapsed = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
        if (monthsElapsed > 3 && percent < 25) rag = "red";
        else if (monthsElapsed > 1 && percent < 10) rag = "amber";
      }

      let startMonth = now.getMonth();
      if (proj.fechaInicio) {
        const s = new Date(proj.fechaInicio);
        if (s.getFullYear() === currentYear) startMonth = s.getMonth();
        else if (s.getFullYear() < currentYear) startMonth = 0;
      }

      let endMonth = 11;
      const estimatedDays = resultados.reduce((acc, r) => acc + (r.diasEstimados ?? 30), 0);
      const estimatedMonths = Math.ceil(estimatedDays / 30);
      endMonth = Math.min(11, startMonth + estimatedMonths - 1);

      items.push({
        proyecto: proj,
        totalResultados: resultados.length,
        completados: resultados.filter((r) => {
          const rEntregs = entregs.filter((e) => e.resultadoId === r.id);
          return rEntregs.length > 0 && rEntregs.every((e) => e.estado === "hecho");
        }).length,
        percent,
        rag,
        startMonth,
        spanMonths: endMonth - startMonth + 1,
      });
    }

    return items.sort((a, b) => a.startMonth - b.startMonth);
  }, [state, currentYear, now]);

  const RAG_HEX = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };

  return (
    <div className="flex-1 overflow-x-auto">
      <p className="mb-6 text-sm font-medium text-muted">{currentYear} · Trimestres</p>

      {/* Month headers */}
      <div className="mb-4 grid grid-cols-12 gap-px">
        {allMonths.map((m) => (
          <div
            key={m}
            className={`rounded-lg px-1 py-2 text-center text-xs font-medium ${
              m === now.getMonth() ? "bg-accent text-white" : "bg-surface text-muted"
            }`}
          >
            {MONTHS_ES[m]}
          </div>
        ))}
      </div>

      {/* Quarter dividers */}
      <div className="mb-2 grid grid-cols-4 gap-2">
        {quarters.map((q) => (
          <div key={q.q} className={`rounded-lg py-1 text-center text-[11px] font-bold ${q.isCurrent ? "bg-accent/10 text-accent" : "bg-surface text-muted"}`}>
            {q.label}
          </div>
        ))}
      </div>

      {/* Project bars */}
      {projects.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted">No hay proyectos con resultados.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.proyecto.id} className="group flex items-center gap-2">
              <div className="w-28 shrink-0 truncate text-right text-xs font-medium text-foreground">
                {p.proyecto.nombre}
              </div>
              <div className="relative flex-1">
                <div className="grid h-8 grid-cols-12 gap-px rounded-lg bg-surface">
                  {allMonths.map((m) => (
                    <div key={m} className="h-8 border-r border-border/30 last:border-r-0" />
                  ))}
                </div>
                <div
                  className="absolute top-0 flex h-8 items-center rounded-lg px-2 transition-colors"
                  style={{
                    left: `${(p.startMonth / 12) * 100}%`,
                    width: `${(p.spanMonths / 12) * 100}%`,
                    backgroundColor: BORDER_HEX[p.proyecto.area] + "20",
                    borderColor: BORDER_HEX[p.proyecto.area],
                    borderWidth: "1px",
                    borderStyle: "solid",
                  }}
                >
                  <div
                    className="h-full rounded-lg opacity-30"
                    style={{
                      width: `${p.percent}%`,
                      backgroundColor: BORDER_HEX[p.proyecto.area],
                    }}
                  />
                  <span className="absolute right-2 text-[10px] font-bold text-foreground">
                    {p.percent}%
                  </span>
                </div>
              </div>
              <span className="w-6 text-center text-xs font-bold" style={{ color: RAG_HEX[p.rag] }}>
                ●
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
