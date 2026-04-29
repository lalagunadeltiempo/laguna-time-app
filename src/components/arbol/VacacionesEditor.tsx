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
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" aria-label="Cerrar" onClick={onClose} />
      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-border bg-background shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vac-title"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="vac-title" className="text-lg font-semibold text-foreground">
            Semanas en las que no apuntas nada ({anio})
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="border-b border-border px-4 py-3 text-xs text-muted">
          Toca los <strong>lunes</strong> de las semanas que son descanso: esos días no te pediremos número. Por defecto vienen{" "}
          <strong>agosto</strong> y <strong>dos semanas de Navidad</strong> ({christmasVacationMondays(anio).map(isoWeekLabelFromMondayKey).join(", ")}
          ).
        </p>
        <div className="flex-1 overflow-y-auto px-4 py-3">
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
                      : "border-border bg-surface text-foreground hover:border-accent"
                  }`}
                  title={`${isoWeekLabelFromMondayKey(mk)} — ${label}${aug ? " · agosto" : ""}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={restoreDefaults} className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:bg-surface">
            Volver a agosto + Navidad
          </button>
          <button type="button" onClick={onClose} className="ml-auto rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90">
            Listo
          </button>
        </div>
      </aside>
    </div>
  );
}

export function isMondayVacacion(mondayKey: string, semanasNoActivas: Set<string>): boolean {
  return semanasNoActivas.has(mondayKey);
}
