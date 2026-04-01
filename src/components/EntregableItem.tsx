"use client";

import { useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import type { Entregable } from "@/lib/types";
import { formatMin, minutosPaso } from "@/lib/utils";
import type { EntregableView } from "@/lib/build-proyectos";
import { MenuAcciones } from "./MenuAcciones";
import { ModalConfirm } from "./ModalConfirm";

const ESTADO_DOT: Record<string, string> = {
  en_proceso: "bg-amber-400",
  a_futuro: "bg-blue-300",
  en_espera: "bg-zinc-300",
  hecho: "bg-green-400",
  cancelada: "bg-red-300",
};

export function EntregableItem({ entregable }: { entregable: EntregableView }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const dot = ESTADO_DOT[entregable.estado] ?? "bg-zinc-300";
  const [editing, setEditing] = useState(false);
  const [showPasos, setShowPasos] = useState(false);
  const [nombre, setNombre] = useState(entregable.nombre);
  const [dias, setDias] = useState(String(entregable.diasEstimados));
  const [responsable, setResponsable] = useState(entregable.responsable);
  const [estado, setEstado] = useState(entregable.estado);
  const [fechaLimite, setFechaLimite] = useState(entregable.fechaLimite ?? "");
  const [fechaInicio, setFechaInicio] = useState(entregable.fechaInicio ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pasos = showPasos
    ? state.pasos
        .filter((p) => p.entregableId === entregable.id && p.finTs)
        .sort((a, b) => new Date(b.finTs!).getTime() - new Date(a.finTs!).getTime())
    : [];

  function save() {
    const changes: Record<string, unknown> = {};
    if (nombre.trim() && nombre.trim() !== entregable.nombre) changes.nombre = nombre.trim();
    const b = Math.max(1, parseInt(dias) || entregable.diasEstimados);
    if (b !== entregable.diasEstimados) changes.diasEstimados = b;
    if (responsable !== entregable.responsable) changes.responsable = responsable;
    if (estado !== entregable.estado) changes.estado = estado;
    const fl = fechaLimite || null;
    if (fl !== entregable.fechaLimite) changes.fechaLimite = fl;
    const fi = fechaInicio || null;
    if (fi !== entregable.fechaInicio) changes.fechaInicio = fi;
    if (Object.keys(changes).length > 0) {
      dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes });
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 my-0.5">
        <input
          type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-amber-400 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">Días:</span>
            <input type="number" min="1" value={dias} onChange={(e) => setDias(e.target.value)}
              className="w-12 rounded border border-zinc-200 bg-white px-1.5 py-1 text-center text-[10px] text-zinc-900 focus:border-amber-400 focus:outline-none" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">Para:</span>
            <select value={responsable} onChange={(e) => setResponsable(e.target.value)}
              className="rounded border border-zinc-200 bg-white px-1.5 py-1 text-[10px] text-zinc-700 focus:border-amber-400 focus:outline-none">
              {state.miembros.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">Estado:</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value as Entregable["estado"])}
              className="rounded border border-zinc-200 bg-white px-1.5 py-1 text-[10px] text-zinc-700 focus:border-amber-400 focus:outline-none">
              <option value="a_futuro">A futuro</option>
              <option value="en_proceso">En proceso</option>
              <option value="en_espera">En espera</option>
              <option value="hecho">Hecho</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">Inicio:</span>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
              className="rounded border border-zinc-200 bg-white px-1.5 py-1 text-[10px] text-zinc-700 focus:border-amber-400 focus:outline-none" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">Deadline:</span>
            <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)}
              className="rounded border border-zinc-200 bg-white px-1.5 py-1 text-[10px] text-zinc-700 focus:border-amber-400 focus:outline-none" />
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={save} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white">Guardar</button>
          <button onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-600">Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="group flex items-center gap-2 rounded px-2 py-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="flex-1 truncate text-[11px] text-zinc-600">{entregable.nombre}</span>
        <span className="flex shrink-0 items-center gap-2">
          {entregable.fechaInicio && (
            <span className="text-[10px] tabular-nums text-zinc-400">{entregable.fechaInicio.slice(5)}</span>
          )}
          {entregable.fechaLimite && (
            <span className="text-[10px] tabular-nums text-red-400">{entregable.fechaLimite.slice(5)}</span>
          )}
          {entregable.diasEstimados > entregable.diasHechos && (
            <span className="text-[10px] tabular-nums text-zinc-400">{entregable.diasHechos}/{entregable.diasEstimados}</span>
          )}
          {entregable.minutos > 0 && (
            <span className="text-[10px] tabular-nums text-zinc-400">{formatMin(entregable.minutos)}</span>
          )}
          <span className="text-[10px] text-zinc-400">{entregable.responsable}</span>
          <MenuAcciones acciones={[
            { label: "Ver pasos", onClick: () => setShowPasos((v) => !v) },
            { label: "Editar / Planificar", onClick: () => setEditing(true) },
            { label: "Eliminar", destructive: true, onClick: () => setConfirmDelete(true) },
          ]} />
        </span>
      </div>

      {/* Historial de pasos */}
      {showPasos && (
        <div className="ml-6 mb-1 space-y-0.5 border-l border-zinc-100 pl-2">
          {pasos.length === 0 ? (
            <p className="py-1 text-[10px] text-zinc-400">Sin pasos registrados</p>
          ) : (
            pasos.map((p) => {
              const dur = minutosPaso(p);
              const fecha = p.inicioTs ? new Date(p.inicioTs).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "pendiente";
              return (
                <div key={p.id} className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] tabular-nums text-zinc-300">{fecha}</span>
                  <span className="flex-1 truncate text-[10px] text-zinc-500">{p.nombre}</span>
                  <span className="text-[10px] tabular-nums text-zinc-400">{formatMin(dur)}</span>
                </div>
              );
            })
          )}
          <button onClick={() => setShowPasos(false)} className="text-[10px] text-zinc-300 hover:text-zinc-500">Cerrar</button>
        </div>
      )}

      {confirmDelete && (
        <ModalConfirm
          mensaje={`¿Eliminar "${entregable.nombre}" y todos sus pasos?`}
          onConfirm={() => { dispatch({ type: "DELETE_ENTREGABLE", id: entregable.id }); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
