"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import {
  AREA_COLORS, AREAS_PERSONAL, AREAS_EMPRESA,
  type Area, type Entregable, type Ambito,
} from "@/lib/types";
import { projectSOPsForDate, type ProjectedSOP } from "@/lib/sop-projector";

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

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
        if (fp > dateKey) continue;
        if (result.some((b) => b.id === `next-${paso.id}`)) continue;

        const newerPasoExists = pasos.some((p) =>
          p.entregableId === paso.entregableId && p.inicioTs && paso.finTs && p.inicioTs >= paso.finTs
        );
        if (newerPasoExists) continue;

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
        if (!ent.fechaInicio || ent.fechaInicio > dateKey) continue;
        if (ent.planNivel === "mes" || ent.planNivel === "trimestre") continue;
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
    const existingPending = state.pasos.find(
      (p) => p.entregableId === block.entregableId && !p.inicioTs && !p.finTs && p.nombre === block.title
    );
    if (existingPending) {
      dispatch({ type: "ACTIVATE_PASO", id: existingPending.id });
      dispatch({ type: "UPDATE_ENTREGABLE", id: block.entregableId, changes: { estado: "en_proceso" } });
    } else {
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
    }
    setConfirmBlock(null);
  }

  function materializeSOP(sop: ProjectedSOP) {
    if (isMentor) return;
    dispatch({
      type: "MATERIALIZE_SOP",
      plantillaId: sop.plantillaId,
      area: sop.area,
      responsable: sop.responsable,
      currentUser,
      dateKey,
      ids: {
        resultado: generateId(),
        entregable: generateId(),
        paso: generateId(),
        proyecto: generateId(),
      },
    });
    setConfirmSOP(null);
  }

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
            {plannedBlocks.map((block) => {
              const hex = AREA_COLORS[block.area]?.hex ?? "#888";
              return (
                <PlannedBlockRow key={block.id} block={block} hex={hex} isToday={isToday} isMentor={isMentor}
                  onStart={() => setConfirmBlock(block)}
                  onReschedule={(newDate) => {
                    if (block.id.startsWith("next-") && block.pasoId) {
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
   PLANNED BLOCK ROW with reschedule/delete
   ============================================================ */

function PlannedBlockRow({ block, hex, isToday, isMentor, onStart, onReschedule }: {
  block: Block; hex: string; isToday: boolean; isMentor: boolean;
  onStart: () => void; onReschedule: (newDate: string | null) => void;
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
            <button type="button" onClick={() => { onReschedule(toDateKey(addDays(new Date(), 1))); setShowMenu(false); }}
              className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-surface">Mañana</button>
            <button type="button" onClick={() => { onReschedule(toDateKey(addDays(new Date(), 7))); setShowMenu(false); }}
              className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-surface">+1 semana</button>
            <button type="button" onClick={() => setShowDatePicker(true)}
              className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-surface">Otra fecha</button>
            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)}
                className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-100 dark:border-red-700/30 dark:bg-red-500/10">Eliminar</button>
            ) : (
              <>
                <span className="text-[10px] text-red-500 py-1">¿Seguro?</span>
                <button type="button" onClick={() => { onReschedule(null); setShowMenu(false); }}
                  className="rounded-md bg-red-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-600">Sí</button>
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
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setShowMenu((s) => !s)} title="Opciones"
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
            </svg>
          </button>
          {isToday && (
            <button type="button" onClick={onStart}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white hover:brightness-110"
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
