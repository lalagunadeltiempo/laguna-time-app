"use client";

import { useEffect } from "react";
import {
  christmasVacationMondays,
  defaultSemanasNoActivas,
  isoWeekLabelFromMondayKey,
  mondaysInCalendarYear,
  parseLocalDateKey,
  weekTouchesAugust,
} from "@/lib/arbol-tiempo";

/** Editor en la misma página (sin overlay): en móvil los chips hacen scroll dentro del bloque. */
export function VacacionesEditor({
  anio,
  semanasNoActivas,
  onSave,
  onClose,
}: {
  anio: number;
  semanasNoActivas: string[];
  onSave: (next: string[]) => void;
  onClose: () => void;
}) {
  const set = new Set(semanasNoActivas);
  const mondays = mondaysInCalendarYear(anio);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(mk: string) {
    const next = new Set(set);
    if (next.has(mk)) next.delete(mk);
    else next.add(mk);
    onSave([...next].sort());
  }

  function restoreDefaults() {
    onSave(defaultSemanasNoActivas(anio));
  }

  return (
    <section className="mb-6 rounded-xl border border-amber-400/50 bg-amber-500/[0.06] shadow-sm" aria-labelledby="vac-inline-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/30 px-4 py-3">
        <h2 id="vac-inline-title" className="text-base font-semibold text-foreground">
          Semanas en las que no apuntas nada ({anio})
        </h2>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-background/80" aria-label="Cerrar">
          ✕
        </button>
      </div>
      <p className="border-b border-amber-400/20 px-4 py-3 text-xs text-muted">
        Toca los <strong>lunes</strong> de las semanas de descanso: ahí no te pediremos número. Por defecto:{" "}
        <strong>agosto</strong> y <strong>dos semanas de Navidad</strong> ({christmasVacationMondays(anio).map(isoWeekLabelFromMondayKey).join(", ")}
        ).
      </p>
      <div className="max-h-[min(40vh,320px)] overflow-y-auto px-4 py-3 sm:max-h-[min(50vh,420px)]">
        <div className="flex flex-wrap gap-1.5">
          {mondays.map((mk) => {
            const on = set.has(mk);
            const d = parseLocalDateKey(mk);
            const label = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
            const aug = weekTouchesAugust(mk, anio);
            return (
              <button
                key={mk}
                type="button"
                onClick={() => toggle(mk)}
                className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                  on
                    ? "border-amber-500 bg-amber-500/15 text-amber-900 dark:text-amber-100"
                    : "border-border bg-background text-foreground hover:border-accent"
                }`}
                title={`${isoWeekLabelFromMondayKey(mk)} — ${label}${aug ? " · agosto" : ""}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-amber-400/20 px-4 py-3">
        <button type="button" onClick={restoreDefaults} className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted hover:bg-surface">
          Volver a agosto + Navidad
        </button>
        <button type="button" onClick={onClose} className="ml-auto rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90">
          Listo
        </button>
      </div>
    </section>
  );
}

export function isMondayVacacion(mondayKey: string, semanasNoActivas: Set<string>): boolean {
  return semanasNoActivas.has(mondayKey);
}
