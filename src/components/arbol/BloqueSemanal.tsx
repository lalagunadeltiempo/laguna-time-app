"use client";

/**
 * Bloque SEMANAL: listado de semanas ISO ACTIVAS (sin descansos ni
 * festivos). Cada semana abre bajo demanda y muestra ramas/hojas con
 * su plan y el input de real.
 *
 * Por defecto sólo se monta la cabecera ligera de cada semana; el
 * contenido (que puede incluir decenas de inputs) se monta al abrir
 * gracias a `LazyDetails`. Además los inputs usan el índice de
 * registros para lookups O(1) y `useUpsertRegistro` ya no se suscribe
 * al estado global.
 */
import { memo, useMemo } from "react";
import type { NodoArbol, PlanArbolConfigAnio, RegistroNodo } from "@/lib/types";
import {
  estadoPeriodo,
  formatWeekRange,
  hijosSumaDirectosIdx,
  isoWeekLabelFromMondayKey,
  mesKeyFromDate,
  mesesCerradosSet,
  mondaysInCalendarYear,
  nodoTieneDobleConteoEnMesIdx,
  parseLocalDateKey,
  planAgregadoEnPeriodoIdx,
  realEfectivoEnPeriodoIdx,
  replanSemanalSerie,
  semanasNoActivasSet,
  type ArbolIndices,
} from "@/lib/arbol-tiempo";
import {
  AvisoDobleConteo,
  LazyDetails,
  NumberInput,
  type RegistrosIndex,
  claveRegistro,
  fmtNum,
  useUpsertRegistro,
  usePersistedOpen,
} from "./arbol-comunes";

/** Map: nodoId → (mondayKey → replan semanal). */
type ReplanPorNodoSemana = ReadonlyMap<string, ReadonlyMap<string, number>>;

interface BloqueSemanalProps {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  regsIndex: RegistrosIndex;
  idx: ArbolIndices;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
}

export function BloqueSemanal({ raiz, ramas, regsIndex, idx, config, year, unidad }: BloqueSemanalProps) {
  const semanasActivas = useMemo(() => {
    const mondays = mondaysInCalendarYear(year);
    const noActivas = semanasNoActivasSet(config);
    return mondays.filter((m) => !noActivas.has(m));
  }, [year, config]);

  const mesesCerrados = useMemo(() => mesesCerradosSet(config), [config]);

  // Replan semanal por nodo (raíz + ramas suma + sus hojas suma). Mismo
  // significado que el replan mensual/trimestral pero a granularidad de
  // semana: «lo que queda por facturar repartido entre las semanas activas
  // restantes». Se calcula una serie por nodo (O(nodos × semanas)) y se
  // baja a las filas vía lookup O(1) por (nodoId, mondayKey).
  const replanPorNodoSemana = useMemo<ReplanPorNodoSemana>(() => {
    const nodos: NodoArbol[] = [raiz];
    for (const r of ramas) {
      if (r.relacionConPadre !== "suma") continue;
      nodos.push(r);
      for (const h of hijosSumaDirectosIdx(idx, r.id)) nodos.push(h);
    }
    const m = new Map<string, ReadonlyMap<string, number>>();
    for (const nodo of nodos) {
      const metaAnual = planAgregadoEnPeriodoIdx(idx, nodo, "anio", String(year), config) ?? 0;
      if (metaAnual <= 0) continue;
      const realPorSemana = new Map<string, number>();
      for (const mk of semanasActivas) {
        realPorSemana.set(mk, realEfectivoEnPeriodoIdx(idx, nodo.id, "semana", mk));
      }
      m.set(
        nodo.id,
        replanSemanalSerie({ metaAnual, realPorSemana, mesesCerrados, anio: year, config }),
      );
    }
    return m;
  }, [raiz, ramas, idx, year, config, semanasActivas, mesesCerrados]);

  // Toggle estético: por defecto NO mostramos las semanas vacías de meses
  // cerrados (la usuaria no quiere verlas si no llegó a usarlas). El
  // cálculo del plan/replan no depende de esto en absoluto.
  const { open: mostrarVaciasCerradas, onToggle: setMostrarVaciasCerradas } = usePersistedOpen(
    `arbol:${year}:semanal:mostrar-vacias-cerradas`,
    false,
  );

  // Filtrado: una semana se oculta si pertenece a un mes cerrado y no
  // tiene NINGÚN registro real (raíz ni descendientes; los descendientes
  // van vía `realEfectivoEnPeriodoIdx` sobre la raíz).
  const semanasVisibles = useMemo(() => {
    if (mostrarVaciasCerradas || mesesCerrados.size === 0) return semanasActivas;
    return semanasActivas.filter((mk) => {
      const mes = mesKeyFromDate(parseLocalDateKey(mk));
      if (!mesesCerrados.has(mes)) return true;
      const real = realEfectivoEnPeriodoIdx(idx, raiz.id, "semana", mk);
      return real > 0;
    });
  }, [semanasActivas, mostrarVaciasCerradas, mesesCerrados, idx, raiz.id]);

  const ocultas = semanasActivas.length - semanasVisibles.length;

  return (
    <details open className="rounded-xl border border-border bg-background">
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <h2 className="text-base font-semibold text-foreground">
          <span aria-hidden className="mr-2 inline-block text-[10px] text-muted">▼</span>
          SEMANAL
          <span className="ml-2 text-[11px] font-normal text-muted">
            — apunta aquí lo facturado cada semana. Las semanas de descanso no aparecen.
          </span>
        </h2>
      </summary>

      <div className="space-y-2 border-t border-border/60 p-4">
        {ocultas > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-dashed border-border bg-surface/40 px-3 py-2 text-[11px] text-muted">
            <span>
              {ocultas} {ocultas === 1 ? "semana vacía oculta" : "semanas vacías ocultas"} de meses cerrados.
            </span>
            <button
              type="button"
              onClick={() => setMostrarVaciasCerradas(true)}
              className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface"
            >
              Mostrarlas igualmente
            </button>
          </div>
        )}
        {ocultas === 0 && mostrarVaciasCerradas && mesesCerrados.size > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-muted">
            <button
              type="button"
              onClick={() => setMostrarVaciasCerradas(false)}
              className="rounded border border-border bg-background px-2 py-1 font-medium text-foreground hover:bg-surface"
            >
              Ocultar semanas vacías de meses cerrados
            </button>
          </div>
        )}
        {semanasVisibles.length === 0 ? (
          <p className="rounded border border-dashed border-border px-3 py-3 text-sm text-muted">
            No hay semanas activas configuradas. Revisa «Semanas de descanso» en la cabecera.
          </p>
        ) : (
          semanasVisibles.map((mondayKey) => (
            <FilaSemana
              key={mondayKey}
              raiz={raiz}
              ramas={ramas}
              regsIndex={regsIndex}
              idx={idx}
              config={config}
              year={year}
              unidad={unidad}
              mondayKey={mondayKey}
              replanPorNodoSemana={replanPorNodoSemana}
            />
          ))
        )}
      </div>
    </details>
  );
}

const FilaSemana = memo(function FilaSemana({
  raiz,
  ramas,
  regsIndex,
  idx,
  config,
  year,
  unidad,
  mondayKey,
  replanPorNodoSemana,
}: {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  regsIndex: RegistrosIndex;
  idx: ArbolIndices;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
  mondayKey: string;
  replanPorNodoSemana: ReplanPorNodoSemana;
}) {
  const label = isoWeekLabelFromMondayKey(mondayKey);
  const rango = formatWeekRange(mondayKey);
  const estado = estadoPeriodo("semana", mondayKey, year);
  const plan = planAgregadoEnPeriodoIdx(idx, raiz, "semana", mondayKey, config);
  const real = realEfectivoEnPeriodoIdx(idx, raiz.id, "semana", mondayKey);
  const deltaPlan = plan !== undefined ? real - plan : undefined;
  const replan = replanPorNodoSemana.get(raiz.id)?.get(mondayKey);
  const mostrarReplan =
    plan !== undefined && replan !== undefined && Math.abs(replan - plan) >= 1;
  const mesKey = mesKeyFromDate(parseLocalDateKey(mondayKey));
  const ramasConReal = useMemo(
    () => ramas.filter((r) => r.relacionConPadre === "suma"),
    [ramas],
  );
  const regRaiz = ramas.length === 0 ? regsIndex.get(claveRegistro(raiz.id, "semana", mondayKey)) : undefined;
  const avisoDobleConteoRaiz =
    ramas.length === 0 && nodoTieneDobleConteoEnMesIdx(idx, raiz.id, mesKey);

  return (
    <LazyDetails
      className="rounded-lg border border-border bg-surface/30"
      defaultOpen={estado === "actual"}
      summary={
        <summary className="cursor-pointer list-none px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="block min-w-0">
              <span className="block text-sm font-medium text-foreground">{label}</span>
              <span className="block text-[10px] text-muted">{rango}</span>
            </span>
            <span className="flex flex-wrap items-baseline gap-x-3 text-[11px] tabular-nums text-muted">
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                  estado === "pasado"
                    ? "bg-surface text-muted"
                    : estado === "actual"
                      ? "bg-accent/15 text-accent"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-200"
                }`}
              >
                {estado}
              </span>
              <span>
                Plan:{" "}
                <strong className="text-foreground">{plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"}</strong>
              </span>
              {mostrarReplan && (
                <span>
                  Replan:{" "}
                  <strong className="text-foreground">{fmtNum(replan as number)} {unidad}</strong>
                </span>
              )}
              <span>
                Real:{" "}
                <strong
                  className={
                    deltaPlan !== undefined && deltaPlan < 0
                      ? "text-red-700 dark:text-red-300"
                      : "text-foreground"
                  }
                >
                  {fmtNum(real)} {unidad}
                </strong>
              </span>
            </span>
          </span>
        </summary>
      }
    >
      <div className="space-y-2 border-t border-border/60 px-3 py-2">
        {ramasConReal.length === 0 && ramas.length === 0 ? (
          <>
            <FilaApunteSemanal
              nodoId={raiz.id}
              periodoKey={mondayKey}
              existing={regRaiz}
              unidad={unidad}
              ariaLabel={`Real semana ${label} de ${raiz.nombre}`}
            />
            {avisoDobleConteoRaiz && <AvisoDobleConteo />}
          </>
        ) : (
          ramasConReal.map((rama) => (
            <FilaRamaSemanal
              key={rama.id}
              rama={rama}
              idx={idx}
              regsIndex={regsIndex}
              config={config}
              unidad={unidad}
              mondayKey={mondayKey}
              replanPorNodoSemana={replanPorNodoSemana}
            />
          ))
        )}
      </div>
    </LazyDetails>
  );
});

function FilaRamaSemanal({
  rama,
  idx,
  regsIndex,
  config,
  unidad,
  mondayKey,
  replanPorNodoSemana,
}: {
  rama: NodoArbol;
  idx: ArbolIndices;
  regsIndex: RegistrosIndex;
  config: PlanArbolConfigAnio | undefined;
  unidad: string;
  mondayKey: string;
  replanPorNodoSemana: ReplanPorNodoSemana;
}) {
  const hojas = hijosSumaDirectosIdx(idx, rama.id);
  const plan = planAgregadoEnPeriodoIdx(idx, rama, "semana", mondayKey, config);
  const real = realEfectivoEnPeriodoIdx(idx, rama.id, "semana", mondayKey);
  const existingRama = regsIndex.get(claveRegistro(rama.id, "semana", mondayKey));
  const mesKey = mesKeyFromDate(parseLocalDateKey(mondayKey));
  const replanRama = replanPorNodoSemana.get(rama.id)?.get(mondayKey);
  const mostrarReplanRama =
    plan !== undefined && replanRama !== undefined && Math.abs(replanRama - plan) >= 1;
  const avisoRama = hojas.length === 0 && nodoTieneDobleConteoEnMesIdx(idx, rama.id, mesKey);

  return (
    <div className="rounded border border-border/50 bg-background/60 p-2">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground">{rama.nombre}</span>
        <span className="flex gap-x-2 text-[10px] tabular-nums text-muted">
          <span>
            Plan: <strong className="text-foreground">{plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"}</strong>
          </span>
          {mostrarReplanRama && (
            <span>
              Replan: <strong className="text-foreground">{fmtNum(replanRama as number)} {unidad}</strong>
            </span>
          )}
          <span>
            Real: <strong className="text-foreground">{fmtNum(real)} {unidad}</strong>
          </span>
        </span>
      </div>
      {hojas.length === 0 ? (
        <>
          <FilaApunteSemanal
            nodoId={rama.id}
            periodoKey={mondayKey}
            existing={existingRama}
            unidad={unidad}
            ariaLabel={`Real semana de ${rama.nombre}`}
          />
          {avisoRama && <AvisoDobleConteo />}
        </>
      ) : (
        <div className="space-y-1.5">
          {hojas.map((hoja) => {
            const pHoja = planAgregadoEnPeriodoIdx(idx, hoja, "semana", mondayKey, config);
            const existingHoja = regsIndex.get(claveRegistro(hoja.id, "semana", mondayKey));
            const replanHoja = replanPorNodoSemana.get(hoja.id)?.get(mondayKey);
            const mostrarReplanHoja =
              pHoja !== undefined && replanHoja !== undefined && Math.abs(replanHoja - pHoja) >= 1;
            const avisoHoja = nodoTieneDobleConteoEnMesIdx(idx, hoja.id, mesKey);
            return (
              <div key={hoja.id} className="rounded border border-border/40 bg-surface/50 px-2 py-1.5">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                  <span className="text-foreground">{hoja.nombre}</span>
                  <span className="flex gap-x-2 tabular-nums text-muted">
                    <span>
                      Plan:{" "}
                      <strong className="text-foreground">
                        {pHoja !== undefined ? `${fmtNum(pHoja)} ${unidad}` : "—"}
                      </strong>
                    </span>
                    {mostrarReplanHoja && (
                      <span>
                        Replan:{" "}
                        <strong className="text-foreground">{fmtNum(replanHoja as number)} {unidad}</strong>
                      </span>
                    )}
                  </span>
                </div>
                <FilaApunteSemanal
                  nodoId={hoja.id}
                  periodoKey={mondayKey}
                  existing={existingHoja}
                  unidad={unidad}
                  ariaLabel={`Real semana de ${hoja.nombre}`}
                />
                {avisoHoja && <AvisoDobleConteo />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilaApunteSemanal({
  nodoId,
  periodoKey,
  existing,
  unidad,
  ariaLabel,
}: {
  nodoId: string;
  periodoKey: string;
  existing: RegistroNodo | undefined;
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
          periodoTipo: "semana",
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
