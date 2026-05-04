"use client";

/**
 * Bloque SEMANAL: listado de semanas ISO ACTIVAS (excluyendo descansos
 * y festivos del año). Cada semana se despliega y muestra ramas y
 * hojas con su plan semanal (sólo lectura) y un input para apuntar el
 * "real" de esa semana por hoja (o por rama si no hay hojas).
 *
 * No pintamos "replan" a este nivel para no saturar; el replan vive en
 * el bloque Mensual y Trimestral.
 */
import { useMemo } from "react";
import type { NodoArbol, PlanArbolConfigAnio, RegistroNodo } from "@/lib/types";
import {
  estadoPeriodo,
  formatWeekRange,
  hijosSumaDirectosIdx,
  isoWeekLabelFromMondayKey,
  mondaysInCalendarYear,
  planAgregadoEnPeriodoIdx,
  realEfectivoEnPeriodoIdx,
  type ArbolIndices,
} from "@/lib/arbol-tiempo";
import { NumberInput, fmtNum, useUpsertRegistro } from "./arbol-comunes";

interface BloqueSemanalProps {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  registros: RegistroNodo[];
  idx: ArbolIndices;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
}

export function BloqueSemanal({ raiz, ramas, registros, idx, config, year, unidad }: BloqueSemanalProps) {
  // Lista de lunes del año que son semanas ACTIVAS (no de descanso).
  const semanasActivas = useMemo(() => {
    const mondays = mondaysInCalendarYear(year);
    const noActivas = new Set(config?.semanasNoActivas ?? []);
    return mondays.filter((m) => !noActivas.has(m));
  }, [year, config]);

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
        {semanasActivas.length === 0 ? (
          <p className="rounded border border-dashed border-border px-3 py-3 text-sm text-muted">
            No hay semanas activas configuradas. Revisa «Semanas de descanso» en la cabecera.
          </p>
        ) : (
          semanasActivas.map((mondayKey) => (
            <FilaSemana
              key={mondayKey}
              raiz={raiz}
              ramas={ramas}
              registros={registros}
              idx={idx}
              config={config}
              year={year}
              unidad={unidad}
              mondayKey={mondayKey}
            />
          ))
        )}
      </div>
    </details>
  );
}

function FilaSemana({
  raiz,
  ramas,
  registros,
  idx,
  config,
  year,
  unidad,
  mondayKey,
}: {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  registros: RegistroNodo[];
  idx: ArbolIndices;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
  mondayKey: string;
}) {
  const label = isoWeekLabelFromMondayKey(mondayKey);
  const rango = formatWeekRange(mondayKey);
  const estado = estadoPeriodo("semana", mondayKey, year);
  const plan = planAgregadoEnPeriodoIdx(idx, raiz, "semana", mondayKey, config);
  const real = realEfectivoEnPeriodoIdx(idx, raiz.id, "semana", mondayKey);
  const deltaPlan = plan !== undefined ? real - plan : undefined;

  const ramasConReal = ramas.filter((r) => r.relacionConPadre === "suma");

  return (
    <details className="rounded-lg border border-border bg-surface/30" open={estado === "actual"}>
      <summary className="cursor-pointer list-none px-3 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-[10px] text-muted">{rango}</p>
          </div>
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
        </div>
      </summary>

      <div className="space-y-2 border-t border-border/60 px-3 py-2">
        {ramasConReal.length === 0 && ramas.length === 0 ? (
          <FilaApunteSemanal
            nodoId={raiz.id}
            registros={registros}
            periodoKey={mondayKey}
            unidad={unidad}
            ariaLabel={`Real semana ${label} de ${raiz.nombre}`}
          />
        ) : (
          ramasConReal.map((rama) => (
            <FilaRamaSemanal
              key={rama.id}
              rama={rama}
              idx={idx}
              registros={registros}
              config={config}
              year={year}
              unidad={unidad}
              mondayKey={mondayKey}
            />
          ))
        )}
      </div>
    </details>
  );
}

function FilaRamaSemanal({
  rama,
  idx,
  registros,
  config,
  year,
  unidad,
  mondayKey,
}: {
  rama: NodoArbol;
  idx: ArbolIndices;
  registros: RegistroNodo[];
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
  mondayKey: string;
}) {
  const hojas = hijosSumaDirectosIdx(idx, rama.id);
  const plan = planAgregadoEnPeriodoIdx(idx, rama, "semana", mondayKey, config);
  const real = realEfectivoEnPeriodoIdx(idx, rama.id, "semana", mondayKey);

  return (
    <div className="rounded border border-border/50 bg-background/60 p-2">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-foreground">{rama.nombre}</span>
        <span className="flex gap-x-2 text-[10px] tabular-nums text-muted">
          <span>
            Plan: <strong className="text-foreground">{plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"}</strong>
          </span>
          <span>
            Real: <strong className="text-foreground">{fmtNum(real)} {unidad}</strong>
          </span>
        </span>
      </div>
      {hojas.length === 0 ? (
        <FilaApunteSemanal
          nodoId={rama.id}
          registros={registros}
          periodoKey={mondayKey}
          unidad={unidad}
          ariaLabel={`Real semana de ${rama.nombre}`}
        />
      ) : (
        <div className="space-y-1.5">
          {hojas.map((hoja) => {
            const pHoja = planAgregadoEnPeriodoIdx(idx, hoja, "semana", mondayKey, config);
            return (
              <div key={hoja.id} className="rounded border border-border/40 bg-surface/50 px-2 py-1.5">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                  <span className="text-foreground">{hoja.nombre}</span>
                  <span className="tabular-nums text-muted">
                    Plan:{" "}
                    <strong className="text-foreground">
                      {pHoja !== undefined ? `${fmtNum(pHoja)} ${unidad}` : "—"}
                    </strong>
                  </span>
                </div>
                <FilaApunteSemanal
                  nodoId={hoja.id}
                  registros={registros}
                  periodoKey={mondayKey}
                  unidad={unidad}
                  ariaLabel={`Real semana de ${hoja.nombre}`}
                />
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
  registros,
  periodoKey,
  unidad,
  ariaLabel,
}: {
  nodoId: string;
  registros: RegistroNodo[];
  periodoKey: string;
  unidad: string;
  ariaLabel: string;
}) {
  const upsert = useUpsertRegistro();
  const reg = registros.find(
    (r) => r.nodoId === nodoId && r.periodoTipo === "semana" && r.periodoKey === periodoKey,
  );
  return (
    <NumberInput
      value={reg?.valor}
      onCommit={(v) =>
        upsert({
          nodoId,
          periodoTipo: "semana",
          periodoKey,
          valor: v,
          unidades: reg?.unidades,
        })
      }
      ariaLabel={ariaLabel}
      unidad={unidad}
      compact
    />
  );
}
