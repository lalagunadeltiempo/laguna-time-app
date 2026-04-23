import { useMemo, useState } from "react";
import { trimestreKey, trimestreRango, trimestresEntre, etiquetaTrimestre } from "../../lib/trimestre-utils";

interface Props {
  trimestresActivos: string[];
  fechaInicio: string | null | undefined;
  fechaLimite: string | null | undefined;
  onChange: (trimestres: string[]) => void;
  onClose: () => void;
}

export function TrimestreSelector({ trimestresActivos, fechaInicio, fechaLimite, onChange, onClose }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(() => {
    if (trimestresActivos && trimestresActivos.length > 0) {
      const first = trimestresActivos[0].slice(0, 4);
      const y = parseInt(first, 10);
      if (Number.isFinite(y)) return y;
    }
    if (fechaInicio) {
      const y = parseInt(fechaInicio.slice(0, 4), 10);
      if (Number.isFinite(y)) return y;
    }
    return currentYear;
  });

  const seleccionados = useMemo(() => {
    const set = new Set<string>(trimestresActivos ?? []);
    if (set.size === 0 && (fechaInicio || fechaLimite)) {
      for (const k of trimestresEntre(fechaInicio ?? null, fechaLimite ?? null)) set.add(k);
    }
    return set;
  }, [trimestresActivos, fechaInicio, fechaLimite]);

  function toggle(q: 1 | 2 | 3 | 4) {
    const key = trimestreKey(year, q);
    const curr = new Set(seleccionados);
    if (curr.has(key)) curr.delete(key); else curr.add(key);
    onChange([...curr].sort());
  }

  return (
    <div className="mx-2 mb-3 ml-3 sm:mx-5 sm:ml-8 md:ml-14 rounded-lg border border-border bg-surface/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted hover:text-foreground"
            title="Año anterior">‹</button>
          <span className="text-sm font-semibold text-foreground">{year}</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted hover:text-foreground"
            title="Año siguiente">›</button>
        </div>
        <button type="button" onClick={onClose} className="text-[10px] text-muted hover:text-foreground">
          Cerrar
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((q) => {
          const key = trimestreKey(year, q as 1 | 2 | 3 | 4);
          const active = seleccionados.has(key);
          const rango = trimestreRango(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(q as 1 | 2 | 3 | 4)}
              className={`flex flex-col items-center rounded-md border px-2 py-2 text-xs transition-colors ${
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
              }`}
              title={rango ? `${rango.inicio} → ${rango.fin}` : key}>
              <span className="font-semibold">{etiquetaTrimestre(key).slice(0, 2)}</span>
              <span className="text-[9px] opacity-70">
                {rango ? `${rango.inicio.slice(5)} - ${rango.fin.slice(5)}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {seleccionados.size > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {[...seleccionados].sort().map((k) => (
            <span key={k} className="rounded-full bg-background px-2 py-0.5 text-[10px] text-muted">
              {etiquetaTrimestre(k)}
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            className="ml-auto text-[10px] text-red-500 hover:text-red-700">
            Limpiar
          </button>
        </div>
      )}
    </div>
  );
}
