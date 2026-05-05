import { describe, expect, it } from "vitest";
import {
  distribucionTrimestralEfectiva,
  metaParaNodoEnPeriodo,
} from "./arbol-tiempo";
import type { NodoArbol } from "./types";

/**
 * Regresión del bug "Aulas Plan: 0 €":
 *
 * Cuando un nodo del árbol acaba con `metaPorTrimestre = {Q1:0, Q2:0,
 * Q3:0, Q4:0}` (residuo posible tras reescalados, importaciones legacy
 * o edición parcial), la distribución trimestral ganaba sobre el
 * `metaValor` y devolvía un plan = 0 en cada periodo. Verificamos que
 * la función ahora descarta esa distribución vacía y vuelve al cálculo
 * derivado de `metaValor`.
 */

function nodo(metaValor: number | undefined, metaPorTrimestre?: Partial<Record<"Q1" | "Q2" | "Q3" | "Q4", number | undefined>>): NodoArbol {
  return {
    id: "h1",
    anio: 2026,
    orden: 0,
    nombre: "PSI Miedo",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor,
    metaPorTrimestre: metaPorTrimestre as NodoArbol["metaPorTrimestre"],
    parentId: "rama1",
    creado: "2026-01-01T00:00:00.000Z",
  };
}

describe("distribucionTrimestralEfectiva", () => {
  it("descarta `metaPorTrimestre` cuando todos los trimestres están definidos a 0", () => {
    const n = nodo(9029.45, { Q1: 0, Q2: 0, Q3: 0, Q4: 0 });
    expect(distribucionTrimestralEfectiva(n, 2026, undefined)).toBeNull();
  });

  it("respeta `metaPorTrimestre` cuando al menos un trimestre tiene valor positivo", () => {
    const n = nodo(10_000, { Q1: 10_000, Q2: 0, Q3: 0, Q4: 0 });
    const dist = distribucionTrimestralEfectiva(n, 2026, undefined);
    expect(dist).not.toBeNull();
    expect(dist!.Q1).toBe(10_000);
    expect(dist!.Q2).toBe(0);
    expect(dist!.Q3).toBe(0);
    expect(dist!.Q4).toBe(0);
  });

  it("prorratea el residuo cuando hay trimestres parcialmente definidos", () => {
    const n = nodo(12_000, { Q1: 3_000 });
    const dist = distribucionTrimestralEfectiva(n, 2026, undefined);
    expect(dist).not.toBeNull();
    expect(dist!.Q1).toBe(3_000);
    const restoSum = dist!.Q2 + dist!.Q3 + dist!.Q4;
    expect(Math.round(restoSum)).toBe(9_000);
  });

  it("devuelve null si no hay `metaPorTrimestre`", () => {
    const n = nodo(9_000, undefined);
    expect(distribucionTrimestralEfectiva(n, 2026, undefined)).toBeNull();
  });
});

describe("metaParaNodoEnPeriodo con metaPorTrimestre todo a cero", () => {
  it("plan anual deriva de metaValor cuando metaPorTrimestre está todo a 0", () => {
    const n = nodo(9029.45, { Q1: 0, Q2: 0, Q3: 0, Q4: 0 });
    const planAnual = metaParaNodoEnPeriodo(n, "anio", "2026", 2026, undefined);
    expect(planAnual).toBeCloseTo(9029.45, 2);
  });

  it("plan mensual reparte por días laborables cuando metaPorTrimestre está todo a 0", () => {
    const n = nodo(9_000, { Q1: 0, Q2: 0, Q3: 0, Q4: 0 });
    let suma = 0;
    for (let m = 1; m <= 12; m++) {
      const mk = `2026-${String(m).padStart(2, "0")}`;
      const v = metaParaNodoEnPeriodo(n, "mes", mk, 2026, undefined);
      if (v !== undefined) suma += v;
    }
    expect(Math.round(suma)).toBe(9_000);
  });

  it("plan trimestral cuadra con la suma de meses cuando metaPorTrimestre está todo a 0", () => {
    const n = nodo(9_000, { Q1: 0, Q2: 0, Q3: 0, Q4: 0 });
    const q1 = metaParaNodoEnPeriodo(n, "trimestre", "2026-Q1", 2026, undefined) ?? 0;
    let mesesQ1 = 0;
    for (const mk of ["2026-01", "2026-02", "2026-03"]) {
      mesesQ1 += metaParaNodoEnPeriodo(n, "mes", mk, 2026, undefined) ?? 0;
    }
    expect(Math.round(q1)).toBe(Math.round(mesesQ1));
  });
});
