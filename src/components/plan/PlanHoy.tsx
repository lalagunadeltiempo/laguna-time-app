"use client";

import { useState, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { usePendientes, type Pendiente } from "@/lib/hooks";
import { generateId } from "@/lib/store";
import { USUARIO_ACTUAL } from "@/lib/usuario";
import { type Area } from "@/lib/types";

interface Props {
  onOpenDetalle: (resultadoId: string) => void;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7:00 - 21:00

const BORDER_HEX: Record<string, string> = {
  fisico: "#f43f5e", emocional: "#ec4899", mental: "#6366f1", espiritual: "#8b5cf6",
  financiera: "#10b981", operativa: "#3b82f6", comercial: "#f59e0b", administrativa: "#a855f6",
};

export function PlanHoy({ onOpenDetalle }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [confirmTarget, setConfirmTarget] = useState<Pendiente | null>(null);

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
        return p.finTs!.slice(0, 10) === ayerStr;
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
        area: proj?.area ?? ("operativa" as Area),
      };
    });
  }, [state, todayStr]);

  const sopEntregablesHoy = useMemo(() => {
    const currentWeek = (() => {
      const d = new Date();
      const dUtc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      dUtc.setUTCDate(dUtc.getUTCDate() + 4 - (dUtc.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(dUtc.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((dUtc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `${dUtc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
    })();

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
      return { entregable: e, resultadoNombre: res?.nombre ?? "", proyectoNombre: proj?.nombre ?? "", plantilla, pasosDados, area: proj?.area ?? ("operativa" as Area) };
    });
  }, [state]);

  const pasosActivosHoy = useMemo(() => {
    return state.pasosActivos
      .map((id) => state.pasos.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => {
        const ent = state.entregables.find((e) => e.id === p!.entregableId);
        const res = ent ? state.resultados.find((r) => r.id === ent.resultadoId) : undefined;
        const proj = res ? state.proyectos.find((pr) => pr.id === res.proyectoId) : undefined;
        return { paso: p!, area: proj?.area ?? ("operativa" as Area), proyectoNombre: proj?.nombre ?? "", entregableNombre: ent?.nombre ?? "" };
      });
  }, [state]);

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

  const allBlocks = [
    ...pasosActivosHoy.map((b) => ({
      id: `active-${b.paso.id}`,
      type: "active" as const,
      area: b.area,
      title: b.paso.nombre,
      subtitle: `${b.proyectoNombre} · ${b.entregableNombre}`,
      hour: b.paso.inicioTs ? new Date(b.paso.inicioTs).getHours() : 9,
    })),
    ...programadosHoy.map((b) => ({
      id: `prog-${b.paso.id}`,
      type: "programado" as const,
      area: b.area,
      title: b.siguienteNombre,
      subtitle: `${b.proyectoNombre} · ${b.resultadoNombre}`,
      hour: 9,
    })),
    ...sopEntregablesHoy.map((b) => ({
      id: `sop-${b.entregable.id}`,
      type: "sop" as const,
      area: b.area,
      title: b.entregable.nombre,
      subtitle: `${b.proyectoNombre} · ${b.resultadoNombre}`,
      hour: 10,
    })),
  ];

  return (
    <div className="flex-1">
      {/* Time blocks view */}
      <div className="relative rounded-xl border border-border bg-background">
        {/* Hour grid */}
        {HOURS.map((hour) => (
          <div key={hour} className="relative flex min-h-[56px] border-b border-border/50 last:border-b-0">
            <div className="flex w-14 shrink-0 items-start justify-end pr-3 pt-1">
              <span className="text-xs font-medium text-muted">{String(hour).padStart(2, "0")}:00</span>
            </div>
            <div className="flex-1 px-2 py-1">
              {allBlocks
                .filter((b) => b.hour === hour)
                .map((block) => {
                  const color = BORDER_HEX[block.area] ?? "#f59e0b";
                  return (
                    <div
                      key={block.id}
                      className="mb-1 rounded-lg border-l-[3px] bg-surface px-3 py-2 transition-colors hover:bg-surface-hover"
                      style={{ borderLeftColor: color }}
                    >
                      <div className="flex items-center gap-2">
                        {block.type === "active" && (
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                          </span>
                        )}
                        <span className="text-sm font-medium text-foreground">{block.title}</span>
                        {block.type === "sop" && (
                          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-600">SOP</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{block.subtitle}</p>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {allBlocks.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-muted">Nada programado para hoy.</p>
          <p className="mt-1 text-xs text-muted/60">Asigna entregables desde el Mapa o navega por SOPs y Proyectos.</p>
        </div>
      )}

      {/* Confirm modal */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">Empezar paso</h3>
            <p className="mt-1 text-xs text-muted">{`¿Empezar "${confirmTarget.siguientePasoNombre || confirmTarget.entregable.nombre}"?`}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmTarget(null)} className="flex-1 rounded-lg border border-border py-2.5 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
              <button onClick={() => { startPendiente(confirmTarget); setConfirmTarget(null); }} className="flex-1 rounded-lg bg-green-600 py-2.5 text-xs font-medium text-white hover:bg-green-700">Empezar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
