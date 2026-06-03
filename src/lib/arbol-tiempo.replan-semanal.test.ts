import { describe, expect, it } from "vitest";
import {
  defaultSemanasNoActivas,
  diasLaborablesEnSemanaISO,
  mesKeyFromDate,
  mondaysInCalendarYear,
  parseLocalDateKey,
  replanSemanalSerie,
  semanasNoActivasSet,
} from "./arbol-tiempo";
import type { PlanArbolConfigAnio } from "./types";

describe("replanSemanalSerie", () => {
  const anio = 2026;
  // Config con TODAS las semanas activas (sin descansos), para un reparto
  // determinista por días laborables.
  const configActivas: PlanArbolConfigAnio = { anio, semanasNoActivas: [] };
  const meta = 520_000;

  const semanasActivas = (config: PlanArbolConfigAnio) => {
    const noAct = semanasNoActivasSet(config);
    return mondaysInCalendarYear(anio).filter((m) => !noAct.has(m));
  };

  it("sin cierres, la suma de los replanes semanales cuadra con la meta anual", () => {
    const replan = replanSemanalSerie({
      metaAnual: meta,
      realPorSemana: new Map(),
      anio,
      config: configActivas,
    });
    let sum = 0;
    for (const v of replan.values()) sum += v;
    expect(sum).toBeCloseTo(meta, 1);
  });

  it("sin cierres, el replan de cada semana equivale al plan lineal por días laborables", () => {
    const semanas = semanasActivas(configActivas);
    const pesos = semanas.map((m) => diasLaborablesEnSemanaISO(m, anio, configActivas));
    const pesoTotal = pesos.reduce((a, b) => a + b, 0);
    const replan = replanSemanalSerie({
      metaAnual: meta,
      realPorSemana: new Map(),
      anio,
      config: configActivas,
    });
    // Comprobamos varias semanas repartidas a lo largo del año.
    for (const i of [0, 10, 25, 40, semanas.length - 1]) {
      const esperado = pesoTotal > 0 ? (meta * pesos[i]) / pesoTotal : 0;
      expect(replan.get(semanas[i])).toBeCloseTo(esperado, 4);
    }
  });

  it("excluye las semanas de descanso del resultado", () => {
    const configDescansos: PlanArbolConfigAnio = {
      anio,
      semanasNoActivas: defaultSemanasNoActivas(anio),
    };
    const noAct = semanasNoActivasSet(configDescansos);
    const replan = replanSemanalSerie({
      metaAnual: meta,
      realPorSemana: new Map(),
      anio,
      config: configDescansos,
    });
    for (const mk of noAct) {
      expect(replan.has(mk)).toBe(false);
    }
    // Cuadre también con descansos.
    let sum = 0;
    for (const v of replan.values()) sum += v;
    expect(sum).toBeCloseTo(meta, 1);
  });

  it("un mes cerrado POR DEBAJO del plan eleva el replan de las semanas siguientes", () => {
    const semanas = semanasActivas(configActivas);
    const baseline = replanSemanalSerie({
      metaAnual: meta,
      realPorSemana: new Map(),
      anio,
      config: configActivas,
    });
    // Cerramos enero con real 0 en todas sus semanas (por debajo del plan).
    const eneroCero = new Map<string, number>();
    for (const mk of semanas) {
      if (mesKeyFromDate(parseLocalDateKey(mk)) === `${anio}-01`) eneroCero.set(mk, 0);
    }
    const replan = replanSemanalSerie({
      metaAnual: meta,
      realPorSemana: eneroCero,
      mesesCerrados: new Set([`${anio}-01`]),
      anio,
      config: configActivas,
    });
    // Una semana de marzo (posterior a enero) debe pedir más que en baseline.
    const semanaMarzo = semanas.find((mk) => mesKeyFromDate(parseLocalDateKey(mk)) === `${anio}-03`)!;
    expect(replan.get(semanaMarzo)!).toBeGreaterThan(baseline.get(semanaMarzo)!);
  });

  it("un mes cerrado CUMPLIENDO el plan deja el replan de las semanas siguientes ~igual", () => {
    const semanas = semanasActivas(configActivas);
    const baseline = replanSemanalSerie({
      metaAnual: meta,
      realPorSemana: new Map(),
      anio,
      config: configActivas,
    });
    // Cerramos enero con real == plan lineal de cada semana (baseline, que
    // sin cierres coincide con el plan lineal).
    const eneroPlan = new Map<string, number>();
    for (const mk of semanas) {
      if (mesKeyFromDate(parseLocalDateKey(mk)) === `${anio}-01`) {
        eneroPlan.set(mk, baseline.get(mk) ?? 0);
      }
    }
    const replan = replanSemanalSerie({
      metaAnual: meta,
      realPorSemana: eneroPlan,
      mesesCerrados: new Set([`${anio}-01`]),
      anio,
      config: configActivas,
    });
    const semanaMarzo = semanas.find((mk) => mesKeyFromDate(parseLocalDateKey(mk)) === `${anio}-03`)!;
    expect(replan.get(semanaMarzo)!).toBeCloseTo(baseline.get(semanaMarzo)!, 4);
  });
});
