"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/lib/context";
import { ambitoDeArea, type Resultado, type Proyecto, type Ambito } from "@/lib/types";

interface ResultadoProgress {
  resultado: Resultado;
  proyecto: Proyecto;
  totalEntregables: number;
  completados: number;
  enProceso: number;
  percent: number;
  rag: "green" | "amber" | "red";
}

const RAG_HEX = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };
const RAG_BG = { green: "#22c55e15", amber: "#f59e0b15", red: "#ef444415" };
const RAG_BORDER = { green: "#22c55e40", amber: "#f59e0b40", red: "#ef444440" };

type AmbitoFilter = "todo" | Ambito;

interface Props {
  selectedDate: Date;
}

export function PlanMes({ selectedDate }: Props) {
  const state = useAppState();
  const [filtro, setFiltro] = useState<AmbitoFilter>("todo");

  const mesLabel = useMemo(() => {
    return selectedDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  }, [selectedDate]);

  const resultados = useMemo(() => {
    const refNorm = new Date(selectedDate);
    refNorm.setHours(0, 0, 0, 0);
    const refMs = refNorm.getTime();
    const selYear = selectedDate.getFullYear();
    const selMonth = selectedDate.getMonth();
    const items: ResultadoProgress[] = [];

    for (const res of state.resultados) {
      const proj = state.proyectos.find((p) => p.id === res.proyectoId);
      if (!proj) continue;
      if (filtro !== "todo" && ambitoDeArea(proj.area) !== filtro) continue;

      const entregs = state.entregables.filter((e) => e.resultadoId === res.id);
      if (entregs.length === 0) continue;

      const hasActivityInMonth = entregs.some((e) => {
        if (e.fechaInicio) {
          const d = new Date(e.fechaInicio + "T12:00:00");
          if (!isNaN(d.getTime()) && d.getFullYear() === selYear && d.getMonth() === selMonth) return true;
        }
        return false;
      });
      const hasDeadlineInMonth = res.fechaLimite ? (() => {
        const dl = new Date(res.fechaLimite!);
        return dl.getFullYear() === selYear && dl.getMonth() === selMonth;
      })() : false;
      const hasActiveWork = entregs.some((e) => e.estado === "en_proceso");

      if (!hasActivityInMonth && !hasDeadlineInMonth && !hasActiveWork) continue;

      const completados = entregs.filter((e) => e.estado === "hecho").length;
      const enProceso = entregs.filter((e) => e.estado === "en_proceso").length;
      const total = entregs.length;
      const percent = Math.round((completados / total) * 100);

      let rag: "green" | "amber" | "red" = "green";
      if (res.fechaLimite) {
        const deadline = new Date(res.fechaLimite);
        const daysLeft = Math.ceil((deadline.getTime() - refMs) / 86400000);
        if (daysLeft < 0) rag = "red";
        else if (daysLeft < 7 && percent < 80) rag = "amber";
      }
      if (enProceso === 0 && completados === 0 && rag !== "red") rag = "amber";

      items.push({ resultado: res, proyecto: proj, totalEntregables: total, completados, enProceso, percent, rag });
    }

    return items
      .filter((r) => r.completados < r.totalEntregables)
      .sort((a, b) => {
        const ragOrder = { red: 0, amber: 1, green: 2 };
        if (ragOrder[a.rag] !== ragOrder[b.rag]) return ragOrder[a.rag] - ragOrder[b.rag];
        return b.percent - a.percent;
      });
  }, [state, selectedDate, filtro]);

  const byProject = useMemo(() => {
    const map = new Map<string, { proyecto: Proyecto; items: ResultadoProgress[] }>();
    for (const r of resultados) {
      if (!map.has(r.proyecto.id)) map.set(r.proyecto.id, { proyecto: r.proyecto, items: [] });
      map.get(r.proyecto.id)!.items.push(r);
    }
    return Array.from(map.values());
  }, [resultados]);

  return (
    <div className="flex-1">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm font-medium capitalize text-muted">{mesLabel}</p>
        <AmbitoToggle value={filtro} onChange={setFiltro} />
      </div>

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
                  <div key={r.resultado.id} className="rounded-xl p-4"
                    style={{ backgroundColor: RAG_BG[r.rag], border: `1px solid ${RAG_BORDER[r.rag]}` }}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: RAG_HEX[r.rag] }} />
                      <span className="flex-1 text-sm font-medium text-foreground">{r.resultado.nombre}</span>
                      <span className="text-xs font-bold" style={{ color: RAG_HEX[r.rag] }}>{r.percent}%</span>
                    </div>
                    <div className="mb-2 h-2 rounded-full bg-surface">
                      <div className="h-2 rounded-full transition-all" style={{ width: `${r.percent}%`, backgroundColor: RAG_HEX[r.rag] }} />
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
