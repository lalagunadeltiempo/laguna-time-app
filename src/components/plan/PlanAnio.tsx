"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useIsMentor } from "@/lib/usuario";
import {
  AREAS_PERSONAL,
  AREAS_EMPRESA,
  AREA_COLORS,
  ambitoDeArea,
  type Area,
  type Objetivo,
  type Proyecto,
} from "@/lib/types";
import { mesesDeTrimestre } from "@/lib/semana-utils";
import { AmbitoToggle, type AmbitoFilter } from "./PlanMes";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface ProjectRoad {
  proyecto: Proyecto;
  startMonth: number;
  endMonth: number;
  percent: number;
  total: number;
  done: number;
}

interface Props { selectedDate: Date }

export function PlanAnio({ selectedDate }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const [filtro, setFiltro] = useState<AmbitoFilter>("empresa");
  const [newObjText, setNewObjText] = useState("");
  const [newObjArea, setNewObjArea] = useState<Area | "">("");

  const year = selectedDate.getFullYear();
  const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() : -1;
  const periodo = String(year);

  const allAreas = useMemo(() => {
    const areas = [...AREAS_EMPRESA, ...AREAS_PERSONAL];
    return filtro === "todo" ? areas : areas.filter((a) => ambitoDeArea(a.id) === filtro);
  }, [filtro]);

  const objetivos = useMemo(() => {
    return (state.objetivos ?? []).filter((o) => o.nivel === "anio" && o.periodo === periodo);
  }, [state.objetivos, periodo]);

  const areaSummaries = useMemo(() => {
    return allAreas.map(({ id, label }) => {
      const projs = state.proyectos.filter((p) => p.area === id);
      const results = state.resultados.filter((r) => projs.some((p) => p.id === r.proyectoId));
      const entregs = state.entregables.filter((e) => results.some((r) => r.id === e.resultadoId) && e.estado !== "cancelada");
      const completados = entregs.filter((e) => e.estado === "hecho").length;
      const enProceso = entregs.filter((e) => e.estado === "en_proceso" || e.estado === "planificado").length;
      const total = entregs.length;
      return { area: id as Area, label, total, completados, enProceso, sinEmpezar: total - completados - enProceso, percent: total > 0 ? Math.round((completados / total) * 100) : 0 };
    });
  }, [state, allAreas]);

  // Calcula los meses (0..11) que el proyecto tiene activos en este año,
  // a partir de trimestresActivos y mesesActivos. Devuelve null si no hay actividad
  // planificada en este año.
  function mesesDelAnio(proj: Proyecto, anio: number): number[] {
    const set = new Set<number>();
    const yearPrefix = `${anio}-`;
    for (const t of proj.trimestresActivos ?? []) {
      if (!t.startsWith(yearPrefix)) continue;
      for (const m of mesesDeTrimestre(t)) {
        const mm = parseInt(m.slice(5, 7), 10);
        if (Number.isFinite(mm)) set.add(mm - 1);
      }
    }
    for (const m of proj.mesesActivos ?? []) {
      if (!m.startsWith(yearPrefix)) continue;
      const mm = parseInt(m.slice(5, 7), 10);
      if (Number.isFinite(mm)) set.add(mm - 1);
    }
    return [...set].sort((a, b) => a - b);
  }

  const roadmap = useMemo(() => {
    const items: ProjectRoad[] = [];
    for (const proj of state.proyectos) {
      if (filtro !== "todo" && ambitoDeArea(proj.area) !== filtro) continue;
      const results = state.resultados.filter((r) => r.proyectoId === proj.id);
      const entregs = state.entregables.filter((e) => results.some((r) => r.id === e.resultadoId) && e.estado !== "cancelada");

      const done = entregs.filter((e) => e.estado === "hecho").length;
      const total = entregs.length;
      const percent = total > 0 ? Math.round((done / total) * 100) : 0;

      const mesesAnio = mesesDelAnio(proj, year);
      if (mesesAnio.length === 0) continue;
      const startMonth = mesesAnio[0];
      const endMonth = mesesAnio[mesesAnio.length - 1];

      items.push({ proyecto: proj, startMonth, endMonth, percent, total, done });
    }
    return items.sort((a, b) => a.startMonth - b.startMonth);
  }, [state, filtro, year]);

  const totalEntregables = areaSummaries.reduce((s, a) => s + a.total, 0);
  const totalCompletados = areaSummaries.reduce((s, a) => s + a.completados, 0);
  const globalPercent = totalEntregables > 0 ? Math.round((totalCompletados / totalEntregables) * 100) : 0;

  function addObjetivo() {
    if (!newObjText.trim()) return;
    dispatch({
      type: "ADD_OBJETIVO",
      payload: {
        id: generateId(),
        texto: newObjText.trim(),
        nivel: "anio",
        periodo,
        area: newObjArea || undefined,
        completado: false,
        creado: new Date().toISOString(),
      },
    });
    setNewObjText("");
    setNewObjArea("");
  }

  function toggleProjectQuarter(projId: string, q: number) {
    dispatch({ type: "TOGGLE_PROYECTO_TRIMESTRE", id: projId, trimestre: `${year}-Q${q + 1}` });
  }

  const areaHex = (a: Area) => AREA_COLORS[a]?.hex ?? "#888";

  const [editingMtp, setEditingMtp] = useState(false);
  const [mtpDraft, setMtpDraft] = useState(state.mtp ?? "");

  function saveMtp() {
    dispatch({ type: "SET_MTP", mtp: mtpDraft.trim() });
    setEditingMtp(false);
  }

  return (
    <div className="flex-1 space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{year} · Visión anual</p>
        {!isMentor && <AmbitoToggle value={filtro} onChange={setFiltro} />}
      </div>

      {/* MTP */}
      <section className="rounded-2xl border-2 border-accent/20 bg-gradient-to-br from-accent/5 to-transparent p-6">
        <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-accent/60">Propósito Transformador Masivo</h3>
        {editingMtp && !isMentor ? (
          <div className="space-y-2">
            <textarea
              value={mtpDraft}
              onChange={(e) => setMtpDraft(e.target.value)}
              placeholder="Define tu Propósito Transformador Masivo..."
              rows={2}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveMtp(); } }}
              className="w-full resize-none rounded-lg border border-accent/30 bg-background px-4 py-3 text-lg font-semibold text-foreground placeholder:text-muted/40 focus:border-accent focus:outline-none"
            />
            <div className="flex gap-2">
              <button onClick={saveMtp} className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent/80">Guardar</button>
              <button onClick={() => { setEditingMtp(false); setMtpDraft(state.mtp ?? ""); }} className="rounded-lg border border-border px-4 py-1.5 text-xs text-muted hover:bg-surface">Cancelar</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { if (!isMentor) { setMtpDraft(state.mtp ?? ""); setEditingMtp(true); } }}
            className={`w-full text-left ${isMentor ? "cursor-default" : "cursor-pointer"}`}
          >
            {state.mtp ? (
              <p className="text-xl font-bold leading-relaxed text-foreground">{state.mtp}</p>
            ) : (
              <p className="text-lg italic text-muted/40">{isMentor ? "Sin MTP definido" : "Define tu Propósito Transformador Masivo..."}</p>
            )}
          </button>
        )}
      </section>

      {/* Objetivos anuales */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Objetivos {year}</h3>
        <div className="space-y-1">
          {objetivos.map((obj) => (
            <ObjetivoRow key={obj.id} obj={obj} isMentor={isMentor} />
          ))}
        </div>
        {!isMentor && (
          <div className="mt-2 flex gap-2">
            <input value={newObjText} onChange={(e) => setNewObjText(e.target.value)}
              placeholder="Nuevo objetivo anual..."
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

      {/* Progreso global */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-sm text-muted">Progreso global</p>
            <p className="text-4xl font-bold text-foreground">{globalPercent}%</p>
          </div>
          <div className="text-right text-xs text-muted">
            <p>{totalCompletados} de {totalEntregables} entregables</p>
            <p>{roadmap.length} proyectos</p>
          </div>
        </div>
        <div className="h-3 rounded-full bg-border">
          <div className="h-3 rounded-full bg-accent transition-all" style={{ width: `${globalPercent}%` }} />
        </div>
      </section>

      {/* Por área */}
      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Por área</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {areaSummaries.map((a) => {
            const c = AREA_COLORS[a.area];
            return (
              <div key={a.area} className="rounded-xl border border-border bg-background p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white ${c.dot}`}>{c.initial}</span>
                  <span className="text-sm font-semibold text-foreground">{a.label}</span>
                  <span className="ml-auto text-sm font-bold text-foreground">{a.percent}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${a.percent}%`, backgroundColor: areaHex(a.area) }} />
                </div>
                <div className="mt-2 flex gap-3 text-xs text-muted">
                  <span>{a.completados} hechos</span>
                  <span>{a.enProceso} activos</span>
                  <span>{a.sinEmpezar} pend.</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Roadmap */}
      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Roadmap</h3>
        <div className="mb-2 grid grid-cols-6 gap-px sm:grid-cols-12">
          {MONTHS_ES.map((m, i) => (
            <div key={i} className={`rounded-lg px-1 py-1.5 text-center text-[10px] font-medium ${i === currentMonth ? "bg-accent text-white" : "bg-surface text-muted"}`}>{m}</div>
          ))}
        </div>

        {(() => {
          return (
            <>
              {roadmap.length === 0 && (
                <p className="py-8 text-center text-sm text-muted">Sin proyectos activos</p>
              )}
              {roadmap.length > 0 && (
                <div className="space-y-1.5">
                  {roadmap.map((r) => {
                    const hex = areaHex(r.proyecto.area);
                    const span = r.endMonth - r.startMonth + 1;
                    return (
                      <div key={r.proyecto.id} className="group flex items-center gap-2">
                        <div className="w-28 shrink-0 truncate text-right text-xs font-medium text-foreground">{r.proyecto.nombre}</div>
                        <div className="relative flex-1">
                          <div className="grid h-7 grid-cols-12 gap-px rounded-lg bg-surface">
                            {Array.from({ length: 12 }, (_, i) => <div key={i} className="h-7 border-r border-border/30 last:border-r-0" />)}
                          </div>
                          <div className="absolute top-0 flex h-7 items-center overflow-hidden rounded-lg px-1.5"
                            style={{
                              left: `${(r.startMonth / 12) * 100}%`,
                              width: `${(span / 12) * 100}%`,
                              backgroundColor: hex + "20",
                              border: `1px solid ${hex}`,
                            }}>
                            <div className="h-full rounded-lg opacity-30" style={{ width: `${r.percent}%`, backgroundColor: hex }} />
                            <span className="absolute right-1.5 text-[10px] font-bold text-foreground">{r.percent}%</span>
                          </div>
                        </div>
                        {!isMentor && (() => {
                          const activos = new Set(r.proyecto.trimestresActivos ?? []);
                          return (
                            <div className="hidden gap-0.5 group-hover:flex">
                              {[0, 1, 2, 3].map((q) => {
                                const key = `${year}-Q${q + 1}`;
                                const active = activos.has(key);
                                return (
                                  <button key={q} onClick={() => toggleProjectQuarter(r.proyecto.id, q)}
                                    className={`rounded border px-1 py-0.5 text-[9px] transition-colors ${active ? "border-accent bg-accent text-white" : "border-border text-muted hover:border-accent hover:text-accent"}`}
                                    title={`${active ? "Quitar" : "Activar"} Q${q + 1} ${year}`}>
                                    Q{q + 1}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </section>
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
