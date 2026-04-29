"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { usePlannedBlocks, useFocoProyectos, type PlannedBlockOrigen } from "@/lib/hooks";
import {
  AREA_COLORS, AREAS_PERSONAL, AREAS_EMPRESA,
  type Area, type Entregable, type Ambito,
} from "@/lib/types";
import { ResponsableToggle, type ResponsableFilter } from "./PlanMes";
import { EntregableActivoCard } from "../EntregableActivo";

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
  type: "active" | "done" | "programado";
  area: Area;
  title: string;
  subtitle: string;
  hour: number;
  entregableId?: string;
  pasoId?: string;
  proyectoId?: string;
  proyectoNombre?: string;
  resultadoNombre?: string;
  entregableNombre?: string;
  startMin?: number;
  endMin?: number;
  timeLabel?: string;
  durationLabel?: string;
  hex?: string;
  origen?: PlannedBlockOrigen;
  /** Hora planificada (solo lo usan bloques no ejecutados). */
  planInicioTs?: string | null;
  /** El bloque entra para `targetUser` por un paso suyo (no por ser responsable del entregable). */
  pasoTuyo?: boolean;
  /** Índice de la sesión dentro de `entregable.sesiones` (solo bloques `done`/`active`). */
  sesionIdx?: number;
  /** ISO timestamp de inicio de la sesión, para edición inline. */
  sesionInicioTs?: string;
  /** ISO timestamp de fin (null si la sesión sigue abierta). */
  sesionFinTs?: string | null;
}

function hhmmFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isoFromDateAndHhmm(dateKey: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  const [y, mo, d] = dateKey.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, mo - 1, d, h || 0, m || 0, 0, 0);
  return dt.toISOString();
}

interface Props {
  selectedDate: Date;
}

export function PlanHoy({ selectedDate }: Props) {
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [respFilter, setRespFilter] = useState<ResponsableFilter>("yo");
  const targetUser: string | null = respFilter === "todo" ? null : respFilter === "yo" ? currentUser : respFilter;
  const targetIsCurrent = targetUser === currentUser;
  const pasoBadgeLabel = targetIsCurrent || targetUser === null ? "Paso tuyo" : `Paso de ${targetUser}`;
  const [showDrillDown, setShowDrillDown] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [detalleEntregableId, setDetalleEntregableId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);

  // Orden manual de los entregables "Sin hora" para `editUsuario` + `dateKey`.
  // Se persiste en localStorage. La lista contiene `entregableId`s; lo que no
  // esté ordenado va al final (alfabético). Al reordenar se sobrescribe la
  // entrada con el orden visible actual.
  const sinHoraStorageKey = useMemo(() => {
    const u = targetUser ?? currentUser;
    return `laguna-planhoy-sinhora-orden:${u}:${dateKey}`;
  }, [targetUser, currentUser, dateKey]);
  const [sinHoraOrden, setSinHoraOrden] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(sinHoraStorageKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) {
          setSinHoraOrden(arr);
          return;
        }
      }
    } catch { /* noop */ }
    setSinHoraOrden([]);
  }, [sinHoraStorageKey]);
  function aplicarOrdenSinHora(blocks: Block[]): Block[] {
    if (sinHoraOrden.length === 0) return blocks;
    const indice = new Map<string, number>();
    sinHoraOrden.forEach((id, i) => indice.set(id, i));
    const out = [...blocks];
    out.sort((a, b) => {
      const ka = a.entregableId ?? a.id;
      const kb = b.entregableId ?? b.id;
      const ia = indice.has(ka) ? indice.get(ka)! : Number.POSITIVE_INFINITY;
      const ib = indice.has(kb) ? indice.get(kb)! : Number.POSITIVE_INFINITY;
      if (ia !== ib) return ia - ib;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
    return out;
  }
  function moveSinHora(visibles: Block[], block: Block, dir: "up" | "down") {
    const ordenados = aplicarOrdenSinHora(visibles);
    const ids = ordenados.map((b) => b.entregableId ?? b.id);
    const key = block.entregableId ?? block.id;
    const idx = ids.indexOf(key);
    if (idx === -1) return;
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= ids.length) return;
    const next = [...ids];
    const tmp = next[idx];
    next[idx] = next[target];
    next[target] = tmp;
    setSinHoraOrden(next);
    try { localStorage.setItem(sinHoraStorageKey, JSON.stringify(next)); }
    catch { /* noop */ }
  }

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
    const { entregables, resultados, proyectos } = state;
    const result: Block[] = [];

    // NOTA: la unidad de trabajo es el ENTREGABLE. Antes pintábamos también
    // un bloque por cada PASO ejecutado (legacy), lo que apilaba varias filas
    // por hora cuando un entregable tenía varios pasos hechos. Ahora el
    // horario muestra sólo bloques de SESIÓN del entregable: una sesión =
    // un bloque. Los pasos siguen visibles dentro del detalle del entregable
    // como checklist.

    // Sesiones de entregable que ocurrieron en dateKey.
    for (const ent of entregables) {
      if (targetUser !== null) {
        const esDelTarget = ent.responsable === targetUser
          || state.pasos.some((p) => p.entregableId === ent.id && p.responsable === targetUser);
        if (!esDelTarget) continue;
      }
      const sesiones = Array.isArray(ent.sesiones) ? ent.sesiones : [];
      for (let idx = 0; idx < sesiones.length; idx++) {
        const s = sesiones[idx];
        if (s.inicioTs.slice(0, 10) !== dateKey) continue;
        const isDone = s.finTs !== null;
        const res = resultados.find((r) => r.id === ent.resultadoId);
        const proj = res ? proyectos.find((pr) => pr.id === res.proyectoId) : undefined;
        const hour = new Date(s.inicioTs).getHours();
        const startMin = minsFromMidnight(s.inicioTs);
        const endMin = s.finTs ? minsFromMidnight(s.finTs) : startMin;
        const dur = endMin - startMin;

        result.push({
          id: `ses-${ent.id}-${idx}`,
          type: isDone ? "done" : "active",
          area: proj?.area ?? "operativa",
          title: ent.nombre,
          subtitle: `${proj?.nombre ?? ""}${res ? ` · ${res.nombre}` : ""}`,
          hour,
          entregableId: ent.id,
          proyectoId: proj?.id,
          proyectoNombre: proj?.nombre,
          entregableNombre: ent.nombre,
          startMin,
          endMin: isDone ? endMin : undefined,
          timeLabel: isDone ? `${fmtTime(startMin)} – ${fmtTime(endMin)}` : fmtTime(startMin),
          durationLabel: isDone ? fmtDuration(dur) : undefined,
          sesionIdx: idx,
          sesionInicioTs: s.inicioTs,
          sesionFinTs: s.finTs,
        });
      }
    }

    return result;
  }, [state, dateKey, targetUser]);

  const hookPlanned = usePlannedBlocks(dateKey, targetUser);

  /**
   * Entregables que ya tienen sesión (activa o terminada) hoy.
   * Sirven para no duplicarlos en "Planificado": si ya están ejecutándose o
   * hechos, sólo se ven en el Horario.
   */
  const entregablesEnHorario = useMemo(() => {
    const ids = new Set<string>();
    for (const b of executedBlocks) {
      if (b.entregableId) ids.add(b.entregableId);
    }
    return ids;
  }, [executedBlocks]);

  const plannedPrincipal = useMemo(() => {
    if (isPast && !isToday) return [] as Block[];
    const toBlock = (b: typeof hookPlanned[number]): Block => ({
      ...b,
      type: "programado" as const,
      hour: -1,
      resultadoNombre: b.resultadoNombre,
      planInicioTs: b.planInicioTs ?? null,
    });
    // Orden: 1) bloques con hora planificada ascendente; 2) sin hora alfabéticamente.
    const cmp = (a: Block, b: Block) => {
      const ha = a.planInicioTs ? new Date(a.planInicioTs).getTime() : null;
      const hb = b.planInicioTs ? new Date(b.planInicioTs).getTime() : null;
      if (ha != null && hb != null) return ha - hb;
      if (ha != null) return -1;
      if (hb != null) return 1;
      const projA = a.proyectoNombre ?? "";
      const projB = b.proyectoNombre ?? "";
      if (projA !== projB) return projA.localeCompare(projB);
      const entA = a.entregableNombre ?? "";
      const entB = b.entregableNombre ?? "";
      return entA.localeCompare(entB);
    };
    // Sólo mostramos lo planificado para HOY y lo que está EN MARCHA. Los
    // bloques "arrastrado" (planificados para días anteriores y aún sin
    // cerrar) ya no se cuelan aquí: la revisión histórica se hace recorriendo
    // trimestre → mes → semana, no desde Hoy. Si el usuario navega a un día
    // pasado, igualmente no vemos planificación; sólo el horario ejecutado.
    const principal: Block[] = [];
    for (const hb of hookPlanned) {
      if (hb.entregableId && entregablesEnHorario.has(hb.entregableId)) continue;
      if (hb.origen === "arrastrado") continue;
      principal.push(toBlock(hb));
    }
    principal.sort(cmp);
    return principal;
  }, [hookPlanned, isPast, isToday, entregablesEnHorario]);

  /**
   * Asigna (o limpia) la hora planificada de un bloque a nivel ENTREGABLE.
   * Al trabajar por entregable, `planInicioTs` vive en el entregable.
   * Si el bloque arrastra un "next-*" legacy, también limpiamos el siguientePaso
   * del paso previo para que el listado no duplique.
   */
  /**
   * Usuario sobre el que aplican las ediciones de planificación.
   * - Si filtras por un miembro concreto (toggle Equipo/Yo/Miembro), las
   *   ediciones van sobre ese miembro (planificas su semana).
   * - En "Todos" o "Yo" editas tu propia planificación.
   */
  const editUsuario = targetUser ?? currentUser;

  function asignarHora(block: Block, hhmm: string | null) {
    if (!block.entregableId) return;
    const nuevoTs = hhmm ? isoFromDateAndHhmm(dateKey, hhmm) : null;

    if (block.id.startsWith("next-") && block.pasoId) {
      dispatch({ type: "RESCHEDULE_NEXT_PASO", pasoId: block.pasoId, newDate: null });
    }

    dispatch({ type: "SET_ENTREGABLE_PLAN_INICIO", id: block.entregableId, ts: nuevoTs, usuario: editUsuario });
  }

  /**
   * Reprograma un bloque de tipo "ent-*" usando `diasPlanificadosByUser`
   * como fuente canónica (lo que también muestra Plan Semana). Mueve el
   * día sólo en el slot del usuario activo y limpia su hora si apunta a
   * ese día.
   */
  function reprogramarEntregable(entregableId: string, newDate: string | null) {
    const ent = state.entregables.find((e) => e.id === entregableId);
    if (!ent) return;
    const dias = ent.diasPlanificadosByUser?.[editUsuario] ?? [];
    if (dias.includes(dateKey)) {
      dispatch({ type: "TOGGLE_ENTREGABLE_DIA", id: entregableId, dateKey, usuario: editUsuario });
    }
    if (newDate && !dias.includes(newDate)) {
      dispatch({ type: "TOGGLE_ENTREGABLE_DIA", id: entregableId, dateKey: newDate, usuario: editUsuario });
    }
    const planTs = ent.planInicioTsByUser?.[editUsuario] ?? null;
    if (!newDate && planTs && planTs.slice(0, 10) === dateKey) {
      dispatch({ type: "SET_ENTREGABLE_PLAN_INICIO", id: entregableId, ts: null, usuario: editUsuario });
    }
  }

  const { focoIds, toggleFoco, clearFoco, focoMax } = useFocoProyectos();
  const focoActivo = focoIds.length > 0;

  const { plannedFoco, plannedOtros } = useMemo(() => {
    if (!focoActivo) return { plannedFoco: plannedPrincipal, plannedOtros: [] as Block[] };
    const foco: Block[] = [];
    const otros: Block[] = [];
    for (const b of plannedPrincipal) {
      if (b.proyectoId && focoIds.includes(b.proyectoId)) foco.push(b);
      else otros.push(b);
    }
    return { plannedFoco: foco, plannedOtros: otros };
  }, [plannedPrincipal, focoIds, focoActivo]);

  const proyectosConTrabajoHoy = useMemo(() => {
    const map = new Map<string, { proyectoId: string; proyectoNombre: string; area: Area; hex: string; count: number }>();
    for (const b of plannedPrincipal) {
      if (!b.proyectoId) continue;
      const existing = map.get(b.proyectoId);
      const hex = b.hex ?? AREA_COLORS[b.area]?.hex ?? "#888";
      if (existing) existing.count++;
      else map.set(b.proyectoId, { proyectoId: b.proyectoId, proyectoNombre: b.proyectoNombre ?? "Sin proyecto", area: b.area, hex, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [plannedPrincipal]);

  const hasPlanned = plannedFoco.length > 0;
  const plannedCount = plannedFoco.length;
  const otrosCount = plannedOtros.length;
  const [planOpen, setPlanOpen] = useState(true);
  const [otrosOpen, setOtrosOpen] = useState(false);
  const [showFocoPicker, setShowFocoPicker] = useState(false);

  return (
    <div className="flex-1 space-y-4">

      {!isMentor && (
        <div className="flex justify-end">
          <ResponsableToggle
            value={respFilter}
            onChange={setRespFilter}
            miembros={state.miembros}
            todoLabel="Todos"
            yoLabel="Yo"
          />
        </div>
      )}

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
              {focoActivo && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700" title="Modo foco activo">
                  Foco · {focoIds.length}
                </span>
              )}
            </button>
            <div className="flex items-center gap-1.5">
              {!isMentor && proyectosConTrabajoHoy.length > 0 && (
                <button
                  onClick={() => setShowFocoPicker(true)}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${focoActivo ? "border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100" : "border-border bg-background text-muted hover:bg-surface hover:text-foreground"}`}
                  title="Modo foco: limita HOY a 1-3 proyectos"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                  </svg>
                  {focoActivo ? "Foco" : "Foco"}
                </button>
              )}
              {!isMentor && (
                <button onClick={() => setShowDrillDown(true)}
                  className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Añadir
                </button>
              )}
            </div>
          </div>

          {planOpen && !hasPlanned && otrosCount === 0 && (
            <p className="py-3 text-center text-xs text-muted">Nada planificado. Usa el botón + para añadir.</p>
          )}
          {planOpen && focoActivo && !hasPlanned && otrosCount > 0 && (
            <p className="py-3 text-center text-xs text-muted">Nada planificado hoy en los {focoIds.length === 1 ? "proyecto" : "proyectos"} con foco. Revisa &quot;Otros proyectos&quot; abajo.</p>
          )}

          {planOpen && (() => {
            // Separamos visualmente "Por hora" / "Sin hora" para que el orden
            // cronológico sea inmediatamente legible. Antes mostrábamos un
            // encabezado por proyecto cada vez que cambiaba — eso hacía
            // perder la sensación de ordenación temporal cuando los bloques
            // de distintos proyectos se intercalaban por hora.
            const conHora = plannedFoco.filter((b) => b.planInicioTs);
            const sinHora = aplicarOrdenSinHora(plannedFoco.filter((b) => !b.planInicioTs));
            const reorderBindings = (block: Block) => {
              if (isMentor) return {};
              const idx = sinHora.findIndex((b) => (b.entregableId ?? b.id) === (block.entregableId ?? block.id));
              const isInSinHora = idx !== -1;
              if (!isInSinHora) return {};
              return {
                onMoveUp: () => moveSinHora(sinHora, block, "up"),
                onMoveDown: () => moveSinHora(sinHora, block, "down"),
                canMoveUp: idx > 0,
                canMoveDown: idx < sinHora.length - 1,
              } as const;
            };
            const renderRow = (block: Block) => {
              const hex = AREA_COLORS[block.area]?.hex ?? "#888";
              return (
                <PlannedBlockRow key={block.id} block={block} hex={hex} isMentor={isMentor} refDate={selectedDate}
                  pasoBadgeLabel={pasoBadgeLabel}
                  onSetTime={(hhmm) => asignarHora(block, hhmm)}
                  onOpenDetalle={block.entregableId ? () => setDetalleEntregableId(block.entregableId!) : undefined}
                  onReschedule={(newDate) => {
                    if (block.id.startsWith("pending-") && block.pasoId) {
                      if (!newDate) dispatch({ type: "DELETE_PASO", id: block.pasoId });
                    } else if (block.id.startsWith("next-") && block.pasoId) {
                      dispatch({ type: "RESCHEDULE_NEXT_PASO", pasoId: block.pasoId, newDate });
                    } else if (block.id.startsWith("ent-") && block.entregableId) {
                      reprogramarEntregable(block.entregableId, newDate);
                    }
                  }}
                  {...reorderBindings(block)}
                />
              );
            };
            return (
              <div className="mt-3 space-y-1.5">
                {conHora.length > 0 && (
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">Por hora</p>
                )}
                {conHora.map(renderRow)}
                {sinHora.length > 0 && (
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted/70">Sin hora</p>
                )}
                {sinHora.map(renderRow)}
              </div>
            );
          })()}

          {planOpen && focoActivo && otrosCount > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setOtrosOpen((v) => !v)}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-violet-200 bg-violet-50/40 px-3 py-2 text-left transition-colors hover:bg-violet-50"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                  className={`shrink-0 text-violet-500 transition-transform ${otrosOpen ? "rotate-90" : ""}`}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <p className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-violet-700">
                  Otros proyectos con trabajo hoy ({otrosCount})
                </p>
              </button>
              {otrosOpen && (() => {
                const conHora = plannedOtros.filter((b) => b.planInicioTs);
                const sinHora = aplicarOrdenSinHora(plannedOtros.filter((b) => !b.planInicioTs));
                const reorderBindings = (block: Block) => {
                  if (isMentor) return {};
                  const idx = sinHora.findIndex((b) => (b.entregableId ?? b.id) === (block.entregableId ?? block.id));
                  if (idx === -1) return {};
                  return {
                    onMoveUp: () => moveSinHora(sinHora, block, "up"),
                    onMoveDown: () => moveSinHora(sinHora, block, "down"),
                    canMoveUp: idx > 0,
                    canMoveDown: idx < sinHora.length - 1,
                  } as const;
                };
                const renderRow = (block: Block) => {
                  const hex = AREA_COLORS[block.area]?.hex ?? "#888";
                  return (
                    <PlannedBlockRow key={block.id} block={block} hex={hex} isMentor={isMentor} refDate={selectedDate}
                      pasoBadgeLabel={pasoBadgeLabel}
                      onSetTime={(hhmm) => asignarHora(block, hhmm)}
                      onOpenDetalle={block.entregableId ? () => setDetalleEntregableId(block.entregableId!) : undefined}
                      onReschedule={(newDate) => {
                        if (block.id.startsWith("pending-") && block.pasoId) {
                          if (!newDate) dispatch({ type: "DELETE_PASO", id: block.pasoId });
                        } else if (block.id.startsWith("next-") && block.pasoId) {
                          dispatch({ type: "RESCHEDULE_NEXT_PASO", pasoId: block.pasoId, newDate });
                        } else if (block.id.startsWith("ent-") && block.entregableId) {
                          reprogramarEntregable(block.entregableId, newDate);
                        }
                      }}
                      {...reorderBindings(block)}
                    />
                  );
                };
                return (
                  <div className="mt-2 space-y-1.5">
                    {conHora.length > 0 && (
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">Por hora</p>
                    )}
                    {conHora.map(renderRow)}
                    {sinHora.length > 0 && (
                      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted/70">Sin hora</p>
                    )}
                    {sinHora.map(renderRow)}
                  </div>
                );
              })()}
            </div>
          )}

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
                  // Priorizamos abrir el detalle del entregable (notas, URLs,
                  // pasos, historial de sesiones con edición de horas…). Si el
                  // bloque es un paso legacy sin entregable asociado, caemos al
                  // editor de tiempos del paso como antes.
                  const openDetalle = block.entregableId ? () => setDetalleEntregableId(block.entregableId!) : null;
                  const openLegacyPasoEditor = !openDetalle && (block.type === "done" || block.type === "active") && !!block.pasoId
                    ? () => setEditingBlock(block)
                    : null;
                  const onClick = openDetalle ?? openLegacyPasoEditor;
                  const clickable = !!onClick;
                  return (
                    <div key={block.id}
                      className={`mb-1 rounded-lg border-l-[3px] px-3 py-2 ${clickable ? "cursor-pointer hover:brightness-95 transition-all" : ""}`}
                      style={{ borderLeftColor: color, backgroundColor: color + "0c" }}
                      onClick={onClick ?? undefined}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      title={openDetalle ? "Abrir entregable (notas, URLs, pasos…)" : undefined}
                      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}>
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
                        <span className={`flex-1 text-sm font-medium ${block.type === "done" ? "text-muted line-through" : "text-foreground"}`}>{block.title}</span>
                        {openDetalle && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted/60" aria-hidden="true">
                            <path d="M14 3h7v7" />
                            <path d="M10 14 21 3" />
                            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                          </svg>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{block.subtitle}</p>
                      {!isMentor && block.entregableId !== undefined && block.sesionIdx !== undefined && block.sesionInicioTs ? (
                        <SesionTimeInline
                          color={color}
                          entregableId={block.entregableId}
                          sesionIdx={block.sesionIdx}
                          inicioTs={block.sesionInicioTs}
                          finTs={block.sesionFinTs ?? null}
                          dateKey={dateKey}
                          durationLabel={block.durationLabel}
                        />
                      ) : (
                        (block.timeLabel || block.durationLabel) && (
                          <p className="mt-0.5 text-[10px] text-muted/60">{block.timeLabel}{block.durationLabel ? ` · ${block.durationLabel}` : ""}</p>
                        )
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

      {/* Foco picker */}
      {showFocoPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
          role="dialog" aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setShowFocoPicker(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") setShowFocoPicker(false); }}>
          <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-background p-5 shadow-2xl">
            <div className="mb-1 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" fill="currentColor" />
              </svg>
              <h2 className="text-base font-semibold text-foreground">Modo foco</h2>
            </div>
            <p className="mb-3 text-[12px] text-muted">
              Elige hasta {focoMax} proyectos. Solo verás trabajo de esos proyectos como principal; el resto queda en &quot;Otros proyectos con trabajo hoy&quot;.
            </p>
            {proyectosConTrabajoHoy.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No hay proyectos con trabajo hoy.</p>
            ) : (
              <div className="mb-3 space-y-1.5">
                {proyectosConTrabajoHoy.map((p) => {
                  const selected = focoIds.includes(p.proyectoId);
                  const disabled = !selected && focoIds.length >= focoMax;
                  return (
                    <button
                      key={p.proyectoId}
                      onClick={() => toggleFoco(p.proyectoId)}
                      disabled={disabled}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${selected ? "border-violet-400 bg-violet-50" : "border-border bg-surface/50 hover:bg-surface"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                      title={disabled ? `Máximo ${focoMax} proyectos en foco` : undefined}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.hex }} />
                      <span className="flex-1 truncate text-sm font-medium text-foreground">{p.proyectoNombre}</span>
                      <span className="text-[11px] text-muted">{p.count}</span>
                      {selected && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { clearFoco(); setShowFocoPicker(false); }}
                disabled={!focoActivo}
                className="flex-1 rounded-lg border border-border py-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-40"
              >
                Quitar foco
              </button>
              <button
                onClick={() => setShowFocoPicker(false)}
                className="flex-1 rounded-lg bg-foreground py-2.5 text-xs font-semibold text-background hover:bg-foreground/90"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit time of done block (histórico pasado) */}
      {editingBlock && editingBlock.pasoId && (
        <EditBlockTimesDialog
          block={editingBlock}
          pasoId={editingBlock.pasoId}
          onClose={() => setEditingBlock(null)}
        />
      )}


      {/* Detalle del entregable (notas, URLs, pasos, historial) */}
      {detalleEntregableId && (() => {
        const ent = state.entregables.find((e) => e.id === detalleEntregableId);
        if (!ent) return null;
        return (
          <EntregableDetalleDialog entregable={ent} onClose={() => setDetalleEntregableId(null)} />
        );
      })()}
    </div>
  );
}

/* ============================================================
   ENTREGABLE DETALLE DIALOG — abre notas, URLs, pasos, historial
   ============================================================ */

function EntregableDetalleDialog({ entregable, onClose }: { entregable: Entregable; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-end">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-background text-muted shadow-md transition-colors hover:bg-surface hover:text-foreground"
            aria-label="Cerrar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <EntregableActivoCard entregable={entregable} mode="detalle" />
      </div>
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

/** Edición inline de las horas de una sesión del horario, sin diálogo.
 *  El usuario cambia inicio o fin con dos `<input type="time">` y se despacha
 *  `UPDATE_SESION_ENTREGABLE_TIMES` directamente. Si la sesión está activa
 *  (`finTs === null`), poner una hora de fin la cierra; vaciarla la deja abierta.
 *  No propaga el clic para que no se abra el detalle del entregable al editar. */
function SesionTimeInline({
  color,
  entregableId,
  sesionIdx,
  inicioTs,
  finTs,
  dateKey,
  durationLabel,
}: {
  color: string;
  entregableId: string;
  sesionIdx: number;
  inicioTs: string;
  finTs: string | null;
  dateKey: string;
  durationLabel?: string;
}) {
  const dispatch = useAppDispatch();
  const inicioVal = hhmmFromIso(inicioTs) ?? "";
  const finVal = hhmmFromIso(finTs) ?? "";

  function commit(nextInicio: string, nextFin: string) {
    if (!nextInicio) return;
    const inicioIso = isoFromDateAndHhmm(dateKey, nextInicio);
    const finIso = nextFin ? isoFromDateAndHhmm(dateKey, nextFin) : null;
    if (finIso && finIso <= inicioIso) return;
    dispatch({
      type: "UPDATE_SESION_ENTREGABLE_TIMES",
      id: entregableId,
      sesionIdx,
      inicioTs: inicioIso,
      finTs: finIso,
    });
  }

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted/80"
      onClick={stop}
      onKeyDown={stop}
    >
      <input
        type="time"
        value={inicioVal}
        onChange={(e) => commit(e.target.value, finVal)}
        onClick={stop}
        aria-label="Hora de inicio"
        title="Cambiar hora de inicio"
        className="rounded-md border bg-background px-1.5 py-0.5 text-[11px] font-semibold tabular-nums outline-none focus:ring-1 focus:ring-accent"
        style={{ color, borderColor: color + "55" }}
      />
      <span aria-hidden>–</span>
      <input
        type="time"
        value={finVal}
        onChange={(e) => commit(inicioVal, e.target.value)}
        onClick={stop}
        aria-label="Hora de fin"
        title={finTs ? "Cambiar hora de fin (déjalo vacío para reabrir)" : "Poner hora de fin para cerrar la sesión"}
        placeholder="—"
        className="rounded-md border bg-background px-1.5 py-0.5 text-[11px] font-semibold tabular-nums outline-none focus:ring-1 focus:ring-accent"
        style={{ color: finVal ? color : undefined, borderColor: color + "55" }}
      />
      {durationLabel && <span className="text-muted/60">· {durationLabel}</span>}
      {!finVal && (
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          en marcha
        </span>
      )}
    </div>
  );
}

function EditBlockTimesDialog({ block, pasoId, onClose }: { block: Block; pasoId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const paso = state.pasos.find((p) => p.id === pasoId);

  const [inicio, setInicio] = useState(() => paso?.inicioTs ? toLocalDT(new Date(paso.inicioTs)) : "");
  const [fin, setFin] = useState(() => paso?.finTs ? toLocalDT(new Date(paso.finTs)) : "");

  const isDone = !!paso?.finTs;
  const isActive = !isDone && !!paso?.inicioTs;

  function save() {
    if (!inicio) return;
    const inicioTs = new Date(inicio).toISOString();
    const finTs = fin ? new Date(fin).toISOString() : null;
    if (finTs && finTs <= inicioTs) return;
    dispatch({ type: "UPDATE_PASO_TIMES", id: pasoId, inicioTs, finTs });
    onClose();
  }

  function restaurar() {
    dispatch({ type: "RESTORE_PASO", id: pasoId });
    onClose();
  }

  function cancelarInicio() {
    dispatch({ type: "CANCEL_INICIO_PASO", id: pasoId });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
      role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl bg-background p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-foreground">Editar registro</h3>
        <p className="mt-1 mb-3 truncate text-xs text-muted">{block.title}</p>

        <label className="mb-1 block text-[11px] font-medium text-muted">Inicio</label>
        <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent" />

        <label className="mb-1 block text-[11px] font-medium text-muted">Fin</label>
        <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent" />

        {isDone && (
          <button onClick={restaurar}
            className="mb-3 w-full rounded-lg border border-amber-300 bg-amber-50 py-2 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">
            Restaurar (no lo había terminado)
          </button>
        )}
        {isActive && (
          <button onClick={cancelarInicio}
            className="mb-3 w-full rounded-lg border border-zinc-300 bg-zinc-50 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100">
            Cancelar inicio (no lo había empezado)
          </button>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2.5 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
          <button onClick={save} disabled={!inicio} className="flex-1 rounded-lg bg-accent py-2.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-40">Guardar</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PLANNED BLOCK ROW with reschedule/delete
   ============================================================ */

function PlannedBlockRow({ block, hex, isMentor, refDate, onSetTime, onReschedule, onOpenDetalle, pasoBadgeLabel = "Paso tuyo", onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
  block: Block; hex: string; isMentor: boolean; refDate: Date;
  /** Recibe directamente la hora HH:MM o null para limpiarla. */
  onSetTime: (hhmm: string | null) => void;
  onReschedule: (newDate: string | null) => void;
  /** Si se proporciona, el título es clickable y abre el detalle del entregable. */
  onOpenDetalle?: () => void;
  pasoBadgeLabel?: string;
  /** Reorden manual del bloque dentro de "Sin hora". */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const horaPlan = hhmmFromIso(block.planInicioTs);

  return (
    <div className="flex items-center gap-2 rounded-lg border-l-[3px] px-3 py-2.5"
      style={{ borderLeftColor: hex, backgroundColor: hex + "0c" }}>
      {!isMentor && (onMoveUp || onMoveDown) && (
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="text-[10px] leading-none text-muted/40 hover:text-foreground disabled:opacity-20 disabled:hover:text-muted/40"
            title="Subir"
            aria-label="Subir entregable"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="text-[10px] leading-none text-muted/40 hover:text-foreground disabled:opacity-20 disabled:hover:text-muted/40"
            title="Bajar"
            aria-label="Bajar entregable"
          >
            ▼
          </button>
        </div>
      )}
      {!isMentor ? (
        <input
          type="time"
          value={horaPlan ?? ""}
          onChange={(e) => onSetTime(e.target.value || null)}
          className="shrink-0 rounded-md bg-background px-1.5 py-0.5 text-[11px] font-bold tabular-nums outline-none focus:ring-1 focus:ring-accent"
          style={{ color: horaPlan ? hex : undefined, borderColor: hex + "40", borderWidth: 1 }}
          title={horaPlan ? "Editar hora planificada (vacía para quitarla)" : "Asignar hora planificada"}
          aria-label="Hora planificada"
        />
      ) : horaPlan ? (
        <span className="shrink-0 rounded-md bg-background px-2 py-0.5 text-[11px] font-bold tabular-nums" style={{ color: hex }}>{horaPlan}</span>
      ) : (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
      )}
      <div className="flex-1 min-w-0">
        {onOpenDetalle ? (
          <button
            type="button"
            onClick={onOpenDetalle}
            className="block w-full min-w-0 text-left"
            title="Abrir entregable (notas, URLs, pasos…)"
          >
            <p className="truncate text-sm font-medium text-foreground hover:text-accent hover:underline underline-offset-2">
              {block.title}
              {block.pasoTuyo && (
                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">{pasoBadgeLabel}</span>
              )}
            </p>
            <p className="truncate text-xs text-muted">{block.subtitle}</p>
          </button>
        ) : (
          <>
            <p className="truncate text-sm font-medium text-foreground">
              {block.title}
              {block.pasoTuyo && (
                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">{pasoBadgeLabel}</span>
              )}
            </p>
            <p className="truncate text-xs text-muted">{block.subtitle}</p>
          </>
        )}
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
          {onOpenDetalle && (
            <button
              type="button"
              onClick={onOpenDetalle}
              className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-2 text-[11px] font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
              title="Abrir entregable (notas, URLs, pasos…)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 3h7v7" />
                <path d="M10 14 21 3" />
                <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
              </svg>
              Abrir
            </button>
          )}
          <button type="button" onClick={() => setShowMenu((s) => !s)} title="Opciones"
            className="rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
            </svg>
          </button>
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
    dispatch({ type: "ADD_RESULTADO", payload: { id, nombre: name, descripcion: null, proyectoId: selectedProyectoId, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null, responsable: currentUser } });
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
        responsable: currentUser,
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
