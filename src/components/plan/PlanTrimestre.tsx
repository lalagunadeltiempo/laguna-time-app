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
  type Objetivo,
} from "@/lib/types";
import { AmbitoToggle } from "./PlanMes";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type AmbitoFilter = "todo" | Ambito;

function pad(n: number) { return String(n).padStart(2, "0"); }

function quarterLabel(q: number, y: number) { return `Q${q + 1} ${y}`; }
function quarterMonths(q: number) { return [q * 3, q * 3 + 1, q * 3 + 2]; }
function periodoQ(q: number, y: number) { return `${y}-Q${q + 1}`; }

function entInQuarter(ent: Entregable, qMonths: number[], year: number): boolean {
  if (!ent.fechaInicio) return false;
  const d = new Date(ent.fechaInicio + "T12:00:00");
  return d.getFullYear() === year && qMonths.includes(d.getMonth());
}

function entMonth(ent: Entregable): number {
  if (!ent.fechaInicio) return -1;
  return new Date(ent.fechaInicio + "T12:00:00").getMonth();
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

  const entregables = useMemo(() => {
    const filtered = state.entregables.filter((e) => {
      if (e.estado === "hecho" || e.estado === "cancelada") return false;
      if (!entInQuarter(e, qMonths, year)) return false;
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : null;
      if (filtro !== "todo" && proj && ambitoDeArea(proj.area) !== filtro) return false;
      return true;
    });
    return filtered;
  }, [state, qMonths, year, filtro]);

  const { byMonth, unassigned } = useMemo(() => {
    const byMonth = new Map<number, Entregable[]>();
    for (const m of qMonths) byMonth.set(m, []);
    const unassigned: Entregable[] = [];
    for (const ent of entregables) {
      if (ent.planNivel === "trimestre") {
        unassigned.push(ent);
      } else {
        const m = entMonth(ent);
        if (byMonth.has(m)) byMonth.get(m)!.push(ent);
        else unassigned.push(ent);
      }
    }
    return { byMonth, unassigned };
  }, [entregables, qMonths]);

  const projects = useMemo(() => {
    return state.proyectos.filter((p) => {
      if (filtro !== "todo" && ambitoDeArea(p.area) !== filtro) return false;
      const entregs = state.entregables.filter((e) => {
        const res = state.resultados.find((r) => r.id === e.resultadoId);
        return res?.proyectoId === p.id;
      });
      return entregs.some((e) => entInQuarter(e, qMonths, year))
        || (!!p.fechaInicio && entInQuarter({ fechaInicio: p.fechaInicio } as Entregable, qMonths, year));
    }).map((p) => {
      const allEntregs = state.entregables.filter((e) => {
        const res = state.resultados.find((r) => r.id === e.resultadoId);
        return res?.proyectoId === p.id;
      });
      const done = allEntregs.filter((e) => e.estado === "hecho").length;
      const total = allEntregs.length;
      return { ...p, done, total, percent: total ? Math.round((done / total) * 100) : 0 };
    });
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

      {/* Objetivos del trimestre */}
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

      {/* Columnas de meses + sin asignar */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Entregables</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {qMonths.map((m) => (
            <MonthColumn key={m} month={m} year={year} items={byMonth.get(m) ?? []} onAssign={assignToMonth} isMentor={isMentor} />
          ))}
          <div className="rounded-xl border border-dashed border-border bg-surface/30 p-3">
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">Sin asignar</h4>
            {unassigned.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">—</p>
            ) : (
              <div className="space-y-1.5">
                {unassigned.map((ent) => (
                  <EntregableCard key={ent.id} ent={ent} months={qMonths} onAssign={assignToMonth} isMentor={isMentor} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Proyectos activos */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Proyectos activos</h3>
        {projects.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Sin proyectos activos en este trimestre</p>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => {
              const hex = AREA_COLORS[p.area]?.hex ?? "#888";
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
                  <span className="flex-1 truncate text-sm font-medium text-foreground">{p.nombre}</span>
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full transition-all" style={{ width: `${p.percent}%`, backgroundColor: hex }} />
                  </div>
                  <span className="w-10 text-right text-xs font-bold text-muted">{p.percent}%</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- sub-components ---------- */

function MonthColumn({ month, year, items, onAssign, isMentor }: {
  month: number; year: number; items: Entregable[]; onAssign: (id: string, month: number) => void; isMentor: boolean;
}) {
  const now = new Date();
  const isCurrent = now.getFullYear() === year && now.getMonth() === month;
  return (
    <div className={`rounded-xl border p-3 ${isCurrent ? "border-accent/40 bg-accent/5" : "border-border bg-background"}`}>
      <h4 className={`mb-2 text-center text-xs font-bold uppercase ${isCurrent ? "text-accent" : "text-muted"}`}>{MONTHS_ES[month]}</h4>
      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">—</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((ent) => (
            <EntregableCard key={ent.id} ent={ent} months={[]} onAssign={onAssign} isMentor={isMentor} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntregableCard({ ent, months, onAssign, isMentor }: {
  ent: Entregable; months: number[]; onAssign: (id: string, month: number) => void; isMentor: boolean;
}) {
  const state = useAppState();
  const res = state.resultados.find((r) => r.id === ent.resultadoId);
  const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : null;
  const hex = proj ? (AREA_COLORS[proj.area]?.hex ?? "#888") : "#888";
  const estadoBadge = ent.estado === "en_proceso" ? "bg-amber-100 text-amber-700" : ent.estado === "planificado" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500";

  return (
    <div className="rounded-lg border border-border/60 bg-background p-2">
      <div className="flex items-start gap-1.5">
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{ent.nombre}</p>
          {proj && <p className="truncate text-[10px] text-muted">{proj.nombre}</p>}
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${estadoBadge}`}>{ent.estado.replace("_", " ")}</span>
      </div>
      {!isMentor && months.length > 0 && (
        <div className="mt-1.5 flex gap-1">
          {months.map((m) => (
            <button key={m} onClick={() => onAssign(ent.id, m)}
              className="flex-1 rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted hover:border-accent hover:bg-accent-soft hover:text-accent">
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
