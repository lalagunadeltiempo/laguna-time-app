"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useIsMentor } from "@/lib/usuario";
import {
  ambitoDeArea,
  AREA_COLORS,
  AREAS_EMPRESA,
  AREAS_PERSONAL,
  type Area,
  type Ambito,
  type Entregable,
  type Resultado,
  type Proyecto,
  type Objetivo,
} from "@/lib/types";
import { AmbitoToggle } from "./PlanMes";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type AmbitoFilter = "todo" | Ambito;

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
  allEntCount: number;
  activeEntCount: number;
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
  const [filtro, setFiltro] = useState<AmbitoFilter>("todo");
  const [newObjText, setNewObjText] = useState("");
  const [newObjArea, setNewObjArea] = useState<Area | "">("");

  const year = selectedDate.getFullYear();
  const currentQ = Math.floor(selectedDate.getMonth() / 3);
  const qMonths = quarterMonths(currentQ);
  const qPeriodo = periodoQ(currentQ, year);

  function buildProjNode(p: Proyecto): ProjNode {
    const hex = AREA_COLORS[p.area]?.hex ?? "#888";
    const projResults = state.resultados.filter((r) => r.proyectoId === p.id);
    const resNodes: ResNode[] = projResults.map((r) => {
      const ents = state.entregables
        .filter((e) => e.resultadoId === r.id && e.estado !== "hecho" && e.estado !== "cancelada")
        .map((e) => ({ ent: e, hex, projName: p.nombre }));
      return { resultado: r, entregables: ents };
    }).filter((rn) => rn.entregables.length > 0);

    const allEnts = state.entregables.filter((e) => {
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      return res?.proyectoId === p.id;
    });
    const done = allEnts.filter((e) => e.estado === "hecho").length;
    const total = allEnts.length;
    const activeEntCount = allEnts.filter((e) => e.estado !== "hecho" && e.estado !== "cancelada").length;

    return {
      proyecto: p, resultados: resNodes, allEntCount: activeEntCount, activeEntCount,
      done, total, percent: total ? Math.round((done / total) * 100) : 0, hex,
    };
  }

  const { monthData, operations, backlogProjects } = useMemo(() => {
    const monthEnt = new Map<number, EntWithContext[]>();
    const monthProj = new Map<number, ProjNode[]>();
    for (const m of qMonths) { monthEnt.set(m, []); monthProj.set(m, []); }

    const ops: ProjNode[] = [];
    const backlog: ProjNode[] = [];
    const projSeen = new Set<string>();

    for (const p of state.proyectos) {
      if (filtro !== "todo" && ambitoDeArea(p.area) !== filtro) continue;
      const node = buildProjNode(p);

      if (p.tipo === "operacion") {
        if (node.total > 0) ops.push(node);
        for (const rn of node.resultados) {
          for (const ec of rn.entregables) {
            if (!entInQuarter(ec.ent.fechaInicio, qMonths, year) && ec.ent.fechaInicio) continue;
            if (entInQuarter(ec.ent.fechaInicio, qMonths, year)) {
              const m = entMonth(ec.ent.fechaInicio);
              monthEnt.get(m)?.push(ec);
            }
          }
        }
        continue;
      }

      const hasEntInQ = node.resultados.some((rn) =>
        rn.entregables.some((ec) => entInQuarter(ec.ent.fechaInicio, qMonths, year))
      );
      const projInQ = entInQuarter(p.fechaInicio, qMonths, year);

      if (projInQ || hasEntInQ) {
        projSeen.add(p.id);
        if (projInQ) {
          const m = entMonth(p.fechaInicio);
          monthProj.get(m)?.push(node);
        }
        for (const rn of node.resultados) {
          for (const ec of rn.entregables) {
            if (entInQuarter(ec.ent.fechaInicio, qMonths, year)) {
              const m = entMonth(ec.ent.fechaInicio);
              monthEnt.get(m)?.push(ec);
            }
          }
        }
      }

      if (node.activeEntCount > 0) {
        const hasUnplanned = node.resultados.some((rn) =>
          rn.entregables.some((ec) => !entInQuarter(ec.ent.fechaInicio, qMonths, year))
        );
        if (hasUnplanned || !projSeen.has(p.id)) {
          backlog.push(node);
          projSeen.add(p.id);
        }
      }
    }

    const md = new Map<number, { entregables: EntWithContext[]; projects: ProjNode[]; count: number }>();
    for (const m of qMonths) {
      const ents = monthEnt.get(m) ?? [];
      const projs = monthProj.get(m) ?? [];
      md.set(m, { entregables: ents, projects: projs, count: ents.length + projs.reduce((s, pn) => s + pn.activeEntCount, 0) });
    }

    return { monthData: md, operations: ops, backlogProjects: backlog };
  }, [state, filtro, qMonths, year]);

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
        <AmbitoToggle value={filtro} onChange={setFiltro} />
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

      {/* Operaciones */}
      {operations.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Operaciones</h3>
          <div className="flex flex-wrap gap-2">
            {operations.map((pn) => (
              <div key={pn.proyecto.id} className="flex items-center gap-2 rounded-lg border-2 bg-background px-3 py-2" style={{ borderColor: pn.hex + "50" }}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: pn.hex }} />
                <span className="text-sm font-medium text-foreground">{pn.proyecto.nombre}</span>
                <div className="h-2 w-16 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pn.percent}%`, backgroundColor: pn.hex }} />
                </div>
                <span className="text-[10px] font-bold text-muted">{pn.done}/{pn.total}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Roadmap por mes */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Roadmap</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {qMonths.map((m) => {
            const data = monthData.get(m)!;
            return (
              <MonthColumn key={m} month={m} year={year} entregables={data.entregables}
                projects={data.projects} count={data.count}
                qMonths={qMonths} onAssign={assignToMonth} onUnassign={unassignEnt} isMentor={isMentor} />
            );
          })}
        </div>
      </section>

      {/* Backlog */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
          Backlog
          {backlogProjects.length > 0 && <span className="ml-2 text-[10px] font-normal text-muted">({backlogProjects.reduce((s, pn) => s + pn.activeEntCount, 0)} entregables sin planificar)</span>}
        </h3>
        {backlogProjects.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Todo el trabajo está planificado</p>
        ) : (
          <div className="space-y-2">
            {backlogProjects.map((pn) => (
              <BacklogProjectCard key={pn.proyecto.id} node={pn} qMonths={qMonths} onAssign={assignToMonth} isMentor={isMentor} />
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

function MonthColumn({ month, year, entregables, projects, count, qMonths, onAssign, onUnassign, isMentor }: {
  month: number; year: number; entregables: EntWithContext[]; projects: ProjNode[];
  count: number; qMonths: number[];
  onAssign: (id: string, month: number) => void; onUnassign: (id: string) => void; isMentor: boolean;
}) {
  const now = new Date();
  const isCurrent = now.getFullYear() === year && now.getMonth() === month;
  const empty = entregables.length === 0 && projects.length === 0;
  const otherMonths = qMonths.filter((m) => m !== month);
  const overloaded = count > 6;

  return (
    <div className={`rounded-xl border p-3 ${isCurrent ? "border-accent/40 bg-accent/5" : "border-border bg-background"}`}>
      <div className="mb-2 flex items-center justify-center gap-2">
        <h4 className={`text-center text-xs font-bold uppercase ${isCurrent ? "text-accent" : "text-muted"}`}>{MONTHS_ES[month]}</h4>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${overloaded ? "bg-amber-100 text-amber-700" : "bg-surface text-muted"}`}>{count}</span>
      </div>
      {empty ? (
        <p className="py-4 text-center text-xs text-muted">—</p>
      ) : (
        <div className="space-y-1.5">
          {projects.map((pn) => (
            <ExpandableProjectCard key={pn.proyecto.id} node={pn} qMonths={qMonths}
              onAssign={onAssign} onUnassign={onUnassign} isMentor={isMentor} inMonth />
          ))}
          {entregables.map((ec) => (
            <MonthEntregableCard key={ec.ent.id} ec={ec} otherMonths={otherMonths}
              onAssign={onAssign} onUnassign={onUnassign} isMentor={isMentor} />
          ))}
        </div>
      )}
    </div>
  );
}

function MonthEntregableCard({ ec, otherMonths, onAssign, onUnassign, isMentor }: {
  ec: EntWithContext; otherMonths: number[];
  onAssign: (id: string, month: number) => void; onUnassign: (id: string) => void; isMentor: boolean;
}) {
  const [showActions, setShowActions] = useState(false);
  const estadoBadge = ec.ent.estado === "en_proceso" ? "bg-amber-100 text-amber-700"
    : ec.ent.estado === "planificado" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500";

  return (
    <div className="rounded-lg border border-border/60 bg-background p-2">
      <div className="flex items-start gap-1.5">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ec.hex }} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{ec.ent.nombre}</p>
          <p className="truncate text-[10px] text-muted">{ec.projName}</p>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${estadoBadge}`}>{ec.ent.estado.replace("_", " ")}</span>
        {!isMentor && (
          <button onClick={() => setShowActions(!showActions)}
            className="shrink-0 rounded p-0.5 text-muted hover:bg-surface hover:text-foreground" title="Reasignar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
          </button>
        )}
      </div>
      {showActions && !isMentor && (
        <div className="mt-1.5 flex gap-1">
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

function ExpandableProjectCard({ node, qMonths, onAssign, onUnassign, isMentor, inMonth }: {
  node: ProjNode; qMonths: number[];
  onAssign: (id: string, month: number) => void; onUnassign: (id: string) => void;
  isMentor: boolean; inMonth?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border-2 bg-background" style={{ borderColor: node.hex + "50" }}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 p-2 text-left">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: node.hex }} />
        <span className="flex-1 truncate text-xs font-semibold text-foreground">{node.proyecto.nombre}</span>
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
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{rn.resultado.nombre}</p>
              <div className="space-y-1 pl-2">
                {rn.entregables.map((ec) => (
                  <EntregableRow key={ec.ent.id} ec={ec} qMonths={qMonths} onAssign={onAssign} onUnassign={onUnassign} isMentor={isMentor} inMonth={inMonth} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EntregableRow({ ec, qMonths, onAssign, onUnassign, isMentor, inMonth }: {
  ec: EntWithContext; qMonths: number[];
  onAssign: (id: string, month: number) => void; onUnassign: (id: string) => void;
  isMentor: boolean; inMonth?: boolean;
}) {
  const estadoBadge = ec.ent.estado === "en_proceso" ? "bg-amber-100 text-amber-700"
    : ec.ent.estado === "planificado" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500";
  const assignedMonth = entMonth(ec.ent.fechaInicio);
  const isInQ = qMonths.includes(assignedMonth);

  return (
    <div className="flex items-center gap-1.5 rounded bg-surface/50 px-1.5 py-1">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ec.hex }} />
      <span className="flex-1 truncate text-[11px] text-foreground">{ec.ent.nombre}</span>
      <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-bold ${estadoBadge}`}>{ec.ent.estado.replace("_", " ")}</span>
      {isInQ && (
        <span className="shrink-0 rounded bg-accent/10 px-1 py-0.5 text-[8px] font-bold text-accent">{MONTHS_ES[assignedMonth]}</span>
      )}
      {!isMentor && !inMonth && (
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
    </div>
  );
}

function BacklogProjectCard({ node, qMonths, onAssign, isMentor }: {
  node: ProjNode; qMonths: number[];
  onAssign: (id: string, month: number) => void; isMentor: boolean;
}) {
  const [open, setOpen] = useState(false);
  const unplannedCount = node.resultados.reduce((s, rn) =>
    s + rn.entregables.filter((ec) => !entInQuarter(ec.ent.fechaInicio, qMonths, new Date().getFullYear())).length, 0);

  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/20">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: node.hex }} />
        <span className="flex-1 truncate text-sm font-medium text-foreground">{node.proyecto.nombre}</span>
        {node.proyecto.tipo === "operacion" && (
          <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600">OP</span>
        )}
        <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">{unplannedCount} pend.</span>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full transition-all" style={{ width: `${node.percent}%`, backgroundColor: node.hex }} />
          </div>
          <span className="text-[9px] font-bold text-muted">{node.done}/{node.total}</span>
        </div>
      </button>
      {open && (
        <div className="space-y-1 px-3 pb-3">
          {node.resultados.map((rn) => {
            const unplanned = rn.entregables.filter((ec) => !entInQuarter(ec.ent.fechaInicio, qMonths, new Date().getFullYear()));
            if (unplanned.length === 0) return null;
            return (
              <div key={rn.resultado.id}>
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{rn.resultado.nombre}</p>
                <div className="space-y-1 pl-2">
                  {unplanned.map((ec) => (
                    <BacklogEntRow key={ec.ent.id} ec={ec} qMonths={qMonths} onAssign={onAssign} isMentor={isMentor} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BacklogEntRow({ ec, qMonths, onAssign, isMentor }: {
  ec: EntWithContext; qMonths: number[];
  onAssign: (id: string, month: number) => void; isMentor: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-white/50 px-1.5 py-1 dark:bg-surface/30">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ec.hex }} />
      <span className="flex-1 truncate text-[11px] text-foreground">{ec.ent.nombre}</span>
      {!isMentor && (
        <div className="flex shrink-0 gap-0.5">
          {qMonths.map((m) => (
            <button key={m} onClick={() => onAssign(ec.ent.id, m)}
              className="rounded border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted hover:border-accent hover:bg-accent-soft hover:text-accent">
              {MONTHS_ES[m]}
            </button>
          ))}
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
