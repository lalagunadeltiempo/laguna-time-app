"use client";

import { useState, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { usePendientes, type Pendiente } from "@/lib/hooks";
import { generateId } from "@/lib/store";
import { USUARIO_ACTUAL } from "@/lib/usuario";
import { getISOWeek } from "@/lib/utils";
import { ModalConfirm } from "./ModalConfirm";

interface Props {
  onOpenDetalle: (resultadoId: string) => void;
}

export function PantallaPlan({ onOpenDetalle }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const pendientes = usePendientes();
  const [view, setView] = useState<"dia" | "semana">("dia");
  const [confirmTarget, setConfirmTarget] = useState<Pendiente | null>(null);

  const currentWeek = useMemo(() => getISOWeek(), []);
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const programadosHoy = useMemo(() => {
    return state.pasos.filter((p) => {
      if (!p.finTs || !p.siguientePaso) return false;
      if (p.siguientePaso.tipo !== "continuar") return false;
      const fp = p.siguientePaso.fechaProgramada;
      if (!fp) return false;
      if (fp === "manana") {
        const ayer = new Date();
        ayer.setDate(ayer.getDate() - 1);
        const ayerStr = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, "0")}-${String(ayer.getDate()).padStart(2, "0")}`;
        const finDate = p.finTs.slice(0, 10);
        return finDate === ayerStr;
      }
      return fp === todayStr;
    }).map((p) => {
      const ent = state.entregables.find((e) => e.id === p.entregableId);
      const res = ent ? state.resultados.find((r) => r.id === ent.resultadoId) : undefined;
      const proj = res ? state.proyectos.find((pr) => pr.id === res.proyectoId) : undefined;
      return {
        paso: p,
        siguienteNombre: p.siguientePaso?.nombre ?? p.nombre,
        entregableNombre: ent?.nombre ?? "",
        resultadoNombre: res?.nombre ?? "",
        proyectoNombre: proj?.nombre ?? "",
      };
    });
  }, [state, todayStr]);

  const estaSemana = pendientes.filter((p) => p.resultadoSemana === currentWeek);
  const otros = pendientes.filter((p) => p.resultadoSemana !== currentWeek);

  const sopEntregablesHoy = useMemo(() => {
    return state.entregables.filter((e) => {
      if (e.tipo !== "sop" || e.estado === "hecho" || e.estado === "cancelada") return false;
      if (e.responsable !== USUARIO_ACTUAL) return false;
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      return res?.semana === currentWeek;
    }).map((e) => {
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      const plantilla = e.plantillaId ? state.plantillas.find((pl) => pl.id === e.plantillaId) : null;
      const pasosDados = state.pasos.filter((p) => p.entregableId === e.id);
      return { entregable: e, resultadoNombre: res?.nombre ?? "", proyectoNombre: proj?.nombre ?? "", plantilla, pasosDados };
    });
  }, [state, currentWeek]);

  function startPendiente(p: Pendiente) {
    if (p.pendingPasoId) {
      dispatch({ type: "ACTIVATE_PASO", id: p.pendingPasoId });
      return;
    }
    dispatch({
      type: "START_PASO",
      payload: {
        id: generateId(),
        entregableId: p.entregable.id,
        nombre: p.siguientePasoNombre || p.entregable.nombre,
        inicioTs: new Date().toISOString(),
        finTs: null, estado: "",
        contexto: p.ultimoPaso
          ? { urls: [...p.ultimoPaso.contexto.urls], apps: [...p.ultimoPaso.contexto.apps], notas: "" }
          : { urls: [], apps: [], notas: "" },
        implicados: [{ tipo: "equipo", nombre: USUARIO_ACTUAL }],
        pausas: [],
        siguientePaso: null,
      },
    });
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-zinc-900">Plan</h1>
      </div>

      {/* Tabs día / semana */}
      <div className="mb-5 flex gap-1 rounded-xl bg-zinc-100 p-1">
        <button onClick={() => setView("dia")} className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${view === "dia" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}>
          Hoy
        </button>
        <button onClick={() => setView("semana")} className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${view === "semana" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}>
          Esta semana
        </button>
      </div>

      {view === "dia" && (
        <>
          {/* Pasos programados para hoy */}
          {programadosHoy.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-600">Programados para hoy</h2>
              <div className="space-y-1">
                {programadosHoy.map((item) => (
                  <button key={item.paso.id} className="w-full rounded-xl bg-white px-3 py-2.5 text-left transition-all hover:bg-amber-50">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                      <span className="text-xs font-semibold text-zinc-800">{item.proyectoNombre}</span>
                      <span className="text-[10px] text-zinc-300">→</span>
                      <span className="text-xs text-zinc-500">{item.resultadoNombre}</span>
                    </div>
                    <p className="mt-0.5 ml-[18px] text-[11px] text-zinc-500">Siguiente: {item.siguienteNombre}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Entregable-SOPs activos */}
          {sopEntregablesHoy.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-purple-600">Procesos activos</h2>
              <div className="space-y-2">
                {sopEntregablesHoy.map((item) => (
                  <div key={item.entregable.id} className="rounded-xl border border-purple-200 bg-purple-50 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-800">{item.entregable.nombre}</span>
                      <span className="text-[10px] text-zinc-400">{item.proyectoNombre} → {item.resultadoNombre}</span>
                    </div>
                    {item.plantilla && (
                      <div className="mt-2 space-y-1">
                        {item.plantilla.pasos.map((ps) => {
                          const done = item.pasosDados.some((pd) => pd.nombre === ps.nombre && pd.finTs);
                          return (
                            <div key={ps.id} className={`flex items-center gap-2 text-xs ${done ? "text-zinc-400 line-through" : "text-zinc-700"}`}>
                              <span className={`h-3 w-3 shrink-0 rounded border ${done ? "border-purple-400 bg-purple-400" : "border-zinc-300"}`} />
                              {ps.nombre}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {programadosHoy.length === 0 && sopEntregablesHoy.length === 0 && (
            <div className="mb-6 flex flex-col items-center py-8 text-center">
              <p className="text-sm text-zinc-400">Nada programado para hoy.</p>
              <p className="text-xs text-zinc-300">Revisa tu semana o navega por proyectos/SOPs para planificar.</p>
            </div>
          )}
        </>
      )}

      {view === "semana" && (
        <>
          {estaSemana.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-600">
                Esta semana ({estaSemana.length})
              </h2>
              <div className="space-y-1">
                {estaSemana.map((p) => (
                  <PendienteItem key={p.entregable.id} p={p} onStart={() => setConfirmTarget(p)} onOpenDetalle={() => onOpenDetalle(p.entregable.resultadoId)} />
                ))}
              </div>
            </section>
          )}

          {otros.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Otros pendientes ({otros.length})
              </h2>
              <div className="space-y-1">
                {otros.map((p) => (
                  <PendienteItem key={p.entregable.id} p={p} onStart={() => setConfirmTarget(p)} onOpenDetalle={() => onOpenDetalle(p.entregable.resultadoId)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-900">Empezar paso</h3>
            <p className="mt-1 text-xs text-zinc-600">{`¿Empezar "${confirmTarget.siguientePasoNombre || confirmTarget.entregable.nombre}"?`}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmTarget(null)} className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Cancelar</button>
              <button onClick={() => { startPendiente(confirmTarget); setConfirmTarget(null); }} className="flex-1 rounded-lg bg-green-600 py-2.5 text-xs font-medium text-white hover:bg-green-700">Empezar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PendienteItem({ p, onStart, onOpenDetalle }: { p: Pendiente; onStart: () => void; onOpenDetalle: () => void }) {
  const estadoDot = p.entregable.estado === "en_proceso" ? "bg-amber-400" : p.entregable.estado === "en_espera" ? "bg-zinc-300" : "bg-blue-300";
  const tipoTag = p.entregable.tipo !== "raw" ? p.entregable.tipo.toUpperCase() : null;

  return (
    <button onClick={onStart} className="w-full rounded-xl bg-white px-3 py-2.5 text-left transition-all hover:bg-amber-50 active:scale-[0.99]">
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${estadoDot}`} />
        <span className="text-xs font-semibold text-zinc-800">{p.proyectoNombre}</span>
        <span className="text-[10px] text-zinc-300">→</span>
        <span className="text-xs text-zinc-500">{p.resultadoNombre}</span>
        <span className="text-[10px] text-zinc-300">→</span>
        <span className="flex-1 min-w-0 truncate text-xs font-medium text-zinc-700">{p.entregable.nombre}</span>
        {tipoTag && <span className="shrink-0 rounded bg-purple-100 px-1 py-0.5 text-[8px] font-bold text-purple-600">{tipoTag}</span>}
      </div>
      {p.siguientePasoNombre && (
        <p className="mt-0.5 ml-[18px] text-[11px] text-zinc-400">Siguiente: {p.siguientePasoNombre}</p>
      )}
    </button>
  );
}
