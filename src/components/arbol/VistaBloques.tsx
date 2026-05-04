"use client";

/**
 * Orquestador del Árbol de objetivos en su vista temporal.
 *
 * Presenta cuatro bloques en cascada, abiertos por defecto, estilo
 * «Mapa» pero con el EJE TIEMPO en vez de áreas. El único editable
 * para el PLAN es el bloque Anual; trimestral y semanal/mensual son
 * sólo lectura del plan y el usuario introduce el "real" en mensual
 * y semanal.
 *
 * No hay selector de MODO: la app expone de entrada lo que antes
 * estaba escondido tras tres pestañas confusas.
 */
import { useMemo } from "react";
import { useAppState } from "@/lib/context";
import { EMPTY_ARBOL, type NodoArbol } from "@/lib/types";
import {
  buildArbolIndices,
  diasLaborablesEnAnio,
  ensureConfigAnio,
  metaEfectivaNodoIdx,
  metaSemanalPropuesta,
  ramasDirectas,
} from "@/lib/arbol-tiempo";
import { BloqueAnual } from "./BloqueAnual";
import { BloqueTrimestral } from "./BloqueTrimestral";
import { BloqueMensual } from "./BloqueMensual";
import { BloqueSemanal } from "./BloqueSemanal";
import { fmtNum } from "./arbol-comunes";

export interface VistaBloquesProps {
  raiz: NodoArbol;
  year: number;
}

export function VistaBloques({ raiz, year }: VistaBloquesProps) {
  const state = useAppState();
  const arbol = state.arbol ?? EMPTY_ARBOL;

  const configsEffective = useMemo(() => ensureConfigAnio(arbol.configs, year), [arbol.configs, year]);
  const config = configsEffective.find((c) => c.anio === year);

  const ramas = useMemo(() => ramasDirectas(arbol.nodos, raiz.id, year), [arbol.nodos, raiz.id, year]);
  const unidad = raiz.metaUnidad ?? "";
  const idx = useMemo(
    () => buildArbolIndices(arbol.registros, arbol.nodos, year),
    [arbol.registros, arbol.nodos, year],
  );

  const diasLaborables = diasLaborablesEnAnio(year, config);
  const cuotaSemanal =
    raiz.metaValor !== undefined && diasLaborables > 0
      ? metaSemanalPropuesta(raiz.metaValor, year, config)
      : 0;

  const planRamasAnual = useMemo(
    () =>
      ramas
        .filter((r) => r.relacionConPadre === "suma")
        .reduce((acc, r) => acc + (metaEfectivaNodoIdx(idx, r) ?? 0), 0),
    [ramas, idx],
  );
  const cuadre =
    raiz.metaValor !== undefined &&
    planRamasAnual > 0 &&
    Math.abs(planRamasAnual - raiz.metaValor) > 0.01
      ? `Las ramas suman ${fmtNum(planRamasAnual)} ${unidad} y el objetivo es ${fmtNum(raiz.metaValor)} ${unidad}.`
      : null;

  return (
    <div className="space-y-4">
      {/* Tira informativa: días laborables del año y cuota semanal media. */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-[12px] text-foreground">
        En {year} hay <strong>{diasLaborables}</strong> días laborables (lun–vie; excluyen tus semanas de descanso y los
        festivos
        {config?.comunidadAutonoma ? " nacionales y autonómicos que configuraste" : " nacionales"}).
        {raiz.metaValor !== undefined && (
          <>
            {" "}Para llegar a <strong>{fmtNum(raiz.metaValor)} {unidad}</strong> tendrías que hacer{" "}
            <strong className="tabular-nums">
              {fmtNum(cuotaSemanal)} {unidad}
            </strong>{" "}
            de media a la semana.
          </>
        )}
        {cuadre && (
          <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-amber-900 dark:text-amber-100">{cuadre}</span>
        )}
      </div>

      <BloqueAnual
        raiz={raiz}
        ramas={ramas}
        nodos={arbol.nodos}
        registros={arbol.registros}
        idx={idx}
        year={year}
        unidad={unidad}
      />

      <BloqueTrimestral raiz={raiz} ramas={ramas} idx={idx} config={config} year={year} unidad={unidad} />

      <BloqueMensual
        raiz={raiz}
        ramas={ramas}
        registros={arbol.registros}
        idx={idx}
        config={config}
        year={year}
        unidad={unidad}
      />

      <BloqueSemanal
        raiz={raiz}
        ramas={ramas}
        registros={arbol.registros}
        idx={idx}
        config={config}
        year={year}
        unidad={unidad}
      />
    </div>
  );
}
