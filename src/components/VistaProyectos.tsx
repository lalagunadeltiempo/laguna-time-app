"use client";

import { useState, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { formatMin, getISOWeek } from "@/lib/utils";
import { buildProyectos, type ResultadoView } from "@/lib/build-proyectos";
import { MenuAcciones } from "./MenuAcciones";
import { ModalConfirm } from "./ModalConfirm";
import { EntregableItem } from "./EntregableItem";
import { AddResultadoInline, AddEntregableInline } from "./AddInline";

interface Props {
  onBack: () => void;
  onOpenDetalle?: (resultadoId: string) => void;
}

export function VistaProyectos({ onBack, onOpenDetalle }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const proyectos = useMemo(() => buildProyectos(state), [state]);

  const [deleteTarget, setDeleteTarget] = useState<{ type: "proyecto" | "resultado"; id: string; nombre: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ type: "proyecto" | "resultado"; id: string; value: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ resultadoId: string; resultadoName: string; currentProyectoId: string } | null>(null);

  function confirmDelete() {
    if (!deleteTarget) return;
    dispatch(deleteTarget.type === "proyecto"
      ? { type: "DELETE_PROYECTO", id: deleteTarget.id }
      : { type: "DELETE_RESULTADO", id: deleteTarget.id });
    setDeleteTarget(null);
  }

  function saveEdit() {
    if (!editTarget || !editTarget.value.trim()) return;
    dispatch(editTarget.type === "proyecto"
      ? { type: "RENAME_PROYECTO", id: editTarget.id, nombre: editTarget.value.trim() }
      : { type: "RENAME_RESULTADO", id: editTarget.id, nombre: editTarget.value.trim() });
    setEditTarget(null);
  }

  function promoteResultado(id: string) {
    const res = state.resultados.find((r) => r.id === id);
    if (!res) return;
    const proj = state.proyectos.find((p) => p.id === res.proyectoId);
    const area = proj?.area ?? state.proyectos[0]?.area ?? "administrativa";
    dispatch({ type: "PROMOTE_RESULTADO", resultadoId: id, area, nuevoProyectoId: generateId() });
  }

  function moveResultado(id: string, nuevoProyectoId: string) {
    dispatch({ type: "MOVE_RESULTADO", resultadoId: id, nuevoProyectoId });
    setMoveTarget(null);
  }

  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  function createProject() {
    const name = newProjectName.trim();
    if (!name) return;
    const area = state.proyectos[0]?.area ?? "administrativa";
    dispatch({ type: "ADD_PROYECTO", payload: { id: generateId(), nombre: name, descripcion: null, area, creado: new Date().toISOString(), fechaInicio: null } });
    setNewProjectName("");
    setCreatingProject(false);
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="flex-1 text-xl font-bold text-zinc-900">Proyectos</h1>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">{proyectos.length}</span>
        <button onClick={() => setCreatingProject(true)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white hover:bg-amber-600">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      {/* Crear proyecto inline */}
      {creatingProject && (
        <div className="mb-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 space-y-2">
          <input type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} autoFocus
            placeholder="Nombre del nuevo proyecto..."
            onKeyDown={(e) => { if (e.key === "Enter") createProject(); if (e.key === "Escape") setCreatingProject(false); }}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none" />
          <div className="flex gap-2">
            <button onClick={() => setCreatingProject(false)} className="flex-1 rounded-lg border border-zinc-200 bg-white py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Cancelar</button>
            <button onClick={createProject} disabled={!newProjectName.trim()} className="flex-1 rounded-lg bg-amber-500 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-40">Crear</button>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto">
        {proyectos.map((p) => (
          <ProyectoCard
            key={p.id} proyecto={p}
            onEditProyecto={() => setEditTarget({ type: "proyecto", id: p.id, value: p.nombre })}
            onDeleteProyecto={() => setDeleteTarget({ type: "proyecto", id: p.id, nombre: p.nombre })}
            onDeleteResultado={(r) => setDeleteTarget({ type: "resultado", id: r.id, nombre: r.nombre })}
            onPromoteResultado={(r) => promoteResultado(r.id)}
            onMoveResultado={(r) => setMoveTarget({ resultadoId: r.id, resultadoName: r.nombre, currentProyectoId: r.proyectoId })}
            onOpenDetalle={onOpenDetalle}
          />
        ))}
      </div>

      {/* Editar nombre — inline */}
      {editTarget && (
        <div className="my-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-zinc-900">Editar nombre</h3>
          <input type="text" value={editTarget.value} onChange={(e) => setEditTarget({ ...editTarget, value: e.target.value })} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditTarget(null); }}
            className="w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none" />
          <div className="mt-2 flex gap-2">
            <button onClick={() => setEditTarget(null)} className="flex-1 rounded-lg border border-zinc-200 bg-white py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Cancelar</button>
            <button onClick={saveEdit} className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-medium text-white hover:bg-amber-600">Guardar</button>
          </div>
        </div>
      )}

      {/* Mover resultado — inline */}
      {moveTarget && (
        <div className="my-3 rounded-xl border-2 border-purple-200 bg-purple-50 p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-zinc-900">Mover a otro proyecto</h3>
          <p className="mb-3 text-[10px] text-zinc-500">Mover &ldquo;{moveTarget.resultadoName}&rdquo; a:</p>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {state.proyectos.filter((p) => p.id !== moveTarget.currentProyectoId).sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => (
              <button key={p.id} onClick={() => moveResultado(moveTarget.resultadoId, p.id)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-xs text-zinc-700 transition-all hover:border-amber-400 hover:bg-amber-50">{p.nombre}</button>
            ))}
          </div>
          <button onClick={() => setMoveTarget(null)} className="mt-2 w-full rounded-lg border border-zinc-200 bg-white py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Cancelar</button>
        </div>
      )}

      {/* Eliminar — overlay fijo siempre visible */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-900">
              {deleteTarget.type === "proyecto" ? "Eliminar proyecto" : "Eliminar resultado"}
            </h3>
            <p className="mt-1 text-xs text-zinc-600">
              {deleteTarget.type === "proyecto"
                ? `Se eliminará "${deleteTarget.nombre}" con todos sus resultados, entregables y pasos.`
                : `Se eliminará "${deleteTarget.nombre}" con todos sus entregables y pasos.`}
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
              <button onClick={confirmDelete}
                className="flex-1 rounded-lg bg-red-500 py-2.5 text-xs font-medium text-white hover:bg-red-600">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -- Subcomponentes locales (no necesitan archivo propio) --

import type { ProyectoView } from "@/lib/build-proyectos";

function ProyectoCard({
  proyecto, onEditProyecto, onDeleteProyecto, onDeleteResultado, onPromoteResultado, onMoveResultado, onOpenDetalle,
}: {
  proyecto: ProyectoView;
  onEditProyecto: () => void; onDeleteProyecto: () => void;
  onDeleteResultado: (r: ResultadoView) => void;
  onPromoteResultado: (r: ResultadoView) => void; onMoveResultado: (r: ResultadoView) => void;
  onOpenDetalle?: (resultadoId: string) => void;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [descValue, setDescValue] = useState(proyecto.descripcion ?? "");
  const pct = proyecto.diasTotal > 0 ? Math.round((proyecto.diasDone / proyecto.diasTotal) * 100) : null;
  const restante = proyecto.diasTotal - proyecto.diasDone;

  const fechaReal = proyecto.fechaInicioReal;

  function setFechaInicio(val: string) {
    dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { fechaInicio: val || null } });
  }

  function saveDesc() {
    const trimmed = descValue.trim();
    if (trimmed !== (proyecto.descripcion ?? "")) {
      dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { descripcion: trimmed || null } });
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-start">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-start gap-3 px-4 py-3.5 text-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className={`mt-0.5 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}><path d="m9 18 6-6-6-6" /></svg>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-zinc-800">{proyecto.nombre}</h3>
              <span className="shrink-0 text-xs tabular-nums text-zinc-400">{proyecto.resultados.length} resultado{proyecto.resultados.length !== 1 && "s"}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              {pct !== null && (
                <>
                  <div className="h-1.5 flex-1 rounded-full bg-zinc-100">
                    <div className={`h-1.5 rounded-full transition-all ${pct >= 100 ? "bg-green-400" : "bg-amber-400"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <span className="shrink-0 text-[10px] font-medium tabular-nums text-zinc-400">{pct}%</span>
                </>
              )}
              {proyecto.minutosTotal > 0 && <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">{formatMin(proyecto.minutosTotal)}</span>}
            </div>
            <div className="mt-1 flex items-center gap-2">
              {fechaReal && <span className="text-[10px] text-green-600">Inicio: {new Date(fechaReal).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" })}</span>}
              {restante > 0 && (
                <span className="text-[10px] text-zinc-400">
                  {restante} día{restante !== 1 ? "s" : ""} pendiente{restante !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </button>
        <div className="pr-2 pt-3 flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            {!fechaReal && (
              <input type="date" value={proyecto.fechaInicio ?? ""}
                onChange={(e) => { e.stopPropagation(); setFechaInicio(e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                title="Fecha de inicio estimada"
                className="h-7 w-[7.5rem] rounded border border-zinc-200 px-1 text-[10px] text-zinc-500 focus:border-amber-400 focus:outline-none" />
            )}
            <MenuAcciones acciones={[
              { label: "Editar nombre", onClick: onEditProyecto },
              { label: "Eliminar proyecto", destructive: true, onClick: onDeleteProyecto },
            ]} />
          </div>
        </div>
      </div>

      {/* Descripción inline — siempre visible */}
      <div className="px-4 pb-2" onClick={(e) => e.stopPropagation()}>
        <input type="text" value={descValue}
          onChange={(e) => setDescValue(e.target.value)}
          onBlur={saveDesc}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveDesc(); (e.target as HTMLInputElement).blur(); } }}
          placeholder="Descripción del proyecto..."
          className="w-full border-0 border-b border-transparent bg-transparent px-0 py-1 text-[11px] text-zinc-500 placeholder:text-zinc-300 focus:border-amber-300 focus:outline-none" />
      </div>

      {open && (
        <div className="border-t border-zinc-50 px-4 pb-3 pt-2">
          {proyecto.resultados.map((r) => (
            <ResultadoItem key={r.id} resultado={r}
              onDelete={() => onDeleteResultado(r)}
              onPromote={() => onPromoteResultado(r)} onMove={() => onMoveResultado(r)}
              onOpenDetalle={() => onOpenDetalle?.(r.id)} />
          ))}
          <AddResultadoInline proyectoId={proyecto.id} />
        </div>
      )}
    </div>
  );
}

function ResultadoItem({ resultado, onDelete, onPromote, onMove, onOpenDetalle }: {
  resultado: ResultadoView; onDelete: () => void; onPromote: () => void; onMove: () => void; onOpenDetalle: () => void;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(resultado.nombre);
  const [fechaLimite, setFechaLimite] = useState(resultado.fechaLimite ?? "");
  const [durCantidad, setDurCantidad] = useState(String(resultado.diasEstimados ?? ""));
  const [confirmAction, setConfirmAction] = useState<"promover" | "mover" | null>(null);

  const pct = resultado.diasTotal > 0 ? Math.round((resultado.diasDone / resultado.diasTotal) * 100) : null;
  const currentWeek = useMemo(() => getISOWeek(), []);
  const isThisWeek = resultado.semana === currentWeek;

  function toggleSemana() {
    dispatch({ type: "UPDATE_RESULTADO", id: resultado.id, changes: { semana: isThisWeek ? null : currentWeek } });
  }

  function saveName() {
    if (nameValue.trim() && nameValue.trim() !== resultado.nombre) {
      dispatch({ type: "RENAME_RESULTADO", id: resultado.id, nombre: nameValue.trim() });
    }
    setEditingName(false);
  }

  function savePlanning() {
    const dl = fechaLimite || null;
    const dc = durCantidad.trim() === "" ? null : (parseInt(durCantidad, 10) || null);
    dispatch({
      type: "UPDATE_RESULTADO",
      id: resultado.id,
      changes: { fechaLimite: dl, diasEstimados: dc },
    });
    setPlanning(false);
  }

  const ICO = "flex h-6 w-6 items-center justify-center rounded transition-colors";

  return (
    <div className="border-l-2 border-zinc-100 pl-3">
      <div className="flex items-center gap-0.5">
        {/* Chevron */}
        <button onClick={() => setOpen((o) => !o)} className="flex h-6 w-4 items-center justify-center shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            className={`text-zinc-300 transition-transform ${open ? "rotate-90" : ""}`}><path d="m9 18 6-6-6-6" /></svg>
        </button>

        {/* Name — click to go to detail, double-click to edit */}
        {editingName ? (
          <input type="text" value={nameValue} onChange={(e) => setNameValue(e.target.value)} autoFocus
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setNameValue(resultado.nombre); setEditingName(false); } }}
            className="flex-1 min-w-0 rounded border border-amber-300 bg-amber-50 px-1.5 py-1 text-xs font-medium text-zinc-900 focus:outline-none"
          />
        ) : (
          <button onClick={onOpenDetalle} onDoubleClick={(e) => { e.stopPropagation(); setEditingName(true); }}
            className="flex-1 min-w-0 truncate text-left text-xs font-medium text-zinc-600 py-1 hover:text-amber-600"
            title="Clic: ver detalle · Doble clic: editar nombre">
            {resultado.nombre}
          </button>
        )}

        {/* Stats inline */}
        <span className="flex shrink-0 items-center gap-1.5">
          {resultado.entregables.length > 0 && (
            <span className="rounded bg-zinc-100 px-1 py-0.5 text-[9px] text-zinc-400">
              {resultado.entregables.filter((e) => e.estado === "hecho").length}/{resultado.entregables.length}
            </span>
          )}
          {pct !== null && (
            <span className="h-1 w-5 rounded-full bg-zinc-100">
              <span className={`block h-1 rounded-full ${pct >= 100 ? "bg-green-400" : "bg-amber-400"}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </span>
          )}
          {resultado.minutosTotal > 0 && <span className="text-[9px] tabular-nums text-zinc-400">{formatMin(resultado.minutosTotal)}</span>}
        </span>

        {/* Icon: this week */}
        <button onClick={toggleSemana} title={isThisWeek ? "Quitar de esta semana" : "Añadir a esta semana"}
          className={`${ICO} ${isThisWeek ? "text-amber-500" : "text-zinc-300"} hover:text-amber-500`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={isThisWeek ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>

        {/* Icon: plan */}
        <button onClick={() => setPlanning((p) => !p)} title="Planificar duración"
          className={`${ICO} ${planning ? "text-blue-500" : "text-zinc-300"} hover:text-blue-500`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
          </svg>
        </button>

        {/* Icon: promote to project */}
        <button onClick={() => setConfirmAction("promover")} title="Promover a proyecto"
          className={`${ICO} text-zinc-300 hover:text-green-500`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>

        {/* Icon: move */}
        <button onClick={() => setConfirmAction("mover")} title="Mover a otro proyecto"
          className={`${ICO} text-zinc-300 hover:text-purple-500`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>

        {/* Icon: delete */}
        <button onClick={onDelete} title="Eliminar resultado"
          className={`${ICO} text-zinc-300 hover:text-red-500`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Planning panel */}
      {planning && (
        <div className="ml-5 my-1 rounded-lg border border-blue-200 bg-blue-50 p-2 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Planificación</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500">Deadline:</span>
              <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)}
                className="rounded border border-zinc-200 bg-white px-1.5 py-1 text-[10px] text-zinc-700 focus:border-blue-400 focus:outline-none" />
            </div>
            <span className="text-[10px] text-zinc-400">o</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-500">Sesiones estimadas:</span>
              <input type="number" min="1" value={durCantidad} onChange={(e) => setDurCantidad(e.target.value)} placeholder="—"
                className="w-10 rounded border border-zinc-200 bg-white px-1 py-1 text-center text-[10px] text-zinc-700 focus:border-blue-400 focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={savePlanning} className="rounded-lg bg-blue-500 px-3 py-1 text-[11px] font-medium text-white">Guardar</button>
            <button onClick={() => setPlanning(false)} className="text-[11px] text-zinc-400 hover:text-zinc-600">Cerrar</button>
          </div>
        </div>
      )}

      {/* Confirm promover/mover */}
      {confirmAction === "promover" && (
        <ModalConfirm titulo="Promover a proyecto" mensaje={`¿Convertir "${resultado.nombre}" en un proyecto independiente?`}
          labelConfirm="Promover" variant="primary"
          onConfirm={() => { onPromote(); setConfirmAction(null); }} onCancel={() => setConfirmAction(null)} />
      )}
      {confirmAction === "mover" && (
        <ModalConfirm titulo="Mover resultado" mensaje={`¿Mover "${resultado.nombre}" a otro proyecto?`}
          labelConfirm="Continuar" variant="primary"
          onConfirm={() => { onMove(); setConfirmAction(null); }} onCancel={() => setConfirmAction(null)} />
      )}

      {/* Entregables */}
      {open && (
        <div className="ml-3 space-y-0.5 pb-1">
          {resultado.entregables.map((e) => <EntregableItem key={e.id} entregable={e} />)}
          <AddEntregableInline resultadoId={resultado.id} />
        </div>
      )}
    </div>
  );
}
