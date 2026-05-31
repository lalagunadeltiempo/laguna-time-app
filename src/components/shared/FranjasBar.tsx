"use client";

import { useMemo } from "react";
import type { FranjaDia } from "@/lib/types";
import { minutosDeHHMM } from "@/lib/franjas";

/**
 * Barra horizontal compacta que representa las franjas de time blocking del día
 * como segmentos de color proporcionales a su duración. Sirve de banda de
 * referencia en las columnas de día de la vista Semana, donde no hay eje
 * horario explícito.
 */
export function FranjasBar({ franjas, className }: { franjas: FranjaDia[]; className?: string }) {
  const segmentos = useMemo(() => {
    const conMin = franjas
      .map((f) => ({ f, ini: minutosDeHHMM(f.inicio), fin: minutosDeHHMM(f.fin) }))
      .filter((x) => x.fin > x.ini)
      .sort((a, b) => a.ini - b.ini);
    if (conMin.length === 0) return [];
    const desde = conMin[0].ini;
    const hasta = conMin[conMin.length - 1].fin;
    const span = hasta - desde || 1;
    return conMin.map(({ f, ini, fin }) => ({
      f,
      pct: ((fin - ini) / span) * 100,
    }));
  }, [franjas]);

  if (segmentos.length === 0) return null;

  return (
    <div className={`flex h-1.5 overflow-hidden rounded-full ${className ?? ""}`} aria-hidden="true">
      {segmentos.map(({ f, pct }) => (
        <span
          key={f.id}
          title={`${f.inicio}–${f.fin} · ${f.nombre}${f.descripcion ? ` — ${f.descripcion}` : ""}`}
          style={{ width: `${pct}%`, backgroundColor: f.color }}
        />
      ))}
    </div>
  );
}
