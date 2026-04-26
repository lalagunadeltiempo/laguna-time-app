"use client";

import { useState, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario } from "@/lib/usuario";
import {
  type Ambito,
  type Area,
  AREAS_PERSONAL,
  AREAS_EMPRESA,
} from "@/lib/types";

interface Props {
  onClose: () => void;
}

export function NuevoPaso({ onClose }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();

  const [pasoName, setPasoName] = useState("");
  const [entregableId, setEntregableId] = useState<string | null>(null);
  const [newEntregable, setNewEntregable] = useState("");

  const [showClasificar, setShowClasificar] = useState(false);
  const [proyectoId, setProyectoId] = useState<string | null>(null);
  const [newProyecto, setNewProyecto] = useState("");
  const [showNewProyecto, setShowNewProyecto] = useState(false);
  const [newProyectoArea, setNewProyectoArea] = useState<Area>("administrativa");
  const [newProyectoAmbito, setNewProyectoAmbito] = useState<Ambito>("empresa");

  const [resultadoId, setResultadoId] = useState<string | null>(null);
  const [newResultado, setNewResultado] = useState("");
  const [showNewResultado, setShowNewResultado] = useState(false);

  const entregablesActivos = useMemo(() => {
    const lastActivity = new Map<string, number>();
    for (const paso of state.pasos) {
      if (!paso.inicioTs) continue;
      const ts = new Date(paso.inicioTs).getTime();
      const prev = lastActivity.get(paso.entregableId) ?? 0;
      if (ts > prev) lastActivity.set(paso.entregableId, ts);
    }
    return state.entregables
      .filter((e) => e.estado !== "hecho")
      .sort((a, b) => {
        const ta = lastActivity.get(a.id) ?? 0;
        const tb = lastActivity.get(b.id) ?? 0;
        if (ta !== tb) return tb - ta;
        return a.nombre.localeCompare(b.nombre);
      })
      .slice(0, 12);
  }, [state.entregables, state.pasos]);

  const proyectos = useMemo(() => {
    return [...state.proyectos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [state.proyectos]);

  const resultadosDisp = useMemo(() => {
    if (!proyectoId) return [];
    return state.resultados.filter((r) => r.proyectoId === proyectoId);
  }, [state.resultados, proyectoId]);

  const areas = newProyectoAmbito === "personal" ? AREAS_PERSONAL : AREAS_EMPRESA;

  const entregableNombre = entregableId
    ? state.entregables.find((e) => e.id === entregableId)?.nombre ?? ""
    : newEntregable.trim() || pasoName.trim();

  const pasoFinal = pasoName.trim();
  const canStart = !!pasoFinal;

  function handleStart() {
    if (!canStart) return;
    const now = new Date().toISOString();

    let eId = entregableId;

    if (!eId) {
      let pId = proyectoId;
      if (!pId && showNewProyecto && newProyecto.trim()) {
        pId = generateId();
        dispatch({ type: "ADD_PROYECTO", payload: { id: pId, nombre: newProyecto.trim(), area: newProyectoArea, creado: now, fechaInicio: null, descripcion: null } });
      }
      if (!pId) {
        let defaultProj = state.proyectos.find((p) => p.nombre === "General");
        if (!defaultProj) {
          pId = generateId();
          dispatch({ type: "ADD_PROYECTO", payload: { id: pId, nombre: "General", area: "administrativa", creado: now, fechaInicio: null, descripcion: null } });
        } else {
          pId = defaultProj.id;
        }
      }

      let rId = resultadoId;
      if (!rId && showNewResultado && newResultado.trim()) {
        rId = generateId();
        dispatch({ type: "ADD_RESULTADO", payload: { id: rId, nombre: newResultado.trim(), descripcion: null, proyectoId: pId, creado: now, semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null, responsable: currentUser } });
      }
      if (!rId) {
        let defaultRes = state.resultados.find((r) => r.proyectoId === pId);
        if (!defaultRes) {
          rId = generateId();
          dispatch({ type: "ADD_RESULTADO", payload: { id: rId, nombre: "General", descripcion: null, proyectoId: pId, creado: now, semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null, responsable: currentUser } });
        } else {
          rId = defaultRes.id;
        }
      }

      eId = generateId();
      dispatch({
        type: "ADD_ENTREGABLE",
        payload: {
          id: eId, nombre: entregableNombre, resultadoId: rId, tipo: "raw",
          plantillaId: null, diasEstimados: 3, diasHechos: 0, esDiaria: false,
          responsable: currentUser, estado: "en_proceso", creado: now,
          semana: null, fechaLimite: null, fechaInicio: null,
        },
      });
    }

    dispatch({
      type: "START_PASO",
      payload: {
        id: generateId(), entregableId: eId, nombre: pasoFinal,
        inicioTs: now, finTs: null, estado: "",
        contexto: { urls: [], apps: [], notas: "" },
        implicados: [{ tipo: "equipo", nombre: currentUser }],
        pausas: [], siguientePaso: null,
      },
    });
    onClose();
  }

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-white p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Empezar a trabajar</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-4">
        {/* PASO — lo primero: ¿qué vas a hacer? */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            ¿Qué vas a hacer?
          </label>
          <input
            type="text"
            value={pasoName}
            onChange={(e) => setPasoName(e.target.value)}
            placeholder="Describe brevemente tu próxima acción..."
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && canStart) handleStart(); }}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* ENTREGABLE — opcional, para clasificar */}
        {pasoName.trim() && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Entregable <span className="font-normal normal-case text-zinc-300">(opcional — elige uno o escribe nuevo)</span>
            </label>
            {entregableId ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2">
                <span className="flex-1 text-sm font-medium text-green-800">{entregableNombre}</span>
                <button onClick={() => setEntregableId(null)} className="text-xs text-green-600 hover:underline">Cambiar</button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={newEntregable}
                  onChange={(e) => setNewEntregable(e.target.value)}
                  placeholder="¿A qué entregable pertenece? (Enter para empezar rápido)"
                  onKeyDown={(e) => { if (e.key === "Enter" && canStart) handleStart(); }}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"
                />
                {entregablesActivos.length > 0 && !newEntregable.trim() && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entregablesActivos.map((e) => (
                      <button key={e.id} onClick={() => { setEntregableId(e.id); setNewEntregable(""); }}
                        className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600 transition-all hover:border-green-400 hover:bg-green-50">
                        {e.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* CLASIFICACION OPCIONAL */}
        {entregableNombre && !entregableId && (
          <div>
            {!showClasificar ? (
              <button onClick={() => setShowClasificar(true)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-amber-600">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
                Clasificar en proyecto y resultado (opcional)
              </button>
            ) : (
              <div className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Clasificación</p>
                  <button onClick={() => { setShowClasificar(false); setProyectoId(null); setResultadoId(null); setShowNewProyecto(false); setShowNewResultado(false); }}
                    className="text-[10px] text-zinc-400 hover:text-zinc-600">Cerrar</button>
                </div>

                {/* Proyecto */}
                <div>
                  <p className="mb-1 text-[10px] font-medium text-zinc-500">Proyecto</p>
                  {!showNewProyecto ? (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap gap-1">
                        {proyectos.map((p) => (
                          <button key={p.id}
                            onClick={() => { setProyectoId(p.id === proyectoId ? null : p.id); setResultadoId(null); setShowNewResultado(false); }}
                            className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${proyectoId === p.id ? "border-amber-400 bg-amber-50 text-amber-700" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>
                            {p.nombre}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => { setShowNewProyecto(true); setProyectoId(null); }} className="text-[10px] text-amber-600 hover:underline">+ Crear proyecto</button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input type="text" value={newProyecto} onChange={(e) => setNewProyecto(e.target.value)} placeholder="Nombre del proyecto..."
                        autoFocus className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs focus:border-amber-400 focus:outline-none" />
                      <div className="flex gap-1.5">
                        <select value={newProyectoAmbito} onChange={(e) => { const a = e.target.value as Ambito; setNewProyectoAmbito(a); setNewProyectoArea((a === "personal" ? AREAS_PERSONAL : AREAS_EMPRESA)[0].id); }}
                          className="rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[10px]">
                          <option value="empresa">Empresa</option><option value="personal">Personal</option>
                        </select>
                        <select value={newProyectoArea} onChange={(e) => setNewProyectoArea(e.target.value as Area)}
                          className="flex-1 rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[10px]">
                          {areas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                        </select>
                      </div>
                      <button onClick={() => { setShowNewProyecto(false); setNewProyecto(""); }} className="text-[10px] text-zinc-400 hover:text-zinc-600">Cancelar</button>
                    </div>
                  )}
                </div>

                {/* Resultado */}
                {(proyectoId || (showNewProyecto && newProyecto.trim())) && (
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-zinc-500">Resultado</p>
                    {!showNewResultado ? (
                      <div className="space-y-1.5">
                        {resultadosDisp.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {resultadosDisp.map((r) => (
                              <button key={r.id}
                                onClick={() => setResultadoId(r.id === resultadoId ? null : r.id)}
                                className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${resultadoId === r.id ? "border-amber-400 bg-amber-50 text-amber-700" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>
                                {r.nombre}
                              </button>
                            ))}
                          </div>
                        )}
                        <button onClick={() => { setShowNewResultado(true); setResultadoId(null); }} className="text-[10px] text-amber-600 hover:underline">+ Crear resultado</button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <input type="text" value={newResultado} onChange={(e) => setNewResultado(e.target.value)} placeholder="Nombre del resultado..."
                          autoFocus className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs focus:border-amber-400 focus:outline-none" />
                        <button onClick={() => { setShowNewResultado(false); setNewResultado(""); }} className="text-[10px] text-zinc-400 hover:text-zinc-600">Cancelar</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* BOTON EMPEZAR */}
        {canStart && (
          <button onClick={handleStart}
            className="w-full rounded-xl bg-green-600 py-3.5 text-base font-semibold text-white transition-colors hover:bg-green-700">
            Empezar
          </button>
        )}
      </div>
    </div>
  );
}
