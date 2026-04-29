"use client";

import { useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { EMPTY_ARBOL } from "@/lib/types";

/** Reflexión de cierre de trimestre con 3 textareas. Se guarda con debounce a estado y persiste por trimestre.
 *  El padre debe pasar `key={`${anio}-${trimestreKey}`}` para que se reinicialice al cambiar de trimestre. */
export function CierreTrimestre({ anio, trimestreKey }: { anio: number; trimestreKey: string }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const arbol = state.arbol ?? EMPTY_ARBOL;

  const existing = useMemo(
    () => (arbol.reflexiones ?? []).find((r) => r.anio === anio && r.trimestreKey === trimestreKey),
    [arbol.reflexiones, anio, trimestreKey],
  );

  const [funciono, setFunciono] = useState(existing?.funciono ?? "");
  const [noFunciono, setNoFunciono] = useState(existing?.noFunciono ?? "");
  const [cambios, setCambios] = useState(existing?.cambios ?? "");

  function commit(changes: { funciono?: string; noFunciono?: string; cambios?: string }) {
    dispatch({
      type: "UPSERT_REFLEXION_TRIMESTRE",
      anio,
      trimestreKey,
      changes: {
        funciono: changes.funciono ?? funciono,
        noFunciono: changes.noFunciono ?? noFunciono,
        cambios: changes.cambios ?? cambios,
      },
    });
  }

  return (
    <details className="mb-4 rounded-xl border border-border bg-surface/40">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        Cierre de trimestre · {trimestreKey}
        <span className="ml-2 text-xs font-normal text-muted">— qué funcionó, qué no, qué cambias</span>
      </summary>
      <div className="grid gap-3 border-t border-border/60 p-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">Lo que funcionó</span>
          <textarea
            value={funciono}
            onChange={(e) => setFunciono(e.target.value)}
            onBlur={() => commit({ funciono })}
            rows={4}
            placeholder="Lo que sí salió como esperabas."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">Lo que no funcionó</span>
          <textarea
            value={noFunciono}
            onChange={(e) => setNoFunciono(e.target.value)}
            onBlur={() => commit({ noFunciono })}
            rows={4}
            placeholder="Lo que se atascó o no salió."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted">Qué cambias para el siguiente</span>
          <textarea
            value={cambios}
            onChange={(e) => setCambios(e.target.value)}
            onBlur={() => commit({ cambios })}
            rows={4}
            placeholder="Decisiones concretas para el próximo trimestre."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>
    </details>
  );
}
