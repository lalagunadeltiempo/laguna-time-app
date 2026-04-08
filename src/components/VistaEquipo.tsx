"use client";

import { useState, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import type { MiembroInfo } from "@/lib/types";
import { useUsuario } from "@/lib/usuario";
import { ModalConfirm } from "./ModalConfirm";

const COLORS = ["#F59E0B", "#3B82F6", "#10B981", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316", "#84CC16", "#A855F7"];

interface Props { onBack: () => void }

export function VistaEquipo({ onBack }: Props) {
  const { nombre: currentUser } = useUsuario();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MiembroInfo | null>(null);

  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  function resetForm() {
    setNombre(""); setRol(""); setColor(COLORS[0]);
    setAdding(false); setEditingId(null);
  }

  function startEdit(m: MiembroInfo) {
    setNombre(m.nombre); setRol(m.rol ?? ""); setColor(m.color);
    setEditingId(m.id); setAdding(false);
  }

  function save() {
    const trimmed = nombre.trim();
    if (!trimmed) return;

    if (editingId) {
      dispatch({ type: "UPDATE_MIEMBRO", id: editingId, changes: { nombre: trimmed, rol: (rol.trim() || undefined) as MiembroInfo["rol"], color } });
    } else {
      dispatch({ type: "ADD_MIEMBRO", payload: { id: generateId(), nombre: trimmed, rol: (rol.trim() || undefined) as MiembroInfo["rol"], color, capacidadDiaria: 1, diasLaborables: [1, 2, 3, 4, 5] } });
    }
    resetForm();
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    dispatch({ type: "DELETE_MIEMBRO", id: deleteTarget.id });
    setDeleteTarget(null);
  }

  function statsFor(m: MiembroInfo) {
    const entregables = state.entregables.filter((e) => e.responsable === m.nombre);
    const activos = entregables.filter((e) => e.estado === "en_proceso").length;
    const hechos = entregables.filter((e) => e.estado === "hecho").length;
    return { total: entregables.length, activos, hechos };
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="flex-1 text-xl font-bold text-zinc-900">Equipo</h1>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500">{state.miembros.length}</span>
      </div>

      {/* Lista de miembros */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {state.miembros.map((m) => {
          const s = statsFor(m);
          const isMe = m.nombre === currentUser;
          const isEditing = editingId === m.id;

          if (isEditing) {
            return (
              <div key={m.id} className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 space-y-2">
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") resetForm(); }}
                  placeholder="Nombre" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none" />
                <input type="text" value={rol} onChange={(e) => setRol(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") resetForm(); }}
                  placeholder="Rol (opcional)" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs focus:border-amber-400 focus:outline-none" />
                <div className="flex gap-1.5">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => setColor(c)}
                      className={`h-6 w-6 rounded-full border-2 transition-all ${color === c ? "border-zinc-800 scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={resetForm} className="flex-1 rounded-lg border border-zinc-200 bg-white py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Cancelar</button>
                  <button onClick={save} className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-medium text-white hover:bg-amber-600">Guardar</button>
                </div>
              </div>
            );
          }

          return (
            <div key={m.id}>
              <div className={`flex items-center gap-3 rounded-xl border p-3 transition-colors cursor-pointer ${selectedMember === m.id ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-white hover:border-zinc-300"}`}
                onClick={() => setSelectedMember(selectedMember === m.id ? null : m.id)}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: m.color }}>
                  {m.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-800 truncate">{m.nombre}</p>
                    {isMe && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Tú</span>}
                  </div>
                  {m.rol && <p className="text-[10px] text-zinc-400 truncate">{m.rol}</p>}
                  <div className="mt-0.5 flex gap-3 text-[10px] text-zinc-400">
                    <span>{s.total} entregables</span>
                    <span>{s.activos} activos</span>
                    <span>{s.hechos} hechos</span>
                  </div>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => startEdit(m)}
                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600" title="Editar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  {!isMe && (
                    <button onClick={() => setDeleteTarget(m)}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500" title="Eliminar">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              {selectedMember === m.id && <MemberPlan nombre={m.nombre} />}
            </div>
          );
        })}
      </div>

      {/* Confirmación de borrado */}
      {deleteTarget && (
        <ModalConfirm
          titulo={`Eliminar a ${deleteTarget.nombre}`}
          mensaje={`Se eliminará del equipo. Los entregables asignados a ${deleteTarget.nombre} no se borran.`}
          onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Formulario de añadir */}
      {adding ? (
        <div className="mt-3 rounded-xl border-2 border-green-200 bg-green-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-zinc-700">Nuevo miembro</p>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") resetForm(); }}
            placeholder="Nombre" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-green-400 focus:outline-none" />
          <input type="text" value={rol} onChange={(e) => setRol(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") resetForm(); }}
            placeholder="Rol (opcional, ej: Coordinadora, Developer...)" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs focus:border-green-400 focus:outline-none" />
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border-2 transition-all ${color === c ? "border-zinc-800 scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={resetForm} className="flex-1 rounded-lg border border-zinc-200 bg-white py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Cancelar</button>
            <button onClick={save} disabled={!nombre.trim()}
              className="flex-1 rounded-lg bg-green-600 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40">Añadir</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { resetForm(); setAdding(true); }}
          className="mt-3 w-full rounded-xl border-2 border-dashed border-zinc-200 py-3 text-sm font-medium text-zinc-500 hover:border-green-300 hover:text-green-600 transition-colors">
          + Añadir miembro
        </button>
      )}
    </div>
  );
}

/* ---- Planificación de un miembro ---- */

function MemberPlan({ nombre }: { nombre: string }) {
  const state = useAppState();

  const plan = useMemo(() => {
    const entregables = state.entregables.filter((e) => e.responsable === nombre && e.estado !== "hecho" && e.estado !== "cancelada");
    const grouped = new Map<string, { proyecto: string; resultado: string; items: typeof entregables }>();

    for (const e of entregables) {
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      if (!res) continue;
      const proj = state.proyectos.find((p) => p.id === res.proyectoId);
      const key = res.id;
      if (!grouped.has(key)) grouped.set(key, { proyecto: proj?.nombre ?? "", resultado: res.nombre, items: [] });
      grouped.get(key)!.items.push(e);
    }
    return Array.from(grouped.values());
  }, [state, nombre]);

  const hechos = useMemo(
    () => state.entregables.filter((e) => e.responsable === nombre && e.estado === "hecho").length,
    [state, nombre],
  );

  const ESTADO_LABEL: Record<string, { text: string; cls: string }> = {
    en_proceso: { text: "En curso", cls: "text-amber-600" },
    en_espera: { text: "Esperando", cls: "text-zinc-400" },
    a_futuro: { text: "Futuro", cls: "text-blue-400" },
  };

  if (plan.length === 0) {
    return (
      <div className="ml-6 mt-1 mb-2 rounded-lg border border-zinc-100 px-3 py-2 text-[11px] text-zinc-400">
        Sin entregables pendientes. {hechos > 0 && `${hechos} completados.`}
      </div>
    );
  }

  return (
    <div className="ml-6 mt-1 mb-2 space-y-2">
      {plan.map(({ proyecto, resultado, items }) => (
        <div key={resultado} className="rounded-lg border border-zinc-200 px-3 py-2">
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-[11px] font-semibold text-zinc-700">{proyecto}</span>
            <span className="text-[10px] text-zinc-300">→</span>
            <span className="text-[11px] text-zinc-500">{resultado}</span>
          </div>
          <div className="space-y-0.5">
            {items.map((e) => {
              const st = ESTADO_LABEL[e.estado] ?? { text: e.estado, cls: "text-zinc-400" };
              return (
                <div key={e.id} className="flex items-center gap-2 text-[11px]">
                  <span className={`${st.cls}`}>{st.text}</span>
                  <span className="text-zinc-700 truncate">{e.nombre}</span>
                  <span className="ml-auto text-[10px] text-zinc-300">{e.diasHechos}/{e.diasEstimados}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {hechos > 0 && <p className="text-[10px] text-zinc-400 ml-1">{hechos} entregable{hechos > 1 ? "s" : ""} completado{hechos > 1 ? "s" : ""}</p>}
    </div>
  );
}
