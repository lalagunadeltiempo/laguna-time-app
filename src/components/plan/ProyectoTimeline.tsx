"use client";

import { type Resultado, type Entregable } from "@/lib/types";
import { inferDateRange, type DateRange } from "@/lib/proyecto-stats";

export function ProyectoTimeline({
  range, resultados, entregables, hoy, areaColor,
}: {
  range: DateRange;
  resultados: Resultado[];
  entregables: Entregable[];
  hoy: Date;
  areaColor: string;
}) {
  const startStr = range.inicio;
  const endStr = range.fin;

  const pad = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hoyStr = pad(hoy);

  const allDates: string[] = [];
  if (startStr) allDates.push(startStr);
  if (endStr) allDates.push(endStr);
  for (const r of resultados) {
    if (r.fechaInicio) allDates.push(r.fechaInicio);
    if (r.fechaLimite) allDates.push(r.fechaLimite);
  }
  for (const e of entregables) {
    if (e.fechaInicio) allDates.push(e.fechaInicio);
    if (e.fechaLimite) allDates.push(e.fechaLimite);
  }
  allDates.push(hoyStr);

  if (allDates.length < 2) {
    return (
      <div className="border-b border-border px-5 py-3 text-center">
        <p className="text-[11px] italic text-muted/70">
          Añade fechas para ver la línea de tiempo del proyecto.
        </p>
      </div>
    );
  }

  const minStr = allDates.reduce((a, b) => (a < b ? a : b));
  const maxStr = allDates.reduce((a, b) => (a > b ? a : b));
  const minMs = new Date(minStr + "T00:00:00").getTime();
  const maxMs = new Date(maxStr + "T23:59:59").getTime();
  const span = Math.max(1, maxMs - minMs);

  const pos = (dateStr: string) => {
    const t = new Date(dateStr + "T12:00:00").getTime();
    return Math.max(0, Math.min(100, ((t - minMs) / span) * 100));
  };
  const hoyPct = pos(hoyStr);

  const formatShort = (s: string) => {
    const d = new Date(s + "T12:00:00");
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };

  return (
    <div className="border-b border-border px-5 py-3">
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted">
        <span>{formatShort(minStr)}</span>
        <span>Línea de tiempo</span>
        <span>{formatShort(maxStr)}</span>
      </div>

      <div className="space-y-1">
        {resultados.map((r) => {
          const resEnts = entregables.filter((e) => e.resultadoId === r.id);
          const inferred = inferDateRange(resEnts);
          const ini = r.fechaInicio ?? inferred.inicio ?? startStr;
          const fin = r.fechaLimite ?? inferred.fin ?? endStr;
          if (!ini || !fin) {
            return (
              <div key={r.id} className="relative h-4 rounded bg-surface/50" title={r.nombre}>
                <span className="absolute left-2 top-0 text-[9px] italic leading-4 text-muted/70">{r.nombre} (sin fechas)</span>
              </div>
            );
          }
          const left = pos(ini);
          const right = pos(fin);
          const width = Math.max(1.5, right - left);
          return (
            <div key={r.id} className="relative h-4" title={`${r.nombre} · ${formatShort(ini)} → ${formatShort(fin)}`}>
              <div className="absolute inset-y-0 rounded" style={{ left: `${left}%`, width: `${width}%`, backgroundColor: areaColor + "66" }} />
              {resEnts.map((e) => {
                if (!e.fechaLimite) return null;
                const ep = pos(e.fechaLimite);
                return (
                  <span key={e.id}
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
                    style={{ left: `${ep}%`, backgroundColor: e.estado === "hecho" ? "#22c55e" : e.estado === "cancelada" ? "#9ca3af" : "#f59e0b" }}
                    title={`${e.nombre} · ${formatShort(e.fechaLimite)}`}
                  />
                );
              })}
              <span className="absolute left-1 top-0 max-w-[90%] truncate text-[9px] leading-4 text-foreground/90">
                {r.nombre}
              </span>
            </div>
          );
        })}
      </div>

      {/* Today line */}
      <div className="relative mt-1 h-3">
        <div className="absolute top-0 h-full w-px bg-red-500" style={{ left: `${hoyPct}%` }} />
        <span className="absolute top-0 -translate-x-1/2 text-[9px] font-bold text-red-500" style={{ left: `${hoyPct}%` }}>hoy</span>
      </div>
    </div>
  );
}
