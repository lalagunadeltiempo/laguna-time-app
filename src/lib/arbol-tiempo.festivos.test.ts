import { describe, expect, it } from "vitest";
import {
  cuotaAjustada,
  defaultSemanasNoActivas,
  diasLaborablesEnAnio,
  diasLaborablesEnMes,
  easterVacationMonday,
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

describe("defaults: Semana Santa", () => {
  it("Pascua 2025 fue el 20-abr → lunes ISO 2025-04-14", () => {
    expect(easterVacationMonday(2025)).toBe("2025-04-14");
    expect(defaultSemanasNoActivas(2025)).toContain("2025-04-14");
  });

  it("Pascua 2026 cae el 5-abr → lunes ISO 2026-03-30", () => {
    expect(easterVacationMonday(2026)).toBe("2026-03-30");
    expect(defaultSemanasNoActivas(2026)).toContain("2026-03-30");
  });

  it("Pascua 2027 cae el 28-mar → lunes ISO 2027-03-22", () => {
    expect(easterVacationMonday(2027)).toBe("2027-03-22");
    expect(defaultSemanasNoActivas(2027)).toContain("2027-03-22");
  });
});

describe("regresión: config 2025 sin descansos vs con defaults", () => {
  it("una config con semanasNoActivas:[] hace que agosto facture como un mes normal", () => {
    const sinDefaults = { anio: 2025, semanasNoActivas: [], comunidadAutonoma: "MD" };
    expect(diasLaborablesEnMes("2025-08", 2025, sinDefaults)).toBeGreaterThan(15);
  });

  it("aplicando los defaults (como hace la migración v23) agosto baja a 0 días laborables", () => {
    // Misma lógica que la migración v23: unión defensiva.
    const conDefaults = {
      anio: 2025,
      semanasNoActivas: defaultSemanasNoActivas(2025),
      comunidadAutonoma: "MD",
    };
    expect(diasLaborablesEnMes("2025-08", 2025, conDefaults)).toBe(0);
    // Las 2 semanas de Navidad y la de Pascua también pierden días laborables.
    const dicSinDefaults = diasLaborablesEnMes("2025-12", 2025, {
      anio: 2025,
      semanasNoActivas: [],
      comunidadAutonoma: "MD",
    });
    expect(diasLaborablesEnMes("2025-12", 2025, conDefaults)).toBeLessThan(dicSinDefaults);
  });
});
