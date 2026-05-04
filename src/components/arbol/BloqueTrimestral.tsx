"use client";

/**
 * Bloque TRIMESTRAL: Q1 .. Q4 del año, sólo lectura del plan.
 *
 * Cada tarjeta muestra tres cifras en la cabecera: Plan original
 * (prorrateo anual por días laborables), Replan sugerido (`cuotaAjustada`
 * que sube/baja lo que queda para seguir llegando al anual) y Real
 * (suma de registros del trimestre). Al abrir la tarjeta salen las
 * ramas y sus hojas con los mismos tres valores, y la reflexión de
 * cierre de ese trimestre vive embebida dentro.
 *
 * Aquí NO se edita el plan. El real se introduce en el bloque Mensual
 * o Semanal.
 */
import { useMemo } from "react";
import type { NodoArbol, PlanArbolConfigAnio, TrimestreKey } from "@/lib/types";
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
import { CierreTrimestre } from "./CierreTrimestre";
import { MetricLine, fmtNum } from "./arbol-comunes";

const TRIMESTRE_LABELS: { key: TrimestreKey; label: string }[] = [
  { key: "Q1", label: "Q1" },
  { key: "Q2", label: "Q2" },
  { key: "Q3", label: "Q3" },
  { key: "Q4", label: "Q4" },
];

interface BloqueTrimestralProps {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  idx: ArbolIndices;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
}

export function BloqueTrimestral({ raiz, ramas, idx, config, year, unidad }: BloqueTrimestralProps) {
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
          TRIMESTRAL
          <span className="ml-2 text-[11px] font-normal text-muted">
            — plan repartido por días laborables y festivos; lo real se apunta más abajo
          </span>
        </h2>
      </summary>

      <div className="grid gap-3 border-t border-border/60 p-4 sm:grid-cols-2">
        {TRIMESTRE_LABELS.map(({ key, label }) => {
          const periodoKey = `${year}-${key}`;
          return (
            <TarjetaTrimestre
              key={periodoKey}
              raiz={raiz}
              ramas={ramas}
              idx={idx}
              config={config}
              year={year}
              unidad={unidad}
              trimestreKey={key}
              periodoKey={periodoKey}
              label={label}
              replan={ajuste.trimRestante(periodoKey)}
            />
          );
        })}
      </div>
    </details>
  );
}

function TarjetaTrimestre({
  raiz,
  ramas,
  idx,
  config,
  year,
  unidad,
  trimestreKey,
  periodoKey,
  label,
  replan,
}: {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  idx: ArbolIndices;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
  trimestreKey: TrimestreKey;
  periodoKey: string;
  label: string;
  replan: number | undefined;
}) {
  const plan = useMemo(
    () => metaParaNodoEnPeriodo(raiz, "trimestre", periodoKey, year, config),
    [raiz, periodoKey, year, config],
  );
  const real = useMemo(
    () => realEfectivoEnPeriodoIdx(idx, raiz.id, "trimestre", periodoKey),
    [idx, raiz.id, periodoKey],
  );
  const estado = estadoPeriodo("trimestre", periodoKey, year);

  const deltaPlan = plan !== undefined ? real - plan : undefined;
  const pct = plan && plan > 0 ? Math.min(100, Math.round((real / plan) * 100)) : 0;
  const showProgress = estado === "pasado" || estado === "actual";

  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {year} · {label}
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
        {deltaPlan !== undefined && estado === "pasado" && (
          <MetricLine
            label="Δ vs plan"
            value={`${fmtNum(deltaPlan, { signed: true })} ${unidad}`}
            accent={deltaPlan >= 0 ? "good" : "bad"}
          />
        )}
      </div>

      {showProgress && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Desglose por ramas y hojas */}
      {ramas.length > 0 && (
        <details className="mt-3 rounded-lg border border-border/60 bg-surface/30">
          <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-muted marker:content-none [&::-webkit-details-marker]:hidden">
            Desglose por ramas ({ramas.length})
          </summary>
          <div className="space-y-2 border-t border-border/60 px-2 py-2">
            {ramas.map((rama) => (
              <FilaRamaTrimestral
                key={rama.id}
                rama={rama}
                idx={idx}
                config={config}
                year={year}
                unidad={unidad}
                periodoKey={periodoKey}
              />
            ))}
          </div>
        </details>
      )}

      {/* Reflexión de cierre: sólo tiene sentido en trimestres pasados o el actual */}
      {estado !== "futuro" && (
        <div className="mt-3">
          <CierreTrimestre key={`${year}-${trimestreKey}`} anio={year} trimestreKey={periodoKey} />
        </div>
      )}
    </div>
  );
}

function FilaRamaTrimestral({
  rama,
  idx,
  config,
  year,
  unidad,
  periodoKey,
}: {
  rama: NodoArbol;
  idx: ArbolIndices;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
  periodoKey: string;
}) {
  const hojas = hijosSumaDirectosIdx(idx, rama.id);
  const plan = useMemo(
    () => planAgregadoEnPeriodoIdx(idx, rama, "trimestre", periodoKey, config),
    [idx, rama, periodoKey, config],
  );
  const real = useMemo(
    () => realEfectivoEnPeriodoIdx(idx, rama.id, "trimestre", periodoKey),
    [idx, rama.id, periodoKey],
  );
  const deltaPlan = plan !== undefined ? real - plan : undefined;

  return (
    <details className="rounded border border-border/40">
      <summary className="cursor-pointer list-none px-2 py-1.5 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[12px] font-medium text-foreground">{rama.nombre}</span>
          <span className="flex flex-wrap gap-x-3 text-[10px] tabular-nums text-muted">
            <span>
              Plan:{" "}
              <strong className="text-foreground">{plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"}</strong>
            </span>
            <span>
              Real:{" "}
              <strong className={deltaPlan !== undefined && deltaPlan < 0 ? "text-red-700 dark:text-red-300" : "text-foreground"}>
                {fmtNum(real)} {unidad}
              </strong>
            </span>
          </span>
        </div>
      </summary>
      {hojas.length > 0 && (
        <div className="space-y-1 border-t border-border/40 px-2 py-1.5">
          {hojas.map((hoja) => {
            const pHoja = planAgregadoEnPeriodoIdx(idx, hoja, "trimestre", periodoKey, config);
            const rHoja = realEfectivoEnPeriodoIdx(idx, hoja.id, "trimestre", periodoKey);
            const delta = pHoja !== undefined ? rHoja - pHoja : undefined;
            return (
              <div
                key={hoja.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded bg-background/50 px-2 py-1 text-[11px]"
              >
                <span className="text-foreground">{hoja.nombre}</span>
                <span className="flex flex-wrap gap-x-3 tabular-nums text-muted">
                  <span>
                    Plan:{" "}
                    <strong className="text-foreground">{pHoja !== undefined ? `${fmtNum(pHoja)} ${unidad}` : "—"}</strong>
                  </span>
                  <span>
                    Real:{" "}
                    <strong className={delta !== undefined && delta < 0 ? "text-red-700 dark:text-red-300" : "text-foreground"}>
                      {fmtNum(rHoja)} {unidad}
                    </strong>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </details>
  );
}
