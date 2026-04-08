"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario } from "@/lib/usuario";
import { AREA_COLORS, type Area, type Entregable } from "@/lib/types";
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
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [confirmBlock, setConfirmBlock] = useState<Block | null>(null);
  const [confirmSOP, setConfirmSOP] = useState<ProjectedSOP | null>(null);
  const [pickHour, setPickHour] = useState<number | null>(null);
  const [entHourMap, setEntHourMap] = useState<Record<string, number>>({});
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
        entregableIdsWithPasos.add(ent.id);
        const res = ent ? resultados.find((r) => r.id === ent.resultadoId) : undefined;
        const proj = res ? proyectos.find((pr) => pr.id === res.proyectoId) : undefined;

        result.push({
          id: `next-${paso.id}`,
          type: "programado",
          area: proj?.area ?? "operativa",
          title: paso.siguientePaso.nombre ?? paso.nombre,
          subtitle: `${proj?.nombre ?? ""} · ${ent.nombre}`,
          hour: 9,
          entregableId: ent.id,
          pasoId: paso.id,
        });
      }

      for (const ent of entregables) {
        if (ent.fechaInicio !== dateKey) continue;
        if (ent.estado === "hecho" || ent.estado === "cancelada") continue;
        if (entregableIdsWithPasos.has(ent.id)) continue;
        const res = resultados.find((r) => r.id === ent.resultadoId);
        const proj = res ? proyectos.find((pr) => pr.id === res.proyectoId) : undefined;
        result.push({
          id: `ent-${ent.id}`,
          type: "programado",
          area: proj?.area ?? "operativa",
          title: ent.nombre,
          subtitle: `${proj?.nombre ?? ""}`,
          hour: entHourMap[ent.id] ?? 9,
          entregableId: ent.id,
        });
      }
    }

    return result;
  }, [state.pasos, state.entregables, state.resultados, state.proyectos, state.pasosActivos, dateKey, isToday, isPast, entHourMap]);

  const projectedSOPs = useMemo(() => {
    return projectSOPsForDate(state, selectedDate, currentUser);
  }, [state, selectedDate, currentUser]);

  const virtualSOPs = useMemo(() => {
    return projectedSOPs.filter((sop) => {
      return !state.entregables.some(
        (e) => e.tipo === "sop" && e.plantillaId === sop.plantillaId && e.fechaInicio === dateKey
      );
    });
  }, [projectedSOPs, state.entregables, dateKey]);

  const pendientes = useMemo(() => {
    return state.entregables.filter((e) =>
      e.estado !== "hecho" && e.estado !== "cancelada" &&
      (e.responsable === currentUser || !e.responsable)
    ).map((e) => {
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      return { entregable: e, proj, res };
    });
  }, [state.entregables, state.resultados, state.proyectos, currentUser]);

  function handleBlockClick(block: Block) {
    if (block.type === "active" || block.type === "done") return;
    setConfirmBlock(block);
  }

  function confirmStart() {
    if (!confirmBlock?.entregableId) return;
    dispatch({
      type: "START_PASO",
      payload: {
        id: generateId(),
        entregableId: confirmBlock.entregableId,
        nombre: confirmBlock.title,
        inicioTs: new Date().toISOString(),
        finTs: null,
        estado: "",
        contexto: { urls: [], apps: [], notas: "" },
        implicados: [{ tipo: "equipo", nombre: currentUser }],
        pausas: [],
        siguientePaso: null,
      },
    });
    setConfirmBlock(null);
  }

  function handleSlotClick(hour: number) {
    if (isPast) return;
    setPickHour(hour);
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

  function assignToPlan(ent: Entregable) {
    if (pickHour !== null) {
      setEntHourMap((m) => ({ ...m, [ent.id]: pickHour }));
    }
    dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { fechaInicio: dateKey, estado: ent.estado === "a_futuro" ? "en_proceso" : ent.estado } });
    setPickHour(null);
  }

  return (
    <div className="flex-1">
      <div ref={scrollRef} className="relative max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-background">
        {HOURS.map((hour) => {
          const hourBlocks = allBlocks.filter((b) => b.hour === hour);
          return (
            <div key={hour} data-hour={hour}
              className="relative flex min-h-[52px] border-b border-border/50 last:border-b-0">
              <div className="flex w-14 shrink-0 items-start justify-end pr-3 pt-1">
                <span className="text-xs font-medium text-muted">{String(hour).padStart(2, "0")}:00</span>
              </div>
              <div className="flex-1 px-2 py-1"
                onClick={() => hourBlocks.length === 0 && handleSlotClick(hour)}
                role={!isPast && hourBlocks.length === 0 ? "button" : undefined}
                tabIndex={!isPast && hourBlocks.length === 0 ? 0 : undefined}
              >
                {hourBlocks.map((block) => {
                  const color = AREA_COLORS[block.area]?.hex ?? "#888";
                  const isClickable = block.type === "programado" && isToday;
                  return (
                    <button key={block.id} type="button" disabled={!isClickable}
                      onClick={(e) => { e.stopPropagation(); handleBlockClick(block); }}
                      className={`mb-1 w-full rounded-lg border-l-[3px] bg-surface px-3 py-2 text-left transition-colors ${
                        isClickable ? "cursor-pointer hover:bg-surface-hover" : ""
                      }`}
                      style={{ borderLeftColor: color }}>
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
                        {block.type === "programado" && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted" style={{ backgroundColor: "var(--surface)" }}>Pendiente</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{block.subtitle}</p>
                    </button>
                  );
                })}
                {hourBlocks.length === 0 && !isPast && (
                  <div className="flex h-full min-h-[36px] cursor-pointer items-center rounded-lg px-3 transition-colors hover:bg-surface/50">
                    <span className="text-xs text-muted/40">+</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {virtualSOPs.length > 0 && (isToday || !isPast) && (
        <div className="mt-4">
          <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-purple-400">
              <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
            </svg>
            SOPs programados para hoy
          </h4>
          <div className="space-y-1">
            {virtualSOPs.map((sop) => (
              <button key={sop.plantillaId} type="button"
                onClick={() => setConfirmSOP(sop)}
                className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-purple-200 bg-purple-50/50 px-4 py-3 text-left transition-all hover:border-purple-400 hover:bg-purple-50 dark:border-purple-800/30 dark:bg-purple-500/5">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: AREA_COLORS[sop.area]?.hex ?? "#888" }} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{sop.nombre}</p>
                  <p className="text-xs text-muted">{sop.pasosTotal} pasos · {sop.responsable}</p>
                </div>
                <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">SOP</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {allBlocks.length === 0 && !pickHour && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted">{isPast ? "No hubo actividad este día." : "Nada programado. Haz clic en un hueco para planificar."}</p>
        </div>
      )}

      {/* Picker: select a pending entregable for a slot */}
      {pickHour !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
          role="dialog" aria-modal="true" tabIndex={-1} ref={(el) => el?.focus()}
          onClick={(e) => { if (e.target === e.currentTarget) setPickHour(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") setPickHour(null); }}>
          <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Planificar a las {String(pickHour).padStart(2, "0")}:00</h3>
            <p className="mb-4 text-xs text-muted">Elige un entregable pendiente:</p>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {pendientes.length === 0 && <p className="py-4 text-center text-xs text-muted">No hay entregables pendientes</p>}
              {pendientes.map(({ entregable, proj }) => (
                <button key={entregable.id} onClick={() => assignToPlan(entregable)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: AREA_COLORS[proj?.area ?? "operativa"]?.hex ?? "#888" }} />
                  <div className="flex-1 truncate">
                    <p className="truncate text-sm font-medium text-foreground">{entregable.nombre}</p>
                    <p className="truncate text-xs text-muted">{proj?.nombre ?? ""}</p>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setPickHour(null)} className="mt-3 w-full rounded-lg border border-border py-2 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
          </div>
        </div>
      )}

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
              <button onClick={() => materializeSOP(confirmSOP)} className="flex-1 rounded-lg bg-purple-600 py-2.5 text-xs font-medium text-white hover:bg-purple-700">Empezar</button>
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
              <button onClick={confirmStart} className="flex-1 rounded-lg py-2.5 text-xs font-medium text-white" style={{ backgroundColor: "#16a34a" }}>Empezar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
