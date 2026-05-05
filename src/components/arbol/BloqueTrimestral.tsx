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
import { memo, useMemo } from "react";
import type { NodoArbol, PlanArbolConfigAnio, TrimestreKey } from "@/lib/types";
import {
  estadoPeriodo,
  hijosSumaDirectosIdx,
  mesesCerradosSet,
  metaParaNodoEnPeriodo,
  planAgregadoEnPeriodoIdx,
  proporcionesMensualesAYParaNodo,
  realEfectivoEnPeriodoIdx,
  replanTrimestralSerie,
  type ArbolIndices,
} from "@/lib/arbol-tiempo";
import { CierreTrimestre } from "./CierreTrimestre";
import { LazyDetails, MetricLine, fmtNum } from "./arbol-comunes";

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
  // Reales mes a mes de la raíz, base común para la serie de replan.
  const realPorMes = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 1; i <= 12; i++) {
      const k = `${year}-${String(i).padStart(2, "0")}`;
      m.set(k, realEfectivoEnPeriodoIdx(idx, raiz.id, "mes", k));
    }
    return m;
  }, [idx, raiz.id, year]);
  const mesesCerrados = useMemo(() => mesesCerradosSet(config), [config]);
  const proporcionesAYRaiz = useMemo(
    () => proporcionesMensualesAYParaNodo(idx, raiz.id),
    [idx, raiz.id],
  );
  // Replan por trimestre: cada Q ajusta lo que queda asumiendo "cumple plan"
  // los meses anteriores que aún no estén cerrados. Funciona igual para
  // años pasados, actual y futuros.
  const replanPorQ = useMemo(
    () =>
      replanTrimestralSerie({
        metaAnual: raiz.metaValor ?? 0,
        realPorMes,
        mesesCerrados,
        anio: year,
        config,
        proporcionesAY: proporcionesAYRaiz,
      }),
    [raiz.metaValor, realPorMes, mesesCerrados, year, config, proporcionesAYRaiz],
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
          // Trimestre con todos sus meses cerrados: ya no replanifica.
          const qNum = parseInt(key.slice(1), 10);
          const mesesQ = [qNum * 3 - 2, qNum * 3 - 1, qNum * 3].map(
            (m) => `${year}-${String(m).padStart(2, "0")}`,
          );
          const qCerrado = mesesQ.every((mk) => mesesCerrados.has(mk));
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
              replan={replanPorQ.get(periodoKey)}
              qCerrado={qCerrado}
            />
          );
        })}
      </div>
    </details>
  );
}

const TarjetaTrimestre = memo(function TarjetaTrimestre({
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
  qCerrado,
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
  qCerrado: boolean;
}) {
  const plan = useMemo(
    () => metaParaNodoEnPeriodo(raiz, "trimestre", periodoKey, year, config, idx),
    [raiz, periodoKey, year, config, idx],
  );
  const real = useMemo(
    () => realEfectivoEnPeriodoIdx(idx, raiz.id, "trimestre", periodoKey),
    [idx, raiz.id, periodoKey],
  );
  const estado = estadoPeriodo("trimestre", periodoKey, year);

  const deltaPlan = plan !== undefined ? real - plan : undefined;
  const deltaReplan = replan !== undefined ? real - replan : undefined;
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
        {replan !== undefined && plan !== undefined && Math.abs(replan - plan) >= 1 && (
          <MetricLine
            label={qCerrado ? "Replan que tocaba" : "Replan sugerido"}
            value={`${fmtNum(replan)} ${unidad}`}
            accent="muted"
          />
        )}
        <MetricLine
          label="Real"
          value={`${fmtNum(real)} ${unidad}`}
          accent={
            deltaReplan !== undefined
              ? deltaReplan >= 0
                ? "good"
                : "bad"
              : deltaPlan !== undefined
                ? deltaPlan >= 0
                  ? "good"
                  : "bad"
                : undefined
          }
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

      {/* Desglose por ramas y hojas (montado bajo demanda) */}
      {ramas.length > 0 && (
        <LazyDetails
          className="mt-3 rounded-lg border border-border/60 bg-surface/30"
          summary={
            <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-muted marker:content-none [&::-webkit-details-marker]:hidden">
              Desglose por ramas ({ramas.length})
            </summary>
          }
        >
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
        </LazyDetails>
      )}

      {/* Reflexión de cierre: sólo tiene sentido en trimestres pasados o el actual.
          El form real (3 textareas con debounce) se monta al abrir; así no
          pagamos 4 cierres al entrar a la pantalla. */}
      {estado !== "futuro" && (
        <div className="mt-3">
          <CierreTrimestre key={`${year}-${trimestreKey}`} anio={year} trimestreKey={periodoKey} />
        </div>
      )}
    </div>
  );
});

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
        <span className="flex flex-wrap items-baseline justify-between gap-2">
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
        </span>
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
