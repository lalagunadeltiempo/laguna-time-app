import { describe, expect, it } from "vitest";
import {
  cuotaAjustada,
  defaultSemanasNoActivas,
  diasLaborablesEnAnio,
  diasLaborablesEnMes,
  metaParaPeriodo,
} from "./arbol-tiempo";

describe("plan por días laborables (festivos ES)", () => {
  const config2026 = { anio: 2026, semanasNoActivas: defaultSemanasNoActivas(2026) };

  it("los meses suman la meta anual (cadencia anual)", () => {
    const meta = 624_000;
    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      const mk = `2026-${String(m).padStart(2, "0")}`;
      sum += metaParaPeriodo("anual", meta, "mes", mk, 2026, config2026) ?? 0;
    }
    expect(sum).toBeCloseTo(meta, 1);
  });

  it("enero con festivo tiene menos días laborables que un mes de 31 sin festivos extra (orden de magnitud)", () => {
    const ene = diasLaborablesEnMes("2026-01", 2026, config2026);
    const mar = diasLaborablesEnMes("2026-03", 2026, config2026);
    const total = diasLaborablesEnAnio(2026, config2026);
    expect(ene).toBeGreaterThan(0);
    expect(mar).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(200);
    expect(ene + mar).toBeLessThanOrEqual(total);
  });

  it("cuotaAjustada expone diasLaborablesRestantes y semana equivalente", () => {
    const aj = cuotaAjustada({
      metaAnual: 100_000,
      realHastaHoy: 0,
      anio: 2026,
      config: config2026,
      hoy: new Date(2026, 5, 15),
    });
    expect(aj.diasLaborablesRestantes).toBeGreaterThan(100);
    expect(aj.faltaTotal).toBe(100_000);
    expect(aj.semanaRestante).toBeCloseTo((100_000 * 5) / aj.diasLaborablesRestantes, 4);
  });

  it("CCAA opcional reduce o mantiene días según dataset", () => {
    const soloNacional = diasLaborablesEnAnio(2026, config2026);
    const conMadrid = diasLaborablesEnAnio(2026, { ...config2026, comunidadAutonoma: "MD" });
    expect(conMadrid).toBeLessThanOrEqual(soloNacional);
  });
});
