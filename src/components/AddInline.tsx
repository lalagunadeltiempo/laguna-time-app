"use client";

import { useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario } from "@/lib/usuario";

export function AddResultadoInline({ proyectoId }: { proyectoId: string }) {
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const [editing, setEditing] = useState(false);
  const [nombre, setNombre] = useState("");

  function save() {
    if (!nombre.trim()) return;
    dispatch({
      type: "ADD_RESULTADO",
      payload: { id: generateId(), nombre: nombre.trim(), descripcion: null, proyectoId, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null, responsable: currentUser },
    });
    setNombre("");
    setEditing(false);
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-amber-600">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Añadir resultado
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2 px-3">
      <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del resultado..." autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setNombre(""); } }}
        className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none" />
      <button onClick={save} disabled={!nombre.trim()} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">OK</button>
      <button onClick={() => { setEditing(false); setNombre(""); }} className="text-xs text-zinc-400">✕</button>
    </div>
  );
}

export function AddEntregableInline({ resultadoId }: { resultadoId: string }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const [editing, setEditing] = useState(false);
  const [nombre, setNombre] = useState("");
  const [dias, setDias] = useState("3");
  const [responsable, setResponsable] = useState(currentUser);

  function save() {
    if (!nombre.trim()) return;
    dispatch({
      type: "ADD_ENTREGABLE",
      payload: {
        id: generateId(), nombre: nombre.trim(), resultadoId,
        tipo: "raw", plantillaId: null,
        diasEstimados: Math.max(1, parseInt(dias) || 3), diasHechos: 0,
        esDiaria: false, responsable, estado: "a_futuro", creado: new Date().toISOString(),
        semana: null, fechaLimite: null, fechaInicio: null,
      },
    });
    setNombre(""); setDias("3"); setResponsable(currentUser); setEditing(false);
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="mt-0.5 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-amber-600">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Añadir entregable
      </button>
    );
  }

  return (
    <div className="mt-1 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
      <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="¿Qué hay que entregar?" autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setNombre(""); } }}
        className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none" />
      <div className="flex items-center gap-3">
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
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={!nombre.trim()} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Crear</button>
        <button onClick={() => { setEditing(false); setNombre(""); }} className="text-xs text-zinc-400 hover:text-zinc-600">Cancelar</button>
      </div>
    </div>
  );
}
