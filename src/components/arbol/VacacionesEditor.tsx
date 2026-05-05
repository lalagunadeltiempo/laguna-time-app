"use client";

import { useEffect, useRef } from "react";
import {
  christmasVacationMondays,
  isoWeekLabelFromMondayKey,
  mondaysInCalendarYear,
  parseLocalDateKey,
  semanasNoActivasSet,
  weekTouchesAugust,
} from "@/lib/arbol-tiempo";
import type { PlanArbolConfigAnio } from "@/lib/types";
import { COMUNIDADES_AUTONOMAS_OPCIONES } from "@/lib/festivos-es";

/**
 * Editor de "Semanas de descanso" en overlay modal.
 *
 * Antes vivía como sección al final de la página, debajo de toda la
 * vista del Árbol; con un árbol denso quedaba fuera de pantalla y
 * parecía no abrirse. Ahora se monta sobre todo (`fixed inset-0`,
 * backdrop semitransparente) para que cualquier interacción con el
 * botón "Semanas de descanso" sea visible inmediatamente.
 *
 * No bloqueamos el scroll del `body`: el contenedor del modal ya es
 * `fixed inset-0 overflow-y-auto`, así que absorbe el scroll por sí
 * mismo. Bloquear el body con `style.overflow = "hidden"` y restaurar el
 * valor previo es frágil: si el modal se vuelve a montar antes de que el
 * cleanup haya corrido (HMR, doble apertura, re-render del padre), el
 * "valor previo" guardado puede ser ya `"hidden"`, y el cleanup deja la
 * página atascada para siempre.
 */
export function VacacionesEditor({
  anio,
  config,
  onToggleSemana,
  onAddDefaults,
  onChangeCcaa,
  onClose,
}: {
  anio: number;
  /** Config completa del año (no sólo el array). Se necesita para que el
   *  set efectivo respete los tombstones LWW de "esta semana ya no es
   *  descanso" al pintar los botones. */
  config: PlanArbolConfigAnio | undefined;
  /** Toggle individual: el padre dispatcha `TOGGLE_SEMANA_NO_ACTIVA` para
   *  que el LWW se aplique con ts ahora y sobreviva al próximo merge. */
  onToggleSemana: (mondayKey: string) => void;
  /** Añade los descansos por defecto sin pisar los que la usuaria ya
   *  tenga marcados. El padre dispatcha N toggles para conservar LWW. */
  onAddDefaults: () => void;
  /** Cambia la CCAA. */
  onChangeCcaa: (code: string) => void;
  onClose: () => void;
}) {
  const set = semanasNoActivasSet(config);
  const comunidadAutonoma = config?.comunidadAutonoma;
  const mondays = mondaysInCalendarYear(anio);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Foco al botón "Cerrar" al abrir, para que Escape y Tab funcionen
  // bien y no quede el foco en un control de fondo.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 px-3 py-6 sm:items-center sm:py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vac-modal-title"
      onClick={(e) => {
        // Cerrar sólo si el clic es exactamente sobre el backdrop, no
        // sobre un descendiente.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="relative w-full max-w-xl rounded-xl border border-amber-400/50 bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/30 px-4 py-3">
          <h2 id="vac-modal-title" className="text-base font-semibold text-foreground">
            Semanas en las que no apuntas nada ({anio})
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <p className="border-b border-amber-400/20 px-4 py-3 text-xs text-muted">
          Marca el <strong>lunes</strong> de cada semana en la que <em>no</em> vas a trabajar (vacaciones, formaciones,
          descansos…). Esas semanas se quedan fuera del plan: no te pediremos cifras y no contarán como días laborables.
          De serie marcamos <strong>agosto</strong>, las <strong>dos semanas de Navidad</strong> (
          {christmasVacationMondays(anio).map(isoWeekLabelFromMondayKey).join(", ")}) y la{" "}
          <strong>de Semana Santa</strong>; tócalas para deshacer cualquiera. El plan del año también descuenta los{" "}
          <strong>festivos laborales</strong> (España + comunidad si la eliges abajo).
        </p>
        <div className="border-b border-amber-400/20 px-4 py-3">
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Festivos de tu comunidad autónoma
            <select
              value={comunidadAutonoma ?? ""}
              onChange={(e) => onChangeCcaa(e.target.value)}
              className="max-w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
            >
              {COMUNIDADES_AUTONOMAS_OPCIONES.map((o) => (
                <option key={o.id || "national"} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="max-h-[min(50vh,420px)] overflow-y-auto px-4 py-3">
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
                  onClick={() => onToggleSemana(mk)}
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
          <button
            type="button"
            onClick={onAddDefaults}
            title="Añade agosto, las dos semanas de Navidad y la de Semana Santa SIN borrar las que ya hayas marcado a mano."
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted hover:bg-surface"
          >
            Añadir los descansos por defecto
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90"
          >
            Listo
          </button>
        </div>
      </section>
    </div>
  );
}

export function isMondayVacacion(mondayKey: string, semanasNoActivas: Set<string>): boolean {
  return semanasNoActivas.has(mondayKey);
}
