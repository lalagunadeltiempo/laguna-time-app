import { describe, expect, it } from "vitest";
import {
  defaultSemanasNoActivas,
  diasLaborablesEnMes,
  metaParaPeriodo,
  replanMensualSerie,
} from "./arbol-tiempo";
import type { PlanArbolConfigAnio } from "./types";

describe("piso mensual: cuadre y semántica", () => {
  const anio = 2026;
  // Config con descansos por defecto: agosto entero queda con 0 días
  // laborables (las 5 semanas de agosto están en `semanasNoActivas`).
  const config: PlanArbolConfigAnio = {
    anio,
    semanasNoActivas: defaultSemanasNoActivas(anio),
    pisoMensual: { [`${anio}-08`]: 10000 },
  };
  const meta = 450_000;

  it("agosto sin laborables y con piso 10.000 devuelve 10.000", () => {
    expect(diasLaborablesEnMes(`${anio}-08`, anio, config)).toBe(0);
    const planAgosto = metaParaPeriodo("anual", meta, "mes", `${anio}-08`, anio, config);
    expect(planAgosto).toBeCloseTo(10_000, 6);
  });

  it("la suma mensual cuadra con la meta anual", () => {
    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      const mk = `${anio}-${String(m).padStart(2, "0")}`;
      sum += metaParaPeriodo("anual", meta, "mes", mk, anio, config) ?? 0;
    }
    expect(sum).toBeCloseTo(meta, 1);
  });

  it("los meses sin piso reparten la meta restante (440.000) entre sus laborables", () => {
    const enero = metaParaPeriodo("anual", meta, "mes", `${anio}-01`, anio, config) ?? 0;
    const diasEnero = diasLaborablesEnMes(`${anio}-01`, anio, config);
    let diasRestantes = 0;
    for (let m = 1; m <= 12; m++) {
      const mk = `${anio}-${String(m).padStart(2, "0")}`;
      if (mk === `${anio}-08`) continue;
      diasRestantes += diasLaborablesEnMes(mk, anio, config);
    }
    const esperado = (440_000 * diasEnero) / diasRestantes;
    expect(enero).toBeCloseTo(esperado, 4);
  });

  it("replan mensual con agosto cerrado respeta el piso (replan agosto = 10.000)", () => {
    const realPorMes = new Map<string, number>([[`${anio}-08`, 10_000]]);
    const replan = replanMensualSerie({
      metaAnual: meta,
      realPorMes,
      mesesCerrados: new Set([`${anio}-08`]),
      anio,
      config,
    });
    expect(replan.get(`${anio}-08`)).toBeCloseTo(10_000, 6);
  });

  it("replan mensual con agosto abierto sigue respetando el piso como compromiso fijo", () => {
    const replan = replanMensualSerie({
      metaAnual: meta,
      realPorMes: new Map(),
      anio,
      config,
    });
    expect(replan.get(`${anio}-08`)).toBeCloseTo(10_000, 6);
  });

  it("si los pisos exceden la meta anual, el plan total se clampa a la meta", () => {
    const cfgGrande: PlanArbolConfigAnio = {
      anio,
      semanasNoActivas: defaultSemanasNoActivas(anio),
      pisoMensual: { [`${anio}-08`]: 600_000 },
    };
    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      const mk = `${anio}-${String(m).padStart(2, "0")}`;
      sum += metaParaPeriodo("anual", 450_000, "mes", mk, anio, cfgGrande) ?? 0;
    }
    expect(sum).toBeCloseTo(450_000, 1);
  });
});
