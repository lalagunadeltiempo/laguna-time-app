"use client";

import { useState, useMemo } from "react";
import type { Proyecto, Resultado, Entregable } from "@/lib/types";
import { AREA_COLORS } from "@/lib/types";
import {
  inferDateRange,
  ritmoColor,
  ritmoLabel,
  ritmoLabelCorto,
  type ProyectoRitmo,
} from "@/lib/proyecto-stats";

/* ---- Public types ---- */

export interface GanttProject {
  proyecto: Proyecto;
  resultados: Resultado[];
  entregables: Entregable[];
  ritmo: ProyectoRitmo;
}

/* ---- Helpers ---- */

const LABEL_W = 200;

function dk(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoW(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7);
}

function getMon(d: Date): Date {
  const day = d.getDay() || 7;
  const m = new Date(d);
  m.setDate(d.getDate() - day + 1);
  m.setHours(0, 0, 0, 0);
  return m;
}

interface WC {
  key: string;
  label: string;
  sub: string;
  pct: number;
  wPct: number;
}

function fmtShort(s: string): string {
  const d = new Date(s + "T12:00:00");
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function entClr(estado: string): string {
  switch (estado) {
    case "hecho": return "#22c55e";
    case "cancelada": return "#9ca3af";
    case "en_proceso": return "#3b82f6";
    case "planificado": return "#f59e0b";
    case "en_espera": return "#8b5cf6";
    default: return "#d1d5db";
  }
}

/* ---- Component ---- */

interface Props {
  projects: GanttProject[];
  hoy: Date;
  rangeStart?: string;
  rangeEnd?: string;
}

export function GanttMultiProyecto({
  projects,
  hoy,
  rangeStart: rsOvr,
  rangeEnd: reOvr,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const hoyStr = dk(hoy);

  const { weeks, pos, hoyPct } = useMemo(() => {
    const dd: string[] = [hoyStr];
    for (const g of projects) {
      if (g.proyecto.fechaInicio) dd.push(g.proyecto.fechaInicio);
      if (g.proyecto.fechaLimite) dd.push(g.proyecto.fechaLimite);
      for (const r of g.resultados) {
        if (r.fechaInicio) dd.push(r.fechaInicio);
        if (r.fechaLimite) dd.push(r.fechaLimite);
      }
      for (const e of g.entregables) {
        if (e.fechaInicio) dd.push(e.fechaInicio);
        if (e.fechaLimite) dd.push(e.fechaLimite);
      }
    }
    dd.sort();
    const sStr = rsOvr || dd[0]!;
    const eStr = reOvr || dd[dd.length - 1]!;
    const sD = new Date(sStr + "T00:00:00");
    const eD = new Date(eStr + "T23:59:59");
    if (eD.getTime() - sD.getTime() < 27 * 86400000) {
      eD.setDate(eD.getDate() + 28);
    }

    const sMs = sD.getTime();
    const eMs = eD.getTime();
    const span = Math.max(1, eMs - sMs);
    const p = (ds: string) =>
      Math.max(
        0,
        Math.min(100, ((new Date(ds + "T12:00:00").getTime() - sMs) / span) * 100),
      );

    const first = getMon(sD);
    const cols: WC[] = [];
    const cur = new Date(first);
    while (cur.getTime() <= eD.getTime()) {
      const k = dk(cur);
      const nx = new Date(cur);
      nx.setDate(nx.getDate() + 7);
      cols.push({
        key: k,
        label: `S${isoW(cur)}`,
        sub: cur.toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
        pct: p(k),
        wPct: p(dk(nx)) - p(k),
      });
      cur.setDate(cur.getDate() + 7);
    }

    return { weeks: cols, pos: p, hoyPct: p(hoyStr) };
  }, [projects, hoyStr, rsOvr, reOvr]);

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center">
        <p className="text-sm italic text-muted">
          No hay proyectos para mostrar en el Gantt.
        </p>
      </div>
    );
  }

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const allExpanded = projects.every((gp) => expanded.has(gp.proyecto.id));
  const toggleAll = () => {
    if (allExpanded) {
      setExpanded(new Set());
    } else {
      setExpanded(new Set(projects.map((gp) => gp.proyecto.id)));
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted">
          Gantt de proyectos
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleAll}
            className="text-[10px] font-medium text-muted transition-colors hover:text-foreground"
          >
            {allExpanded ? "Colapsar todo" : "Expandir todo"}
          </button>
          <span className="text-[10px] text-muted">
            {projects.length} proyecto{projects.length !== 1 && "s"}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto touch-pan-x">
        <div
          className="relative"
          style={{ minWidth: Math.max(600, weeks.length * 72 + LABEL_W) }}
        >
          {/* ---- Gridlines overlay (renders once, spans full height) ---- */}
          <div
            className="pointer-events-none absolute inset-y-0 z-[1]"
            style={{ left: LABEL_W, right: 0 }}
          >
            {weeks.map((w) => (
              <div
                key={w.key}
                className="absolute inset-y-0 w-px bg-border/25"
                style={{ left: `${w.pct}%` }}
              />
            ))}
            <div
              className="absolute inset-y-0 w-0.5 bg-red-500/50"
              style={{ left: `${hoyPct}%` }}
            />
          </div>

          {/* ---- Week column headers ---- */}
          <div className="flex border-b border-border/60 bg-background/40">
            <div className="shrink-0" style={{ width: LABEL_W }} />
            <div className="relative h-10 flex-1">
              {weeks.map((w) => (
                <div
                  key={w.key}
                  className="absolute inset-y-0 flex flex-col items-center justify-center"
                  style={{ left: `${w.pct}%`, width: `${w.wPct}%` }}
                >
                  <span className="text-[10px] font-bold text-muted">
                    {w.label}
                  </span>
                  <span className="text-[8px] text-muted/60">{w.sub}</span>
                </div>
              ))}
              <div
                className="absolute bottom-0 -translate-x-1/2 text-[7px] font-bold text-red-500"
                style={{ left: `${hoyPct}%` }}
              >
                hoy
              </div>
            </div>
          </div>

          {/* ---- Project rows ---- */}
          {projects.map((gp) => (
            <ProjectRow
              key={gp.proyecto.id}
              gp={gp}
              open={expanded.has(gp.proyecto.id)}
              onToggle={toggle}
              pos={pos}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function ProjectRow({
  gp,
  open,
  onToggle,
  pos,
}: {
  gp: GanttProject;
  open: boolean;
  onToggle: (id: string) => void;
  pos: (d: string) => number;
}) {
  const p = gp.proyecto;
  const hex = AREA_COLORS[p.area]?.hex ?? "#888";
  const inf = inferDateRange([...gp.resultados, ...gp.entregables]);
  const pS = p.fechaInicio || inf.inicio;
  const pE = p.fechaLimite || inf.fin;

  return (
    <div className="border-b border-border/30 last:border-b-0">
      {/* Project bar */}
      <div className="group flex items-stretch transition-colors hover:bg-accent/5">
        <button
          onClick={() => onToggle(p.id)}
          className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-left"
          style={{ width: LABEL_W }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={`shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          >
            <path d="M8 5l8 7-8 7z" />
          </svg>
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: hex }}
          />
          <span className="min-w-0 truncate text-[11px] font-semibold text-foreground">
            {p.nombre}
          </span>
        </button>

        <div className="relative flex-1 py-1.5">
          {pS && pE ? (
            <div
              className="relative h-6"
              title={`${p.nombre}\n${ritmoLabel(gp.ritmo)}\n${fmtShort(pS)} → ${fmtShort(pE)}`}
            >
              <div
                className="absolute inset-y-0 rounded"
                style={{
                  left: `${pos(pS)}%`,
                  width: `${Math.max(1.5, pos(pE) - pos(pS))}%`,
                  backgroundColor: hex + "25",
                }}
              />
              {gp.ritmo.porcentaje > 0 && (
                <div
                  className="absolute inset-y-0 rounded"
                  style={{
                    left: `${pos(pS)}%`,
                    width: `${Math.max(
                      0.5,
                      (pos(pE) - pos(pS)) * gp.ritmo.porcentaje,
                    )}%`,
                    backgroundColor: hex + "70",
                  }}
                />
              )}
              <div
                className="absolute inset-y-0 flex items-center justify-between overflow-hidden px-1.5"
                style={{
                  left: `${pos(pS)}%`,
                  width: `${Math.max(1.5, pos(pE) - pos(pS))}%`,
                }}
              >
                <span
                  className="text-[9px] font-bold whitespace-nowrap"
                  style={{ color: hex }}
                >
                  {Math.round(gp.ritmo.porcentaje * 100)}%
                </span>
                <span
                  className="text-[9px] font-semibold whitespace-nowrap"
                  style={{ color: ritmoColor(gp.ritmo.estadoRitmo) }}
                >
                  {ritmoLabelCorto(gp.ritmo.estadoRitmo)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex h-6 items-center">
              <span className="pl-1 text-[9px] italic text-muted/50">
                Sin fechas
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded: results + deliverables */}
      {open &&
        gp.resultados.map((r) => (
          <ResultRow
            key={r.id}
            resultado={r}
            entregables={gp.entregables.filter((e) => e.resultadoId === r.id)}
            hex={hex}
            pos={pos}
          />
        ))}
    </div>
  );
}

function ResultRow({
  resultado: r,
  entregables,
  hex,
  pos,
}: {
  resultado: Resultado;
  entregables: Entregable[];
  hex: string;
  pos: (d: string) => number;
}) {
  const rI = inferDateRange(entregables);
  const rS = r.fechaInicio || rI.inicio;
  const rF = r.fechaLimite || rI.fin;
  const done = entregables.filter((e) => e.estado === "hecho").length;
  const tot = entregables.filter((e) => e.estado !== "cancelada").length;

  return (
    <>
      {/* Result */}
      <div className="flex items-stretch bg-surface/20">
        <div
          className="flex shrink-0 items-center gap-1 pl-8 pr-2 py-1"
          style={{ width: LABEL_W }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: hex + "88" }}
          />
          <span className="min-w-0 truncate text-[10px] font-medium text-foreground/75">
            {r.nombre}
          </span>
          {tot > 0 && (
            <span className="shrink-0 text-[9px] text-muted">
              {done}/{tot}
            </span>
          )}
        </div>
        <div className="relative flex-1 py-1">
          {rS && rF ? (
            <div
              className="relative h-3.5"
              title={`${r.nombre} · ${fmtShort(rS)} → ${fmtShort(rF)} · ${done}/${tot} hechos`}
            >
              <div
                className="absolute inset-y-0 rounded-sm"
                style={{
                  left: `${pos(rS)}%`,
                  width: `${Math.max(1, pos(rF) - pos(rS))}%`,
                  backgroundColor: hex + "18",
                }}
              />
              {entregables.map((e) => {
                const ed = e.fechaLimite || e.fechaInicio;
                if (!ed) return null;
                return (
                  <span
                    key={e.id}
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70"
                    style={{
                      left: `${pos(ed)}%`,
                      backgroundColor: entClr(e.estado),
                    }}
                    title={`${e.nombre} · ${e.estado}`}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex h-3.5 items-center">
              <span className="pl-1 text-[8px] italic text-muted/40">
                sin fechas
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Deliverables */}
      {entregables.map((e) => (
        <EntregableRow key={e.id} entregable={e} pos={pos} />
      ))}
    </>
  );
}

function EntregableRow({
  entregable: e,
  pos,
}: {
  entregable: Entregable;
  pos: (d: string) => number;
}) {
  const eS = e.fechaInicio;
  const eF = e.fechaLimite;
  const eD = eS || eF;

  return (
    <div className="flex items-stretch">
      <div
        className="flex shrink-0 items-center gap-1 pl-12 pr-2 py-px"
        style={{ width: LABEL_W }}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: entClr(e.estado) }}
        />
        <span
          className={`min-w-0 truncate text-[9px] ${
            e.estado === "hecho"
              ? "text-muted/50 line-through"
              : "text-foreground/60"
          }`}
        >
          {e.nombre}
        </span>
        {e.diasEstimados > 0 && (
          <span className="shrink-0 text-[8px] text-muted/50">
            {e.diasEstimados}d
          </span>
        )}
      </div>
      <div className="relative flex-1 py-px">
        {eS && eF ? (
          <div className="relative h-2">
            <div
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${pos(eS)}%`,
                width: `${Math.max(0.5, pos(eF) - pos(eS))}%`,
                backgroundColor: entClr(e.estado) + "55",
              }}
            />
          </div>
        ) : eD ? (
          <div className="relative h-2">
            <span
              className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${pos(eD)}%`,
                backgroundColor: entClr(e.estado) + "88",
              }}
            />
          </div>
        ) : (
          <div className="h-2" />
        )}
      </div>
    </div>
  );
}
