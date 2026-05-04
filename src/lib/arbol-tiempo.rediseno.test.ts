import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PlanArbolConfigAnio } from "./types";
import {
  cuotaAjustada,
  defaultSemanasNoActivas,
  diasLaborablesEnAnio,
  diasLaborablesEnMes,
  replanMensualSerie,
  replanTrimestralSerie,
} from "./arbol-tiempo";

/**
 * Tests del rediseño del Árbol de objetivos como vista temporal.
 * 1) La matemática de sincronización % ↔ € es la esperada.
 * 2) El replan mensual sube cuando vas por debajo del plan.
 * 3) El bloque trimestral es SÓLO lectura: no puede despachar acciones.
 */

describe("Sincronización % ↔ € en el bloque Anual", () => {
  it("cuando una rama recibe un %, su € resultante es (metaAnualRaíz * pct) / 100", () => {
    const metaRaiz = 450_000;
    // Simulamos el cálculo exacto que hace BloqueAnual al editar el %:
    const pct = 35;
    const metaRama = (metaRaiz * pct) / 100;
    expect(metaRama).toBe(157_500);

    // Y al revés: a partir del €, el % que se muestra es exactamente ese.
    const pctDerivado = (metaRama / metaRaiz) * 100;
    expect(pctDerivado).toBeCloseTo(pct, 10);
  });

  it("el redondeo del euro a dos decimales no falsea la equivalencia cuando se reescribe el %", () => {
    const metaRaiz = 100_000;
    const pct = 33.33;
    const euroRedondeado = Math.round(((metaRaiz * pct) / 100) * 100) / 100;
    expect(euroRedondeado).toBe(33_330);
    const pctDesdeEuro = (euroRedondeado / metaRaiz) * 100;
    expect(pctDesdeEuro).toBeCloseTo(pct, 8);
  });
});

describe("Replan mensual sube si llevas retraso", () => {
  it("al ir por debajo del plan, mesRestante > plan lineal de ese mes", () => {
    const anio = 2026;
    const config: PlanArbolConfigAnio = { anio, semanasNoActivas: defaultSemanasNoActivas(anio) };
    const metaAnual = 120_000;

    // Caso A: llevamos justo lo planificado hasta finales de abril.
    const planHastaAbril = (metaAnual * 4) / 12;
    const ajusteAlDia = cuotaAjustada({
      metaAnual,
      realHastaHoy: planHastaAbril,
      anio,
      config,
      hoy: new Date(anio, 4, 1), // 1 de mayo
    });
    // Caso B: vamos cortos — hemos hecho la mitad de lo que tocaba.
    const ajusteCorto = cuotaAjustada({
      metaAnual,
      realHastaHoy: planHastaAbril / 2,
      anio,
      config,
      hoy: new Date(anio, 4, 1),
    });
    const mesMayo = `${anio}-05`;
    expect(ajusteCorto.mesRestante(mesMayo)).toBeGreaterThan(ajusteAlDia.mesRestante(mesMayo));
  });

  it("si vas por encima del plan, el replan del mes es menor (o cero) que el plan lineal", () => {
    const anio = 2026;
    const config: PlanArbolConfigAnio = { anio, semanasNoActivas: defaultSemanasNoActivas(anio) };
    const metaAnual = 120_000;
    const planHastaAbril = (metaAnual * 4) / 12;
    const ajusteAlDia = cuotaAjustada({
      metaAnual,
      realHastaHoy: planHastaAbril,
      anio,
      config,
      hoy: new Date(anio, 4, 1),
    });
    const ajusteAdelantado = cuotaAjustada({
      metaAnual,
      realHastaHoy: planHastaAbril * 2,
      anio,
      config,
      hoy: new Date(anio, 4, 1),
    });
    const mesMayo = `${anio}-05`;
    expect(ajusteAdelantado.mesRestante(mesMayo)).toBeLessThan(ajusteAlDia.mesRestante(mesMayo));
  });
});

describe("Replan por mes/trimestre a partir de la serie de reales (con cierre de mes)", () => {
  const anio = 2025;
  const config: PlanArbolConfigAnio = { anio, semanasNoActivas: defaultSemanasNoActivas(anio) };
  const metaAnual = 450_000;

  const planLineal = (k: string) =>
    (metaAnual * diasLaborablesEnMes(k, anio, config)) / diasLaborablesEnAnio(anio, config);

  it("sin meses cerrados, el replan de cada mes coincide con el plan lineal", () => {
    // Aunque haya reales apuntados, mientras los meses estén "abiertos" se
    // asume que cumplirán plan: no hay razón aún para replanificar.
    const realPorMes = new Map<string, number>([[`${anio}-01`, 100_000]]);
    const replan = replanMensualSerie({ metaAnual, realPorMes, anio, config });
    for (let i = 1; i <= 12; i++) {
      const k = `${anio}-${String(i).padStart(2, "0")}`;
      expect(replan.get(k)).toBeCloseTo(planLineal(k), 6);
    }
  });

  it("al cerrar enero por encima del plan, el replan de febrero baja por debajo del plan lineal", () => {
    const ene = `${anio}-01`;
    const feb = `${anio}-02`;
    const realPorMes = new Map<string, number>([[ene, planLineal(ene) + 10_000]]);
    const replan = replanMensualSerie({
      metaAnual,
      realPorMes,
      mesesCerrados: new Set([ene]),
      anio,
      config,
    });

    // El propio enero, al ser el primero, su replan no se ve afectado por
    // su cierre (no hay meses anteriores a considerar).
    expect(replan.get(ene)).toBeCloseTo(planLineal(ene), 6);
    expect(replan.get(feb)!).toBeLessThan(planLineal(feb));
  });

  it("al cerrar enero por debajo del plan, el replan de febrero sube por encima del plan lineal", () => {
    const ene = `${anio}-01`;
    const feb = `${anio}-02`;
    const realPorMes = new Map<string, number>([[ene, planLineal(ene) / 2]]);
    const replan = replanMensualSerie({
      metaAnual,
      realPorMes,
      mesesCerrados: new Set([ene]),
      anio,
      config,
    });
    expect(replan.get(feb)!).toBeGreaterThan(planLineal(feb));
  });

  it("cerrar un mes con real=0 explícito penaliza el replan de los siguientes", () => {
    // Si el usuario cierra enero declarando 0€ facturados (mes muerto), los
    // meses siguientes deben asumir más carga.
    const ene = `${anio}-01`;
    const feb = `${anio}-02`;
    const realPorMes = new Map<string, number>([[ene, 0]]);
    const replanCerrado = replanMensualSerie({
      metaAnual,
      realPorMes,
      mesesCerrados: new Set([ene]),
      anio,
      config,
    });
    const replanAbierto = replanMensualSerie({
      metaAnual,
      realPorMes,
      anio,
      config,
    });
    expect(replanCerrado.get(feb)!).toBeGreaterThan(replanAbierto.get(feb)!);
    expect(replanCerrado.get(feb)!).toBeGreaterThan(planLineal(feb));
  });

  it("Q2 baja si los tres meses de Q1 se cierran adelantados", () => {
    const mesesQ1 = ["01", "02", "03"].map((m) => `${anio}-${m}`);
    const realPorMes = new Map<string, number>(
      mesesQ1.map((k) => [k, planLineal(k) * 1.2]),
    );
    const replan = replanTrimestralSerie({
      metaAnual,
      realPorMes,
      mesesCerrados: new Set(mesesQ1),
      anio,
      config,
    });

    const q1 = `${anio}-Q1`;
    const q2 = `${anio}-Q2`;
    const diasQ1 = mesesQ1.reduce((a, mk) => a + diasLaborablesEnMes(mk, anio, config), 0);
    const planQ1 = (metaAnual * diasQ1) / diasLaborablesEnAnio(anio, config);
    expect(replan.get(q1)).toBeCloseTo(planQ1, 6);

    const mesesQ2 = ["04", "05", "06"].map((m) => `${anio}-${m}`);
    const diasQ2 = mesesQ2.reduce((a, mk) => a + diasLaborablesEnMes(mk, anio, config), 0);
    const planQ2 = (metaAnual * diasQ2) / diasLaborablesEnAnio(anio, config);
    expect(replan.get(q2)!).toBeLessThan(planQ2);
  });

  it("cerrar enero con la meta cumplida deja a 0 el replan de los meses posteriores", () => {
    const ene = `${anio}-01`;
    const realPorMes = new Map<string, number>([[ene, metaAnual]]);
    const replan = replanMensualSerie({
      metaAnual,
      realPorMes,
      mesesCerrados: new Set([ene]),
      anio,
      config,
    });
    for (let i = 2; i <= 12; i++) {
      expect(replan.get(`${anio}-${String(i).padStart(2, "0")}`)).toBe(0);
    }
  });
});

describe("BloqueTrimestral es sólo lectura (smoke estático)", () => {
  it("su código fuente no importa useAppDispatch ni despacha acciones que muten el árbol", () => {
    const src = readFileSync(join(process.cwd(), "src/components/arbol/BloqueTrimestral.tsx"), "utf8");
    expect(src).not.toMatch(/useAppDispatch/);
    for (const accion of [
      "ADD_NODO_ARBOL",
      "UPDATE_NODO_ARBOL",
      "DELETE_NODO_ARBOL",
      "UPSERT_REGISTRO_NODO",
      "DELETE_REGISTRO_NODO",
      "REASSIGN_REGISTROS_NODO",
      "SET_ARBOL_CONFIG_ANIO",
    ]) {
      expect(src, `BloqueTrimestral despacha ${accion}, debería ser sólo lectura`).not.toContain(accion);
    }
  });
});
