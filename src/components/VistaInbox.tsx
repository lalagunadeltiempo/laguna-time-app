"use client";

import { useState, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { USUARIO_ACTUAL } from "@/lib/usuario";

interface Props {
  onClose: () => void;
}

export function VistaInbox({ onClose }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const pendientes = useMemo(
    () => state.inbox.filter((i) => !i.procesado).sort((a, b) => new Date(a.creado).getTime() - new Date(b.creado).getTime()),
    [state.inbox],
  );
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertMode, setConvertMode] = useState<"entregable" | "paso">("entregable");

  function discard(id: string) {
    dispatch({ type: "PROCESS_INBOX", id });
  }

  if (pendientes.length === 0) {
    return (
      <div className="my-4 rounded-2xl border-2 border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Inbox</h2>
        <p className="mt-3 text-sm text-zinc-500">No hay ideas pendientes de procesar.</p>
        <button onClick={onClose} className="mt-4 w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50">Cerrar</button>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-2xl border-2 border-amber-200 bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            Inbox <span className="ml-1 text-sm font-normal text-zinc-400">({pendientes.length})</span>
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-3">
          {pendientes.map((item) => (
            convertingId === item.id ? (
              <ConvertForm
                key={item.id}
                texto={item.texto}
                mode={convertMode}
                onDone={() => { discard(item.id); setConvertingId(null); }}
                onCancel={() => setConvertingId(null)}
              />
            ) : (
              <div key={item.id} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <p className="text-sm text-zinc-800">{item.texto}</p>
                <p className="mt-1 text-[10px] text-zinc-400">
                  {new Date(item.creado).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => { setConvertMode("entregable"); setConvertingId(item.id); }}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                  >
                    Crear entregable
                  </button>
                  <button
                    onClick={() => { setConvertMode("paso"); setConvertingId(item.id); }}
                    className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
                  >
                    Crear paso
                  </button>
                  <button
                    onClick={() => discard(item.id)}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
    </div>
  );
}

/* ---------- Form to convert an inbox item ---------- */

function ConvertForm({ texto, mode, onDone, onCancel }: {
  texto: string; mode: "entregable" | "paso"; onDone: () => void; onCancel: () => void;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const [nombre, setNombre] = useState(texto);
  const [proyectoId, setProyectoId] = useState("");
  const [resultadoId, setResultadoId] = useState("");
  const [entregableId, setEntregableId] = useState("");
  const [responsable, setResponsable] = useState(USUARIO_ACTUAL);

  const [newProyecto, setNewProyecto] = useState("");
  const [newResultado, setNewResultado] = useState("");
  const [newEntregable, setNewEntregable] = useState("");
  const [showNewProyecto, setShowNewProyecto] = useState(false);
  const [showNewResultado, setShowNewResultado] = useState(false);
  const [showNewEntregable, setShowNewEntregable] = useState(false);

  const proyectos = useMemo(
    () => [...state.proyectos].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [state.proyectos],
  );

  const resultados = useMemo(
    () => proyectoId
      ? state.resultados.filter((r) => r.proyectoId === proyectoId).sort((a, b) => a.nombre.localeCompare(b.nombre))
      : [],
    [state.resultados, proyectoId],
  );

  const entregables = useMemo(
    () => resultadoId
      ? state.entregables.filter((e) => e.resultadoId === resultadoId).sort((a, b) => a.nombre.localeCompare(b.nombre))
      : [],
    [state.entregables, resultadoId],
  );

  function ensureProyecto(): string {
    if (proyectoId) return proyectoId;
    if (!newProyecto.trim()) return "";
    const id = generateId();
    dispatch({
      type: "ADD_PROYECTO",
      payload: {
        id,
        nombre: newProyecto.trim(),
        descripcion: null,
        area: "administrativa",
        creado: new Date().toISOString(),
        fechaInicio: null,
      },
    });
    return id;
  }

  function ensureResultado(pId: string): string {
    if (resultadoId) return resultadoId;
    if (!newResultado.trim()) return "";
    const id = generateId();
    dispatch({
      type: "ADD_RESULTADO",
      payload: { id, nombre: newResultado.trim(), descripcion: null, proyectoId: pId, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null },
    });
    return id;
  }

  function ensureEntregable(rId: string): string {
    if (entregableId) return entregableId;
    if (!newEntregable.trim()) return "";
    const id = generateId();
    dispatch({
      type: "ADD_ENTREGABLE",
      payload: {
        id,
        nombre: newEntregable.trim(),
        resultadoId: rId,
        tipo: "raw",
        plantillaId: null,
        diasEstimados: 3,
        diasHechos: 0,
        esDiaria: false,
        responsable,
        estado: "a_futuro",
        creado: new Date().toISOString(),
        semana: null,
        fechaLimite: null,
        fechaInicio: null,
      },
    });
    return id;
  }

  function handleSave() {
    if (!nombre.trim()) return;
    const pId = ensureProyecto();
    if (!pId) return;
    const rId = ensureResultado(pId);
    if (!rId) return;

    if (mode === "entregable") {
      dispatch({
        type: "ADD_ENTREGABLE",
        payload: {
          id: generateId(),
          nombre: nombre.trim(),
          resultadoId: rId,
          tipo: "raw",
          plantillaId: null,
          diasEstimados: 3,
          diasHechos: 0,
          esDiaria: false,
          responsable,
          estado: "a_futuro",
          creado: new Date().toISOString(),
          semana: null,
          fechaLimite: null,
          fechaInicio: null,
        },
      });
    } else {
      const eId = ensureEntregable(rId);
      if (!eId) return;
      dispatch({
        type: "ADD_PASO",
        payload: {
          id: generateId(), entregableId: eId, nombre: nombre.trim(),
          inicioTs: null, finTs: null, estado: "",
          contexto: { urls: [], apps: [], notas: "" },
          implicados: [{ tipo: "equipo", nombre: USUARIO_ACTUAL }],
          pausas: [],
          siguientePaso: null,
        },
      });
    }
    onDone();
  }

  const needsEntregable = mode === "paso";
  const canSave = nombre.trim()
    && (proyectoId || newProyecto.trim())
    && (resultadoId || newResultado.trim())
    && (!needsEntregable || entregableId || newEntregable.trim());

  const isPaso = mode === "paso";
  const accentBg = isPaso ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200";
  const accentLabel = isPaso ? "text-blue-600" : "text-amber-600";
  const accentBtn = isPaso ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700";

  return (
    <div className={`rounded-xl border ${accentBg} p-3 space-y-2`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${accentLabel}`}>
        {isPaso ? "Crear paso" : "Crear entregable"}
      </p>

      {/* Nombre */}
      <input
        type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre..."
        className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-amber-400 focus:outline-none"
        autoFocus
      />

      {/* Proyecto */}
      {!showNewProyecto ? (
        <div className="flex gap-1">
          <select value={proyectoId} onChange={(e) => { setProyectoId(e.target.value); setResultadoId(""); setEntregableId(""); }}
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 focus:border-amber-400 focus:outline-none">
            <option value="">Selecciona proyecto...</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button onClick={() => setShowNewProyecto(true)} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50" title="Crear proyecto">+</button>
        </div>
      ) : (
        <div className="flex gap-1">
          <input type="text" value={newProyecto} onChange={(e) => setNewProyecto(e.target.value)} placeholder="Nuevo proyecto..."
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-amber-400 focus:outline-none" autoFocus />
          <button onClick={() => { setShowNewProyecto(false); setNewProyecto(""); }} className="text-xs text-zinc-400 hover:text-zinc-600 px-1">&times;</button>
        </div>
      )}

      {/* Resultado */}
      {(proyectoId || newProyecto.trim()) && (
        !showNewResultado ? (
          <div className="flex gap-1">
            <select value={resultadoId} onChange={(e) => { setResultadoId(e.target.value); setEntregableId(""); }}
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 focus:border-amber-400 focus:outline-none"
              disabled={!proyectoId}>
              <option value="">Selecciona resultado...</option>
              {resultados.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
            <button onClick={() => setShowNewResultado(true)} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50" title="Crear resultado">+</button>
          </div>
        ) : (
          <div className="flex gap-1">
            <input type="text" value={newResultado} onChange={(e) => setNewResultado(e.target.value)} placeholder="Nuevo resultado..."
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-amber-400 focus:outline-none" autoFocus />
            <button onClick={() => { setShowNewResultado(false); setNewResultado(""); }} className="text-xs text-zinc-400 hover:text-zinc-600 px-1">&times;</button>
          </div>
        )
      )}

      {/* Entregable (only for paso mode) */}
      {needsEntregable && (resultadoId || newResultado.trim()) && (
        !showNewEntregable ? (
          <div className="flex gap-1">
            <select value={entregableId} onChange={(e) => setEntregableId(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 focus:border-amber-400 focus:outline-none"
              disabled={!resultadoId}>
              <option value="">Selecciona entregable...</option>
              {entregables.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <button onClick={() => setShowNewEntregable(true)} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50" title="Crear entregable">+</button>
          </div>
        ) : (
          <div className="flex gap-1">
            <input type="text" value={newEntregable} onChange={(e) => setNewEntregable(e.target.value)} placeholder="Nuevo entregable..."
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-amber-400 focus:outline-none" autoFocus />
            <button onClick={() => { setShowNewEntregable(false); setNewEntregable(""); }} className="text-xs text-zinc-400 hover:text-zinc-600 px-1">&times;</button>
          </div>
        )
      )}

      {/* Responsable */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-500">Para:</span>
        <select value={responsable} onChange={(e) => setResponsable(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-700 focus:border-amber-400 focus:outline-none">
          {state.miembros.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={!canSave}
          className={`rounded-lg ${accentBtn} px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40`}>
          {isPaso ? "Crear paso" : "Crear entregable"}
        </button>
        <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-600">Cancelar</button>
      </div>
    </div>
  );
}
