"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import {
  ambitoDeArea,
  AREA_COLORS,
  AREAS_EMPRESA,
  AREAS_PERSONAL,
  type Area,
  type Entregable,
  type Resultado,
  type Proyecto,
  type Objetivo,
} from "@/lib/types";
import { AmbitoToggle, ResponsableToggle, matchesResponsable, type AmbitoFilter, type ResponsableFilter } from "./PlanMes";
import { projectSOPsForRange, summarizeSOPsByMonth, type SOPMonthSummary } from "@/lib/sop-projector";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface EntWithContext {
  ent: Entregable;
  hex: string;
  projName: string;
}

interface ResNode {
  resultado: Resultado;
  entregables: EntWithContext[];
}

interface ProjNode {
  proyecto: Proyecto;
  resultados: ResNode[];
  entCount: number;
  done: number;
  total: number;
  percent: number;
  hex: string;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

function quarterLabel(q: number, y: number) { return `Q${q + 1} ${y}`; }
function quarterMonths(q: number) { return [q * 3, q * 3 + 1, q * 3 + 2]; }
function periodoQ(q: number, y: number) { return `${y}-Q${q + 1}`; }

function entInQuarter(fechaInicio: string | null, qMonths: number[], year: number): boolean {
  if (!fechaInicio) return false;
  const d = new Date(fechaInicio + "T12:00:00");
  return d.getFullYear() === year && qMonths.includes(d.getMonth());
}

function entMonth(fechaInicio: string | null): number {
  if (!fechaInicio) return -1;
  return new Date(fechaInicio + "T12:00:00").getMonth();
}

interface Props { selectedDate: Date }

export function PlanTrimestre({ selectedDate }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const { nombre: currentUser } = useUsuario();
  const [filtro, setFiltro] = useState<AmbitoFilter>(isMentor ? "empresa" : "todo");
  const [respFilter, setRespFilter] = useState<ResponsableFilter>("todo");
  const [showDone, setShowDone] = useState(true);
  const [newObjText, setNewObjText] = useState("");
  const [newObjArea, setNewObjArea] = useState<Area | "">("");

  const year = selectedDate.getFullYear();
  const currentQ = Math.floor(selectedDate.getMonth() / 3);
  const qMonths = useMemo(() => quarterMonths(currentQ), [currentQ]);
  const qPeriodo = periodoQ(currentQ, year);

  function buildFullProjNode(p: Proyecto): ProjNode {
    const hex = AREA_COLORS[p.area]?.hex ?? "#888";
    const projResults = state.resultados.filter((r) => r.proyectoId === p.id);
    const resNodes: ResNode[] = projResults.map((r) => {
      const ents = state.entregables
        .filter((e) => e.resultadoId === r.id && e.estado !== "cancelada" && (showDone || e.estado !== "hecho")
          && matchesResponsable(e.responsable, respFilter, currentUser))
        .map((e) => ({ ent: e, hex, projName: p.nombre }));
      return { resultado: r, entregables: ents };
    }).filter((rn) => rn.entregables.length > 0 || rn.resultado.fechaInicio);

    const allEnts = state.entregables.filter((e) => {
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      return res?.proyectoId === p.id;
    });
    const done = allEnts.filter((e) => e.estado === "hecho").length;
    const total = allEnts.length;
    const entCount = resNodes.reduce((s, rn) => s + rn.entregables.length, 0);

    return { proyecto: p, resultados: resNodes, entCount, done, total, percent: total ? Math.round((done / total) * 100) : 0, hex };
  }

  const nowMonth = useMemo(() => new Date().getMonth(), []);

  function sliceProjNodeForMonth(node: ProjNode, month: number): ProjNode | null {
    const qStart = new Date(year, qMonths[0], 1).getTime();
    const slicedRes: ResNode[] = node.resultados.map((rn) => ({
      resultado: rn.resultado,
      entregables: rn.entregables.filter((ec) => {
        if (entMonth(ec.ent.fechaInicio) === month) return true;
        if (!ec.ent.fechaInicio && ec.ent.estado === "en_proceso" && month === nowMonth) return true;
        if (ec.ent.estado === "en_proceso" && ec.ent.fechaInicio && month === nowMonth) {
          const fi = new Date(ec.ent.fechaInicio + "T12:00:00").getTime();
          if (fi < qStart) return true;
        }
        return false;
      }),
    })).filter((rn) => rn.entregables.length > 0 || entMonth(rn.resultado.fechaInicio) === month);
    if (slicedRes.length === 0) return null;
    const entCount = slicedRes.reduce((s, rn) => s + rn.entregables.length, 0);
    return { ...node, resultados: slicedRes, entCount };
  }

  function sliceProjNodeBacklog(node: ProjNode): ProjNode | null {
    const qStart = new Date(year, qMonths[0], 1).getTime();
    const slicedRes: ResNode[] = node.resultados.map((rn) => ({
      resultado: rn.resultado,
      entregables: rn.entregables.filter((ec) => {
        if (!ec.ent.fechaInicio && ec.ent.estado === "en_proceso" && qMonths.includes(nowMonth)) return false;
        if (ec.ent.estado === "en_proceso" && ec.ent.fechaInicio) {
          const fi = new Date(ec.ent.fechaInicio + "T12:00:00").getTime();
          if (fi < qStart && qMonths.includes(nowMonth)) return false;
        }
        return !entInQuarter(ec.ent.fechaInicio, qMonths, year);
      }),
    })).filter((rn) => rn.entregables.length > 0
      || (rn.resultado.fechaInicio && !entInQuarter(rn.resultado.fechaInicio, qMonths, year)));
    if (slicedRes.length === 0) return null;
    const entCount = slicedRes.reduce((s, rn) => s + rn.entregables.length, 0);
    return { ...node, resultados: slicedRes, entCount };
  }

  const { monthProjects, operations, backlogProjects } = useMemo(() => {
    const mProj = new Map<number, ProjNode[]>();
    for (const m of qMonths) mProj.set(m, []);
    const ops: ProjNode[] = [];
    const backlog: ProjNode[] = [];

    for (const p of state.proyectos) {
      if (filtro !== "todo" && ambitoDeArea(p.area) !== filtro) continue;
      const fullNode = buildFullProjNode(p);

      if (p.tipo === "operacion") {
        if (fullNode.total > 0) ops.push(fullNode);
        continue;
      }

      for (const m of qMonths) {
        const slice = sliceProjNodeForMonth(fullNode, m);
        if (slice) {
          mProj.get(m)!.push(slice);
        } else if (entInQuarter(p.fechaInicio, [m], year)) {
          mProj.get(m)!.push({ ...fullNode, resultados: [], entCount: 0 });
        }
      }

      if (fullNode.entCount > 0) {
        const backlogSlice = sliceProjNodeBacklog(fullNode);
        if (backlogSlice) backlog.push(backlogSlice);
      }
    }

    return { monthProjects: mProj, operations: ops, backlogProjects: backlog };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, filtro, respFilter, currentUser, showDone, qMonths, year, nowMonth]);

  const sopMonthSummaries = useMemo(() => {
    const qStart = new Date(year, qMonths[0], 1);
    const qEnd = new Date(year, qMonths[2] + 1, 0);
    const sopMap = projectSOPsForRange(state, qStart, qEnd, respFilter === "yo" ? currentUser : respFilter !== "todo" ? respFilter : undefined);
    return summarizeSOPsByMonth(sopMap, qMonths, state.plantillas);
  }, [state, qMonths, year, respFilter, currentUser]);

  const objetivos = useMemo(() => {
    return (state.objetivos ?? []).filter(
      (o) => o.nivel === "trimestre" && o.periodo === qPeriodo,
    );
  }, [state.objetivos, qPeriodo]);

  const allAreas = [...AREAS_EMPRESA, ...AREAS_PERSONAL].filter((a) => filtro === "todo" || ambitoDeArea(a.id) === filtro);

  function assignToMonth(entId: string, month: number) {
    const dateStr = `${year}-${pad(month + 1)}-01`;
    const now = new Date();
    const isCurrent = now.getFullYear() === year && now.getMonth() === month;
    const ent = state.entregables.find((e) => e.id === entId);
    if (!ent) return;
    const newEstado = (ent.estado === "hecho" || ent.estado === "cancelada" || ent.estado === "en_espera")
      ? ent.estado : isCurrent ? "en_proceso" : "planificado";
    dispatch({ type: "UPDATE_ENTREGABLE", id: entId, changes: { fechaInicio: dateStr, planNivel: "mes", estado: newEstado } });
  }

  function unassignEnt(entId: string) {
    dispatch({ type: "UPDATE_ENTREGABLE", id: entId, changes: { fechaInicio: null, planNivel: null, estado: "a_futuro" } });
  }

  function addObjetivo() {
    if (!newObjText.trim()) return;
    dispatch({
      type: "ADD_OBJETIVO",
      payload: {
        id: generateId(),
        texto: newObjText.trim(),
        nivel: "trimestre",
        periodo: qPeriodo,
        area: newObjArea || undefined,
        completado: false,
        creado: new Date().toISOString(),
      },
    });
    setNewObjText("");
    setNewObjArea("");
  }

  return (
    <div className="flex-1 space-y-6 overflow-x-auto">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{quarterLabel(currentQ, year)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-accent" />
            Hechos
          </label>
          {!isMentor && <ResponsableToggle value={respFilter} onChange={setRespFilter} miembros={state.miembros} />}
          {!isMentor && <AmbitoToggle value={filtro} onChange={setFiltro} />}
        </div>
      </div>

      {/* Objetivos */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Objetivos {quarterLabel(currentQ, year)}</h3>
        <div className="space-y-1">
          {objetivos.map((obj) => (
            <ObjetivoRow key={obj.id} obj={obj} isMentor={isMentor} />
          ))}
        </div>
        {!isMentor && (
          <div className="mt-2 flex gap-2">
            <input value={newObjText} onChange={(e) => setNewObjText(e.target.value)}
              placeholder="Nuevo objetivo..."
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && addObjetivo()} />
            <select value={newObjArea} onChange={(e) => setNewObjArea(e.target.value as Area | "")}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground">
              <option value="">Sin área</option>
              {allAreas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <button onClick={addObjetivo} className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80">+</button>
          </div>
        )}
      </section>

      {/* Operaciones (expandibles) */}
      {operations.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Core</h3>
          <div className="space-y-2">
            {operations.map((pn) => (
              <ExpandableProjectCard key={pn.proyecto.id} node={pn} qMonths={qMonths}
                onAssign={assignToMonth} onUnassign={unassignEnt} isMentor={isMentor} />
            ))}
          </div>
        </section>
      )}

      {/* Roadmap por mes */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Roadmap</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {qMonths.map((m) => {
            const projects = monthProjects.get(m) ?? [];
            const count = projects.reduce((s, pn) => s + pn.entCount + pn.resultados.filter(rn => rn.entregables.length === 0).length, 0);
            const sopSum = sopMonthSummaries.find((s) => s.month === m);
            return (
              <MonthColumn key={m} month={m} year={year} projects={projects} count={count}
                qMonths={qMonths} onAssign={assignToMonth} onUnassign={unassignEnt} isMentor={isMentor}
                sopSummary={sopSum} />
            );
          })}
        </div>
      </section>

      {/* Backlog */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
          Backlog
          {backlogProjects.length > 0 && (
            <span className="ml-2 text-[10px] font-normal text-muted">
              ({backlogProjects.reduce((s, pn) => s + pn.entCount, 0)} entregables sin planificar)
            </span>
          )}
        </h3>
        {backlogProjects.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Todo el trabajo está planificado</p>
        ) : (
          <div className="space-y-2">
            {backlogProjects.map((pn) => (
              <ExpandableProjectCard key={pn.proyecto.id} node={pn} qMonths={qMonths}
                onAssign={assignToMonth} onUnassign={unassignEnt} isMentor={isMentor}
                backlogStyle />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ================================================================
   SUB-COMPONENTS
   ================================================================ */

function MonthColumn({ month, year, projects, count, qMonths, onAssign, onUnassign, isMentor, sopSummary }: {
  month: number; year: number; projects: ProjNode[]; count: number; qMonths: number[];
  onAssign: (id: string, month: number) => void; onUnassign: (id: string) => void; isMentor: boolean;
  sopSummary?: SOPMonthSummary;
}) {
  const now = new Date();
  const isCurrent = now.getFullYear() === year && now.getMonth() === month;
  const overloaded = count > 6;
  const [showSops, setShowSops] = useState(false);

  return (
    <div className={`rounded-xl border p-3 ${isCurrent ? "border-accent/40 bg-accent/5" : "border-border bg-background"}`}>
      <div className="mb-2 flex items-center justify-center gap-2">
        <h4 className={`text-center text-xs font-bold uppercase ${isCurrent ? "text-accent" : "text-muted"}`}>{MONTHS_ES[month]}</h4>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${overloaded ? "bg-amber-100 text-amber-700" : "bg-surface text-muted"}`}>{count}</span>
      </div>

      {sopSummary && sopSummary.totalOcurrencias > 0 && (
        <div className="mb-2">
          <button onClick={() => setShowSops(!showSops)}
            className="w-full rounded-lg bg-blue-50 px-2 py-1.5 text-center text-[10px] font-medium text-blue-600 transition-colors hover:bg-blue-100">
            {sopSummary.totalOcurrencias} SOP{sopSummary.totalOcurrencias !== 1 ? "s" : ""} recurrente{sopSummary.totalOcurrencias !== 1 ? "s" : ""}
            {sopSummary.totalMinutos > 0 && ` (~${Math.round(sopSummary.totalMinutos / 60)}h)`}
          </button>
          {showSops && (
            <div className="mt-1 rounded-lg bg-blue-50 p-2">
              {sopSummary.sops.map((s) => (
                <p key={s.nombre} className="text-[10px] text-blue-700">
                  {s.nombre} <span className="text-blue-400">({s.count}×)</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {projects.length === 0 && (!sopSummary || sopSummary.totalOcurrencias === 0) ? (
        <p className="py-4 text-center text-xs text-muted">—</p>
      ) : (
        <div className="space-y-1.5">
          {projects.map((pn) => (
            <ExpandableProjectCard key={pn.proyecto.id} node={pn} qMonths={qMonths}
              onAssign={onAssign} onUnassign={onUnassign} isMentor={isMentor} inMonth={month} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExpandableProjectCard({ node, qMonths, onAssign, onUnassign, isMentor, inMonth, backlogStyle }: {
  node: ProjNode; qMonths: number[];
  onAssign: (id: string, month: number) => void; onUnassign: (id: string) => void;
  isMentor: boolean; inMonth?: number; backlogStyle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isOp = node.proyecto.tipo === "operacion";
  const expandable = node.resultados.length > 0;

  return (
    <div className={backlogStyle
      ? "rounded-xl border border-dashed border-border bg-surface/20"
      : "rounded-lg border-2 bg-background"
    } style={backlogStyle ? undefined : { borderColor: node.hex + "50" }}>
      <button onClick={() => expandable && setOpen(!open)} className={`flex w-full items-center gap-1.5 p-2 text-left ${expandable ? "cursor-pointer" : "cursor-default"}`}>
        {expandable ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        ) : <span className="w-2.5 shrink-0" />}
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: node.hex }} />
        <span className="flex-1 truncate text-xs font-semibold text-foreground">{node.proyecto.nombre}</span>
        {isOp && <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600">Core</span>}
        {backlogStyle && <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">{node.entCount} pend.</span>}
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full transition-all" style={{ width: `${node.percent}%`, backgroundColor: node.hex }} />
          </div>
          <span className="text-[9px] font-bold text-muted">{node.done}/{node.total}</span>
        </div>
      </button>
      {node.proyecto.descripcion && !open && (
        <p className="truncate px-2 pb-1.5 text-[10px] italic text-muted">{node.proyecto.descripcion}</p>
      )}
      {open && (
        <div className="space-y-1 px-2 pb-2">
          {node.resultados.map((rn) => (
            <div key={rn.resultado.id}>
              <div className="mb-0.5 flex items-center gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{rn.resultado.nombre}</p>
                {rn.resultado.fechaInicio && (
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold text-accent">
                    {MONTHS_ES[new Date(rn.resultado.fechaInicio + "T12:00:00").getMonth()]}
                  </span>
                )}
              </div>
              {rn.entregables.length > 0 ? (
                <div className="space-y-1 pl-2">
                  {rn.entregables.map((ec) => (
                    <EntregableRow key={ec.ent.id} ec={ec} qMonths={qMonths}
                      onAssign={onAssign} onUnassign={onUnassign} isMentor={isMentor}
                      currentMonth={inMonth} />
                  ))}
                </div>
              ) : (
                <p className="pl-2 text-[10px] italic text-muted/60">Sin entregables</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EntregableRow({ ec, qMonths, onAssign, onUnassign, isMentor, currentMonth }: {
  ec: EntWithContext; qMonths: number[];
  onAssign: (id: string, month: number) => void; onUnassign: (id: string) => void;
  isMentor: boolean; currentMonth?: number;
}) {
  const [showActions, setShowActions] = useState(false);
  const isDone = ec.ent.estado === "hecho";
  const estadoBadge = isDone ? "bg-green-100 text-green-700"
    : ec.ent.estado === "en_proceso" ? "bg-amber-100 text-amber-700"
    : ec.ent.estado === "planificado" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500";
  const assignedMonth = entMonth(ec.ent.fechaInicio);
  const isInQ = qMonths.includes(assignedMonth);
  const otherMonths = qMonths.filter((m) => m !== assignedMonth);

  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded bg-surface/50 px-1.5 py-1${isDone ? " opacity-50" : ""}`}>
      {isDone
        ? <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-green-500 text-[7px] text-white">✓</span>
        : <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ec.hex }} />}
      <span className={`flex-1 truncate text-[11px] ${isDone ? "text-muted line-through" : "text-foreground"}`}>{ec.ent.nombre}</span>
      <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-bold ${estadoBadge}`}>{isDone ? "hecho" : ec.ent.estado.replace("_", " ")}</span>
      {isInQ && currentMonth == null && (
        <span className="shrink-0 rounded bg-accent/10 px-1 py-0.5 text-[8px] font-bold text-accent">{MONTHS_ES[assignedMonth]}</span>
      )}
      {!isMentor && currentMonth != null && (
        <button onClick={() => setShowActions(!showActions)}
          className="shrink-0 rounded p-0.5 text-muted hover:bg-surface hover:text-foreground" title="Reasignar">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
        </button>
      )}
      {!isMentor && currentMonth == null && (
        <div className="flex shrink-0 gap-0.5">
          {qMonths.map((m) => (
            <button key={m} onClick={() => onAssign(ec.ent.id, m)}
              className={`rounded px-1 py-0.5 text-[8px] font-medium transition-colors ${
                m === assignedMonth ? "bg-accent text-white" : "border border-border text-muted hover:border-accent hover:text-accent"
              }`}>
              {MONTHS_ES[m]}
            </button>
          ))}
        </div>
      )}
      {showActions && currentMonth != null && (
        <div className="flex w-full gap-1 pt-0.5">
          {otherMonths.map((m) => (
            <button key={m} onClick={() => { onAssign(ec.ent.id, m); setShowActions(false); }}
              className="flex-1 rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted hover:border-accent hover:bg-accent-soft hover:text-accent">
              {MONTHS_ES[m]}
            </button>
          ))}
          <button onClick={() => { onUnassign(ec.ent.id); setShowActions(false); }}
            className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:border-red-400 hover:bg-red-50 hover:text-red-600">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function ObjetivoRow({ obj, isMentor }: { obj: Objetivo; isMentor: boolean }) {
  const dispatch = useAppDispatch();
  const hex = obj.area ? (AREA_COLORS[obj.area]?.hex ?? "#888") : "#888";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-1.5">
      {!isMentor && (
        <input type="checkbox" checked={obj.completado}
          onChange={() => dispatch({ type: "UPDATE_OBJETIVO", id: obj.id, changes: { completado: !obj.completado } })}
          className="h-4 w-4 shrink-0 rounded accent-accent" />
      )}
      {obj.area && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />}
      <span className={`flex-1 text-sm ${obj.completado ? "text-muted line-through" : "text-foreground"}`}>{obj.texto}</span>
      {!isMentor && (
        <button onClick={() => dispatch({ type: "DELETE_OBJETIVO", id: obj.id })}
          className="text-xs text-muted hover:text-red-500">✕</button>
      )}
    </div>
  );
}
