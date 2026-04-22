"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { AREAS_EMPRESA, AREAS_PERSONAL, AREA_COLORS, type Area } from "@/lib/types";

export type MoveTarget =
  | { kind: "resultado"; id: string; currentProyectoId: string }
  | { kind: "entregable"; id: string; currentResultadoId: string }
  | { kind: "paso"; id: string; currentEntregableId: string };

interface Props {
  target: MoveTarget;
  onDone: () => void;
  /** Extra left padding to align inside nested blocks. Defaults to inset for Mapa rows. */
  className?: string;
}

/**
 * Inline panel to move a Resultado/Entregable/Paso to a different parent.
 * UX: step-by-step (Área → Proyecto → Resultado → Entregable as needed),
 *     mobile-friendly with scrollable lists and "back" navigation.
 */
export default function MoveInlinePanel({ target, onDone, className }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const stepsNeeded: ("area" | "proyecto" | "resultado" | "entregable")[] = useMemo(() => {
    if (target.kind === "resultado") return ["area", "proyecto"];
    if (target.kind === "entregable") return ["area", "proyecto", "resultado"];
    return ["area", "proyecto", "resultado", "entregable"];
  }, [target.kind]);

  const [stepIdx, setStepIdx] = useState(0);
  const [areaId, setAreaId] = useState<Area | null>(null);
  const [proyectoId, setProyectoId] = useState<string | null>(null);
  const [resultadoId, setResultadoId] = useState<string | null>(null);

  const step = stepsNeeded[stepIdx];

  function commit(entId?: string) {
    if (target.kind === "resultado" && proyectoId) {
      dispatch({ type: "MOVE_RESULTADO", resultadoId: target.id, nuevoProyectoId: proyectoId });
    } else if (target.kind === "entregable" && resultadoId) {
      dispatch({ type: "MOVE_ENTREGABLE", entregableId: target.id, nuevoResultadoId: resultadoId });
    } else if (target.kind === "paso" && entId) {
      dispatch({ type: "MOVE_PASO", pasoId: target.id, nuevoEntregableId: entId });
    }
    onDone();
  }

  function goBack() {
    if (stepIdx === 0) { onDone(); return; }
    if (step === "proyecto") setAreaId(null);
    else if (step === "resultado") setProyectoId(null);
    else if (step === "entregable") setResultadoId(null);
    setStepIdx(stepIdx - 1);
  }

  const areas = [...AREAS_EMPRESA, ...AREAS_PERSONAL];
  const proyectos = state.proyectos.filter((p) => p.area === areaId);
  const resultados = state.resultados.filter(
    (r) => r.proyectoId === proyectoId &&
      !(target.kind === "entregable" && r.id === target.currentResultadoId),
  );
  const entregables = state.entregables.filter(
    (e) => e.resultadoId === resultadoId &&
      !(target.kind === "paso" && e.id === target.currentEntregableId),
  );

  const panelCls = className ?? "mx-2 mb-3 ml-3 sm:mx-5 sm:ml-8 md:ml-14";

  return (
    <div className={`${panelCls} rounded-lg border border-border bg-surface/50 p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <button onClick={goBack} className="text-[10px] text-accent hover:underline">
          {stepIdx === 0 ? "Cancelar" : "← Atrás"}
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {stepIdx + 1}. {step === "area" ? "Elegir área" : step === "proyecto" ? "Elegir proyecto" : step === "resultado" ? "Elegir resultado" : "Elegir entregable"}
        </p>
      </div>

      <div className="max-h-48 overflow-y-auto">
        {step === "area" && (
          <div className="flex flex-wrap gap-1.5">
            {areas.map((a) => {
              const hex = AREA_COLORS[a.id]?.hex ?? "#888";
              return (
                <button
                  key={a.id}
                  onClick={() => { setAreaId(a.id); setStepIdx(stepIdx + 1); }}
                  className="rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:brightness-95"
                  style={{ borderColor: hex, color: hex }}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        )}

        {step === "proyecto" && (
          <div className="flex flex-wrap gap-1">
            {proyectos.length === 0 && (
              <p className="text-[10px] italic text-muted">Sin proyectos en esta área</p>
            )}
            {proyectos.map((p) => {
              const isCurrent = target.kind === "resultado" && p.id === target.currentProyectoId;
              const disabled = isCurrent;
              return (
                <button
                  key={p.id}
                  disabled={disabled}
                  onClick={() => {
                    if (target.kind === "resultado") { setProyectoId(p.id); commit(); return; }
                    setProyectoId(p.id);
                    setStepIdx(stepIdx + 1);
                  }}
                  className={`rounded-md border border-border px-2 py-1 text-[10px] ${disabled ? "cursor-not-allowed opacity-40" : "text-foreground hover:border-accent hover:bg-accent-soft"}`}
                  title={disabled ? "Proyecto actual" : undefined}
                >
                  {p.nombre}{isCurrent ? " (actual)" : ""}
                </button>
              );
            })}
          </div>
        )}

        {step === "resultado" && (
          <div className="flex flex-wrap gap-1">
            {resultados.length === 0 && (
              <p className="text-[10px] italic text-muted">Sin resultados en este proyecto</p>
            )}
            {resultados.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  if (target.kind === "entregable") { setResultadoId(r.id); commit(); return; }
                  setResultadoId(r.id);
                  setStepIdx(stepIdx + 1);
                }}
                className="rounded-md border border-border px-2 py-1 text-[10px] text-foreground hover:border-accent hover:bg-accent-soft"
              >
                {r.nombre}
              </button>
            ))}
          </div>
        )}

        {step === "entregable" && (
          <div className="flex flex-wrap gap-1">
            {entregables.length === 0 && (
              <p className="text-[10px] italic text-muted">Sin entregables en este resultado</p>
            )}
            {entregables.map((e) => (
              <button
                key={e.id}
                onClick={() => commit(e.id)}
                className="rounded-md border border-border px-2 py-1 text-[10px] text-foreground hover:border-accent hover:bg-accent-soft"
              >
                {e.nombre}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
