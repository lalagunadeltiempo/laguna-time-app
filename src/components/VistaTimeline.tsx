"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/lib/context";
import { generateWeeks, getISOWeek, getWeekMonday } from "@/lib/utils";

type ViewMode = "dias" | "semanas" | "meses";

interface Props {
  onBack: () => void;
  onOpenDetalle?: (resultadoId: string) => void;
}

interface Row {
  resultadoId: string;
  resultadoNombre: string;
  proyectoNombre: string;
  responsable: string;
  startDate: Date | null;
  endDate: Date | null;
  fechaEsReal: boolean;
  estado: string;
  diasEstimados: number;
  diasHechos: number;
}

const ESTADO_COLOR: Record<string, string> = {
  a_futuro: "bg-blue-200", en_proceso: "bg-amber-400", en_espera: "bg-zinc-300", hecho: "bg-green-400", cancelada: "bg-red-200",
};

function addWorkingDays(start: Date, days: number): Date {
  const d = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

function nextWorkingDay(d: Date): Date {
  const r = new Date(d);
  while (true) {
    const dow = r.getDay();
    if (dow !== 0 && dow !== 6) return r;
    r.setDate(r.getDate() + 1);
  }
}

export function VistaTimeline({ onBack, onOpenDetalle }: Props) {
  const state = useAppState();
  const [viewMode, setViewMode] = useState<ViewMode>("semanas");

  const currentWeek = useMemo(() => getISOWeek(), []);

  const rows = useMemo(() => {
    const realStartByRes = new Map<string, Date>();
    const realEndByRes = new Map<string, Date>();
    const estadoByRes = new Map<string, string>();
    const diasByRes = new Map<string, { est: number; done: number }>();
    const respByRes = new Map<string, string>();

    for (const res of state.resultados) {
      const entregables = state.entregables.filter((e) => e.resultadoId === res.id && e.estado !== "cancelada");
      const pasosRes = state.pasos.filter((p) => p.inicioTs && entregables.some((e) => e.id === p.entregableId));

      if (pasosRes.length > 0) {
        const earliest = pasosRes.reduce((min, p) => p.inicioTs! < min.inicioTs! ? p : min);
        realStartByRes.set(res.id, new Date(earliest.inicioTs!));
        const latestFinished = pasosRes.filter((p) => p.finTs).reduce<Date | null>((max, p) => {
          const d = new Date(p.finTs!);
          return !max || d > max ? d : max;
        }, null);
        if (latestFinished) realEndByRes.set(res.id, latestFinished);
      }

      const totalDias = entregables.reduce((s, e) => s + e.diasEstimados, 0);
      const doneDias = entregables.reduce((s, e) => s + e.diasHechos, 0);
      diasByRes.set(res.id, { est: res.diasEstimados ?? totalDias, done: doneDias });

      const firstResp = entregables.find((e) => e.estado !== "hecho")?.responsable ?? entregables[0]?.responsable ?? "";
      respByRes.set(res.id, firstResp);

      const done = entregables.filter((e) => e.estado === "hecho").length;
      let est = "a_futuro";
      if (done === entregables.length && entregables.length > 0) est = "hecho";
      else if (entregables.some((e) => e.estado === "en_proceso")) est = "en_proceso";
      else if (entregables.some((e) => e.estado === "en_espera")) est = "en_espera";
      estadoByRes.set(res.id, est);
    }

    const byProject = new Map<string, typeof state.resultados>();
    for (const res of state.resultados) {
      const arr = byProject.get(res.proyectoId) ?? [];
      arr.push(res);
      byProject.set(res.proyectoId, arr);
    }

    const items: Row[] = [];

    for (const [projId, resArr] of byProject) {
      const proyecto = state.proyectos.find((p) => p.id === projId);
      const projStart = proyecto?.fechaInicio ? new Date(proyecto.fechaInicio + "T00:00:00") : null;

      const sorted = [...resArr].sort(
        (a, b) => new Date(a.creado).getTime() - new Date(b.creado).getTime(),
      );

      let chainEnd: Date | null = projStart;

      for (const res of sorted) {
        const realStart = realStartByRes.get(res.id) ?? null;
        const est = estadoByRes.get(res.id) ?? "a_futuro";
        const dias = diasByRes.get(res.id) ?? { est: 5, done: 0 };
        const resp = respByRes.get(res.id) ?? "";

        let startDate: Date | null = null;
        let fechaEsReal = false;

        if (realStart) {
          startDate = realStart;
          fechaEsReal = true;
        } else if (res.fechaInicio) {
          startDate = new Date(res.fechaInicio + "T00:00:00");
        } else if (chainEnd) {
          startDate = nextWorkingDay(new Date(chainEnd.getTime()));
        } else if (res.semana) {
          startDate = getWeekMonday(res.semana);
        }

        let endDate: Date | null = null;

        if (est === "hecho" && realStart) {
          const realEnd = realEndByRes.get(res.id);
          endDate = realEnd ?? (startDate ? addWorkingDays(startDate, Math.max(dias.est, 1)) : null);
        } else if (res.fechaLimite) {
          endDate = new Date(res.fechaLimite + "T00:00:00");
        } else if (dias.est > 0 && startDate) {
          const remaining = Math.max(0, dias.est - dias.done);
          if (remaining > 0 && fechaEsReal) {
            endDate = addWorkingDays(new Date(), remaining);
          } else {
            endDate = addWorkingDays(startDate, dias.est);
          }
        } else if (startDate) {
          endDate = addWorkingDays(startDate, 5);
        }

        if (endDate && (!chainEnd || endDate > chainEnd)) {
          chainEnd = endDate;
        }

        if (!startDate && !endDate) continue;

        items.push({
          resultadoId: res.id,
          resultadoNombre: res.nombre,
          proyectoNombre: proyecto?.nombre ?? "",
          responsable: resp,
          startDate,
          endDate: endDate ?? (startDate ? addWorkingDays(startDate, 5) : null),
          fechaEsReal,
          estado: est,
          diasEstimados: dias.est,
          diasHechos: dias.done,
        });
      }
    }

    items.sort((a, b) => {
      const as = a.startDate?.getTime() ?? Infinity;
      const bs = b.startDate?.getTime() ?? Infinity;
      return as - bs;
    });
    return items;
  }, [state]);

  const timeAxis = useMemo(() => {
    const now = new Date();
    if (viewMode === "dias") {
      const cols: { label: string; sublabel: string; date: Date; isCurrent: boolean }[] = [];
      const start = new Date(now);
      start.setDate(start.getDate() - 3);
      for (let i = 0; i < 30; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const isToday = d.toDateString() === now.toDateString();
        cols.push({
          label: String(d.getDate()),
          sublabel: d.toLocaleDateString("es-ES", { month: "short" }),
          date: d,
          isCurrent: isToday,
        });
      }
      return { cols, totalDays: 30, originDate: cols[0].date };
    }
    if (viewMode === "meses") {
      const cols: { label: string; sublabel: string; date: Date; isCurrent: boolean; days: number }[] = [];
      const startMonth = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      for (let i = 0; i < 18; i++) {
        const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
        const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const days = Math.round((nextMonth.getTime() - d.getTime()) / 86400000);
        cols.push({
          label: d.toLocaleDateString("es-ES", { month: "short" }),
          sublabel: String(d.getFullYear()),
          date: d,
          isCurrent: d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(),
          days,
        });
      }
      const totalDays = cols.reduce((s, c) => s + c.days, 0);
      return { cols, totalDays, originDate: cols[0].date };
    }
    const weeks = generateWeeks(40, -4);
    const cols = weeks.map((w) => {
      const monday = getWeekMonday(w);
      return {
        label: w.split("-W")[1],
        sublabel: `${monday.getUTCDate()}/${monday.getUTCMonth() + 1}`,
        date: monday,
        isCurrent: w === currentWeek,
        days: 7,
      };
    });
    return { cols, totalDays: cols.length * 7, originDate: cols[0].date };
  }, [viewMode, currentWeek]);

  function barPos(row: Row): { left: number; width: number } | null {
    if (!row.startDate && !row.endDate) return null;
    const origin = timeAxis.originDate.getTime();
    const total = timeAxis.totalDays;
    const msPerDay = 86400000;

    let s = row.startDate ? (row.startDate.getTime() - origin) / msPerDay : 0;
    let e = row.endDate ? (row.endDate.getTime() - origin) / msPerDay : s + 4;

    if (e <= 0 || s >= total) return null;
    s = Math.max(0, Math.min(total, s));
    e = Math.max(s + 0.5, Math.min(total, e));

    return { left: (s / total) * 100, width: ((e - s) / total) * 100 };
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="flex-1 text-xl font-bold text-zinc-900">Timeline</h1>
        <div className="flex rounded-lg border border-zinc-200 text-[10px] font-medium overflow-hidden">
          {(["dias", "semanas", "meses"] as const).map((m) => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-2.5 py-1 capitalize ${viewMode === m ? "bg-amber-500 text-white" : "text-zinc-500 hover:bg-zinc-50"}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-zinc-400">Programa resultados o asigna fechas para verlos aquí.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="mb-1 flex">
            <div className="w-52 shrink-0" />
            <div className="flex flex-1">
              {timeAxis.cols.map((col, i) => (
                <div key={i}
                  className={`flex-1 min-w-[32px] border-l border-zinc-100 px-0.5 py-1 text-center ${col.isCurrent ? "bg-amber-50" : ""}`}
                  style={viewMode === "meses" && "days" in col ? { flex: (col as { days: number }).days } : undefined}>
                  <p className={`text-[9px] font-semibold ${col.isCurrent ? "text-amber-600" : "text-zinc-400"}`}>{col.label}</p>
                  <p className="text-[8px] text-zinc-300">{col.sublabel}</p>
                </div>
              ))}
            </div>
          </div>

          {rows.map((row) => {
            const bar = barPos(row);
            const color = ESTADO_COLOR[row.estado] ?? "bg-zinc-200";
            const pct = row.diasEstimados > 0 ? Math.round((row.diasHechos / row.diasEstimados) * 100) : 0;

            return (
              <div key={row.resultadoId} className="flex items-center hover:bg-zinc-50 rounded">
                <div className="w-52 shrink-0 flex items-center gap-1 pr-2 py-1">
                  <button onClick={() => onOpenDetalle?.(row.resultadoId)}
                    className="flex-1 min-w-0 truncate text-[11px] text-zinc-600 text-left hover:text-amber-600 hover:underline underline-offset-2"
                    title={row.resultadoNombre}>
                    {row.resultadoNombre}
                  </button>
                  <span className="shrink-0 max-w-[52px] truncate rounded bg-zinc-100 px-1 py-0.5 text-[8px] text-zinc-400" title={row.proyectoNombre}>
                    {row.proyectoNombre}
                  </span>
                  {row.diasEstimados > 0 && (
                    <span className="shrink-0 text-[9px] tabular-nums text-zinc-300" title={`${row.diasHechos}/${row.diasEstimados} días`}>
                      {row.diasHechos}/{row.diasEstimados}d
                    </span>
                  )}
                </div>
                <div className="relative flex-1 h-6">
                  <div className="absolute inset-0 flex">
                    {timeAxis.cols.map((col, i) => (
                      <div key={i}
                        className={`flex-1 min-w-[32px] border-l border-zinc-50 ${col.isCurrent ? "bg-amber-50/50" : ""}`}
                        style={viewMode === "meses" && "days" in col ? { flex: (col as { days: number }).days } : undefined} />
                    ))}
                  </div>
                  {bar && (
                    <div
                      className={`absolute top-1 h-4 rounded-sm ${color} ${row.fechaEsReal ? "opacity-90" : "opacity-50"}`}
                      style={{
                        left: `${bar.left}%`,
                        width: `${Math.max(bar.width, 0.8)}%`,
                        ...(row.fechaEsReal ? {} : { backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.4) 3px, rgba(255,255,255,0.4) 6px)" }),
                      }}
                      title={`${row.resultadoNombre} — ${row.responsable} — ${row.diasHechos}/${row.diasEstimados}d (${pct}%)${row.fechaEsReal ? "" : " estimado"}`}
                    />
                  )}
                </div>
              </div>
            );
          })}

          <div className="mt-4 flex flex-wrap gap-3 border-t border-zinc-100 pt-3">
            {Object.entries(ESTADO_COLOR).map(([estado, cls]) => (
              <div key={estado} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-5 rounded-sm ${cls}`} />
                <span className="text-[10px] text-zinc-400">{estado.replace("_", " ")}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-zinc-100">
              <span className="h-2.5 w-5 rounded-sm bg-zinc-400 opacity-90" />
              <span className="text-[10px] text-zinc-400">real</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-5 rounded-sm bg-zinc-400 opacity-50" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.4) 3px, rgba(255,255,255,0.4) 6px)" }} />
              <span className="text-[10px] text-zinc-400">estimado</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
