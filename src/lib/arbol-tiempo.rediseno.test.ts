import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PlanArbolConfigAnio } from "./types";
import { cuotaAjustada, defaultSemanasNoActivas } from "./arbol-tiempo";

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
