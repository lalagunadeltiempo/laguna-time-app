"use client";

/**
 * Bloque MENSUAL: 12 tarjetas (enero..diciembre).
 *
 * El plan es sólo lectura (derivado del anual por días laborables). El
 * "real" de cada mes se puede editar directamente por hoja; si la rama
 * no tiene hojas, se edita al nivel de rama. La lógica de
 * `realEfectivoEnPeriodo` prioriza el registro del mes sobre la suma
 * de semanas cuando ambos están presentes.
 *
 * Optimizaciones de rendimiento:
 *  - LazyDetails: el desglose «Apuntar real» no se monta hasta que el
 *    usuario abre la tarjeta. Así entrar a la pantalla pinta sólo las
 *    12 cabeceras.
 *  - RegistrosIndex: lookup O(1) de cada input, sin `find` linear.
 *  - React.memo: cada tarjeta ignora re-renders si su mes no cambia.
 */
import { memo, useMemo } from "react";
import type { NodoArbol, PlanArbolConfigAnio } from "@/lib/types";
import {
  cuotaAjustada,
  estadoPeriodo,
  hijosSumaDirectosIdx,
  metaParaNodoEnPeriodo,
  planAgregadoEnPeriodoIdx,
  realDelAnioHastaHoyLista,
  realEfectivoEnPeriodoIdx,
  type ArbolIndices,
} from "@/lib/arbol-tiempo";
import {
  LazyDetails,
  MetricLine,
  NumberInput,
  type RegistrosIndex,
  claveRegistro,
  fmtNum,
  useUpsertRegistro,
} from "./arbol-comunes";

const MESES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

interface BloqueMensualProps {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  regsIndex: RegistrosIndex;
  idx: ArbolIndices;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
}

export function BloqueMensual({ raiz, ramas, regsIndex, idx, config, year, unidad }: BloqueMensualProps) {
  const realYTD = useMemo(
    () => realDelAnioHastaHoyLista(idx.regsPorNodo.get(raiz.id), year),
    [idx, raiz.id, year],
  );
  const ajuste = useMemo(
    () => cuotaAjustada({ metaAnual: raiz.metaValor ?? 0, realHastaHoy: realYTD, anio: year, config }),
    [raiz.metaValor, realYTD, year, config],
  );

  return (
    <details open className="rounded-xl border border-border bg-background">
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <h2 className="text-base font-semibold text-foreground">
          <span aria-hidden className="mr-2 inline-block text-[10px] text-muted">▼</span>
          MENSUAL
          <span className="ml-2 text-[11px] font-normal text-muted">
            — plan automático; apunta aquí el real del mes si no llevas la semana
          </span>
        </h2>
      </summary>

      <div className="grid gap-3 border-t border-border/60 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 12 }, (_, i) => {
          const periodoKey = `${year}-${String(i + 1).padStart(2, "0")}`;
          return (
            <TarjetaMes
              key={periodoKey}
              raiz={raiz}
              ramas={ramas}
              regsIndex={regsIndex}
              idx={idx}
              config={config}
              year={year}
              unidad={unidad}
              periodoKey={periodoKey}
              label={MESES_ES[i]}
              replan={ajuste.mesRestante(periodoKey)}
            />
          );
        })}
      </div>
    </details>
  );
}

const TarjetaMes = memo(function TarjetaMes({
  raiz,
  ramas,
  regsIndex,
  idx,
  config,
  year,
  unidad,
  periodoKey,
  label,
  replan,
}: {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  regsIndex: RegistrosIndex;
  idx: ArbolIndices;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
  periodoKey: string;
  label: string;
  replan: number | undefined;
}) {
  const plan = useMemo(
    () => metaParaNodoEnPeriodo(raiz, "mes", periodoKey, year, config),
    [raiz, periodoKey, year, config],
  );
  const real = useMemo(
    () => realEfectivoEnPeriodoIdx(idx, raiz.id, "mes", periodoKey),
    [idx, raiz.id, periodoKey],
  );
  const estado = estadoPeriodo("mes", periodoKey, year);
  const deltaPlan = plan !== undefined ? real - plan : undefined;
  const pct = plan && plan > 0 ? Math.min(100, Math.round((real / plan) * 100)) : 0;
  const showProgress = estado === "pasado" || estado === "actual";

  const ramasConReal = useMemo(
    () => ramas.filter((r) => r.relacionConPadre === "suma"),
    [ramas],
  );

  const regRaiz = ramas.length === 0 ? regsIndex.get(claveRegistro(raiz.id, "mes", periodoKey)) : undefined;

  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {label} <span className="text-[10px] font-normal text-muted">({periodoKey})</span>
        </h3>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
            estado === "pasado"
              ? "bg-surface text-muted"
              : estado === "actual"
                ? "bg-accent/15 text-accent"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-200"
          }`}
        >
          {estado}
        </span>
      </div>

      <div className="mt-3 space-y-1 border-t border-border/50 pt-2">
        <MetricLine label="Plan" value={plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"} accent="muted" />
        {estado !== "pasado" && replan !== undefined && (
          <MetricLine label="Replan sugerido" value={`${fmtNum(replan)} ${unidad}`} accent="muted" />
        )}
        <MetricLine
          label="Real"
          value={`${fmtNum(real)} ${unidad}`}
          accent={deltaPlan !== undefined ? (deltaPlan >= 0 ? "good" : "bad") : undefined}
        />
      </div>

      {showProgress && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {ramasConReal.length > 0 && (
        <LazyDetails
          className="mt-3 rounded-lg border border-border/60 bg-surface/30"
          summary={
            <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-muted marker:content-none [&::-webkit-details-marker]:hidden">
              Apuntar real ({ramasConReal.length} {ramasConReal.length === 1 ? "rama" : "ramas"})
            </summary>
          }
        >
          <div className="space-y-3 border-t border-border/60 px-2 py-2">
            {ramasConReal.map((rama) => (
              <FilaRamaMensual
                key={rama.id}
                rama={rama}
                idx={idx}
                regsIndex={regsIndex}
                config={config}
                year={year}
                unidad={unidad}
                periodoKey={periodoKey}
              />
            ))}
          </div>
        </LazyDetails>
      )}

      {ramas.length === 0 && (
        <div className="mt-3">
          <FilaApunteDirecto
            nodoId={raiz.id}
            periodoKey={periodoKey}
            existing={regRaiz}
            unidad={unidad}
            ariaLabel={`Real ${label} de ${raiz.nombre}`}
          />
        </div>
      )}
    </div>
  );
});

function FilaRamaMensual({
  rama,
  idx,
  regsIndex,
  config,
  year,
  unidad,
  periodoKey,
}: {
  rama: NodoArbol;
  idx: ArbolIndices;
  regsIndex: RegistrosIndex;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
  periodoKey: string;
}) {
  const hojas = hijosSumaDirectosIdx(idx, rama.id);
  const plan = useMemo(
    () => planAgregadoEnPeriodoIdx(idx, rama, "mes", periodoKey, config),
    [idx, rama, periodoKey, config],
  );
  const real = useMemo(
    () => realEfectivoEnPeriodoIdx(idx, rama.id, "mes", periodoKey),
    [idx, rama.id, periodoKey],
  );
  const existingRama = regsIndex.get(claveRegistro(rama.id, "mes", periodoKey));

  return (
    <div className="rounded border border-border/50 bg-background/60 p-2">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground">{rama.nombre}</span>
        <span className="flex flex-wrap gap-x-2 text-[10px] tabular-nums text-muted">
          <span>
            Plan: <strong className="text-foreground">{plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"}</strong>
          </span>
          <span>
            Real: <strong className="text-foreground">{fmtNum(real)} {unidad}</strong>
          </span>
        </span>
      </div>
      {hojas.length === 0 ? (
        <FilaApunteDirecto
          nodoId={rama.id}
          periodoKey={periodoKey}
          existing={existingRama}
          unidad={unidad}
          ariaLabel={`Real ${periodoKey} de ${rama.nombre}`}
        />
      ) : (
        <div className="space-y-2">
          {hojas.map((hoja) => (
            <FilaHojaMensual
              key={hoja.id}
              hoja={hoja}
              idx={idx}
              regsIndex={regsIndex}
              config={config}
              year={year}
              unidad={unidad}
              periodoKey={periodoKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilaHojaMensual({
  hoja,
  idx,
  regsIndex,
  config,
  year,
  unidad,
  periodoKey,
}: {
  hoja: NodoArbol;
  idx: ArbolIndices;
  regsIndex: RegistrosIndex;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
  periodoKey: string;
}) {
  const plan = planAgregadoEnPeriodoIdx(idx, hoja, "mes", periodoKey, config);
  const real = realEfectivoEnPeriodoIdx(idx, hoja.id, "mes", periodoKey);
  const existing = regsIndex.get(claveRegistro(hoja.id, "mes", periodoKey));

  return (
    <div className="rounded border border-border/40 bg-surface/50 px-2 py-1.5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
        <span className="text-foreground">{hoja.nombre}</span>
        <span className="flex gap-x-2 tabular-nums text-muted">
          <span>
            Plan: <strong className="text-foreground">{plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"}</strong>
          </span>
          <span>
            Real acumulado: <strong className="text-foreground">{fmtNum(real)} {unidad}</strong>
          </span>
        </span>
      </div>
      <FilaApunteDirecto
        nodoId={hoja.id}
        periodoKey={periodoKey}
        existing={existing}
        unidad={unidad}
        ariaLabel={`Real ${periodoKey} de ${hoja.nombre}`}
      />
    </div>
  );
}

/** Input simple de "real" del mes para un nodo concreto. El `existing`
 *  viene del índice pre-calculado para evitar búsquedas linear. */
function FilaApunteDirecto({
  nodoId,
  periodoKey,
  existing,
  unidad,
  ariaLabel,
}: {
  nodoId: string;
  periodoKey: string;
  existing: import("@/lib/types").RegistroNodo | undefined;
  unidad: string;
  ariaLabel: string;
}) {
  const upsert = useUpsertRegistro();
  return (
    <NumberInput
      value={existing?.valor}
      onCommit={(v) =>
        upsert({
          nodoId,
          periodoTipo: "mes",
          periodoKey,
          existing,
          valor: v,
          unidades: existing?.unidades,
        })
      }
      ariaLabel={ariaLabel}
      unidad={unidad}
      compact
    />
  );
}
