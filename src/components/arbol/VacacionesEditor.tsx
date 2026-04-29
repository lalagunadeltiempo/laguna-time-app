"use client";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">Vacaciones del año {anio}</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface">
            Cerrar
          </button>
        </div>
        <p className="border-b border-border px-4 py-2 text-xs text-muted">
          Marca los <strong>lunes</strong> de las semanas en las que no trabajas (no se pedirán registros). Por defecto:
          agosto completo y dos semanas de Navidad ({christmasVacationMondays(anio).map(isoWeekLabelFromMondayKey).join(", ")}).
        </p>
        <div className="max-h-[50vh] overflow-y-auto px-4 py-3">
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
          <button type="button" onClick={restoreDefaults} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface">
            Restaurar agosto + Navidad
          </button>
          <button type="button" onClick={onClose} className="ml-auto rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent/90">
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

export function isMondayVacacion(mondayKey: string, semanasNoActivas: Set<string>): boolean {
  return semanasNoActivas.has(mondayKey);
}
