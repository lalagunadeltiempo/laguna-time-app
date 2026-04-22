"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useUsuario } from "@/lib/usuario";
import { generateId } from "@/lib/store";
import { AREA_COLORS, type Entregable, type TipoEntregable } from "@/lib/types";
import {
  computeProyectoRitmo, computeResultadoRitmo, inferDateRange, validateRange,
  ritmoColor, ritmoLabel, ritmoLabelCorto, ritmoTooltip,
  type ProyectoRitmo, type DateRange,
} from "@/lib/proyecto-stats";
import { planificarProyecto } from "@/lib/auto-planner";
import { sesionesEfectivasEntregable } from "@/lib/fechas-efectivas";
import { ProyectoTimeline } from "./ProyectoTimeline";
import MoveInlinePanel from "../shared/MoveInlinePanel";

interface Props {
  proyectoId: string;
  onClose: () => void;
}

export function ProyectoPlanner({ proyectoId, onClose }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();

  const [hoy] = useState<Date>(() => new Date());
  const proyecto = state.proyectos.find((p) => p.id === proyectoId);
  const allResultados = useMemo(
    () => state.resultados.filter((r) => r.proyectoId === proyectoId),
    [state.resultados, proyectoId],
  );
  const allEntregables = useMemo(
    () => {
      const resIds = new Set(allResultados.map((r) => r.id));
      return state.entregables.filter((e) => resIds.has(e.resultadoId));
    },
    [state.entregables, allResultados],
  );

  const ritmo: ProyectoRitmo | null = useMemo(
    () => proyecto ? computeProyectoRitmo(proyecto, allEntregables, allResultados, hoy, state.miembros, state.pasos, state.planConfig) : null,
    [proyecto, allEntregables, allResultados, hoy, state.miembros, state.pasos, state.planConfig],
  );

  const planSugerido = useMemo(() => {
    if (!proyecto) return null;
    return planificarProyecto(proyecto, allResultados, allEntregables, state.pasos, state.miembros, state.planConfig, hoy);
  }, [proyecto, allResultados, allEntregables, state.pasos, state.miembros, state.planConfig, hoy]);

  const proyectoRange: DateRange = useMemo(() => {
    if (!proyecto) return { inicio: null, fin: null };
    const inferred = inferDateRange([
      ...allResultados,
      ...allEntregables,
    ]);
    return {
      inicio: proyecto.fechaInicio ?? inferred.inicio,
      fin: proyecto.fechaLimite ?? inferred.fin,
    };
  }, [proyecto, allResultados, allEntregables]);

  const [movingResId, setMovingResId] = useState<string | null>(null);
  const [expandedRes, setExpandedRes] = useState<Set<string>>(
    () => new Set(allResultados.map((r) => r.id)),
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!proyecto || !ritmo) return null;

  const areaColor = AREA_COLORS[proyecto.area]?.hex ?? "#888";

  function toggleRes(id: string) {
    setExpandedRes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: areaColor }} />
              <h2 className="truncate text-lg font-bold text-foreground">{proyecto.nombre}</h2>
            </div>
            {proyecto.descripcion && (
              <p className="text-sm italic text-muted">{proyecto.descripcion}</p>
            )}
          </div>
          <button onClick={onClose} className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground" aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Dates */}
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <DateField
              label="Inicio"
              value={proyecto.fechaInicio}
              placeholder={proyecto.fechaInicio ? undefined : proyectoRange.inicio ?? undefined}
              onChange={(v) => dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { fechaInicio: v } })}
            />
            <DateField
              label="Fecha límite"
              value={proyecto.fechaLimite ?? null}
              placeholder={proyecto.fechaLimite ? undefined : proyectoRange.fin ?? undefined}
              onChange={(v) => dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { fechaLimite: v } })}
            />
            {(!proyecto.fechaInicio && proyectoRange.inicio) || (!proyecto.fechaLimite && proyectoRange.fin) ? (
              <span className="text-[10px] italic text-muted/70">(fechas en gris = inferidas de sus hijos)</span>
            ) : null}
          </div>
        </div>

        {/* Ritmo summary */}
        <RitmoBar ritmo={ritmo} />

        {/* Aviso de overflow */}
        {planSugerido && (planSugerido.overflow.length > 0 || ritmo.estadoRitmo === "imposible") && (
          <OverflowBanner
            overflowCount={planSugerido.overflow.length}
            sesionesTotales={planSugerido.sesionesTotales}
            ritmo={ritmo}
            proyectoId={proyecto.id}
          />
        )}

        {/* Mini timeline */}
        {allResultados.length > 0 && (
          <ProyectoTimeline
            range={proyectoRange}
            resultados={allResultados}
            entregables={allEntregables}
            hoy={hoy}
            areaColor={areaColor}
          />
        )}

        {/* Resultados */}
        <div className="max-h-[55vh] overflow-y-auto p-5">
          {allResultados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Sin resultados. Añade uno para planificar.</p>
          ) : (
            <div className="space-y-3">
              {allResultados.map((res) => {
                const resEnts = allEntregables.filter((e) => e.resultadoId === res.id);
                const isOpen = expandedRes.has(res.id);
                const ritmoRes = computeResultadoRitmo(res, resEnts, hoy, state.miembros, state.pasos, state.planConfig);
                const ventanaAuto = planSugerido?.ventanas[res.id];
                const ventanaSugerida = (!res.fechaInicio && !res.fechaLimite && ventanaAuto && !ventanaAuto.fija)
                  ? ventanaAuto : null;
                const inferredRes = inferDateRange(resEnts);
                const resRange: DateRange = {
                  inicio: res.fechaInicio ?? inferredRes.inicio,
                  fin: res.fechaLimite ?? inferredRes.fin,
                };
                const validation = validateRange(
                  { fechaInicio: res.fechaInicio, fechaLimite: res.fechaLimite },
                  proyectoRange,
                );
                const pctRes = Math.min(100, Math.round(ritmoRes.porcentaje * 100));
                const colorRes = ritmoColor(ritmoRes.estadoRitmo);

                return (
                  <div key={res.id} className="rounded-xl border border-border bg-surface/30">
                    {/* Resultado header */}
                    <button onClick={() => toggleRes(res.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        className={`mt-1 shrink-0 text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{res.nombre}</span>
                          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{ backgroundColor: colorRes + "18", color: colorRes }}>
                            {ritmoLabelCorto(ritmoRes.estadoRitmo)}
                          </span>
                          {!validation.inRange && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700"
                              title={validation.reason ?? ""}>
                              ⚠ Fuera de rango
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pctRes}%`, backgroundColor: colorRes }} />
                        </div>
                        <p className="mt-1 text-[11px] text-muted">
                          {ritmoRes.diasTrabajoHechos}/{ritmoRes.diasTrabajoTotal}d · {ritmoRes.diasTrabajoPendientes}d pend · {resEnts.length} entregable{resEnts.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border/50 px-4 pb-4 pt-3">
                        {!validation.inRange && validation.reason && (
                          <p className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                            ⚠ {validation.reason}
                          </p>
                        )}
                        {/* Resultado dates */}
                        <div className="mb-3 flex flex-wrap items-center gap-3">
                          <DateField
                            label="Inicio"
                            size="sm"
                            value={res.fechaInicio}
                            placeholder={res.fechaInicio ? undefined : (ventanaSugerida?.inicio ?? inferredRes.inicio) ?? undefined}
                            onChange={(v) => dispatch({ type: "UPDATE_RESULTADO", id: res.id, changes: { fechaInicio: v } })}
                          />
                          <DateField
                            label="Límite"
                            size="sm"
                            value={res.fechaLimite}
                            placeholder={res.fechaLimite ? undefined : (ventanaSugerida?.fin ?? inferredRes.fin) ?? undefined}
                            onChange={(v) => dispatch({ type: "UPDATE_RESULTADO", id: res.id, changes: { fechaLimite: v } })}
                          />
                          {ventanaSugerida && (
                            <span
                              className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"
                              title={`Auto-plan: ${ventanaSugerida.semanas} semana${ventanaSugerida.semanas !== 1 ? "s" : ""} para ${resEnts.length} entregable${resEnts.length !== 1 ? "s" : ""}`}
                            >
                              auto · {ventanaSugerida.semanas}sem
                            </span>
                          )}
                          <button onClick={() => setMovingResId(movingResId === res.id ? null : res.id)}
                            className="ml-auto flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted hover:border-accent hover:text-accent"
                            title="Mover a otro proyecto">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                            Mover
                          </button>
                        </div>

                        {movingResId === res.id && (
                          <MoveInlinePanel
                            target={{ kind: "resultado", id: res.id, currentProyectoId: res.proyectoId }}
                            onDone={() => setMovingResId(null)}
                            className="mb-3"
                          />
                        )}

                        {/* Entregables table */}
                        {resEnts.length > 0 && (
                          <div className="space-y-1.5">
                            {resEnts.map((ent) => (
                              <EntregableRow key={ent.id} entregable={ent} parentRange={resRange} />
                            ))}
                          </div>
                        )}

                        <AddEntregableButton resultadoId={res.id} currentUser={currentUser} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add resultado */}
          <AddResultadoButton proyectoId={proyectoId} />
        </div>
      </div>
    </div>
  );
}

/* ---------- DateField (shared) ---------- */
function DateField({ label, value, placeholder, onChange, size = "md" }: {
  label: string;
  value: string | null;
  placeholder?: string;
  onChange: (v: string | null) => void;
  size?: "sm" | "md";
}) {
  const isInferred = !value && !!placeholder;
  const cls = size === "sm"
    ? "rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
    : "rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground";
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      <span className={size === "sm" ? "text-[10px] font-semibold uppercase" : "text-xs font-semibold uppercase tracking-wider"}>
        {label}
      </span>
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={`${cls} ${isInferred ? "italic text-muted/70" : ""}`}
        placeholder={placeholder}
        title={isInferred && placeholder ? `Inferido: ${placeholder}` : undefined}
      />
      {isInferred && placeholder && (
        <span className="text-[10px] italic text-muted/60">~{placeholder.slice(5)}</span>
      )}
    </label>
  );
}

/* ---------- EntregableRow ---------- */
function EntregableRow({ entregable, parentRange }: { entregable: Entregable; parentRange: DateRange }) {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const [showMove, setShowMove] = useState(false);
  const isDone = entregable.estado === "hecho" || entregable.estado === "cancelada";
  const pasosDe = state.pasos.filter((p) => p.entregableId === entregable.id);
  const sesionesAuto = sesionesEfectivasEntregable(entregable, pasosDe, state.planConfig);
  const sesionesEf = entregable.diasEstimados > 0 ? entregable.diasEstimados : sesionesAuto;
  const isAuto = entregable.diasEstimados <= 0;
  const pending = Math.max(0, sesionesEf - entregable.diasHechos);
  const pct = sesionesEf > 0 ? Math.min(100, Math.round((entregable.diasHechos / sesionesEf) * 100)) : 0;
  const validation = validateRange(
    { fechaInicio: entregable.fechaInicio, fechaLimite: entregable.fechaLimite },
    parentRange,
  );

  return (
    <div>
      <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2${isDone ? " opacity-50" : ""} ${validation.inRange ? "border-border/50" : "border-amber-400"} bg-background`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${isDone ? "bg-green-500" : "bg-amber-400"}`} />
        <span className={`min-w-0 flex-1 basis-[40%] truncate text-xs font-medium ${isDone ? "line-through text-muted" : "text-foreground"}`} title={entregable.nombre}>
          {entregable.nombre}
        </span>

        {!validation.inRange && (
          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700" title={validation.reason ?? ""}>
            ⚠
          </span>
        )}

        <label
          className="flex shrink-0 items-center gap-1 text-[10px] text-muted"
          title={isAuto ? `Auto (${pasosDe.length} pasos / ${state.planConfig?.pasosPorSesion ?? 5} = ${sesionesAuto} sesiones). Pon un número para fijar.` : "Sesiones estimadas (puedes vaciar para volver a auto)"}
        >
          <input
            type="number"
            min={0}
            value={entregable.diasEstimados || ""}
            placeholder={isAuto ? String(sesionesAuto) : ""}
            onChange={(e) => dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes: { diasEstimados: e.target.value ? Number(e.target.value) : 0 } })}
            className={`w-12 rounded border border-border bg-background px-1 py-0.5 text-xs ${isAuto ? "text-accent italic" : "text-foreground"}`}
          />
          <span>{isAuto ? "auto" : "ses"}</span>
        </label>

        <span className="shrink-0 text-[10px] text-muted" title="Sesiones hechas">{entregable.diasHechos}h</span>

        <div className="flex w-12 shrink-0 items-center gap-1" title={`${pct}%`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <span className="shrink-0 text-[10px] font-medium text-muted">{pending}d</span>

        <input type="date" value={entregable.fechaInicio ?? ""} title="Fecha inicio"
          onChange={(e) => dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes: { fechaInicio: e.target.value || null } })}
          className="w-[108px] shrink-0 rounded border border-border bg-background px-1 py-0.5 text-[10px] text-foreground" />
        <input type="date" value={entregable.fechaLimite ?? ""} title="Fecha límite"
          onChange={(e) => dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes: { fechaLimite: e.target.value || null } })}
          className="w-[108px] shrink-0 rounded border border-border bg-background px-1 py-0.5 text-[10px] text-foreground" />

        <button onClick={() => setShowMove((v) => !v)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-surface hover:text-foreground"
          title="Mover a otro resultado">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </button>
      </div>

      {showMove && (
        <div className="mt-1">
          <MoveInlinePanel
            target={{ kind: "entregable", id: entregable.id, currentResultadoId: entregable.resultadoId }}
            onDone={() => setShowMove(false)}
            className=""
          />
        </div>
      )}
    </div>
  );
}

/* ---------- RitmoBar ---------- */
function RitmoBar({ ritmo }: { ritmo: ProyectoRitmo }) {
  const color = ritmoColor(ritmo.estadoRitmo);
  const label = ritmoLabel(ritmo);
  const tooltip = ritmoTooltip(ritmo);
  const pct = Math.min(100, Math.round(ritmo.porcentaje * 100));

  return (
    <div className="border-b border-border px-5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">Avance: {pct}%</span>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: color + "18", color }} title={tooltip}>
          {ritmoLabelCorto(ritmo.estadoRitmo)}
        </span>
      </div>
      <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <p className="text-xs text-muted" title={tooltip}>{label}</p>
      {ritmo.desglose.length > 1 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[10px] text-muted hover:text-foreground">Desglose por persona</summary>
          <ul className="mt-1 space-y-0.5">
            {ritmo.desglose.map((p) => (
              <li key={p.miembro} className="text-[11px] text-muted">
                <span className="font-semibold text-foreground">{p.miembro}:</span> {p.carga} sesiones / {p.laborables} días lab → {p.sesionesPorDia.toFixed(1)}/día (cap {p.capacidadDiaria.toFixed(1)})
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ---------- OverflowBanner ---------- */
function OverflowBanner({
  overflowCount,
  sesionesTotales,
  ritmo,
  proyectoId,
}: {
  overflowCount: number;
  sesionesTotales: number;
  ritmo: ProyectoRitmo;
  proyectoId: string;
}) {
  const dispatch = useAppDispatch();
  const peor = ritmo.peor;

  function extenderDeadline() {
    if (!peor || peor.carga <= 0) return;
    const cap = Math.max(0.1, peor.capacidadDiaria);
    const diasNecesarios = Math.ceil(peor.carga / cap);
    const factor = peor.laborables > 0 ? peor.carga / peor.laborables / cap : 2;
    const calendarioNecesario = Math.ceil(diasNecesarios * Math.max(1.4, factor + 0.4));
    const nueva = new Date();
    nueva.setDate(nueva.getDate() + calendarioNecesario);
    const yyyy = nueva.getFullYear();
    const mm = String(nueva.getMonth() + 1).padStart(2, "0");
    const dd = String(nueva.getDate()).padStart(2, "0");
    dispatch({ type: "UPDATE_PROYECTO", id: proyectoId, changes: { fechaLimite: `${yyyy}-${mm}-${dd}` } });
  }

  return (
    <div className="border-b border-border bg-red-50 px-5 py-3 dark:bg-red-950/30">
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-0.5 text-base">⚠</span>
        <div className="flex-1">
          <p className="text-xs font-bold text-red-700 dark:text-red-300">
            El plan no cabe en la ventana del proyecto
          </p>
          <p className="mt-0.5 text-[11px] text-red-700/80 dark:text-red-300/80">
            {overflowCount > 0 && `${overflowCount} resultado${overflowCount > 1 ? "s" : ""} desborda${overflowCount > 1 ? "n" : ""} el deadline. `}
            {peor && `${peor.miembro} necesita ${peor.sesionesPorDia.toFixed(1)} sesiones/día y su capacidad es ${peor.capacidadDiaria.toFixed(1)}. `}
            Total: {sesionesTotales} sesiones.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={extenderDeadline}
          className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
          title="Mueve la fecha límite del proyecto a una fecha realista para tu capacidad"
        >
          Extender deadline
        </button>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); window.alert("Ve a la sección Equipo y ajusta tu capacidad diaria (sesiones/día)."); }}
          className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 dark:bg-transparent dark:text-red-300"
        >
          Subir capacidad
        </a>
        <span className="rounded-md border border-red-200 bg-white/50 px-2.5 py-1 text-[11px] text-red-700 dark:bg-transparent dark:text-red-300">
          O recorta entregables/resultados abajo ↓
        </span>
      </div>
    </div>
  );
}

/* ---------- AddEntregableButton ---------- */
function AddEntregableButton({ resultadoId, currentUser }: { resultadoId: string; currentUser: string }) {
  const dispatch = useAppDispatch();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [dias, setDias] = useState<string>("3");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) { setAdding(false); return; }
    dispatch({
      type: "ADD_ENTREGABLE",
      payload: {
        id: generateId(), nombre: trimmed, resultadoId,
        tipo: "raw" as TipoEntregable, plantillaId: null,
        diasEstimados: Math.max(0, Number(dias) || 0), diasHechos: 0,
        esDiaria: false, responsable: currentUser,
        estado: "a_futuro", creado: new Date().toISOString(),
        semana: null, fechaLimite: null, fechaInicio: null,
      },
    });
    setName("");
    setDias("3");
    setAdding(false);
  }

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)}
        className="mt-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-accent transition-colors hover:bg-accent-soft">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Entregable
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAdding(false); }}
        placeholder="Nombre del entregable"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" />
      <label className="flex items-center gap-1 text-[10px] text-muted">
        <span>días</span>
        <input type="number" min={0} value={dias} onChange={(e) => setDias(e.target.value)}
          className="w-12 rounded border border-border bg-background px-1 py-0.5 text-xs text-foreground" />
      </label>
      <button onClick={submit} className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/80">OK</button>
      <button onClick={() => setAdding(false)} className="text-xs text-muted hover:text-foreground">Cancelar</button>
    </div>
  );
}

/* ---------- AddResultadoButton ---------- */
function AddResultadoButton({ proyectoId }: { proyectoId: string }) {
  const dispatch = useAppDispatch();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)}
        className="mt-3 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Añadir resultado
      </button>
    );
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) { setAdding(false); return; }
    dispatch({
      type: "ADD_RESULTADO",
      payload: {
        id: generateId(), nombre: trimmed, descripcion: null, proyectoId,
        creado: new Date().toISOString(), semana: null, fechaLimite: null,
        fechaInicio: null, diasEstimados: null,
      },
    });
    setName("");
    setAdding(false);
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAdding(false); }}
        placeholder="Nombre del resultado"
        className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" />
      <button onClick={submit} className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/80">OK</button>
      <button onClick={() => setAdding(false)} className="text-xs text-muted hover:text-foreground">Cancelar</button>
    </div>
  );
}
