import { describe, expect, it } from "vitest";
import { anioEstaCerrado, mesesCalendarioAnio, porcentajeDeTotal } from "./arbol-tiempo";
import type { PlanArbolConfigAnio } from "./types";

describe("anioEstaCerrado", () => {
  const hoyJun2026 = new Date(2026, 5, 2);

  it("año pasado en calendario → cerrado", () => {
    expect(anioEstaCerrado(undefined, 2025, hoyJun2026)).toBe(true);
  });

  it("año futuro → no cerrado", () => {
    expect(anioEstaCerrado(undefined, 2027, hoyJun2026)).toBe(false);
  });

  it("año actual sin 12 meses cerrados → no cerrado", () => {
    const config: PlanArbolConfigAnio = {
      anio: 2026,
      mesesCerradosTs: {
        "2026-01": "2026-02-01T00:00:00.000Z",
        "2026-02": "2026-03-01T00:00:00.000Z",
        "2026-03": "2026-04-01T00:00:00.000Z",
      },
    };
    expect(anioEstaCerrado(config, 2026, hoyJun2026)).toBe(false);
  });

  it("año actual con los 12 meses cerrados → cerrado (cierre anticipado)", () => {
    const mesesCerradosTs: Record<string, string> = {};
    for (const mk of mesesCalendarioAnio(2026)) {
      mesesCerradosTs[mk] = "2026-12-31T00:00:00.000Z";
    }
    const config: PlanArbolConfigAnio = { anio: 2026, mesesCerradosTs };
    expect(anioEstaCerrado(config, 2026, hoyJun2026)).toBe(true);
  });
});

describe("porcentajeDeTotal", () => {
  it("calcula el % cuando el total es positivo", () => {
    expect(porcentajeDeTotal(25, 100)).toBe(25);
    expect(porcentajeDeTotal(53_865, 472_418)).toBeCloseTo((53_865 / 472_418) * 100, 5);
  });

  it("devuelve undefined si el total es 0 o no finito", () => {
    expect(porcentajeDeTotal(10, 0)).toBeUndefined();
    expect(porcentajeDeTotal(Number.NaN, 100)).toBeUndefined();
  });
});
