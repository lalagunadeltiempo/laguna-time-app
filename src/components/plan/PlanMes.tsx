"use client";

import { useMemo } from "react";
import { useAppState } from "@/lib/context";
import type { Resultado, Proyecto } from "@/lib/types";

interface ResultadoProgress {
  resultado: Resultado;
  proyecto: Proyecto;
  totalEntregables: number;
  completados: number;
  enProceso: number;
  percent: number;
  rag: "green" | "amber" | "red";
}

export function PlanMes() {
  const state = useAppState();

  const now = new Date();
  const mesLabel = now.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  const resultados = useMemo(() => {
    const items: ResultadoProgress[] = [];

    for (const res of state.resultados) {
      const proj = state.proyectos.find((p) => p.id === res.proyectoId);
      if (!proj) continue;

      const entregs = state.entregables.filter((e) => e.resultadoId === res.id);
      if (entregs.length === 0) continue;

      const completados = entregs.filter((e) => e.estado === "hecho").length;
      const enProceso = entregs.filter((e) => e.estado === "en_proceso").length;
      const total = entregs.length;
      const percent = Math.round((completados / total) * 100);

      let rag: "green" | "amber" | "red" = "green";
      if (res.fechaLimite) {
        const deadline = new Date(res.fechaLimite);
        const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
        if (daysLeft < 0) rag = "red";
        else if (daysLeft < 7 && percent < 80) rag = "amber";
      }
      if (enProceso === 0 && completados === 0) rag = "amber";

      items.push({ resultado: res, proyecto: proj, totalEntregables: total, completados, enProceso, percent, rag });
    }

    return items
      .filter((r) => r.completados < r.totalEntregables)
      .sort((a, b) => {
        const ragOrder = { red: 0, amber: 1, green: 2 };
        if (ragOrder[a.rag] !== ragOrder[b.rag]) return ragOrder[a.rag] - ragOrder[b.rag];
        return b.percent - a.percent;
      });
  }, [state, now]);

  const byProject = useMemo(() => {
    const map = new Map<string, { proyecto: Proyecto; items: ResultadoProgress[] }>();
    for (const r of resultados) {
      if (!map.has(r.proyecto.id)) {
        map.set(r.proyecto.id, { proyecto: r.proyecto, items: [] });
      }
      map.get(r.proyecto.id)!.items.push(r);
    }
    return Array.from(map.values());
  }, [resultados]);

  const ragColors = { green: "bg-green-500", amber: "bg-amber-500", red: "bg-red-500" };
  const ragBg = { green: "bg-green-50 border-green-200", amber: "bg-amber-50 border-amber-200", red: "bg-red-50 border-red-200" };
  const ragText = { green: "text-green-700", amber: "text-amber-700", red: "text-red-700" };

  return (
    <div className="flex-1">
      <p className="mb-6 text-sm font-medium capitalize text-muted">{mesLabel}</p>

      {byProject.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted">No hay resultados activos este mes.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {byProject.map(({ proyecto, items }) => (
            <div key={proyecto.id}>
              <h3 className="mb-3 text-sm font-bold text-foreground">{proyecto.nombre}</h3>
              <div className="space-y-2">
                {items.map((r) => (
                  <div key={r.resultado.id} className={`rounded-xl border p-4 ${ragBg[r.rag]}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ragColors[r.rag]}`} />
                      <span className="flex-1 text-sm font-medium text-foreground">{r.resultado.nombre}</span>
                      <span className={`text-xs font-bold ${ragText[r.rag]}`}>{r.percent}%</span>
                    </div>
                    <div className="mb-2 h-2 rounded-full bg-white/60">
                      <div className={`h-2 rounded-full transition-all ${ragColors[r.rag]}`} style={{ width: `${r.percent}%` }} />
                    </div>
                    <div className="flex gap-3 text-xs text-muted">
                      <span>{r.completados} hechos</span>
                      <span>{r.enProceso} en curso</span>
                      <span>{r.totalEntregables - r.completados - r.enProceso} pendientes</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
