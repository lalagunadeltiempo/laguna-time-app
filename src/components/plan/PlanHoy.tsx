"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import {
  AREA_COLORS, AREAS_PERSONAL, AREAS_EMPRESA, ambitoDeArea,
  type Area, type Entregable, type Ambito,
} from "@/lib/types";
import { projectSOPsForDate, type ProjectedSOP } from "@/lib/sop-projector";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Block {
  id: string;
  type: "active" | "done" | "programado" | "sop";
  area: Area;
  title: string;
  subtitle: string;
  hour: number;
  entregableId?: string;
  pasoId?: string;
}

interface Props {
  selectedDate: Date;
}

export function PlanHoy({ selectedDate }: Props) {
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [confirmBlock, setConfirmBlock] = useState<Block | null>(null);
  const [confirmSOP, setConfirmSOP] = useState<ProjectedSOP | null>(null);
  const [showDrillDown, setShowDrillDown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  useEffect(() => {
    const id = setInterval(() => {
      const k = toDateKey(new Date());
      setTodayKey((prev) => (prev !== k ? k : prev));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const isToday = dateKey === todayKey;
  const isPast = dateKey < todayKey;

  useEffect(() => {
    if (isToday && scrollRef.current) {
      const nowHour = new Date().getHours();
      const row = scrollRef.current.querySelector(`[data-hour="${nowHour}"]`);
      if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [isToday, dateKey]);

  const allBlocks = useMemo(() => {
    const { pasos, entregables, resultados, proyectos, pasosActivos } = state;
    const result: Block[] = [];
    const entregableIdsWithPasos = new Set<string>();

    for (const paso of pasos) {
      if (!paso.inicioTs) continue;
      const pDate = paso.inicioTs.slice(0, 10);
      if (pDate !== dateKey) continue;

      const ent = entregables.find((e) => e.id === paso.entregableId);
      if (!ent) continue;
      if (ent.responsable && ent.responsable !== currentUser) continue;
      entregableIdsWithPasos.add(ent.id);
      const res = ent ? resultados.find((r) => r.id === ent.resultadoId) : undefined;
      const proj = res ? proyectos.find((pr) => pr.id === res.proyectoId) : undefined;
      const hour = new Date(paso.inicioTs).getHours();

      const isDone = !!paso.finTs;
      const isActive = !isDone && pasosActivos.includes(paso.id);

      result.push({
        id: paso.id,
        type: isDone ? "done" : isActive ? "active" : "programado",
        area: proj?.area ?? "operativa",
        title: paso.nombre,
        subtitle: `${proj?.nombre ?? ""} · ${ent.nombre}`,
        hour,
        entregableId: ent.id,
        pasoId: paso.id,
      });
    }

    if (isToday || !isPast) {
      for (const paso of pasos) {
        if (!paso.finTs || !paso.siguientePaso) continue;
        if (paso.siguientePaso.tipo !== "continuar") continue;
        let fp = paso.siguientePaso.fechaProgramada;
        if (!fp) continue;
        if (fp === "manana") {
          const finDate = new Date(paso.finTs);
          finDate.setDate(finDate.getDate() + 1);
          fp = toDateKey(finDate);
        }
        if (fp !== dateKey) continue;
        if (result.some((b) => b.id === `next-${paso.id}`)) continue;

        const ent = entregables.find((e) => e.id === paso.entregableId);
        if (!ent) continue;
        if (ent.responsable && ent.responsable !== currentUser) continue;
        entregableIdsWithPasos.add(ent.id);
        const res = ent ? resultados.find((r) => r.id === ent.resultadoId) : undefined;
        const proj = res ? proyectos.find((pr) => pr.id === res.proyectoId) : undefined;

        result.push({
          id: `next-${paso.id}`,
          type: "programado",
          area: proj?.area ?? "operativa",
          title: paso.siguientePaso.nombre ?? paso.nombre,
          subtitle: `${proj?.nombre ?? ""} · ${ent.nombre}`,
          hour: -1,
          entregableId: ent.id,
          pasoId: paso.id,
        });
      }

      for (const ent of entregables) {
        if (ent.fechaInicio !== dateKey) continue;
        if (ent.estado === "hecho" || ent.estado === "cancelada") continue;
        if (entregableIdsWithPasos.has(ent.id)) continue;
        if (ent.responsable && ent.responsable !== currentUser) continue;
        const res = resultados.find((r) => r.id === ent.resultadoId);
        const proj = res ? proyectos.find((pr) => pr.id === res.proyectoId) : undefined;
        result.push({
          id: `ent-${ent.id}`,
          type: "programado",
          area: proj?.area ?? "operativa",
          title: ent.nombre,
          subtitle: `${proj?.nombre ?? ""}`,
          hour: -1,
          entregableId: ent.id,
        });
      }
    }

    return result;
  }, [state.pasos, state.entregables, state.resultados, state.proyectos, state.pasosActivos, dateKey, isToday, isPast, currentUser]);

  const plannedBlocks = useMemo(() => allBlocks.filter((b) => b.type === "programado"), [allBlocks]);
  const executedBlocks = useMemo(() => allBlocks.filter((b) => b.type === "active" || b.type === "done"), [allBlocks]);

  const projectedSOPs = useMemo(() => projectSOPsForDate(state, selectedDate, currentUser), [state, selectedDate, currentUser]);
  const virtualSOPs = useMemo(() => {
    return projectedSOPs.filter((sop) => !state.entregables.some(
      (e) => e.tipo === "sop" && e.plantillaId === sop.plantillaId && e.fechaInicio === dateKey
    ));
  }, [projectedSOPs, state.entregables, dateKey]);

  function startBlock(block: Block) {
    if (!block.entregableId) return;
    dispatch({
      type: "START_PASO",
      payload: {
        id: generateId(),
        entregableId: block.entregableId,
        nombre: block.title,
        inicioTs: new Date().toISOString(),
        finTs: null, estado: "",
        contexto: { urls: [], apps: [], notas: "" },
        implicados: [{ tipo: "equipo", nombre: currentUser }],
        pausas: [], siguientePaso: null,
      },
    });
    setConfirmBlock(null);
  }

  function materializeSOP(sop: ProjectedSOP) {
    const plantilla = state.plantillas.find((pl) => pl.id === sop.plantillaId);
    if (!plantilla) return;

    let resultadoId: string | null = null;
    if (plantilla.proyectoId) {
      const existingRes = state.resultados.find((r) => r.proyectoId === plantilla.proyectoId);
      resultadoId = existingRes?.id ?? null;
      if (!resultadoId) {
        const newResId = generateId();
        dispatch({ type: "ADD_RESULTADO", payload: { id: newResId, nombre: "Procesos", descripcion: null, proyectoId: plantilla.proyectoId, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null } });
        resultadoId = newResId;
      }
    } else {
      const firstProj = state.proyectos.find((p) => p.area === sop.area);
      if (firstProj) {
        const existingRes = state.resultados.find((r) => r.proyectoId === firstProj.id);
        resultadoId = existingRes?.id ?? null;
        if (!resultadoId) {
          const newResId = generateId();
          dispatch({ type: "ADD_RESULTADO", payload: { id: newResId, nombre: "Procesos", descripcion: null, proyectoId: firstProj.id, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null } });
          resultadoId = newResId;
        }
      }
    }
    if (!resultadoId) { setConfirmSOP(null); return; }

    const entId = generateId();
    dispatch({ type: "ADD_ENTREGABLE", payload: {
      id: entId, nombre: sop.nombre, resultadoId,
      tipo: "sop" as const, plantillaId: sop.plantillaId,
      diasEstimados: sop.pasosTotal, diasHechos: 0,
      esDiaria: false, responsable: sop.responsable,
      estado: "en_proceso" as const, creado: new Date().toISOString(),
      semana: null, fechaLimite: null, fechaInicio: dateKey,
    }});

    const firstStep = plantilla.pasos[0];
    if (firstStep) {
      dispatch({ type: "START_PASO", payload: {
        id: generateId(), entregableId: entId,
        nombre: firstStep.nombre,
        inicioTs: new Date().toISOString(), finTs: null, estado: "",
        contexto: { urls: [], apps: [], notas: "" },
        implicados: [{ tipo: "equipo", nombre: currentUser }],
        pausas: [], siguientePaso: null,
      }});
    }
    setConfirmSOP(null);
  }

  const hasPlanned = plannedBlocks.length > 0 || virtualSOPs.length > 0;

  return (
    <div className="flex-1 space-y-4">

      {/* PLANIFICADOS PARA HOY — arriba del horario */}
      {(isToday || !isPast) && (
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Planificados para hoy</h3>
            {!isMentor && (
              <button onClick={() => setShowDrillDown(true)}
                className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Añadir
              </button>
            )}
          </div>

          {!hasPlanned && <p className="py-3 text-center text-xs text-muted">Nada planificado. Usa el botón + para añadir.</p>}

          <div className="space-y-1.5">
            {plannedBlocks.map((block) => {
              const hex = AREA_COLORS[block.area]?.hex ?? "#888";
              return (
                <div key={block.id} className="flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5"
                  style={{ borderLeftColor: hex, backgroundColor: hex + "0c" }}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{block.title}</p>
                    <p className="truncate text-xs text-muted">{block.subtitle}</p>
                  </div>
                  {isToday && !isMentor && (
                    <button onClick={() => setConfirmBlock(block)}
                      className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white hover:brightness-110"
                      style={{ backgroundColor: hex }}>
                      Empezar
                    </button>
                  )}
                </div>
              );
            })}

            {virtualSOPs.map((sop) => {
              const sopHex = AREA_COLORS[sop.area]?.hex ?? "#888";
              return (
                <button key={sop.plantillaId} type="button" onClick={() => setConfirmSOP(sop)}
                  className="flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-left transition-all hover:brightness-95"
                  style={{ borderColor: sopHex + "40", backgroundColor: sopHex + "0c" }}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sopHex }} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{sop.nombre}</p>
                    <p className="truncate text-xs text-muted">{sop.pasosTotal}p · SOP · {sop.responsable}</p>
                  </div>
                  <span className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: sopHex + "15", color: sopHex }}>SOP</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* HORARIO — solo pasos en ejecución */}
      <div ref={scrollRef} className="relative max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-background">
        <h3 className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted backdrop-blur-sm">
          Horario
        </h3>
        {HOURS.map((hour) => {
          const hourBlocks = executedBlocks.filter((b) => b.hour === hour);
          return (
            <div key={hour} data-hour={hour} className="relative flex min-h-[44px] border-b border-border/50 last:border-b-0">
              <div className="flex w-14 shrink-0 items-start justify-end pr-3 pt-1">
                <span className="text-xs font-medium text-muted">{String(hour).padStart(2, "0")}:00</span>
              </div>
              <div className="flex-1 px-2 py-1">
                {hourBlocks.map((block) => {
                  const color = AREA_COLORS[block.area]?.hex ?? "#888";
                  return (
                    <div key={block.id} className="mb-1 rounded-lg border-l-[3px] px-3 py-2"
                      style={{ borderLeftColor: color, backgroundColor: color + "0c" }}>
                      <div className="flex items-center gap-2">
                        {block.type === "active" && (
                          <span className="relative flex h-2 w-2" aria-hidden="true">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: "#4ade80" }} />
                            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "#22c55e" }} />
                          </span>
                        )}
                        {block.type === "done" && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                        )}
                        <span className={`text-sm font-medium ${block.type === "done" ? "text-muted line-through" : "text-foreground"}`}>{block.title}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{block.subtitle}</p>
                    </div>
                  );
                })}
                {hourBlocks.length === 0 && (
                  <div className="flex h-full min-h-[28px] items-center px-3">
                    <span className="text-xs text-muted/20">·</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drill-down dialog */}
      {showDrillDown && <DrillDownDialog dateKey={dateKey} onClose={() => setShowDrillDown(false)} />}

      {/* Confirm SOP */}
      {confirmSOP && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
          role="dialog" aria-modal="true" tabIndex={-1} ref={(el) => el?.focus()}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmSOP(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") setConfirmSOP(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">Iniciar SOP</h3>
            <p className="mt-1 text-xs text-muted">{`¿Empezar "${confirmSOP.nombre}" hoy?`}</p>
            <p className="mt-1 text-xs text-muted">{confirmSOP.pasosTotal} pasos</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmSOP(null)} className="flex-1 rounded-lg border border-border py-2.5 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
              <button onClick={() => materializeSOP(confirmSOP)} className="flex-1 rounded-lg py-2.5 text-xs font-medium text-white hover:brightness-110" style={{ backgroundColor: AREA_COLORS[confirmSOP.area]?.hex ?? "#6d28d9" }}>Empezar</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm start */}
      {confirmBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
          role="dialog" aria-modal="true" tabIndex={-1} ref={(el) => el?.focus()}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmBlock(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") setConfirmBlock(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">Empezar paso</h3>
            <p className="mt-1 text-xs text-muted">{`¿Empezar "${confirmBlock.title}"?`}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmBlock(null)} className="flex-1 rounded-lg border border-border py-2.5 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
              <button onClick={() => startBlock(confirmBlock)} className="flex-1 rounded-lg py-2.5 text-xs font-medium text-white" style={{ backgroundColor: "#16a34a" }}>Empezar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   DRILL-DOWN DIALOG: Ámbito → Área → Proyecto → Resultado → Entregable → Paso
   ============================================================ */

type DDStep = "ambito" | "area" | "proyecto" | "resultado" | "entregable" | "paso";

function DrillDownDialog({ dateKey, onClose }: { dateKey: string; onClose: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();

  const [step, setStep] = useState<DDStep>("ambito");
  const [selectedAmbito, setSelectedAmbito] = useState<Ambito | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [selectedProyectoId, setSelectedProyectoId] = useState<string | null>(null);
  const [selectedResultadoId, setSelectedResultadoId] = useState<string | null>(null);
  const [selectedEntregableId, setSelectedEntregableId] = useState<string | null>(null);
  const [newPasoName, setNewPasoName] = useState("");

  const areas = selectedAmbito === "personal" ? AREAS_PERSONAL : AREAS_EMPRESA;
  const proyectos = state.proyectos.filter((p) => p.area === selectedArea);
  const resultados = state.resultados.filter((r) => r.proyectoId === selectedProyectoId);
  const entregables = state.entregables.filter((e) => e.resultadoId === selectedResultadoId && e.estado !== "hecho" && e.estado !== "cancelada");

  function selectAmbito(a: Ambito) { setSelectedAmbito(a); setStep("area"); }
  function selectArea(a: Area) { setSelectedArea(a); setStep("proyecto"); }
  function selectProyecto(id: string) { setSelectedProyectoId(id); setStep("resultado"); }
  function selectResultado(id: string) { setSelectedResultadoId(id); setStep("entregable"); }
  function selectEntregable(id: string) { setSelectedEntregableId(id); setStep("paso"); }

  function goBack() {
    if (step === "area") { setStep("ambito"); setSelectedAmbito(null); }
    else if (step === "proyecto") { setStep("area"); setSelectedArea(null); }
    else if (step === "resultado") { setStep("proyecto"); setSelectedProyectoId(null); }
    else if (step === "entregable") { setStep("resultado"); setSelectedResultadoId(null); }
    else if (step === "paso") { setStep("entregable"); setSelectedEntregableId(null); }
  }

  function confirmPaso() {
    if (!selectedEntregableId) return;
    const name = newPasoName.trim();
    if (!name) return;

    dispatch({ type: "UPDATE_ENTREGABLE", id: selectedEntregableId, changes: { fechaInicio: dateKey, estado: "en_proceso" } });
    onClose();
  }

  const stepLabels: Record<DDStep, string> = {
    ambito: "Elige ámbito",
    area: "Elige área",
    proyecto: "Elige proyecto",
    resultado: "Elige resultado",
    entregable: "Elige entregable",
    paso: "Nombre del paso",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
      role="dialog" aria-modal="true" tabIndex={-1} ref={(el) => el?.focus()}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          {step !== "ambito" && (
            <button onClick={goBack} className="rounded-lg p-1 text-muted hover:bg-surface hover:text-foreground">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          )}
          <h3 className="text-sm font-semibold text-foreground">{stepLabels[step]}</h3>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {step === "ambito" && (
            <div className="space-y-2">
              <button onClick={() => selectAmbito("empresa")} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                <span className="text-lg">🏢</span>
                <span className="text-sm font-medium text-foreground">{state.ambitoLabels.empresa}</span>
              </button>
              <button onClick={() => selectAmbito("personal")} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                <span className="text-lg">👤</span>
                <span className="text-sm font-medium text-foreground">{state.ambitoLabels.personal}</span>
              </button>
            </div>
          )}

          {step === "area" && (
            <div className="space-y-1">
              {areas.map((a) => {
                const c = AREA_COLORS[a.id];
                return (
                  <button key={a.id} onClick={() => selectArea(a.id)} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white ${c?.dot ?? ""}`}>{c?.initial}</span>
                    <span className="text-sm font-medium text-foreground">{a.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {step === "proyecto" && (
            <div className="space-y-1">
              {proyectos.length === 0 && <p className="py-4 text-center text-xs text-muted">Sin proyectos en esta área</p>}
              {proyectos.map((p) => (
                <button key={p.id} onClick={() => selectProyecto(p.id)} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                  <span className="text-sm font-medium text-foreground">{p.nombre}</span>
                </button>
              ))}
            </div>
          )}

          {step === "resultado" && (
            <div className="space-y-1">
              {resultados.length === 0 && <p className="py-4 text-center text-xs text-muted">Sin resultados</p>}
              {resultados.map((r) => (
                <button key={r.id} onClick={() => selectResultado(r.id)} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                  <span className="text-sm font-medium text-foreground">{r.nombre}</span>
                </button>
              ))}
            </div>
          )}

          {step === "entregable" && (
            <div className="space-y-1">
              {entregables.length === 0 && <p className="py-4 text-center text-xs text-muted">Sin entregables activos</p>}
              {entregables.map((e) => (
                <button key={e.id} onClick={() => selectEntregable(e.id)} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                  <span className="text-sm font-medium text-foreground">{e.nombre}</span>
                  {e.tipo !== "raw" && <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">{e.tipo.toUpperCase()}</span>}
                </button>
              ))}
            </div>
          )}

          {step === "paso" && (
            <div className="space-y-3">
              <input value={newPasoName} onChange={(e) => setNewPasoName(e.target.value)}
                placeholder="Nombre del paso a dar hoy..."
                onKeyDown={(e) => { if (e.key === "Enter") confirmPaso(); }}
                autoFocus className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-accent" />
              <button onClick={confirmPaso} disabled={!newPasoName.trim()}
                className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent/90">
                Planificar para hoy
              </button>
            </div>
          )}
        </div>

        <button onClick={onClose} className="mt-3 w-full rounded-lg border border-border py-2 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
      </div>
    </div>
  );
}
