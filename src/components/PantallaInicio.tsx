"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import {
  usePasosActivos,
  usePendientes,
  usePasosHoy,
  useSOPsHoy,
  useSOPsDemanda,
  useEsperandoRespuesta,
  type Pendiente,
  type EsperandoItem,
} from "@/lib/hooks";
import { generateId, exportData, importData, restoreBackup } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { getISOWeek, formatMin } from "@/lib/utils";
import { progLabel, fechaKey } from "@/lib/sop-scheduler";
import { AREA_COLORS, type AppState, type Paso, type Entregable, type Resultado, type EjecucionSOP, type PlantillaProceso, type PasoPlantilla } from "@/lib/types";
import { PasoActivoCard } from "./PasoActivo";
import { NuevoPaso } from "./NuevoPaso";
import { VistaInbox } from "./VistaInbox";
import { ModalConfirm } from "./ModalConfirm";

interface Props {
  onOpenBuscador?: () => void;
  onOpenDetalle?: (resultadoId: string) => void;
}

export function PantallaInicio({ onOpenBuscador, onOpenDetalle }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();
  const pasosActivos = usePasosActivos();
  const pendientes = usePendientes();
  const pasosHoy = usePasosHoy();
  const esperando = useEsperandoRespuesta();
  const { mios: sopsMios, equipo: sopsEquipo } = useSOPsHoy();
  const sopsDemanda = useSOPsDemanda();
  const [showNuevoPaso, setShowNuevoPaso] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [confirmStartTarget, setConfirmStartTarget] = useState<Pendiente | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "paso" | "entregable"; id: string; nombre: string } | null>(null);
  const [showDataPanel, setShowDataPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentWeek = useMemo(() => getISOWeek(), []);

  const hechosHoy = useMemo(() => {
    return pasosHoy.map((p) => {
      const ent = state.entregables.find((e) => e.id === p.entregableId);
      const res = ent ? state.resultados.find((r) => r.id === ent.resultadoId) : undefined;
      const proj = res ? state.proyectos.find((pr) => pr.id === res.proyectoId) : undefined;
      return { paso: p, entregableNombre: ent?.nombre ?? "", resultadoNombre: res?.nombre ?? "", resultadoId: res?.id ?? "", proyectoNombre: proj?.nombre ?? "" };
    });
  }, [pasosHoy, state.entregables, state.resultados, state.proyectos]);

  const pendingInbox = useMemo(() => state.inbox.filter((i) => !i.procesado).length, [state.inbox]);

  const estaSemana = pendientes.filter((p) => p.resultadoSemana === currentWeek);
  const otros = pendientes.filter((p) => p.resultadoSemana !== currentWeek);

  function startFromPendiente(p: Pendiente) {
    if (p.pendingPasoId) {
      dispatch({ type: "ACTIVATE_PASO", id: p.pendingPasoId });
      return;
    }
    const ultimoPaso = p.ultimoPaso;
    dispatch({
      type: "START_PASO",
      payload: {
        id: generateId(),
        entregableId: p.entregable.id,
        nombre: p.siguientePasoNombre || p.entregable.nombre,
        inicioTs: new Date().toISOString(),
        finTs: null,
        estado: "",
        contexto: ultimoPaso
          ? { urls: [...ultimoPaso.contexto.urls], apps: [...ultimoPaso.contexto.apps], notas: "" }
          : { urls: [], apps: [], notas: "" },
        implicados: [{ tipo: "equipo", nombre: currentUser }],
        pausas: [],
        siguientePaso: null,
      },
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    dispatch(deleteTarget.type === "paso"
      ? { type: "DELETE_PASO", id: deleteTarget.id }
      : { type: "DELETE_ENTREGABLE", id: deleteTarget.id });
    setDeleteTarget(null);
  }

  function renderPendientes(items: Pendiente[]) {
    return items.map((p) => (
      <PendienteCard
        key={p.entregable.id}
        pendiente={p}
        onStart={() => setConfirmStartTarget(p)}
        onOpenDetalle={() => onOpenDetalle?.(p.entregable.resultadoId)}
      />
    ));
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      {isMentor && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Vista mentor — solo lectura. Puedes dejar notas en el Mapa.
        </div>
      )}
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Laguna Time App</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {currentUser} &middot;{" "}
            {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <button onClick={() => setShowDataPanel(!showDataPanel)} className="mt-1 rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600" title="Gestión de datos">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m-7-7H1m22 0h-4m-1.343-4.657 2.828-2.828m-16.97 0 2.828 2.828m0 9.314-2.828 2.828m16.97 0-2.828-2.828" /></svg>
        </button>
      </div>

      {showDataPanel && (
        <DataPanel
          onClose={() => setShowDataPanel(false)}
          onImport={(json) => {
            const restored = importData(json);
            dispatch({ type: "INIT", state: restored });
            setShowDataPanel(false);
          }}
          onRestoreBackup={() => {
            const restored = restoreBackup();
            if (restored) {
              dispatch({ type: "INIT", state: restored });
              setShowDataPanel(false);
            }
          }}
          fileInputRef={fileInputRef}
        />
      )}

      {/* Pasos activos */}
      {pasosActivos.length > 0 && (
        <section className="mb-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-green-600">
            {pasosActivos.length === 1 ? "1 tarea en curso" : `${pasosActivos.length} tareas en curso`}
          </h2>
          {pasosActivos.map((p) => (
            <PasoActivoCard key={p.id} paso={p} />
          ))}
        </section>
      )}

      {/* Tus SOPs del día */}
      {sopsMios.length > 0 && (
        <section className="mb-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-purple-600">
            Tus procesos de hoy ({sopsMios.filter((s) => !s.completadoHoy).length} pendientes)
          </h2>
          {sopsMios.map((sop) => (
            <SOPCard key={sop.plantilla.id} sop={sop} />
          ))}
        </section>
      )}

      {/* SOPs del equipo */}
      {sopsEquipo.length > 0 && (
        <SOPsEquipoSection sops={sopsEquipo} />
      )}

      {/* Procesos bajo demanda disponibles */}
      {sopsDemanda.length > 0 && (
        <SOPsDemandaSection procesos={sopsDemanda} />
      )}

      {/* CTA */}
      <button
        onClick={() => setShowNuevoPaso(true)}
        className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-base font-semibold text-white shadow-lg shadow-amber-500/20 transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v12M6 12h12" /></svg>
        {pasosActivos.length > 0 ? "Empezar otra tarea" : "Empezar a trabajar"}
      </button>

      {/* Plan de la semana */}
      {estaSemana.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-600">Esta semana</h2>
          <div className="space-y-1">{renderPendientes(estaSemana)}</div>
        </section>
      )}

      {/* Otros pendientes */}
      {otros.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Pendientes</h2>
          <div className="space-y-1">{renderPendientes(otros)}</div>
        </section>
      )}

      {esperando.length > 0 && <EsperandoSection items={esperando} />}

      {/* Hechos hoy — colapsable */}
      {hechosHoy.length > 0 && (
        <HechosHoySection hechosHoy={hechosHoy} onDelete={(h) => setDeleteTarget({ type: "paso", id: h.paso.id, nombre: h.paso.nombre })} onOpenDetalle={(rId) => onOpenDetalle?.(rId)} />
      )}

      {/* Inbox badge */}
      {pendingInbox > 0 && (
        <button onClick={() => setShowInbox(true)} className="w-full rounded-lg border border-amber-200 px-4 py-3 text-left transition-colors hover:bg-amber-50">
          <p className="text-sm font-medium text-amber-700">{pendingInbox} {pendingInbox === 1 ? "idea" : "ideas"} en el inbox por procesar</p>
        </button>
      )}

      {/* Paneles inline */}
      {showNuevoPaso && <NuevoPaso onClose={() => setShowNuevoPaso(false)} />}
      {showInbox && <VistaInbox onClose={() => setShowInbox(false)} />}

      {deleteTarget && (
        <ModalConfirm
          titulo={deleteTarget.type === "paso" ? "Eliminar paso" : "Eliminar entregable"}
          mensaje={`Se eliminará "${deleteTarget.nombre}"${deleteTarget.type === "entregable" ? " y todos sus pasos" : ""}.`}
          onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Confirm start — fixed overlay so it's always visible */}
      {confirmStartTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-900">Empezar paso</h3>
            <p className="mt-1 text-xs text-zinc-600">{`¿Empezar a trabajar en "${confirmStartTarget.siguientePasoNombre || confirmStartTarget.entregable.nombre}"?`}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmStartTarget(null)}
                className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
              <button onClick={() => { startFromPendiente(confirmStartTarget); setConfirmStartTarget(null); }}
                className="flex-1 rounded-lg bg-green-600 py-2.5 text-xs font-medium text-white hover:bg-green-700">
                Empezar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Pendiente card ---- */

function PendienteCard({ pendiente, onStart, onOpenDetalle }: {
  pendiente: Pendiente; onStart: () => void; onOpenDetalle: () => void;
}) {
  const p = pendiente;
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(p.entregable.nombre);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function saveEdit() {
    if (editValue.trim() && editValue.trim() !== p.entregable.nombre) {
      dispatch({ type: "RENAME_ENTREGABLE", id: p.entregable.id, nombre: editValue.trim() });
    }
    setEditing(false);
  }

  const estadoDot = p.entregable.estado === "en_proceso" ? "bg-amber-400" : p.entregable.estado === "en_espera" ? "bg-zinc-300" : "bg-blue-300";

  return (
    <button onClick={onStart} className="w-full rounded-lg bg-white px-3 py-2.5 text-left transition-all hover:bg-amber-50 active:scale-[0.99]">
      {/* Line 1: Proyecto → Resultado → Entregable */}
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${estadoDot}`} />
        <span className="text-xs font-semibold text-zinc-800">{p.proyectoNombre}</span>
        <span className="text-[10px] text-zinc-300">→</span>
        <span className="text-xs text-zinc-500">{p.resultadoNombre}</span>
        <span className="text-[10px] text-zinc-300">→</span>
        {editing ? (
          <input
            ref={inputRef}
            type="text" value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={saveEdit}
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
            className="flex-1 min-w-0 rounded border border-amber-300 bg-amber-50 px-1 py-0 text-xs text-zinc-900 focus:outline-none"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-xs font-medium text-zinc-700"
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
            {p.entregable.nombre}
          </span>
        )}
        {p.entregable.diasEstimados > 0 && (
          <span className="shrink-0 text-[10px] tabular-nums text-zinc-300 ml-1">
            {p.entregable.diasHechos}/{p.entregable.diasEstimados}
          </span>
        )}
      </div>
      {/* Line 2: Siguiente paso */}
      {p.siguientePasoNombre && (
        <p className="mt-0.5 ml-[18px] text-[11px] text-zinc-400">Siguiente: {p.siguientePasoNombre}</p>
      )}
    </button>
  );
}

/* ---- Hecho card ---- */

function HechoCard({ paso, proyectoNombre, resultadoNombre, entregableNombre, duracion, onDelete, onOpenDetalle }: {
  paso: Paso; proyectoNombre: string; resultadoNombre: string; entregableNombre: string; duracion: number;
  onDelete: () => void; onOpenDetalle: () => void;
}) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(paso.nombre);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function saveEdit() {
    if (editValue.trim() && editValue.trim() !== paso.nombre) {
      dispatch({ type: "RENAME_PASO", id: paso.id, nombre: editValue.trim() });
    }
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg bg-white px-3 py-2">
      <div className="flex-1 min-w-0">
        {/* Line 1: breadcrumb */}
        <button onClick={onOpenDetalle} className="text-left">
          <p className="text-[10px] leading-tight">
            <span className="font-medium text-zinc-500">{proyectoNombre}</span>
            <span className="mx-1 text-zinc-300">→</span>
            <span className="text-zinc-400">{resultadoNombre}</span>
            <span className="mx-1 text-zinc-300">→</span>
            <span className="text-zinc-400">{entregableNombre}</span>
          </p>
        </button>
        {/* Line 2: paso name */}
        {editing ? (
          <input
            ref={inputRef}
            type="text" value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
            className="w-full rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs text-zinc-900 focus:outline-none mt-0.5"
          />
        ) : (
          <p className="text-xs text-zinc-600 cursor-text" onDoubleClick={() => setEditing(true)}>{paso.nombre}</p>
        )}
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">{formatMin(duracion)}</span>
      <button onClick={onDelete} className="shrink-0 rounded p-1 text-zinc-300 hover:text-red-400 hover:bg-red-50 transition-colors" title="Eliminar paso">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

/* ---- Equipo SOPs colapsable ---- */

import type { SOPHoy } from "@/lib/sop-scheduler";

function SOPsEquipoSection({ sops }: { sops: SOPHoy[] }) {
  const [expanded, setExpanded] = useState(false);

  const byResponsable = useMemo(() => {
    const map = new Map<string, SOPHoy[]>();
    for (const s of sops) {
      const r = s.plantilla.responsableDefault;
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(s);
    }
    return Array.from(map.entries());
  }, [sops]);

  const pendientes = sops.filter((s) => !s.completadoHoy).length;
  const completados = sops.filter((s) => s.completadoHoy).length;

  return (
    <section className="mb-4">
      <button onClick={() => setExpanded(!expanded)}
        className="mb-2 flex w-full items-center gap-2 text-left">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Equipo: {pendientes} pendientes{completados > 0 ? `, ${completados} hechos` : ""}
        </h2>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className={`text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="space-y-3">
          {byResponsable.map(([nombre, items]) => (
            <div key={nombre}>
              <p className="mb-1 text-[11px] font-semibold text-zinc-500">{nombre}</p>
              <div className="space-y-1.5">
                {items.map((sop) => <SOPCard key={sop.plantilla.id} sop={sop} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---- Procesos bajo demanda — sección tipo "Esta semana" ---- */

function SOPsDemandaSection({ procesos }: { procesos: PlantillaProceso[] }) {
  const dispatch = useAppDispatch();
  const [expanded, setExpanded] = useState(false);

  function lanzar(pl: PlantillaProceso) {
    const ej: EjecucionSOP = {
      id: generateId(), plantillaId: pl.id,
      fecha: fechaKey(), pasosCompletados: [], estado: "pendiente",
    };
    dispatch({ type: "ADD_EJECUCION", payload: ej });
  }

  return (
    <section className="mb-4">
      <button onClick={() => setExpanded((e) => !e)} className="mb-2 flex w-full items-center gap-2 text-left">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-purple-600">
          Procesos bajo demanda ({procesos.length})
        </h2>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className={`text-purple-400 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="space-y-1">
          {procesos.map((pl) => (
            <div key={pl.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-purple-100 text-[10px] font-bold text-purple-600">{pl.pasos.length}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-800 truncate">{pl.nombre}</p>
                <p className="text-[10px] text-zinc-400">{pl.responsableDefault}</p>
              </div>
              <button onClick={() => lanzar(pl)} className="rounded-lg bg-purple-100 px-3 py-1.5 text-[10px] font-semibold text-purple-700 hover:bg-purple-200 transition-colors">
                Lanzar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---- Esperando respuesta ---- */

function EsperandoSection({ items }: { items: EsperandoItem[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mb-2 flex w-full items-center gap-2 text-left"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-orange-500">
          Esperando respuesta ({items.length})
        </h2>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`text-orange-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.paso.id} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
              <p className="text-[10px] text-zinc-400">
                <span className="font-medium text-zinc-500">{item.proyectoNombre}</span>
                <span className="mx-1">→</span>
                <span>{item.resultadoNombre}</span>
                <span className="mx-1">→</span>
                <span>{item.entregableNombre}</span>
              </p>
              <p className="mt-0.5 text-xs font-medium text-zinc-700">
                {item.paso.siguientePaso?.nombre ?? "Siguiente paso"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="text-orange-500"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
                {item.dependeDe.map((d, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700"
                  >
                    {d.nombre}
                  </span>
                ))}
                {item.fechaProgramada && (
                  <span className="ml-1 text-[10px] text-orange-600">
                    · {new Date(item.fechaProgramada).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---- Hechos hoy — colapsado por defecto ---- */

interface HechoHoy { paso: Paso; entregableNombre: string; resultadoNombre: string; resultadoId: string; proyectoNombre: string }

function HechosHoySection({ hechosHoy, onDelete, onOpenDetalle }: {
  hechosHoy: HechoHoy[];
  onDelete: (h: HechoHoy) => void;
  onOpenDetalle: (rId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="mb-6">
      <button onClick={() => setExpanded((e) => !e)} className="mb-2 flex w-full items-center gap-2 text-left">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Hoy has hecho ({hechosHoy.length})
        </h2>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className={`text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="space-y-1.5">
          {hechosHoy.map((h) => {
            const dur = h.paso.finTs && h.paso.inicioTs
              ? Math.round((new Date(h.paso.finTs).getTime() - new Date(h.paso.inicioTs).getTime()) / 60000)
              : 0;
            return (
              <HechoCard
                key={h.paso.id}
                paso={h.paso}
                proyectoNombre={h.proyectoNombre}
                resultadoNombre={h.resultadoNombre}
                entregableNombre={h.entregableNombre}
                duracion={dur}
                onDelete={() => onDelete(h)}
                onOpenDetalle={() => onOpenDetalle(h.resultadoId)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---- SOP Card (proceso del día con checklist) ---- */

const SOP_PROJECT_NAME = "Ejecución de SOPs";

function ensureSOPEntregable(
  state: Pick<AppState, "proyectos" | "resultados" | "entregables">,
  dispatch: (a: unknown) => void,
  ejecucion: EjecucionSOP,
  plantilla: PlantillaProceso,
): string {
  if (ejecucion.entregableId) {
    const existing = state.entregables.find((e) => e.id === ejecucion.entregableId);
    if (existing) return ejecucion.entregableId;
  }

  let proyecto = state.proyectos.find((p) => p.nombre === SOP_PROJECT_NAME && p.area === plantilla.area);
  if (!proyecto) {
    const projId = generateId();
    const creado = new Date().toISOString();
    dispatch({
      type: "ADD_PROYECTO",
      payload: { id: projId, nombre: SOP_PROJECT_NAME, descripcion: null, area: plantilla.area, creado, fechaInicio: null },
    });
    proyecto = { id: projId, nombre: SOP_PROJECT_NAME, descripcion: null, area: plantilla.area, creado, fechaInicio: null };
  }

  let resultado = state.resultados.find((r) => r.proyectoId === proyecto!.id && r.nombre === plantilla.nombre);
  if (!resultado) {
    const resId = generateId();
    dispatch({ type: "ADD_RESULTADO", payload: { id: resId, nombre: plantilla.nombre, descripcion: null, proyectoId: proyecto.id, creado: new Date().toISOString(), semana: getISOWeek(), fechaLimite: null, fechaInicio: null, diasEstimados: null } as Resultado });
    resultado = { id: resId, nombre: plantilla.nombre, proyectoId: proyecto.id } as Resultado;
  }

  const entId = generateId();
  const entregable: Entregable = {
    id: entId, nombre: `${plantilla.nombre} — ${ejecucion.fecha}`,
    resultadoId: resultado.id, tipo: "sop", plantillaId: plantilla.id,
    diasEstimados: plantilla.pasos.length, diasHechos: 0,
    esDiaria: false, responsable: plantilla.responsableDefault,
    estado: "en_proceso", creado: new Date().toISOString(),
    semana: getISOWeek(), fechaLimite: null, fechaInicio: null,
  };
  dispatch({ type: "ADD_ENTREGABLE", payload: entregable });
  dispatch({ type: "UPDATE_EJECUCION", id: ejecucion.id, changes: { entregableId: entId } });
  return entId;
}

function SOPCard({ sop }: { sop: SOPHoy }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function getOrCreateEjecucion(): EjecucionSOP {
    if (sop.ejecucion) return sop.ejecucion;
    const ej: EjecucionSOP = {
      id: generateId(), plantillaId: sop.plantilla.id,
      fecha: fechaKey(), pasosCompletados: [], estado: "pendiente",
    };
    dispatch({ type: "ADD_EJECUCION", payload: ej });
    return ej;
  }

  function togglePaso(pasoId: string) {
    const ej = getOrCreateEjecucion();
    dispatch({ type: "TOGGLE_PASO_EJECUCION", ejecucionId: ej.id, pasoId });
  }

  function completar() {
    if (!sop.ejecucion) return;
    dispatch({ type: "COMPLETE_EJECUCION", id: sop.ejecucion.id });
  }

  function startEditName(paso: PasoPlantilla) {
    setEditingId(paso.id);
    setEditValue(paso.nombre);
  }

  function commitEditName(pasoId: string) {
    if (editValue.trim() && editValue.trim() !== sop.plantilla.pasos.find((p) => p.id === pasoId)?.nombre) {
      const updatedPasos = sop.plantilla.pasos.map((p) => p.id === pasoId ? { ...p, nombre: editValue.trim() } : p);
      dispatch({ type: "UPDATE_PLANTILLA", id: sop.plantilla.id, changes: { pasos: updatedPasos } });
    }
    setEditingId(null);
  }

  function lanzarPaso(paso: PasoPlantilla) {
    const ej = getOrCreateEjecucion();
    const entregableId = ensureSOPEntregable(state, dispatch as (a: unknown) => void, ej, sop.plantilla);
    const pasoId = generateId();
    const nuevoPaso: Paso = {
      id: pasoId, entregableId, nombre: paso.nombre,
      inicioTs: new Date().toISOString(), finTs: null, estado: "activo",
      contexto: { urls: [], apps: [], notas: "" }, implicados: [], pausas: [],
      siguientePaso: null,
    };
    dispatch({ type: "START_PASO", payload: nuevoPaso });
    const lanzados = { ...(ej.pasosLanzados ?? {}), [paso.id]: pasoId };
    dispatch({ type: "UPDATE_EJECUCION", id: ej.id, changes: { pasosLanzados: lanzados } });
    dispatch({ type: "TOGGLE_PASO_EJECUCION", ejecucionId: ej.id, pasoId: paso.id });
  }

  const completados = sop.ejecucion?.pasosCompletados ?? [];
  const lanzados = sop.ejecucion?.pasosLanzados ?? {};
  const total = sop.pasosHoy.length;
  const done = sop.pasosHoy.filter((p) => completados.includes(p.id)).length;
  const allDone = done === total;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const areaHex = AREA_COLORS[sop.plantilla.area]?.hex ?? "#888";

  return (
    <div className="rounded-xl border-2 overflow-hidden transition-colors"
      style={allDone ? { borderColor: "#86efac", backgroundColor: "#f0fdf4" } : { borderColor: areaHex + "40", backgroundColor: areaHex + "08" }}>
      <button onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 p-3 text-left">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
          style={{ backgroundColor: areaHex + "20", color: areaHex }}>
          {allDone ? "✓" : `${done}/${total}`}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${allDone ? "text-green-700 line-through" : "text-zinc-800"}`}>{sop.plantilla.nombre}</p>
          <p className="text-[10px] text-zinc-400">
            {sop.plantilla.responsableDefault}
            {sop.plantilla.programacion && <> · {progLabel(sop.plantilla.programacion)}</>}
          </p>
        </div>
        <div className="w-12 h-1.5 rounded-full bg-zinc-200 overflow-hidden shrink-0">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: allDone ? "#22c55e" : areaHex }} />
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className={`shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t bg-white p-3 space-y-1" style={{ borderColor: areaHex + "20" }}>
          {sop.pasosHoy.map((paso) => {
            const checked = completados.includes(paso.id);
            const launched = !!lanzados[paso.id];
            const isEditing = editingId === paso.id;
            return (
              <div key={paso.id} className={`flex items-start gap-2 rounded-lg p-2 transition-colors ${checked ? "bg-green-50" : "hover:bg-zinc-50"}`}>
                <input type="checkbox" checked={checked} onChange={() => togglePaso(paso.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 cursor-pointer accent-current" style={{ color: areaHex }} />
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEditName(paso.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitEditName(paso.id); if (e.key === "Escape") setEditingId(null); }}
                      className="w-full rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-700 focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  ) : (
                    <span
                      onClick={() => startEditName(paso)}
                      className={`text-xs leading-relaxed cursor-text ${checked ? "text-zinc-400 line-through" : "text-zinc-700"}`}
                      title="Clic para editar">
                      {paso.nombre}
                    </span>
                  )}
                </div>
                {paso.minutosEstimados !== null && (
                  <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-500">{paso.minutosEstimados}′</span>
                )}
                {!checked && !launched && (
                  <button onClick={() => lanzarPaso(paso)}
                    title="Lanzar como tarea con timer"
                    className="shrink-0 flex h-5 w-5 items-center justify-center rounded-md bg-green-100 text-green-600 hover:bg-green-200 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                )}
                {launched && !checked && (
                  <span className="shrink-0 text-[9px] text-green-500 font-medium">en curso</span>
                )}
              </div>
            );
          })}
          {allDone && sop.ejecucion?.estado !== "completado" && (
            <button onClick={completar}
              className="mt-2 w-full rounded-lg bg-green-600 py-2 text-xs font-medium text-white hover:bg-green-700">
              Marcar proceso como completado
            </button>
          )}
          {sop.ejecucion?.estado === "completado" && (
            <p className="mt-2 text-center text-xs font-medium text-green-600">✓ Completado hoy</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Data management panel ---- */

function DataPanel({ onClose, onImport, onRestoreBackup, fileInputRef }: {
  onClose: () => void;
  onImport: (json: string) => void;
  onRestoreBackup: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [importing, setImporting] = useState(false);
  const [pasteValue, setPasteValue] = useState("");

  function handleExport() {
    const data = exportData();
    if (!data) return;
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laguna-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onImport(reader.result);
      }
    };
    reader.readAsText(file);
  }

  function handlePasteImport() {
    if (pasteValue.trim()) onImport(pasteValue.trim());
  }

  return (
    <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-900">Gestión de datos</h3>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="space-y-2">
        <button onClick={handleExport} className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50">
          Exportar datos (descargar JSON)
        </button>

        <button onClick={onRestoreBackup} className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-xs font-medium text-amber-700 hover:bg-amber-100">
          Restaurar backup automático
        </button>

        <button onClick={() => setImporting(!importing)} className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-left text-xs font-medium text-blue-700 hover:bg-blue-100">
          Importar datos desde archivo
        </button>
      </div>

      {importing && (
        <div className="mt-3 space-y-2">
          <input
            ref={fileInputRef}
            type="file" accept=".json"
            onChange={handleFileImport}
            className="w-full text-xs text-zinc-500 file:mr-2 file:rounded-md file:border-0 file:bg-blue-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-blue-700"
          />
          <p className="text-[10px] text-zinc-400">O pega el JSON directamente:</p>
          <textarea
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-zinc-200 p-2 text-xs text-zinc-700 focus:border-blue-300 focus:outline-none"
            placeholder='{"proyectos":[...],"resultados":[...],"entregables":[...],...}'
          />
          <button onClick={handlePasteImport} disabled={!pasteValue.trim()}
            className="w-full rounded-lg bg-blue-600 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">
            Importar JSON pegado
          </button>
        </div>
      )}
    </div>
  );
}
