"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import {
  ambitoDeArea, AREA_COLORS,
  type Entregable, type Resultado, type Proyecto, type Ambito, type MiembroInfo,
} from "@/lib/types";
import { computeProyectoRitmo, ritmoColor, ritmoLabelCorto, ritmoExplicacion } from "@/lib/proyecto-stats";
import { mesKey as mesKeyOf, weeksOfMonth, type WeekInfo } from "@/lib/semana-utils";

export type AmbitoFilter = "todo" | Ambito;

/* ============================================================
   Helpers
   ============================================================ */

/** Para un resultado, calcula si está "activo" en el mes actual
 *  (según semanasActivas, mesesActivos, o semana legada). */
function resultadoActivoEnMes(r: Resultado, entregables: Entregable[], mesK: string, weekMondays: Set<string>): boolean {
  if ((r.mesesActivos ?? []).includes(mesK)) return true;
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

interface ProjSummary {
  proyecto: Proyecto;
  resultadosActivos: Resultado[];
  entregablesTotal: number;
  entregablesHechos: number;
  entregablesEnCurso: number;
  areaHex: string;
  ritmo: ReturnType<typeof computeProyectoRitmo>;
  warnings: string[];
}

export function PlanMes({ selectedDate }: Props) {
  const state = useAppState();
  const isMentor = useIsMentor();
  const { nombre: currentUser } = useUsuario();
  const [filtro, setFiltro] = useState<AmbitoFilter>(isMentor ? "empresa" : "todo");
  const [respFilter, setRespFilter] = useState<ResponsableFilter>("todo");
  const [showDone, setShowDone] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const mesLabel = useMemo(() =>
    selectedDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
  [selectedDate]);

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const mesK = `${year}-${String(month + 1).padStart(2, "0")}`;
  const weeks = useMemo(() => weeksOfMonth(year, month), [year, month]);
  const weekMondays = useMemo(() => new Set(weeks.map((w) => w.monday)), [weeks]);
  const [hoy] = useState<Date>(() => new Date());

  /* ---- Proyectos visibles este mes ---- */
  const projectSummaries = useMemo<ProjSummary[]>(() => {
    const summaries: ProjSummary[] = [];

    for (const proj of state.proyectos) {
      const projEstado = proj.estado ?? "plan";
      if (projEstado === "completado" || projEstado === "pausado") continue;
      if (filtro !== "todo" && ambitoDeArea(proj.area) !== filtro) continue;

      const resultados = state.resultados.filter((r) => r.proyectoId === proj.id);
      const resIds = new Set(resultados.map((r) => r.id));
      const entregables = state.entregables.filter((e) => resIds.has(e.resultadoId));

      if (!showDone && entregables.length > 0 && entregables.every((e) => e.estado === "hecho" || e.estado === "cancelada")) continue;

      const filtered = respFilter === "todo"
        ? entregables
        : entregables.filter((e) => matchesResponsable(e.responsable, respFilter, currentUser));
      if (filtered.length === 0 && entregables.length > 0) continue;

      // Visibilidad en el mes: mesesActivos del proyecto o de algún resultado, o alguna
      // semana activa/entregable con semana caiga en el mes.
      let inMonth = (proj.mesesActivos ?? []).includes(mesK);
      if (!inMonth) {
        for (const r of resultados) {
          const entsRes = entregables.filter((e) => e.resultadoId === r.id);
          if (resultadoActivoEnMes(r, entsRes, mesK, weekMondays)) { inMonth = true; break; }
        }
      }
      if (!inMonth) continue;

      const resultadosActivos = resultados.filter((r) => {
        const entsRes = entregables.filter((e) => e.resultadoId === r.id);
        return resultadoActivoEnMes(r, entsRes, mesK, weekMondays)
          || (proj.mesesActivos ?? []).includes(mesK);
      });

      const areaHex = AREA_COLORS[proj.area]?.hex ?? "#888";
      const ritmo = computeProyectoRitmo(proj, entregables, resultados, hoy, state.miembros, state.pasos, state.planConfig);
      const entHechos = entregables.filter((e) => e.estado === "hecho").length;
      const entEnCurso = entregables.filter((e) => e.estado === "en_proceso").length;

      const warnings: string[] = [];
      if (entregables.length === 0) warnings.push("Sin entregables");

      summaries.push({
        proyecto: proj,
        resultadosActivos: resultadosActivos.length > 0 ? resultadosActivos : resultados,
        entregablesTotal: entregables.length,
        entregablesHechos: entHechos,
        entregablesEnCurso: entEnCurso,
        areaHex,
        ritmo,
        warnings,
      });
    }

    return summaries;
  }, [state, filtro, respFilter, currentUser, showDone, hoy, mesK, weekMondays]);

  const toggleExpand = (projId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projId)) next.delete(projId); else next.add(projId);
      return next;
    });
  };

  return (
    <div className="flex-1">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium capitalize text-muted">{mesLabel}</p>
          <p className="text-xs text-muted">
            {projectSummaries.length} proyecto{projectSummaries.length !== 1 ? "s" : ""} activo{projectSummaries.length !== 1 ? "s" : ""}
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

      {/* Leyenda de semanas */}
      <section className="mb-6 rounded-xl border border-border bg-surface/40 p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">Semanas del mes</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {weeks.map((w) => (
            <div key={w.idx} className="flex items-center gap-1.5 text-[11px]">
              <span className="rounded bg-background px-1.5 py-0.5 font-bold text-foreground">{w.label}</span>
              <span className="text-muted">{w.rangeLabel}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Proyectos del mes */}
      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Proyectos del mes</h3>

        {projectSummaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface/30 py-8 text-center">
            <p className="text-sm text-muted">No hay proyectos activos este mes.</p>
            <p className="mt-1 text-xs text-muted">Marca el mes al proyecto o a un resultado desde Plan Trimestre.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projectSummaries.map((s) => {
              const pct = s.entregablesTotal > 0 ? Math.round((s.entregablesHechos / s.entregablesTotal) * 100) : 0;
              const rColor = ritmoColor(s.ritmo.estadoRitmo);
              const isExpanded = expandedProjects.has(s.proyecto.id);

              return (
                <div key={s.proyecto.id} className="rounded-xl border border-border bg-background overflow-hidden">
                  <button onClick={() => toggleExpand(s.proyecto.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/50">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.areaHex }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{s.proyecto.nombre}</span>

                    <div className="hidden sm:flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: rColor }} />
                      </div>
                      <span className="text-[11px] font-semibold" style={{ color: rColor }}>{pct}%</span>
                    </div>

                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: rColor + "18", color: rColor }}>
                      {ritmoLabelCorto(s.ritmo.estadoRitmo)}
                    </span>

                    <span className="shrink-0 text-[11px] text-muted">
                      {s.entregablesHechos}/{s.entregablesTotal}
                    </span>

                    {s.warnings.length > 0 && (
                      <span className="shrink-0 text-amber-500" title={s.warnings.join(", ")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </span>
                    )}

                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                      className={`shrink-0 text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3">
                      {(s.ritmo.estadoRitmo === "rojo" || s.ritmo.estadoRitmo === "imposible") && (
                        <div className="mb-3 rounded-lg px-3 py-2"
                          style={{ backgroundColor: rColor + "14", color: rColor }}>
                          <p className="text-[11px] font-semibold">
                            ⚠ {ritmoExplicacion(s.ritmo)}
                          </p>
                        </div>
                      )}

                      {s.warnings.length > 0 && (
                        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2">
                          {s.warnings.map((w, i) => (
                            <p key={i} className="text-[11px] text-amber-700">⚠ {w}</p>
                          ))}
                        </div>
                      )}

                      {s.resultadosActivos.length > 0 ? (
                        <div className="space-y-3">
                          {s.resultadosActivos.map((res) => {
                            const entsTodos = state.entregables.filter((e) => e.resultadoId === res.id);
                            // entregables del mes: ent.semana en el mes, o sin semana (para planificar)
                            const entsMes = entsTodos.filter((e) => {
                              if (!e.semana) return true;
                              return weekMondays.has(e.semana) || mesKeyOf(e.semana) === mesK;
                            });
                            const entsVisibles = entsMes.filter((e) => {
                              if (!showDone && (e.estado === "hecho" || e.estado === "cancelada")) return false;
                              if (!matchesResponsable(e.responsable, respFilter, currentUser)) return false;
                              return true;
                            });
                            return (
                              <div key={res.id} className="rounded-lg border border-border/60 bg-surface/20 p-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="min-w-0 flex-1">
                                    <InlineResultadoNombre resId={res.id} nombre={res.nombre} editable={!isMentor} />
                                  </div>
                                  {!isMentor && (
                                    <ResultadoWeekChips
                                      resId={res.id}
                                      weeks={weeks}
                                      semanasActivas={res.semanasActivas ?? (res.semana ? [res.semana] : [])}
                                    />
                                  )}
                                </div>
                                {entsVisibles.length === 0 ? (
                                  <p className="mt-1 pl-2 text-[11px] italic text-muted/70">— sin entregables este mes</p>
                                ) : (
                                  <div className="mt-1 space-y-1 pl-2">
                                    {entsVisibles.map((ent) => (
                                      <div key={ent.id} className="flex flex-wrap items-center gap-1.5">
                                        <div className="min-w-0 flex-1">
                                          <EntregableInlineRow ent={ent} miembros={state.miembros} editable={!isMentor} />
                                        </div>
                                        {!isMentor && (
                                          <EntregableWeekChips
                                            entId={ent.id}
                                            weeks={weeks}
                                            current={ent.semana ?? null}
                                          />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted italic">Sin resultados</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================================================
   Week chips: multi-toggle para resultados (semanasActivas)
   ============================================================ */

function ResultadoWeekChips({ resId, weeks, semanasActivas }: {
  resId: string; weeks: WeekInfo[]; semanasActivas: string[];
}) {
  const dispatch = useAppDispatch();
  const activas = new Set(semanasActivas);
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {weeks.map((w) => {
        const active = activas.has(w.monday);
        return (
          <button key={w.idx}
            onClick={() => dispatch({ type: "TOGGLE_RESULTADO_SEMANA_ACTIVA", id: resId, semana: w.monday })}
            title={`${w.label} · ${w.rangeLabel}`}
            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
              active ? "bg-accent text-white" : "border border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {w.label}
          </button>
        );
      })}
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
   Inline editors (nombre resultado, entregable, días, responsable)
   ============================================================ */

function InlineResultadoNombre({ resId, nombre, editable }: { resId: string; nombre: string; editable: boolean }) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nombre);

  if (!editable) {
    return <p className="text-[11px] font-semibold text-muted">{nombre}</p>;
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== nombre) {
      dispatch({ type: "UPDATE_RESULTADO", id: resId, changes: { nombre: trimmed } });
    } else {
      setDraft(nombre);
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <button onClick={() => { setDraft(nombre); setEditing(true); }}
        className="block w-full truncate rounded text-left text-[11px] font-semibold text-muted hover:bg-surface/60 hover:text-foreground"
        title="Editar nombre del resultado">
        {nombre}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); save(); }
        if (e.key === "Escape") { setDraft(nombre); setEditing(false); }
      }}
      className="w-full rounded border border-accent/40 bg-background px-1.5 py-0.5 text-[11px] font-semibold text-foreground outline-none focus:border-accent"
    />
  );
}

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
    <div className="flex flex-wrap items-center gap-2 text-xs">
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
          className={`min-w-0 flex-1 truncate rounded text-left ${editable ? "hover:bg-surface/60" : ""} ${isDone ? "text-muted line-through" : "text-foreground"}`}
          title={editable ? "Editar nombre" : undefined}
        >
          {ent.nombre}
        </button>
      )}

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
          className={`shrink-0 rounded px-1 text-[10px] text-muted ${editable ? "hover:bg-surface/60 hover:text-foreground" : ""}`}
          title={editable ? "Editar días estimados" : undefined}
        >
          {(ent.diasEstimados ?? 0)}d
        </button>
      )}

      {editable ? (
        <select
          value={ent.responsable ?? ""}
          onChange={(e) => setResponsable(e.target.value)}
          className="shrink-0 rounded bg-surface px-1 py-0.5 text-[10px] text-muted outline-none hover:text-foreground"
          title="Responsable"
        >
          <option value="">—</option>
          {miembros.map((m) => (
            <option key={m.id} value={m.nombre}>{m.nombre}</option>
          ))}
        </select>
      ) : (
        ent.responsable && (
          <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[9px] text-muted">{ent.responsable}</span>
        )
      )}

      <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[9px] text-muted">
        {ent.estado === "hecho" ? "hecho" : ent.estado === "en_proceso" ? "en curso" : ent.estado === "planificado" ? "planif." : ent.estado === "a_futuro" ? "futuro" : ent.estado}
      </span>
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
