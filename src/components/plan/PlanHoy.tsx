"use client";

import { useState, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario } from "@/lib/usuario";
import type { Area, Paso } from "@/lib/types";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7);

const BORDER_HEX: Record<string, string> = {
  fisico: "#f43f5e", emocional: "#ec4899", mental: "#6366f1", espiritual: "#8b5cf6",
  financiera: "#10b981", operativa: "#3b82f6", comercial: "#f59e0b", administrativa: "#a855f6",
};

interface Block {
  id: string;
  type: "active" | "programado" | "sop";
  area: Area;
  title: string;
  subtitle: string;
  hour: number;
  sourcePaso?: Paso;
  entregableId?: string;
}

export function PlanHoy() {
  const { nombre: currentUser } = useUsuario();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [confirmBlock, setConfirmBlock] = useState<Block | null>(null);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const programadosHoy = useMemo(() => {
    return state.pasos.filter((p) => {
      if (!p.finTs || !p.siguientePaso) return false;
      if (p.siguientePaso.tipo !== "continuar") return false;
      let fp = p.siguientePaso.fechaProgramada;
      if (!fp) return false;
      if (fp === "manana") {
        const finDate = new Date(p.finTs);
        finDate.setDate(finDate.getDate() + 1);
        fp = `${finDate.getFullYear()}-${String(finDate.getMonth() + 1).padStart(2, "0")}-${String(finDate.getDate()).padStart(2, "0")}`;
        return fp === todayStr;
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
        entregableId: p.entregableId,
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
      if (e.responsable !== currentUser) return false;
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      return res?.semana === currentWeek;
    }).map((e) => {
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      return { entregable: e, resultadoNombre: res?.nombre ?? "", proyectoNombre: proj?.nombre ?? "", area: proj?.area ?? ("operativa" as Area) };
    });
  }, [state, currentUser]);

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

  function handleStartProgramado(block: Block) {
    if (!block.sourcePaso || !block.entregableId) return;
    const src = block.sourcePaso;
    dispatch({
      type: "START_PASO",
      payload: {
        id: generateId(),
        entregableId: block.entregableId,
        nombre: src.siguientePaso?.nombre ?? src.nombre,
        inicioTs: new Date().toISOString(),
        finTs: null,
        estado: "",
        contexto: { urls: [...src.contexto.urls], apps: [...src.contexto.apps], notas: "" },
        implicados: [{ tipo: "equipo", nombre: currentUser }],
        pausas: [],
        siguientePaso: null,
      },
    });
  }

  function handleStartSOP(block: Block) {
    if (!block.entregableId) return;
    dispatch({
      type: "START_PASO",
      payload: {
        id: generateId(),
        entregableId: block.entregableId,
        nombre: block.title,
        inicioTs: new Date().toISOString(),
        finTs: null,
        estado: "",
        contexto: { urls: [], apps: [], notas: "" },
        implicados: [{ tipo: "equipo", nombre: currentUser }],
        pausas: [],
        siguientePaso: null,
      },
    });
  }

  function handleBlockClick(block: Block) {
    if (block.type === "active") return;
    setConfirmBlock(block);
  }

  function confirmStart() {
    if (!confirmBlock) return;
    if (confirmBlock.type === "programado") handleStartProgramado(confirmBlock);
    if (confirmBlock.type === "sop") handleStartSOP(confirmBlock);
    setConfirmBlock(null);
  }

  const allBlocks: Block[] = [
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
      sourcePaso: b.paso,
      entregableId: b.entregableId,
    })),
    ...sopEntregablesHoy.map((b) => ({
      id: `sop-${b.entregable.id}`,
      type: "sop" as const,
      area: b.area,
      title: b.entregable.nombre,
      subtitle: `${b.proyectoNombre} · ${b.resultadoNombre}`,
      hour: 10,
      entregableId: b.entregable.id,
    })),
  ];

  return (
    <div className="flex-1">
      <div className="relative rounded-xl border border-border bg-background">
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
                  const isClickable = block.type !== "active";
                  return (
                    <button
                      key={block.id}
                      type="button"
                      disabled={!isClickable}
                      onClick={() => handleBlockClick(block)}
                      className={`mb-1 w-full rounded-lg border-l-[3px] bg-surface px-3 py-2 text-left transition-colors ${
                        isClickable ? "cursor-pointer hover:bg-surface-hover" : ""
                      }`}
                      style={{ borderLeftColor: color }}
                      aria-label={isClickable ? `Empezar: ${block.title}` : block.title}
                    >
                      <div className="flex items-center gap-2">
                        {block.type === "active" && (
                          <span className="relative flex h-2 w-2" aria-hidden="true">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: "#4ade80" }} />
                            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "#22c55e" }} />
                          </span>
                        )}
                        <span className="text-sm font-medium text-foreground">{block.title}</span>
                        {block.type === "sop" && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>SOP</span>
                        )}
                        {block.type === "programado" && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted" style={{ backgroundColor: "var(--surface)" }}>Pendiente</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{block.subtitle}</p>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {allBlocks.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-muted">Nada programado para hoy.</p>
          <p className="mt-1 text-xs text-muted/60">Asigna entregables desde el Mapa o navega por SOPs y Proyectos.</p>
        </div>
      )}

      {confirmBlock && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar inicio de paso"
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmBlock(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") setConfirmBlock(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">Empezar paso</h3>
            <p className="mt-1 text-xs text-muted">{`¿Empezar "${confirmBlock.title}"?`}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmBlock(null)} className="flex-1 rounded-lg border border-border py-2.5 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
              <button onClick={confirmStart} className="flex-1 rounded-lg py-2.5 text-xs font-medium text-white" style={{ backgroundColor: "#16a34a" }}>Empezar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
