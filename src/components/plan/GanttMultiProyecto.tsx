"use client";

import { useState, useMemo } from "react";
import type { Area, Proyecto, Resultado, Entregable } from "@/lib/types";
import { AREA_COLORS, AREAS_EMPRESA, AREAS_PERSONAL } from "@/lib/types";
import {
  ritmoColor,
  ritmoLabel,
  ritmoLabelCorto,
  type ProyectoRitmo,
} from "@/lib/proyecto-stats";
import { rangoEntregableMapa, rangoResultadoMapa } from "@/lib/fechas-efectivas";
import { useAppDispatch } from "@/lib/context";
import { InlineNombre } from "./InlineEditors";

interface EffectiveRange {
  start: string | undefined;
  end: string | undefined;
}

function rangesOverlap(
  aStart: string | null | undefined,
  aEnd: string | null | undefined,
  rangeStart: string | undefined,
  rangeEnd: string | undefined,
): boolean {
  if (!rangeStart || !rangeEnd) return true;
  const s = aStart ?? aEnd ?? null;
  const e = aEnd ?? aStart ?? null;
  if (!s && !e) return false;
  const itemStart = s ?? rangeStart;
  const itemEnd = e ?? rangeEnd;
  return itemStart <= rangeEnd && itemEnd >= rangeStart;
}

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

/* ---- Range mode ---- */

type RangeMode = "mes" | "trimestre" | "todo" | "custom";

const MODE_LABELS: Record<RangeMode, string> = {
  mes: "Mes",
  trimestre: "Trimestre",
  todo: "Todo",
  custom: "Rango",
};

function computePresetRange(
  mode: RangeMode,
  selectedDate: Date,
): { start: string | undefined; end: string | undefined } {
  const y = selectedDate.getFullYear();
  const m = selectedDate.getMonth();
  switch (mode) {
    case "mes":
      return {
        start: dk(new Date(y, m, 1)),
        end: dk(new Date(y, m + 1, 0)),
      };
    case "trimestre": {
      const qStart = Math.floor(m / 3) * 3;
      return {
        start: dk(new Date(y, qStart, 1)),
        end: dk(new Date(y, qStart + 3, 0)),
      };
    }
    case "todo":
      return { start: undefined, end: undefined };
    case "custom":
      return { start: undefined, end: undefined };
  }
}

/* ---- Component ---- */

interface Props {
  projects: GanttProject[];
  hoy: Date;
  selectedDate?: Date;
  rangeStart?: string;
  rangeEnd?: string;
  /** Si false, los nombres se muestran como solo lectura. Por defecto true. */
  editable?: boolean;
}

export function GanttMultiProyecto({
  projects,
  hoy,
  selectedDate,
  rangeStart: rsOvr,
  rangeEnd: reOvr,
  editable = true,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rangeMode, setRangeMode] = useState<RangeMode>("trimestre");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const hoyStr = dk(hoy);

  const effectiveRange = useMemo(() => {
    if (rangeMode === "custom" && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    if (rangeMode !== "custom" && selectedDate) {
      return computePresetRange(rangeMode, selectedDate);
    }
    return { start: rsOvr, end: reOvr };
  }, [rangeMode, customStart, customEnd, selectedDate, rsOvr, reOvr]);

  const { weeks, pos, hoyPct } = useMemo(() => {
    // Recolectamos todas las fechas relevantes para dimensionar la rejilla.
    // Antes solo se miraban `fechaInicio`/`fechaLimite` legacy: ahora derivamos
    // el rango efectivo de cada entregable/resultado/proyecto desde los chips
    // (`semanasActivas`, `mesesActivos`, `diasPlanificadosByUser`).
    const dd: string[] = [hoyStr];
    for (const g of projects) {
      if (g.proyecto.fechaInicio) dd.push(g.proyecto.fechaInicio);
      if (g.proyecto.fechaLimite) dd.push(g.proyecto.fechaLimite);
      for (const r of g.resultados) {
        if (r.fechaInicio) dd.push(r.fechaInicio);
        if (r.fechaLimite) dd.push(r.fechaLimite);
        const entsRes = g.entregables.filter((e) => e.resultadoId === r.id);
        const rr = rangoResultadoMapa(r, entsRes);
        if (rr.inicio) dd.push(rr.inicio);
        if (rr.fin) dd.push(rr.fin);
      }
      for (const e of g.entregables) {
        if (e.fechaInicio) dd.push(e.fechaInicio);
        if (e.fechaLimite) dd.push(e.fechaLimite);
        const re = rangoEntregableMapa(e);
        if (re.inicio) dd.push(re.inicio);
        if (re.fin) dd.push(re.fin);
      }
    }
    dd.sort();
    const sStr = effectiveRange.start || dd[0]!;
    const eStr = effectiveRange.end || dd[dd.length - 1]!;
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
  }, [projects, hoyStr, effectiveRange]);

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

  const MODES: RangeMode[] = ["mes", "trimestre", "todo", "custom"];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* Title + range controls */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted">
          Gantt de proyectos
        </h3>

        {/* Range mode selector */}
        <div className="flex gap-0.5 rounded-md bg-background/60 p-0.5">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setRangeMode(m)}
              className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                rangeMode === m
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {rangeMode === "custom" && (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-6 rounded border border-border bg-background px-1.5 text-[10px] text-foreground"
            />
            <span className="text-[10px] text-muted">–</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-6 rounded border border-border bg-background px-1.5 text-[10px] text-foreground"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
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

          {/* ---- Project rows agrupados por área ---- */}
          {groupByArea(projects).map(({ area, label, items }) => (
            <div key={area}>
              <div className="flex items-stretch border-y border-border/40 bg-surface/60">
                <div className="shrink-0 px-3 py-1.5" style={{ width: LABEL_W }}>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <span className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: AREA_COLORS[area]?.hex ?? "#888" }} />
                    {label}
                  </span>
                </div>
                <div className="flex-1" />
              </div>
              {items.map((gp) => (
                <ProjectRow
                  key={gp.proyecto.id}
                  gp={gp}
                  open={expanded.has(gp.proyecto.id)}
                  onToggle={toggle}
                  pos={pos}
                  rango={effectiveRange}
                  editable={editable}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- Agrupación por área ---- */

const AREA_ORDER: Area[] = [
  ...AREAS_EMPRESA.map((a) => a.id),
  ...AREAS_PERSONAL.map((a) => a.id),
] as Area[];

const AREA_LABELS: Record<Area, string> = {
  ...Object.fromEntries(AREAS_EMPRESA.map((a) => [a.id, a.label])),
  ...Object.fromEntries(AREAS_PERSONAL.map((a) => [a.id, a.label])),
} as Record<Area, string>;

function groupByArea(projects: GanttProject[]): { area: Area; label: string; items: GanttProject[] }[] {
  const byArea = new Map<Area, GanttProject[]>();
  for (const gp of projects) {
    const a = gp.proyecto.area as Area;
    if (!byArea.has(a)) byArea.set(a, []);
    byArea.get(a)!.push(gp);
  }
  return AREA_ORDER
    .filter((a) => byArea.has(a))
    .map((a) => ({ area: a, label: AREA_LABELS[a] ?? a, items: byArea.get(a)! }));
}

/* ---- Sub-components ---- */

function ProjectRow({
  gp,
  open,
  onToggle,
  pos,
  rango,
  editable,
}: {
  gp: GanttProject;
  open: boolean;
  onToggle: (id: string) => void;
  pos: (d: string) => number;
  rango: EffectiveRange;
  editable: boolean;
}) {
  const dispatch = useAppDispatch();
  const p = gp.proyecto;
  const hex = AREA_COLORS[p.area]?.hex ?? "#888";

  // Rango efectivo del proyecto: si tiene fechas legacy las respeta; si no,
  // une los rangos efectivos (chips) de todos sus resultados y entregables.
  let infInicio: string | null = null;
  let infFin: string | null = null;
  for (const r of gp.resultados) {
    const entsRes = gp.entregables.filter((e) => e.resultadoId === r.id);
    const rr = rangoResultadoMapa(r, entsRes);
    if (rr.inicio && (!infInicio || rr.inicio < infInicio)) infInicio = rr.inicio;
    if (rr.fin && (!infFin || rr.fin > infFin)) infFin = rr.fin;
  }
  for (const e of gp.entregables) {
    const re = rangoEntregableMapa(e);
    if (re.inicio && (!infInicio || re.inicio < infInicio)) infInicio = re.inicio;
    if (re.fin && (!infFin || re.fin > infFin)) infFin = re.fin;
  }
  const pS = p.fechaInicio || infInicio;
  const pE = p.fechaLimite || infFin;

  // Filtrar entregables/resultados al rango visible (salvo modo "Todo" = sin start/end).
  // El solapamiento se calcula con el rango efectivo (chips), no con
  // fechaInicio/fechaLimite legacy, para que un entregable planificado por
  // semanasActivas o diasPlanificadosByUser sí entre en el Gantt.
  const entregablesFiltrados = useMemo(() => {
    if (!rango.start || !rango.end) return gp.entregables;
    return gp.entregables.filter((e) => {
      const re = rangoEntregableMapa(e);
      return rangesOverlap(re.inicio, re.fin, rango.start, rango.end);
    });
  }, [gp.entregables, rango.start, rango.end]);

  const resultadosFiltrados = useMemo(() => {
    if (!rango.start || !rango.end) return gp.resultados;
    const entIds = new Set(entregablesFiltrados.map((e) => e.resultadoId));
    return gp.resultados.filter((r) => {
      if (entIds.has(r.id)) return true;
      const entsRes = gp.entregables.filter((e) => e.resultadoId === r.id);
      const rr = rangoResultadoMapa(r, entsRes);
      return rangesOverlap(rr.inicio, rr.fin, rango.start, rango.end);
    });
  }, [gp.resultados, gp.entregables, entregablesFiltrados, rango.start, rango.end]);

  const enRango = entregablesFiltrados.length + resultadosFiltrados.length;

  return (
    <div className="border-b border-border/30 last:border-b-0">
      {/* Project bar */}
      <div className="group flex items-stretch transition-colors hover:bg-accent/5">
        <div
          className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-left"
          style={{ width: LABEL_W }}
        >
          <button onClick={() => onToggle(p.id)} className="flex shrink-0 items-center gap-1.5" title={open ? "Contraer" : "Expandir"}>
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
          </button>
          <div className="min-w-0 flex-1">
            <InlineNombre
              value={p.nombre}
              onSave={(nombre) => dispatch({ type: "UPDATE_PROYECTO", id: p.id, changes: { nombre } })}
              disabled={!editable}
              className="truncate text-[11px] font-semibold text-foreground"
              inputClassName="text-[11px] font-semibold text-foreground"
            />
          </div>
        </div>

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

      {/* Expanded: results + deliverables (filtrados por rango) */}
      {open && resultadosFiltrados.length === 0 && (
        <div className="py-2 pl-12 text-[10px] italic text-muted/50">
          Sin elementos en el rango visible.
        </div>
      )}
      {open &&
        resultadosFiltrados.map((r) => (
          <ResultRow
            key={r.id}
            resultado={r}
            entregables={entregablesFiltrados.filter((e) => e.resultadoId === r.id)}
            hex={hex}
            pos={pos}
            editable={editable}
          />
        ))}
      {open && enRango > 0 && rango.start && rango.end && entregablesFiltrados.length < gp.entregables.length && (
        <div className="py-1 pl-12 text-[9px] italic text-muted/40">
          Mostrando {entregablesFiltrados.length} de {gp.entregables.length} entregables (rango visible). Cambia a "Todo" para verlos todos.
        </div>
      )}
    </div>
  );
}

function ResultRow({
  resultado: r,
  entregables,
  hex,
  pos,
  editable,
}: {
  resultado: Resultado;
  entregables: Entregable[];
  hex: string;
  pos: (d: string) => number;
  editable: boolean;
}) {
  const dispatch = useAppDispatch();
  // Rango efectivo del resultado: chips propios > chips de los entregables
  // hijos > fechas legacy. Así el Gantt se alinea con Mapa y Plan Mes.
  const rrEfectivo = rangoResultadoMapa(r, entregables);
  const rS = r.fechaInicio || rrEfectivo.inicio;
  const rF = r.fechaLimite || rrEfectivo.fin;
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
          <div className="min-w-0 flex-1">
            <InlineNombre
              value={r.nombre}
              onSave={(nombre) => dispatch({ type: "UPDATE_RESULTADO", id: r.id, changes: { nombre } })}
              disabled={!editable}
              className="truncate text-[10px] font-medium text-foreground/75"
              inputClassName="text-[10px] font-medium text-foreground"
            />
          </div>
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
                const re = rangoEntregableMapa(e);
                const ed = e.fechaLimite || e.fechaInicio || re.fin || re.inicio;
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
        <EntregableRow key={e.id} entregable={e} pos={pos} editable={editable} />
      ))}
    </>
  );
}

function EntregableRow({
  entregable: e,
  pos,
  editable,
}: {
  entregable: Entregable;
  pos: (d: string) => number;
  editable: boolean;
}) {
  const dispatch = useAppDispatch();
  const re = rangoEntregableMapa(e);
  const eS = e.fechaInicio || re.inicio;
  const eF = e.fechaLimite || re.fin;
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
        <div className="min-w-0 flex-1">
          <InlineNombre
            value={e.nombre}
            onSave={(nombre) => dispatch({ type: "UPDATE_ENTREGABLE", id: e.id, changes: { nombre } })}
            disabled={!editable}
            className={`truncate text-[9px] ${
              e.estado === "hecho"
                ? "text-muted/50 line-through"
                : "text-foreground/60"
            }`}
            inputClassName="text-[9px] text-foreground"
          />
        </div>
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
