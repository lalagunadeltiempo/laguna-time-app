"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import {
  ambitoDeArea, AREA_COLORS, AREAS_EMPRESA, AREAS_PERSONAL,
  type Area, type Entregable, type Resultado, type Proyecto, type Ambito, type MiembroInfo,
  type TipoEntregable,
} from "@/lib/types";
import { computeProyectoRitmo } from "@/lib/proyecto-stats";
import { mesKey as mesKeyOf, weeksOfMonth, type WeekInfo } from "@/lib/semana-utils";
import { GanttMultiProyecto, type GanttProject } from "./GanttMultiProyecto";
import { InlineNombre, ResponsableSelect } from "./InlineEditors";
import { generateId } from "@/lib/store";

export type AmbitoFilter = "todo" | Ambito;

/* ============================================================
   Helpers
   ============================================================ */

const AREA_ORDER: Area[] = [
  ...AREAS_EMPRESA.map((a) => a.id),
  ...AREAS_PERSONAL.map((a) => a.id),
] as Area[];

const AREA_LABELS: Record<Area, string> = {
  ...Object.fromEntries(AREAS_EMPRESA.map((a) => [a.id, a.label])),
  ...Object.fromEntries(AREAS_PERSONAL.map((a) => [a.id, a.label])),
} as Record<Area, string>;

/** Para un resultado, calcula si está "activo" en el mes actual.
 *
 *  Jerarquía (la superior gana con prioridad absoluta):
 *   1. `mesesActivos` (explícito): si está definido, solo es activo en
 *      los meses marcados. Las `semanasActivas` o `semana` no pueden
 *      expandirlo a otros meses (p.ej. semanas cross-month como
 *      "2026-04-27" que es S5 abril y S1 mayo a la vez).
 *   2. Si no hay `mesesActivos`, fallback a `semanasActivas`, `semana`
 *      legada o entregables con `ent.semana` del mes. */
function resultadoActivoEnMes(r: Resultado, entregables: Entregable[], mesK: string, weekMondays: Set<string>): boolean {
  const mesesExplicitos = r.mesesActivos ?? [];
  if (mesesExplicitos.length > 0) {
    return mesesExplicitos.includes(mesK);
  }
  if ((r.semanasActivas ?? []).some((sk) => weekMondays.has(sk) || mesKeyOf(sk) === mesK)) return true;
  if (r.semana && (weekMondays.has(r.semana) || mesKeyOf(r.semana) === mesK)) return true;
  if (entregables.some((e) => e.semana && (weekMondays.has(e.semana) || mesKeyOf(e.semana) === mesK))) return true;
  return false;
}

/* ============================================================
   Main component
   ============================================================ */

interface Props {
  selectedDate: Date;
  onNavigateToWeek?: (date: Date) => void;
}

interface ResultadoCardData {
  resultado: Resultado;
  proyecto: Proyecto;
  area: Area;
  areaHex: string;
  entregables: Entregable[];
  entregablesTotal: number;
  entregablesHechos: number;
}

export function PlanMes({ selectedDate }: Props) {
  const state = useAppState();
  const isMentor = useIsMentor();
  const { nombre: currentUser } = useUsuario();
  const [filtro, setFiltro] = useState<AmbitoFilter>("empresa");
  const [respFilter, setRespFilter] = useState<ResponsableFilter>("todo");
  const [showDone, setShowDone] = useState(false);

  const mesLabel = useMemo(() =>
    selectedDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
  [selectedDate]);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const mesK = `${year}-${String(month + 1).padStart(2, "0")}`;
  const weeks = useMemo(() => weeksOfMonth(year, month), [year, month]);
  const weekMondays = useMemo(() => new Set(weeks.map((w) => w.monday)), [weeks]);
  const [hoy] = useState<Date>(() => new Date());

  /* ---- Resultados visibles este mes ---- */
  const { cards, ganttProjects } = useMemo<{
    cards: ResultadoCardData[];
    ganttProjects: GanttProject[];
  }>(() => {
    const cards: ResultadoCardData[] = [];
    const ganttProjects: GanttProject[] = [];

    for (const proj of state.proyectos) {
      const projEstado = proj.estado ?? "plan";
      if (projEstado === "completado" || projEstado === "pausado") continue;
      if (filtro !== "todo" && ambitoDeArea(proj.area) !== filtro) continue;

      const resultados = state.resultados.filter((r) => r.proyectoId === proj.id);
      const resIds = new Set(resultados.map((r) => r.id));
      const entregables = state.entregables.filter((e) => resIds.has(e.resultadoId));

      const filtered = respFilter === "todo"
        ? entregables
        : entregables.filter((e) => matchesResponsable(e.responsable, respFilter, currentUser));
      if (filtered.length === 0 && entregables.length > 0) continue;

      // Proyecto visible en el mes si el proyecto tiene ese mes activo o algún resultado está activo.
      // La lista de resultados, sin embargo, es ESTRICTA: solo entran los que el usuario marcó
      // explícitamente en este mes (mesesActivos, semanasActivas del mes, semana legada o entregable del mes).
      let inMonth = (proj.mesesActivos ?? []).includes(mesK);
      const resultadosActivos: Resultado[] = [];
      for (const r of resultados) {
        const entsRes = entregables.filter((e) => e.resultadoId === r.id);
        if (resultadoActivoEnMes(r, entsRes, mesK, weekMondays)) {
          inMonth = true;
          resultadosActivos.push(r);
        }
      }
      if (!inMonth) continue;

      const areaHex = AREA_COLORS[proj.area]?.hex ?? "#888";

      for (const res of resultadosActivos) {
        const entsRes = entregables.filter((e) => e.resultadoId === res.id);
        const entHechos = entsRes.filter((e) => e.estado === "hecho").length;
        cards.push({
          resultado: res,
          proyecto: proj,
          area: proj.area as Area,
          areaHex,
          entregables: entsRes,
          entregablesTotal: entsRes.length,
          entregablesHechos: entHechos,
        });
      }

      const ritmo = computeProyectoRitmo(proj, entregables, resultados, hoy, state.miembros, state.pasos, state.planConfig);
      ganttProjects.push({ proyecto: proj, resultados, entregables, ritmo });
    }

    return { cards, ganttProjects };
  }, [state, filtro, respFilter, currentUser, hoy, mesK, weekMondays]);

  /* ---- Agrupación por semana y área ---- */
  interface WeekBucket {
    week: WeekInfo;
    byArea: Map<Area, ResultadoCardData[]>;
  }

  const weekBuckets: WeekBucket[] = useMemo(() => {
    const buckets = weeks.map((w) => ({ week: w, byArea: new Map<Area, ResultadoCardData[]>() }));
    for (const card of cards) {
      const semanas = (card.resultado.semanasActivas ?? (card.resultado.semana ? [card.resultado.semana] : []))
        .filter((sk) => weekMondays.has(sk));
      for (const sk of semanas) {
        const bucket = buckets.find((b) => b.week.monday === sk);
        if (!bucket) continue;
        if (!bucket.byArea.has(card.area)) bucket.byArea.set(card.area, []);
        bucket.byArea.get(card.area)!.push(card);
      }
    }
    return buckets;
  }, [cards, weeks, weekMondays]);

  /* ---- "Sin semana": resultados activos en el mes sin semana asignada en el mes ---- */
  const sinSemanaCards = useMemo(() => {
    const out: ResultadoCardData[] = [];
    for (const card of cards) {
      const semanas = (card.resultado.semanasActivas ?? (card.resultado.semana ? [card.resultado.semana] : []))
        .filter((sk) => weekMondays.has(sk));
      if (semanas.length > 0) continue;
      // Tampoco hay entregables con semana de este mes ya asignados.
      const tieneEntregableDelMes = card.entregables.some((e) => e.semana && (weekMondays.has(e.semana) || mesKeyOf(e.semana) === mesK));
      if (tieneEntregableDelMes) continue;
      out.push(card);
    }
    return out;
  }, [cards, weekMondays, mesK]);

  const totalResultados = cards.length;

  return (
    <div className="flex-1">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium capitalize text-muted">{mesLabel}</p>
          <p className="text-xs text-muted">
            {totalResultados} resultado{totalResultados !== 1 ? "s" : ""} activo{totalResultados !== 1 ? "s" : ""}
          </p>
        </div>
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

      {/* Gantt del mes */}
      {ganttProjects.length > 0 && (
        <section className="mb-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Gantt</h3>
          <GanttMultiProyecto projects={ganttProjects} hoy={hoy} selectedDate={selectedDate} editable={!isMentor} />
        </section>
      )}

      {/* Semanas del mes */}
      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Semanas del mes</h3>

        {totalResultados === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/30 py-8 text-center">
            <p className="text-sm text-muted">No hay resultados activos este mes.</p>
            <p className="mt-1 text-xs text-muted">Marca el mes al proyecto o a un resultado desde Plan Trimestre.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {weekBuckets.map((bucket) => (
              <WeekColumn key={bucket.week.monday}
                week={bucket.week}
                byArea={bucket.byArea}
                mesK={mesK}
                showDone={showDone}
                respFilter={respFilter}
                currentUser={currentUser}
                isMentor={isMentor}
                miembros={state.miembros}
                weeks={weeks}
              />
            ))}
          </div>
        )}

        {sinSemanaCards.length > 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-amber-400/50 bg-amber-50/30 p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-700">Sin semana · {sinSemanaCards.length}</p>
            <p className="mb-3 text-[10px] text-amber-700/80">
              Resultados con mes activo pero sin ninguna semana asignada este mes. Asígnales semanas con los chips.
            </p>
            <div className="space-y-2">
              {groupCardsByArea(sinSemanaCards).map(({ area, label, items }) => (
                <div key={area}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: AREA_COLORS[area]?.hex ?? "#888" }} />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700/80">{label}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map((card) => (
                      <ResultadoCard key={card.resultado.id}
                        card={card}
                        week={null}
                        weeks={weeks}
                        mesK={mesK}
                        showDone={showDone}
                        respFilter={respFilter}
                        currentUser={currentUser}
                        isMentor={isMentor}
                        miembros={state.miembros}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================================================
   Agrupación por área
   ============================================================ */

function groupCardsByArea(cards: ResultadoCardData[]): { area: Area; label: string; items: ResultadoCardData[] }[] {
  const byArea = new Map<Area, ResultadoCardData[]>();
  for (const c of cards) {
    if (!byArea.has(c.area)) byArea.set(c.area, []);
    byArea.get(c.area)!.push(c);
  }
  return AREA_ORDER
    .filter((a) => byArea.has(a))
    .map((a) => ({ area: a, label: AREA_LABELS[a] ?? a, items: byArea.get(a)! }));
}

/* ============================================================
   WeekColumn: columna de una semana con resultados por área
   ============================================================ */

function WeekColumn({ week, byArea, mesK, showDone, respFilter, currentUser, isMentor, miembros, weeks }: {
  week: WeekInfo;
  byArea: Map<Area, ResultadoCardData[]>;
  mesK: string;
  showDone: boolean;
  respFilter: ResponsableFilter;
  currentUser: string;
  isMentor: boolean;
  miembros: MiembroInfo[];
  weeks: WeekInfo[];
}) {
  const now = new Date();
  const nowMs = now.getTime();
  const isCurrent = nowMs >= week.mondayMs && nowMs <= week.sundayMs;
  const allCards = [...byArea.values()].flat();
  const count = allCards.length;

  const ordered = AREA_ORDER
    .filter((a) => byArea.has(a))
    .map((a) => ({ area: a, label: AREA_LABELS[a] ?? a, items: byArea.get(a)! }));

  return (
    <div className={`rounded-xl border p-3 ${isCurrent ? "border-accent/40 bg-accent/5" : "border-border bg-background"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <h4 className={`text-xs font-bold uppercase ${isCurrent ? "text-accent" : "text-muted"}`}>{week.label}</h4>
          <span className="text-[10px] text-muted">{week.rangeLabel}</span>
        </div>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">{count}</span>
      </div>

      {count === 0 ? (
        <p className="py-4 text-center text-xs text-muted">—</p>
      ) : (
        <div className="space-y-3">
          {ordered.map(({ area, label, items }) => (
            <div key={area}>
              <div className="mb-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: AREA_COLORS[area]?.hex ?? "#888" }} />
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted">{label}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((card) => (
                  <ResultadoCard key={card.resultado.id}
                    card={card}
                    week={week}
                    weeks={weeks}
                    mesK={mesK}
                    showDone={showDone}
                    respFilter={respFilter}
                    currentUser={currentUser}
                    isMentor={isMentor}
                    miembros={miembros}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ResultadoCard: colapsable con entregables de la semana
   ============================================================ */

function ResultadoCard({ card, week, weeks, mesK, showDone, respFilter, currentUser, isMentor, miembros }: {
  card: ResultadoCardData;
  /** null si se muestra en la sección "Sin semana" */
  week: WeekInfo | null;
  weeks: WeekInfo[];
  mesK: string;
  showDone: boolean;
  respFilter: ResponsableFilter;
  currentUser: string;
  isMentor: boolean;
  miembros: MiembroInfo[];
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const { resultado, proyecto, areaHex } = card;

  // Entregables a mostrar dentro de este card:
  // - Si está en una semana: los que tengan ent.semana === week.monday + los sin semana (para planificar)
  // - Si está en "Sin semana": todos los entregables del resultado sin semana (o sin semana del mes)
  const entsVisibles = card.entregables.filter((e) => {
    if (!showDone && (e.estado === "hecho" || e.estado === "cancelada")) return false;
    if (!matchesResponsable(e.responsable, respFilter, currentUser)) return false;
    if (week) {
      return e.semana === week.monday || !e.semana;
    }
    return !e.semana;
  });

  const semanasActivas = resultado.semanasActivas ?? (resultado.semana ? [resultado.semana] : []);

  function handleAddEntregable() {
    const nombre = window.prompt("Nombre del entregable");
    if (!nombre || !nombre.trim()) return;
    const nuevo: Entregable = {
      id: generateId(),
      nombre: nombre.trim(),
      resultadoId: resultado.id,
      tipo: "raw" as TipoEntregable,
      plantillaId: null,
      diasEstimados: 1,
      diasHechos: 0,
      esDiaria: false,
      responsable: currentUser,
      estado: "a_futuro",
      creado: new Date().toISOString(),
      semana: week ? week.monday : null,
      fechaLimite: null,
      fechaInicio: null,
    };
    dispatch({ type: "ADD_ENTREGABLE", payload: nuevo });
  }

  return (
    <div className="rounded-lg border-2 bg-background" style={{ borderColor: areaHex + "40" }}>
      <div className="flex w-full items-center gap-1.5 p-2">
        <button onClick={() => setOpen(!open)}
          className="flex shrink-0 items-center gap-1.5"
          title={open ? "Contraer" : "Expandir"}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: areaHex }} />
        </button>
        <div className="min-w-0 flex-1">
          <InlineNombre
            value={resultado.nombre}
            onSave={(nombre) => dispatch({ type: "UPDATE_RESULTADO", id: resultado.id, changes: { nombre } })}
            disabled={isMentor}
            className="truncate text-[11px] font-semibold text-foreground"
            inputClassName="text-[11px] font-semibold text-foreground"
          />
          <p className="truncate text-[9px] uppercase tracking-wider text-muted">{proyecto.nombre}</p>
        </div>
        {!isMentor && (
          <ResponsableSelect
            value={resultado.responsable}
            miembros={miembros}
            onChange={(v) => dispatch({ type: "UPDATE_RESULTADO", id: resultado.id, changes: { responsable: v || undefined } })}
          />
        )}
        {!isMentor && week === null && (resultado.mesesActivos ?? []).includes(mesK) && (
          <button
            onClick={() => dispatch({ type: "TOGGLE_RESULTADO_MES", id: resultado.id, mes: mesK })}
            title="Quitar de este mes (reprograma desde Plan Trimestre)"
            className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] font-semibold text-muted hover:border-red-400 hover:text-red-500"
          >
            Quitar del mes
          </button>
        )}
      </div>

      {/* Chips de semana siempre visibles (para asignar/quitar en cualquier momento) */}
      {!isMentor && (
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          <span className="mr-0.5 text-[8px] uppercase tracking-wider text-muted">Sem:</span>
          {weeks.map((w) => {
            const active = semanasActivas.includes(w.monday);
            return (
              <button key={w.idx}
                onClick={() => dispatch({ type: "TOGGLE_RESULTADO_SEMANA_ACTIVA", id: resultado.id, semana: w.monday })}
                title={`${w.label} · ${w.rangeLabel}`}
                className={`rounded px-1 py-0.5 text-[8px] font-semibold transition-colors ${
                  active ? "bg-accent text-white" : "border border-border text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div className="space-y-1.5 border-t border-border/60 p-2">
          {entsVisibles.length === 0 ? (
            <p className="pl-1 text-[10px] italic text-muted/70">— sin entregables</p>
          ) : (
            entsVisibles.map((ent) => (
              <div key={ent.id} className="rounded border border-border/40 bg-surface/30 px-1.5 py-1">
                <EntregableInlineRow ent={ent} miembros={miembros} editable={!isMentor} />
                {!isMentor && (
                  <div className="mt-1 flex items-center justify-end">
                    <EntregableWeekChips
                      entId={ent.id}
                      weeks={weeks}
                      current={ent.semana ?? null}
                    />
                  </div>
                )}
              </div>
            ))
          )}
          {!isMentor && (
            <button onClick={handleAddEntregable}
              className="mt-1 w-full rounded border border-dashed border-border py-1 text-[10px] font-medium text-muted hover:border-accent hover:text-accent">
              + Entregable
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Week chips: single-toggle para entregables (ent.semana)
   ============================================================ */

function EntregableWeekChips({ entId, weeks, current }: {
  entId: string; weeks: WeekInfo[]; current: string | null;
}) {
  const dispatch = useAppDispatch();
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {weeks.map((w) => {
        const active = current === w.monday;
        return (
          <button key={w.idx}
            onClick={() => dispatch({ type: "SET_ENTREGABLE_SEMANA", id: entId, semana: w.monday })}
            title={`${w.label} · ${w.rangeLabel}`}
            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
              active ? "bg-accent text-white" : "border border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {w.label}
          </button>
        );
      })}
      <button
        onClick={() => dispatch({ type: "SET_ENTREGABLE_SEMANA", id: entId, semana: null })}
        title="Sin semana"
        className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
          current == null ? "bg-surface text-foreground" : "border border-border text-muted hover:border-red-300 hover:text-red-500"
        }`}
      >
        −
      </button>
    </div>
  );
}

/* ============================================================
   Inline editor del entregable (nombre, días, responsable, estado)
   ============================================================ */

function EntregableInlineRow({ ent, miembros, editable }: { ent: Entregable; miembros: MiembroInfo[]; editable: boolean }) {
  const dispatch = useAppDispatch();
  const isDone = ent.estado === "hecho";

  const [editingNombre, setEditingNombre] = useState(false);
  const [draftNombre, setDraftNombre] = useState(ent.nombre);
  const [editingDias, setEditingDias] = useState(false);
  const [draftDias, setDraftDias] = useState(String(ent.diasEstimados ?? 0));

  function saveNombre() {
    const trimmed = draftNombre.trim();
    if (trimmed && trimmed !== ent.nombre) {
      dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { nombre: trimmed } });
    } else {
      setDraftNombre(ent.nombre);
    }
    setEditingNombre(false);
  }
  function saveDias() {
    const n = Number.parseInt(draftDias, 10);
    if (Number.isFinite(n) && n >= 0 && n !== ent.diasEstimados) {
      dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { diasEstimados: n } });
    } else {
      setDraftDias(String(ent.diasEstimados ?? 0));
    }
    setEditingDias(false);
  }
  function setResponsable(v: string) {
    dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { responsable: v || undefined } });
  }

  return (
    <div className="space-y-0.5 text-xs">
      {/* Línea 1: bullet + nombre (a toda anchura) */}
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isDone ? "bg-emerald-500" : ent.estado === "en_proceso" ? "bg-amber-500" : "bg-gray-300"}`} />
        {editable && editingNombre ? (
          <input
            autoFocus
            value={draftNombre}
            onChange={(e) => setDraftNombre(e.target.value)}
            onBlur={saveNombre}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); saveNombre(); }
              if (e.key === "Escape") { setDraftNombre(ent.nombre); setEditingNombre(false); }
            }}
            className="min-w-0 flex-1 rounded border border-accent/40 bg-background px-1.5 py-0.5 text-foreground outline-none focus:border-accent"
          />
        ) : (
          <button
            onClick={editable ? () => { setDraftNombre(ent.nombre); setEditingNombre(true); } : undefined}
            className={`min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left ${editable ? "hover:bg-surface/60" : ""} ${isDone ? "text-muted line-through" : "text-foreground"}`}
            title={editable ? "Editar nombre" : ent.nombre}
          >
            {ent.nombre}
          </button>
        )}
      </div>

      {/* Línea 2: meta (días, responsable, estado) */}
      <div className="flex flex-wrap items-center gap-1 pl-3 text-[10px] text-muted">
        {editable && editingDias ? (
          <input
            type="number" min={0} autoFocus
            value={draftDias}
            onChange={(e) => setDraftDias(e.target.value)}
            onBlur={saveDias}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); saveDias(); }
              if (e.key === "Escape") { setDraftDias(String(ent.diasEstimados ?? 0)); setEditingDias(false); }
            }}
            className="w-14 rounded border border-accent/40 bg-background px-1 py-0.5 text-[10px] text-foreground outline-none focus:border-accent"
          />
        ) : (
          <button
            onClick={editable ? () => { setDraftDias(String(ent.diasEstimados ?? 0)); setEditingDias(true); } : undefined}
            className={`shrink-0 rounded px-1 ${editable ? "hover:bg-surface/60 hover:text-foreground" : ""}`}
            title={editable ? "Editar días estimados" : undefined}
          >
            {(ent.diasEstimados ?? 0)}d
          </button>
        )}

        {editable ? (
          <select
            value={ent.responsable ?? ""}
            onChange={(e) => setResponsable(e.target.value)}
            className="shrink-0 rounded bg-surface px-1 py-0.5 outline-none hover:text-foreground"
            title="Responsable"
          >
            <option value="">—</option>
            {miembros.map((m) => (
              <option key={m.id} value={m.nombre}>{m.nombre}</option>
            ))}
          </select>
        ) : (
          ent.responsable && (
            <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[9px]">{ent.responsable}</span>
          )
        )}

        <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[9px]">
          {ent.estado === "hecho" ? "hecho" : ent.estado === "en_proceso" ? "en curso" : ent.estado === "planificado" ? "planif." : ent.estado === "a_futuro" ? "futuro" : ent.estado}
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   Shared toggle components (exported for other plan views)
   ============================================================ */

export function AmbitoToggle({ value, onChange }: { value: AmbitoFilter; onChange: (v: AmbitoFilter) => void }) {
  const opts: { id: AmbitoFilter; label: string }[] = [
    { id: "todo", label: "Todo" },
    { id: "empresa", label: "Empresa" },
    { id: "personal", label: "Personal" },
  ];
  return (
    <div className="flex gap-1 rounded-lg bg-surface p-0.5">
      {opts.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === o.id ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type ResponsableFilter = "todo" | "yo" | string;

export function ResponsableToggle({
  value, onChange, miembros,
}: {
  value: ResponsableFilter;
  onChange: (v: ResponsableFilter) => void;
  miembros: MiembroInfo[];
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface p-0.5">
      <button onClick={() => onChange("todo")}
        className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
          value === "todo" ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"
        }`}>Todos</button>
      <button onClick={() => onChange("yo")}
        className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
          value === "yo" ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"
        }`}>Yo</button>
      <select
        value={value !== "todo" && value !== "yo" ? value : ""}
        onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
        className="rounded-md bg-transparent px-1.5 py-1.5 text-xs font-medium text-muted outline-none hover:text-foreground"
      >
        <option value="">Miembro…</option>
        {miembros.map((m) => (
          <option key={m.id} value={m.nombre}>{m.nombre}</option>
        ))}
      </select>
    </div>
  );
}

export function matchesResponsable(
  responsable: string | undefined,
  filter: ResponsableFilter,
  currentUser: string,
): boolean {
  if (filter === "todo") return true;
  if (filter === "yo") return !responsable || responsable === currentUser;
  return responsable === filter;
}
