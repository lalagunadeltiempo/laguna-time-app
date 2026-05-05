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
 * Cierre de mes:
 *  - El usuario marca "Cerrar mes" cuando da el mes por finalizado.
 *  - Antes de cerrar, los meses se asumen "a plan" en el cálculo del
 *    Replan: un mes sin apunte aún no penaliza el replan de los siguientes.
 *  - Al cerrar, el real real (incluso 0) entra al acumulado y los meses
 *    posteriores ven su replan ajustado.
 *  - El propio mes cerrado pasa a etiquetar el replan como "Replan que
 *    tocaba" (mismo número, claramente histórico) para que la usuaria
 *    pueda contrastar Plan / Replan / Real cerrado el mes.
 *
 * Optimizaciones de rendimiento:
 *  - LazyDetails: el desglose «Apuntar real» y cada rama dentro del
 *    desglose se montan bajo demanda. Así entrar a la pantalla pinta sólo
 *    las 12 cabeceras.
 *  - RegistrosIndex: lookup O(1) de cada input, sin `find` linear.
 *  - React.memo: cada tarjeta ignora re-renders si su mes no cambia.
 */
import { memo, useCallback, useMemo } from "react";
import { useAppDispatch } from "@/lib/context";
import type { NodoArbol, PlanArbolConfigAnio } from "@/lib/types";
import {
  diasLaborablesEnMes,
  estadoPeriodo,
  hijosSumaDirectosIdx,
  mesesCerradosSet,
  metaParaNodoEnPeriodo,
  planAgregadoEnPeriodoIdx,
  realEfectivoEnPeriodoIdx,
  replanMensualSerie,
  type ArbolIndices,
} from "@/lib/arbol-tiempo";
import {
  LazyDetails,
  MetricLine,
  NumberInput,
  type RegistrosIndex,
  claveRegistro,
  fmtNum,
  usePersistedOpen,
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
  // Reales mes a mes de la raíz, para la serie de replan.
  const realPorMes = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 1; i <= 12; i++) {
      const k = `${year}-${String(i).padStart(2, "0")}`;
      m.set(k, realEfectivoEnPeriodoIdx(idx, raiz.id, "mes", k));
    }
    return m;
  }, [idx, raiz.id, year]);
  // Set de meses cerrados, derivado de la config del año (LWW por mes).
  const mesesCerrados = useMemo(() => mesesCerradosSet(config), [config]);
  // Replan por mes: cada mes considera "cumple plan" los meses anteriores
  // abiertos y el real real de los cerrados. Funciona igual para años
  // pasados (simulación), actual o futuros.
  const replanPorMes = useMemo(
    () =>
      replanMensualSerie({
        metaAnual: raiz.metaValor ?? 0,
        realPorMes,
        mesesCerrados,
        anio: year,
        config,
      }),
    [raiz.metaValor, realPorMes, mesesCerrados, year, config],
  );

  return (
    <details open className="rounded-xl border border-border bg-background">
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <h2 className="text-base font-semibold text-foreground">
          <span aria-hidden className="mr-2 inline-block text-[10px] text-muted">▼</span>
          MENSUAL
          <span className="ml-2 text-[11px] font-normal text-muted">
            — apunta el real y, cuando lo des por terminado, ciérralo para que el resto del año se ajuste
          </span>
        </h2>
      </summary>

      <p className="border-t border-border/60 px-4 pt-3 text-[11px] leading-snug text-muted">
        Al cerrar un mes verás dos diferencias:
        <strong className="ml-1 text-foreground">Δ vs plan</strong> (real − compromiso de inicio
        de año) te ayuda a aprender de cara al próximo año, y
        <strong className="ml-1 text-foreground">Δ vs replan</strong> (real − lo que tocaba a
        esa altura) te ayuda a decidir el siguiente mes y trimestre.
      </p>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
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
              replan={replanPorMes.get(periodoKey)}
              cerrado={mesesCerrados.has(periodoKey)}
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
  cerrado,
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
  cerrado: boolean;
}) {
  const dispatch = useAppDispatch();
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
  const deltaReplan = replan !== undefined ? real - replan : undefined;
  // La barra mide contra el replan vivo (lo que el año exige a esta
  // altura), no contra el compromiso original; alineamos la sensación
  // visual con la decisión operativa. Fallback a plan si no hay replan.
  const referenciaBarra = replan !== undefined ? replan : plan;
  const pct = referenciaBarra && referenciaBarra > 0
    ? Math.min(100, Math.round((real / referenciaBarra) * 100))
    : 0;
  const showProgress = estado === "pasado" || estado === "actual" || cerrado;
  // Mostrar Δ vs replan sólo si el replan se diferencia del plan en algo
  // visible (>= 1 unidad). Si replan ≈ plan, Δ vs replan repetiría Δ vs
  // plan y aporta ruido.
  const replanDistintoDePlan =
    plan !== undefined && replan !== undefined && Math.abs(replan - plan) >= 1;
  const mostrarDeltas = real > 0 || estado !== "futuro";

  const diasMesActual = useMemo(
    () => diasLaborablesEnMes(periodoKey, year, config),
    [periodoKey, year, config],
  );
  const pisoActual = config?.pisoMensual?.[periodoKey];
  const mostrarPiso = diasMesActual === 0 || (pisoActual !== undefined && pisoActual > 0);
  const onChangePiso = useCallback(
    (v: number | undefined) => {
      dispatch({ type: "SET_PISO_MENSUAL", anio: year, mesKey: periodoKey, valor: v });
    },
    [dispatch, year, periodoKey],
  );

  const ramasConReal = useMemo(
    () => ramas.filter((r) => r.relacionConPadre === "suma"),
    [ramas],
  );

  const regRaiz = ramas.length === 0 ? regsIndex.get(claveRegistro(raiz.id, "mes", periodoKey)) : undefined;

  // El botón de cierre sólo tiene sentido sobre meses que no son futuros:
  // no se cierra "abril" desde enero. Para años pasados (simulación) y
  // actuales sí se permite, igual que en años futuros explícitamente
  // marcados como completados (caso raro pero coherente con el contrato).
  const puedeCerrar = estado !== "futuro" || cerrado;

  const onToggleCerrado = useCallback(() => {
    dispatch({ type: "TOGGLE_MES_CERRADO", anio: year, mesKey: periodoKey });
  }, [dispatch, year, periodoKey]);

  return (
    <div
      className={`min-w-0 rounded-xl border p-3 shadow-sm ${
        cerrado ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-background"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {label} <span className="text-[10px] font-normal text-muted">({periodoKey})</span>
        </h3>
        <div className="flex items-center gap-1.5">
          {cerrado && (
            <span className="shrink-0 rounded bg-emerald-600/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
              cerrado
            </span>
          )}
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
      </div>

      <div className="mt-3 space-y-1 border-t border-border/50 pt-2">
        {/* Orden pensado para que el ojo vaya al Real (lo que pasó) y luego
            a las decisiones operativas: replan vivo y su delta. Plan y Δ
            vs plan quedan como contexto histórico al final. */}
        <MetricLine
          label="Real"
          value={`${fmtNum(real)} ${unidad}`}
          accent={deltaPlan !== undefined ? (deltaPlan >= 0 ? "good" : "bad") : undefined}
        />
        {replanDistintoDePlan && (
          <MetricLine
            label={cerrado ? "Replan que tocaba" : "Replan sugerido"}
            value={`${fmtNum(replan as number)} ${unidad}`}
            accent="muted"
          />
        )}
        {replanDistintoDePlan && deltaReplan !== undefined && mostrarDeltas && (
          <MetricLine
            label="Δ vs replan"
            value={`${fmtNum(deltaReplan, { signed: true })} ${unidad}`}
            accent={deltaReplan >= 0 ? "good" : "bad"}
          />
        )}
        <MetricLine label="Plan" value={plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"} accent="muted" />
        {plan !== undefined && deltaPlan !== undefined && mostrarDeltas && (
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

      {mostrarPiso && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded border border-amber-400/30 bg-amber-500/5 px-2 py-2">
          <label className="flex flex-1 flex-col gap-1 text-[10px] text-muted">
            <span title="Mínimo del mes — útil para meses sin actividad que sí ingresan (ej. agosto)">
              Mínimo del mes ({unidad || "€"})
            </span>
            <NumberInput
              value={pisoActual}
              onCommit={onChangePiso}
              ariaLabel={`Mínimo del mes ${label}`}
              unidad={unidad}
              compact
              title="Mínimo del mes — útil para meses sin actividad que sí ingresan (ej. agosto)"
            />
          </label>
        </div>
      )}

      {puedeCerrar && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onToggleCerrado}
            className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
              cerrado
                ? "border-border bg-background text-muted hover:bg-surface"
                : "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200"
            }`}
            title={cerrado
              ? "Reabre el mes para volver a apuntar reales y reactivar el replan."
              : "Da el mes por terminado: el real entra en el acumulado y el resto del año se ajusta."}
          >
            {cerrado ? "Reabrir mes" : "Cerrar mes (ya no añadiré más)"}
          </button>
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
          <div className="space-y-2 border-t border-border/60 px-2 py-2">
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

  // Persistir abierto/cerrado por (año, rama, mes) en localStorage para que
  // la usuaria recupere su disposición al volver.
  const { open, onToggle } = usePersistedOpen(
    `arbol:${year}:rama:${rama.id}:mes:${periodoKey}`,
    false,
  );

  return (
    <LazyDetails
      className="rounded border border-border/50 bg-background/60"
      open={open}
      onToggle={onToggle}
      summary={
        <summary className="cursor-pointer list-none px-2 py-1.5 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[12px] font-medium text-foreground">
              <span aria-hidden className="mr-1 text-[9px] text-muted">{open ? "▼" : "▶"}</span>
              {rama.nombre}
            </span>
            <span className="flex flex-wrap gap-x-2 text-[10px] tabular-nums text-muted">
              <span>
                Plan: <strong className="text-foreground">{plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"}</strong>
              </span>
              <span>
                Real: <strong className="text-foreground">{fmtNum(real)} {unidad}</strong>
              </span>
            </span>
          </span>
        </summary>
      }
    >
      <div className="border-t border-border/40 p-2">
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
    </LazyDetails>
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
  void year;
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
            Real: <strong className="text-foreground">{fmtNum(real)} {unidad}</strong>
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
