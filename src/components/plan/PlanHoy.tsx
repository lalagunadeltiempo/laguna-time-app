"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { usePlannedBlocks } from "@/lib/hooks";
import {
  AREA_COLORS, AREAS_PERSONAL, AREAS_EMPRESA,
  type Area, type Entregable, type Ambito, type Paso,
} from "@/lib/types";
import { projectSOPsForDate, type ProjectedSOP } from "@/lib/sop-projector";
import SOPLaunchDialog from "@/components/shared/SOPLaunchDialog";
import HierarchyPicker from "@/components/shared/HierarchyPicker";

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minsFromMidnight(ts: string): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtDuration(mins: number): string {
  if (mins < 1) return "<1 min";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface Block {
  id: string;
  type: "active" | "done" | "programado" | "sop";
  area: Area;
  title: string;
  subtitle: string;
  hour: number;
  entregableId?: string;
  pasoId?: string;
  proyectoId?: string;
  proyectoNombre?: string;
  entregableNombre?: string;
  startMin?: number;
  endMin?: number;
  timeLabel?: string;
  durationLabel?: string;
  hex?: string;
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
  const [orphanBlock, setOrphanBlock] = useState<Block | null>(null);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [logAsDoneBlock, setLogAsDoneBlock] = useState<Block | null>(null);
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

  const executedBlocks = useMemo(() => {
    const { pasos, entregables, resultados, proyectos, pasosActivos } = state;
    const result: Block[] = [];

    for (const paso of pasos) {
      if (!paso.inicioTs) continue;
      if (paso.inicioTs.slice(0, 10) !== dateKey) continue;
      const isDone = !!paso.finTs;
      const isActive = !isDone && pasosActivos.includes(paso.id);
      if (!isDone && !isActive) continue;

      const ent = entregables.find((e) => e.id === paso.entregableId);
      if (!ent) continue;
      if (ent.responsable && ent.responsable !== currentUser) continue;
      const res = resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? proyectos.find((pr) => pr.id === res.proyectoId) : undefined;
      const hour = new Date(paso.inicioTs).getHours();
      const startMin = minsFromMidnight(paso.inicioTs);
      const endMin = paso.finTs ? minsFromMidnight(paso.finTs) : startMin;
      const dur = endMin - startMin;

      result.push({
        id: paso.id,
        type: isDone ? "done" : "active",
        area: proj?.area ?? "operativa",
        title: paso.nombre,
        subtitle: `${proj?.nombre ?? ""} · ${ent.nombre}`,
        hour,
        entregableId: ent.id,
        pasoId: paso.id,
        proyectoId: proj?.id,
        proyectoNombre: proj?.nombre,
        entregableNombre: ent.nombre,
        startMin,
        endMin: isDone ? endMin : undefined,
        timeLabel: isDone ? `${fmtTime(startMin)} – ${fmtTime(endMin)}` : fmtTime(startMin),
        durationLabel: isDone ? fmtDuration(dur) : undefined,
      });
    }

    return result;
  }, [state.pasos, state.entregables, state.resultados, state.proyectos, state.pasosActivos, dateKey, currentUser]);

  const hookPlanned = usePlannedBlocks(dateKey);
  const plannedBlocks = useMemo(() => {
    if (isPast && !isToday) return [] as Block[];
    const blocks: Block[] = hookPlanned.map((b) => ({
      ...b,
      type: "programado" as const,
      hour: -1,
    }));
    blocks.sort((a, b) => {
      const areaA = a.area ?? "";
      const areaB = b.area ?? "";
      if (areaA !== areaB) return areaA.localeCompare(areaB);
      const projA = a.proyectoNombre ?? "";
      const projB = b.proyectoNombre ?? "";
      if (projA !== projB) return projA.localeCompare(projB);
      const entA = a.entregableNombre ?? "";
      const entB = b.entregableNombre ?? "";
      return entA.localeCompare(entB);
    });
    return blocks;
  }, [hookPlanned, isPast, isToday]);

  const projectedSOPs = useMemo(() => projectSOPsForDate(state, selectedDate, currentUser), [state, selectedDate, currentUser]);
  const virtualSOPs = useMemo(() => {
    return projectedSOPs.filter((sop) => !state.entregables.some(
      (e) => e.tipo === "sop" && e.plantillaId === sop.plantillaId && e.fechaInicio === dateKey
    ));
  }, [projectedSOPs, state.entregables, dateKey]);

  function tryStartBlock(block: Block) {
    if (!block.entregableId) return;
    const ent = state.entregables.find((e) => e.id === block.entregableId);
    if (!ent) return;
    const res = state.resultados.find((r) => r.id === ent.resultadoId);
    const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
    if (!res || !proj) {
      setConfirmBlock(null);
      setOrphanBlock(block);
      return;
    }
    doStartBlock(block);
  }

  function doStartBlock(block: Block) {
    if (!block.entregableId) return;
    const existingPending = state.pasos.find(
      (p) => p.entregableId === block.entregableId && !p.inicioTs && !p.finTs && p.nombre === block.title
    );
    if (existingPending) {
      dispatch({ type: "ACTIVATE_PASO", id: existingPending.id });
      dispatch({ type: "UPDATE_ENTREGABLE", id: block.entregableId, changes: { estado: "en_proceso" } });
    } else {
      const prevPasoId = block.id.startsWith("next-") ? block.id.slice(5) : null;
      const prevPaso = prevPasoId ? state.pasos.find((p) => p.id === prevPasoId) : null;
      const contexto = prevPaso
        ? { ...prevPaso.contexto }
        : { urls: [] as Paso["contexto"]["urls"], apps: [] as string[], notas: "" };
      dispatch({
        type: "START_PASO",
        payload: {
          id: generateId(),
          entregableId: block.entregableId,
          nombre: block.title,
          inicioTs: new Date().toISOString(),
          finTs: null, estado: "",
          contexto,
          implicados: [{ tipo: "equipo", nombre: currentUser }],
          pausas: [], siguientePaso: null,
        },
      });
    }
    setConfirmBlock(null);
  }

  // materializeSOP is now handled by SOPLaunchDialog

  const hasPlanned = plannedBlocks.length > 0 || virtualSOPs.length > 0;
  const plannedCount = plannedBlocks.length + virtualSOPs.length;
  const [planOpen, setPlanOpen] = useState(true);

  return (
    <div className="flex-1 space-y-4">

      {/* PLANIFICADOS PARA HOY — arriba del horario */}
      {(isToday || !isPast) && (
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setPlanOpen((v) => !v)} className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                className={`shrink-0 text-muted transition-transform ${planOpen ? "rotate-90" : ""}`}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Planificados para hoy</h3>
              {plannedCount > 0 && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">{plannedCount}</span>
              )}
            </button>
            {!isMentor && (
              <button onClick={() => setShowDrillDown(true)}
                className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Añadir
              </button>
            )}
          </div>

          {planOpen && !hasPlanned && <p className="py-3 text-center text-xs text-muted">Nada planificado. Usa el botón + para añadir.</p>}

          {planOpen && <div className="mt-3 space-y-1.5">
            {plannedBlocks.map((block, i) => {
              const hex = AREA_COLORS[block.area]?.hex ?? "#888";
              const prev = i > 0 ? plannedBlocks[i - 1] : null;
              const showProjectHeader = !prev || prev.proyectoId !== block.proyectoId || prev.area !== block.area;
              return (
                <div key={block.id}>
                  {showProjectHeader && (
                    <div className="flex items-center gap-2 pb-1 pt-2 first:pt-0">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: hex }}>
                        {block.proyectoNombre || block.area}
                      </span>
                    </div>
                  )}
                  <PlannedBlockRow block={block} hex={hex} isToday={isToday} isMentor={isMentor} refDate={selectedDate}
                    onStart={() => setConfirmBlock(block)}
                    onLogAsDone={() => setLogAsDoneBlock(block)}
                    onReschedule={(newDate) => {
                      if (block.id.startsWith("pending-") && block.pasoId) {
                        if (!newDate) dispatch({ type: "DELETE_PASO", id: block.pasoId });
                      } else if (block.id.startsWith("next-") && block.pasoId) {
                        dispatch({ type: "RESCHEDULE_NEXT_PASO", pasoId: block.pasoId, newDate });
                      } else if (block.id.startsWith("ent-") && block.entregableId) {
                        if (!newDate) {
                          dispatch({ type: "UPDATE_ENTREGABLE", id: block.entregableId, changes: { fechaInicio: null, estado: "a_futuro" as const } });
                        } else {
                          dispatch({ type: "UPDATE_ENTREGABLE", id: block.entregableId, changes: { fechaInicio: newDate } });
                        }
                      }
                    }}
                  />
                </div>
              );
            })}

            {!isMentor && virtualSOPs.map((sop) => {
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
          </div>}
        </div>
      )}

      {/* HORARIO — filas por hora */}
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
                  const clickable = block.type === "done" && block.pasoId;
                  return (
                    <div key={block.id}
                      className={`mb-1 rounded-lg border-l-[3px] px-3 py-2 ${clickable ? "cursor-pointer hover:brightness-95 transition-all" : ""}`}
                      style={{ borderLeftColor: color, backgroundColor: color + "0c" }}
                      onClick={clickable ? () => setEditingBlock(block) : undefined}>
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
                      {(block.timeLabel || block.durationLabel) && (
                        <p className="mt-0.5 text-[10px] text-muted/60">{block.timeLabel}{block.durationLabel ? ` · ${block.durationLabel}` : ""}</p>
                      )}
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

      {/* Confirm SOP → HierarchyPicker */}
      {confirmSOP && (
        <SOPLaunchDialog
          plantillaId={confirmSOP.plantillaId}
          plantillaNombre={confirmSOP.nombre}
          area={confirmSOP.area}
          responsable={confirmSOP.responsable}
          dateKey={dateKey}
          onClose={() => setConfirmSOP(null)}
        />
      )}

      {/* Orphan entregable → pick destination first */}
      {orphanBlock && orphanBlock.entregableId && (
        <HierarchyPicker
          depth="resultado"
          title={`Destino para "${orphanBlock.title}"`}
          onSelect={(sel) => {
            if (sel.resultadoId && orphanBlock.entregableId) {
              dispatch({ type: "MOVE_ENTREGABLE", entregableId: orphanBlock.entregableId, nuevoResultadoId: sel.resultadoId });
              doStartBlock(orphanBlock);
            }
            setOrphanBlock(null);
          }}
          onCancel={() => setOrphanBlock(null)}
        />
      )}

      {/* Confirm start */}
      {confirmBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
          role="dialog" aria-modal="true" tabIndex={-1}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmBlock(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") setConfirmBlock(null); }}>
          <div className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">Empezar paso</h3>
            <p className="mt-1 text-xs text-muted">{`¿Empezar "${confirmBlock.title}"?`}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmBlock(null)} className="flex-1 rounded-lg border border-border py-2.5 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
              <button onClick={() => tryStartBlock(confirmBlock)} className="flex-1 rounded-lg py-2.5 text-xs font-medium text-white" style={{ backgroundColor: "#16a34a" }}>Empezar</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit time of done block */}
      {editingBlock && editingBlock.pasoId && (
        <EditBlockTimesDialog
          block={editingBlock}
          pasoId={editingBlock.pasoId}
          onClose={() => setEditingBlock(null)}
        />
      )}

      {/* Log planned block as done in past */}
      {logAsDoneBlock && (
        <LogAsDoneDialog
          block={logAsDoneBlock}
          dateKey={dateKey}
          onClose={() => setLogAsDoneBlock(null)}
        />
      )}
    </div>
  );
}


function toLocalDT(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ============================================================
   EDIT BLOCK TIMES DIALOG — edit inicioTs/finTs of a done block
   ============================================================ */

function EditBlockTimesDialog({ block, pasoId, onClose }: { block: Block; pasoId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const paso = state.pasos.find((p) => p.id === pasoId);

  const [inicio, setInicio] = useState(() => paso?.inicioTs ? toLocalDT(new Date(paso.inicioTs)) : "");
  const [fin, setFin] = useState(() => paso?.finTs ? toLocalDT(new Date(paso.finTs)) : "");

  function save() {
    if (!inicio) return;
    const inicioTs = new Date(inicio).toISOString();
    const finTs = fin ? new Date(fin).toISOString() : null;
    if (finTs && finTs <= inicioTs) return;
    dispatch({ type: "UPDATE_PASO_TIMES", id: pasoId, inicioTs, finTs });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
      role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-background p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-foreground">Editar horario</h3>
        <p className="mt-1 mb-3 truncate text-xs text-muted">{block.title}</p>

        <label className="mb-1 block text-[11px] font-medium text-muted">Inicio</label>
        <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent" />

        <label className="mb-1 block text-[11px] font-medium text-muted">Fin</label>
        <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent" />

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2.5 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
          <button onClick={save} disabled={!inicio} className="flex-1 rounded-lg bg-accent py-2.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-40">Guardar</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   LOG AS DONE DIALOG — register a planned block as done in a past time slot
   ============================================================ */

function LogAsDoneDialog({ block, dateKey, onClose }: { block: Block; dateKey: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();

  const [nombre, setNombre] = useState(block.title);
  const [inicio, setInicio] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() - 1);
    return toLocalDT(d);
  });
  const [fin, setFin] = useState(() => toLocalDT(new Date()));

  function submit() {
    if (!nombre.trim() || !block.entregableId) return;
    const inicioTs = new Date(inicio).toISOString();
    const finTs = new Date(fin).toISOString();
    if (finTs <= inicioTs) return;

    const makePaso = (id: string): Paso => ({
      id, entregableId: block.entregableId!, nombre: nombre.trim(), inicioTs, finTs,
      estado: nombre.trim(), contexto: { urls: [], apps: [], notas: "" },
      implicados: [{ tipo: "equipo", nombre: currentUser }], pausas: [], siguientePaso: null,
    });

    if (block.pasoId) {
      dispatch({ type: "UPDATE_PASO_TIMES", id: block.pasoId, inicioTs, finTs });
      dispatch({ type: "CLOSE_PASO", payload: makePaso(block.pasoId) });
    } else {
      const paso = makePaso(generateId());
      dispatch({ type: "ADD_PASO", payload: paso });
      dispatch({ type: "CLOSE_PASO", payload: paso });
    }
    dispatch({ type: "UPDATE_ENTREGABLE", id: block.entregableId, changes: { fechaInicio: dateKey, planNivel: "dia" as const, estado: "en_proceso" as const } });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
      role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-background p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-foreground">Registrar como hecho</h3>
        <p className="mt-1 mb-3 truncate text-xs text-muted">{block.subtitle}</p>

        <label className="mb-1 block text-[11px] font-medium text-muted">Nombre del paso</label>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent" />

        <label className="mb-1 block text-[11px] font-medium text-muted">Inicio</label>
        <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent" />

        <label className="mb-1 block text-[11px] font-medium text-muted">Fin</label>
        <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent" />

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2.5 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
          <button onClick={submit} disabled={!nombre.trim() || !inicio || !fin}
            className="flex-1 rounded-lg bg-accent py-2.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-40">Registrar</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PLANNED BLOCK ROW with reschedule/delete
   ============================================================ */

function PlannedBlockRow({ block, hex, isToday, isMentor, refDate, onStart, onReschedule, onLogAsDone }: {
  block: Block; hex: string; isToday: boolean; isMentor: boolean; refDate: Date;
  onStart: () => void; onReschedule: (newDate: string | null) => void; onLogAsDone?: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-lg border-l-[3px] px-3 py-2.5"
      style={{ borderLeftColor: hex, backgroundColor: hex + "0c" }}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{block.title}</p>
        <p className="truncate text-xs text-muted">{block.subtitle}</p>
        {/* Inline actions */}
        {showMenu && !isMentor && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => { onReschedule(toDateKey(addDays(refDate, 1))); setShowMenu(false); }}
              className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-surface">Mañana</button>
            <button type="button" onClick={() => { onReschedule(toDateKey(addDays(refDate, 7))); setShowMenu(false); }}
              className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-surface">+1 semana</button>
            <button type="button" onClick={() => setShowDatePicker(true)}
              className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-surface">Otra fecha</button>
            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)}
                className="rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">Descartar</button>
            ) : (
              <>
                <span className="text-[10px] text-zinc-500 py-1">¿Seguro?</span>
                <button type="button" onClick={() => { onReschedule(null); setShowMenu(false); }}
                  className="rounded-md bg-zinc-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-zinc-600">Sí</button>
                <button type="button" onClick={() => setConfirmDelete(false)}
                  className="rounded-md border border-border px-2 py-1 text-[10px] text-muted">No</button>
              </>
            )}
            {showDatePicker && (
              <div className="flex items-center gap-1">
                <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-[10px] text-foreground outline-none focus:border-accent" />
                <button type="button" disabled={!customDate} onClick={() => { onReschedule(customDate); setShowMenu(false); }}
                  className="rounded-md bg-accent px-2 py-1 text-[10px] font-medium text-white disabled:opacity-40">OK</button>
              </div>
            )}
          </div>
        )}
      </div>
      {!isMentor && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <button type="button" onClick={() => setShowMenu((s) => !s)} title="Opciones"
            className="rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
            </svg>
          </button>
          {isToday && onLogAsDone && (
            <button type="button" onClick={onLogAsDone} title="Registrar como ya hecho"
              className="rounded-lg border border-border p-2 text-muted hover:bg-surface hover:text-foreground transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </button>
          )}
          {isToday && (
            <button type="button" onClick={onStart}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
              style={{ backgroundColor: hex }}>
              Empezar
            </button>
          )}
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
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [createName, setCreateName] = useState("");

  const areas = selectedAmbito === "personal" ? AREAS_PERSONAL : AREAS_EMPRESA;
  const proyectos = state.proyectos.filter((p) => p.area === selectedArea);
  const resultados = state.resultados.filter((r) => r.proyectoId === selectedProyectoId);
  const entregables = state.entregables.filter((e) => e.resultadoId === selectedResultadoId && e.estado !== "hecho" && e.estado !== "cancelada");

  function selectAmbito(a: Ambito) { setSelectedAmbito(a); setStep("area"); resetCreate(); }
  function selectArea(a: Area) { setSelectedArea(a); setStep("proyecto"); resetCreate(); }
  function selectProyecto(id: string) { setSelectedProyectoId(id); setStep("resultado"); resetCreate(); }
  function selectResultado(id: string) { setSelectedResultadoId(id); setStep("entregable"); resetCreate(); }
  function selectEntregable(id: string) { setSelectedEntregableId(id); setStep("paso"); resetCreate(); }
  function resetCreate() { setShowCreateInput(false); setCreateName(""); }

  function goBack() {
    resetCreate();
    if (step === "area") { setStep("ambito"); setSelectedAmbito(null); }
    else if (step === "proyecto") { setStep("area"); setSelectedArea(null); }
    else if (step === "resultado") { setStep("proyecto"); setSelectedProyectoId(null); }
    else if (step === "entregable") { setStep("resultado"); setSelectedResultadoId(null); }
    else if (step === "paso") { setStep("entregable"); setSelectedEntregableId(null); }
  }

  function createProyecto() {
    const name = createName.trim();
    if (!name || !selectedArea) return;
    const id = generateId();
    dispatch({ type: "ADD_PROYECTO", payload: { id, nombre: name, descripcion: null, area: selectedArea, creado: new Date().toISOString(), fechaInicio: null } });
    setSelectedProyectoId(id);
    setStep("resultado");
    resetCreate();
  }

  function createResultado() {
    const name = createName.trim();
    if (!name || !selectedProyectoId) return;
    const id = generateId();
    dispatch({ type: "ADD_RESULTADO", payload: { id, nombre: name, descripcion: null, proyectoId: selectedProyectoId, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null } });
    setSelectedResultadoId(id);
    setStep("entregable");
    resetCreate();
  }

  function createEntregable() {
    const name = createName.trim();
    if (!name || !selectedResultadoId) return;
    const id = generateId();
    dispatch({ type: "ADD_ENTREGABLE", payload: { id, nombre: name, resultadoId: selectedResultadoId, tipo: "raw", plantillaId: null, diasEstimados: 3, diasHechos: 0, esDiaria: false, responsable: currentUser, estado: "a_futuro", creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null } });
    setSelectedEntregableId(id);
    setStep("paso");
    resetCreate();
  }

  function confirmPaso() {
    if (!selectedEntregableId) return;
    const name = newPasoName.trim();
    if (!name) return;
    dispatch({ type: "UPDATE_ENTREGABLE", id: selectedEntregableId, changes: { fechaInicio: dateKey, planNivel: "dia", estado: "en_proceso" } });
    const pasoId = generateId();
    dispatch({
      type: "ADD_PASO",
      payload: {
        id: pasoId, nombre: name, entregableId: selectedEntregableId,
        estado: "pendiente", inicioTs: null, finTs: null, pausas: [], siguientePaso: null,
        contexto: { urls: [], apps: [], notas: "" }, implicados: [],
      },
    });
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

  const createLabels: Partial<Record<DDStep, { placeholder: string; action: () => void }>> = {
    proyecto: { placeholder: "Nombre del nuevo proyecto...", action: createProyecto },
    resultado: { placeholder: "Nombre del nuevo resultado...", action: createResultado },
    entregable: { placeholder: "Nombre del nuevo entregable...", action: createEntregable },
  };

  const currentCreate = createLabels[step];

  const backdropRef = useRef<HTMLDivElement>(null);
  useEffect(() => { backdropRef.current?.focus(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
      role="dialog" aria-modal="true" tabIndex={-1} ref={backdropRef}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-background p-5 shadow-xl">
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
              {proyectos.map((p) => (
                <button key={p.id} onClick={() => selectProyecto(p.id)} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                  <span className="text-sm font-medium text-foreground">{p.nombre}</span>
                </button>
              ))}
            </div>
          )}

          {step === "resultado" && (
            <div className="space-y-1">
              {resultados.map((r) => (
                <button key={r.id} onClick={() => selectResultado(r.id)} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                  <span className="text-sm font-medium text-foreground">{r.nombre}</span>
                </button>
              ))}
            </div>
          )}

          {step === "entregable" && (
            <div className="space-y-1">
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

        {/* Inline creation for proyecto/resultado/entregable levels */}
        {currentCreate && (
          <div className="mt-3 border-t border-border pt-3">
            {!showCreateInput ? (
              <button onClick={() => setShowCreateInput(true)}
                className="flex w-full items-center gap-2 rounded-lg px-4 py-2.5 text-left text-sm text-accent transition-colors hover:bg-accent/5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Crear nuevo
              </button>
            ) : (
              <div className="flex gap-2">
                <input value={createName} onChange={(e) => setCreateName(e.target.value)}
                  placeholder={currentCreate.placeholder}
                  onKeyDown={(e) => { if (e.key === "Enter") currentCreate.action(); if (e.key === "Escape") resetCreate(); }}
                  autoFocus className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent" />
                <button onClick={currentCreate.action} disabled={!createName.trim()}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent/90">
                  Crear
                </button>
              </div>
            )}
          </div>
        )}

        <button onClick={onClose} className="mt-3 w-full rounded-lg border border-border py-2 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
      </div>
    </div>
  );
}
