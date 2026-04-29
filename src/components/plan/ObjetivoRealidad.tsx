"use client";

import type { Objetivo, RealidadObjetivoEstado } from "@/lib/types";
import { REALIDAD_OBJETIVO_LABELS } from "@/lib/types";

const REALIDAD_BADGE: Record<RealidadObjetivoEstado, string> = {
  cumplido: "border-emerald-500/35 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100",
  superado: "border-sky-500/35 bg-sky-500/12 text-sky-900 dark:text-sky-100",
  por_debajo: "border-amber-500/40 bg-amber-500/12 text-amber-950 dark:text-amber-100",
};

type Changes = Partial<Pick<Objetivo, "realidadEstado" | "realidadPorQue">>;

/**
 * Resultado real vs objetivo: estado + motivo. En modo compacto va en un `<details>` para no hinchar el árbol.
 */
export function ObjetivoRealidadBlock({
  obj,
  isMentor,
  compact,
  onChanges,
}: {
  obj: Objetivo;
  isMentor: boolean;
  compact: boolean;
  onChanges: (changes: Changes) => void;
}) {
  const estado = obj.realidadEstado;
  const porQue = obj.realidadPorQue ?? "";
  const selectCls = compact
    ? "min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[10px] text-foreground"
    : "max-w-[13rem] rounded border border-border bg-background px-2 py-1 text-xs text-foreground";
  const areaCls = compact
    ? "min-h-[2.25rem] w-full resize-y rounded border border-border bg-background px-1.5 py-1 text-[10px] leading-snug text-foreground placeholder:text-muted"
    : "min-h-[2.75rem] w-full max-w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-xs leading-snug text-foreground placeholder:text-muted";

  const fields = (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex flex-wrap items-center gap-1">
        <label className={`shrink-0 ${compact ? "text-[9px]" : "text-[10px]"} font-medium uppercase tracking-wide text-muted`}>
          Resultado
        </label>
        {isMentor ? (
          estado ? (
            <span
              className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${REALIDAD_BADGE[estado]}`}
            >
              {REALIDAD_OBJETIVO_LABELS[estado]}
            </span>
          ) : (
            <span className="text-[10px] text-muted">—</span>
          )
        ) : (
          <select
            value={estado ?? ""}
            onChange={(e) => {
              const v = e.target.value as RealidadObjetivoEstado | "";
              onChanges(v === "" ? { realidadEstado: undefined } : { realidadEstado: v });
            }}
            className={selectCls}
          >
            <option value="">Sin definir</option>
            {(Object.keys(REALIDAD_OBJETIVO_LABELS) as RealidadObjetivoEstado[]).map((k) => (
              <option key={k} value={k}>
                {REALIDAD_OBJETIVO_LABELS[k]}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label className={`mb-0.5 block ${compact ? "text-[9px]" : "text-[10px]"} font-medium uppercase tracking-wide text-muted`}>
          Por qué
        </label>
        {isMentor ? (
          porQue.trim() ? (
            <p className={`whitespace-pre-wrap ${compact ? "text-[10px] leading-snug text-foreground" : "text-xs leading-snug text-foreground"}`}>
              {porQue}
            </p>
          ) : (
            <span className="text-[10px] text-muted">—</span>
          )
        ) : (
          <textarea
            value={porQue}
            placeholder="Motivo breve (opcional)…"
            rows={compact ? 2 : 3}
            onChange={(e) =>
              onChanges(e.target.value === "" ? { realidadPorQue: undefined } : { realidadPorQue: e.target.value })
            }
            className={areaCls}
          />
        )}
      </div>
    </div>
  );

  if (compact) {
    return (
      <details className="mt-1 rounded border border-border/40 bg-surface/25 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-1.5 py-0.5 text-[10px] text-muted hover:text-foreground">
          <span className="select-none font-medium text-muted/90">Realidad</span>
          {estado ? (
            <span className={`rounded-full border px-1.5 py-px text-[9px] font-semibold ${REALIDAD_BADGE[estado]}`}>
              {REALIDAD_OBJETIVO_LABELS[estado]}
            </span>
          ) : porQue.trim() ? (
            <span className="truncate text-[9px] text-foreground/80" title={porQue}>
              {porQue.trim().slice(0, 42)}
              {porQue.trim().length > 42 ? "…" : ""}
            </span>
          ) : (
            <span className="text-[9px] font-normal text-muted">opcional</span>
          )}
        </summary>
        <div className="border-t border-border/35 px-1.5 pb-1.5 pt-1">{fields}</div>
      </details>
    );
  }

  return (
    <div className="mt-1.5 border-l-2 border-border/45 pl-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Realidad</p>
      {fields}
    </div>
  );
}
