import { describe, expect, it } from "vitest";
import {
  buildArbolIndices,
  metaParaNodoEnPeriodo,
  planAgregadoEnPeriodoIdx,
} from "./arbol-tiempo";
import type { NodoArbol, PlanArbolConfigAnio, TrimestreKey } from "./types";

/**
 * Regresión e2e del bug "Aulas Plan: 0 € en Mensual" (commit a243c22 + esta tanda).
 *
 * Escenario realista (sacado del estado de la usuaria):
 *  - Raíz "Facturación" 2026 con metaValor 200_000 €.
 *  - Rama "Aulas" con metaValor 92_100 € y `metaPorTrimestre`
 *    residual `{Q1:0, Q2:0, Q3:0, Q4:0}` (heredado de operaciones
 *    antiguas; el reducer `UPDATE_META_NODO_RESCALAR_HIJOS` actualiza
 *    `metaValor` pero NO toca `metaPorTrimestre`).
 *  - 4 hojas con `metaValor` 9029.45 € cada una y el mismo
 *    `metaPorTrimestre` basura.
 *
 * Antes del fix: `planAgregadoEnPeriodoIdx(rama, "mes", "2026-01")`
 * devolvía 0 porque la distribución trimestral residual ganaba sobre
 * el `metaValor` "vivo". Tras el fix, el plan se deriva correctamente
 * de `metaValor` y la suma anual cuadra con 4 × 9029.45 ≈ 36 117.8 €.
 */

const ts = "2026-01-01T00:00:00.000Z";

function mkNodo(p: Omit<NodoArbol, "creado">): NodoArbol {
  return { ...p, creado: ts };
}

function mkRaiz(metaValor: number): NodoArbol {
  return mkNodo({
    id: "raiz",
    anio: 2026,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor,
  });
}

function mkRama(metaValor: number, metaPorTrimestre?: Partial<Record<TrimestreKey, number>>): NodoArbol {
  return mkNodo({
    id: "aulas",
    anio: 2026,
    parentId: "raiz",
    orden: 0,
    nombre: "Aulas",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor,
    metaPorTrimestre,
  });
}

function mkHoja(id: string, metaValor: number, metaPorTrimestre?: Partial<Record<TrimestreKey, number>>): NodoArbol {
  return mkNodo({
    id,
    anio: 2026,
    parentId: "aulas",
    orden: 0,
    nombre: `Aula ${id}`,
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor,
    metaPorTrimestre,
  });
}

const CONFIG: PlanArbolConfigAnio = { anio: 2026 };

describe("Aulas: plan mensual con metaPorTrimestre residual basura", () => {
  const distResidualBasura: Partial<Record<TrimestreKey, number>> = {
    Q1: 0,
    Q2: 0,
    Q3: 0,
    Q4: 0,
  };

  function buildIdx() {
    const raiz = mkRaiz(200_000);
    const aulas = mkRama(92_100, distResidualBasura);
    const hojas = ["h1", "h2", "h3", "h4"].map((id) => mkHoja(id, 9029.45, distResidualBasura));
    const nodos = [raiz, aulas, ...hojas];
    return { idx: buildArbolIndices([], nodos, 2026), raiz, aulas, hojas };
  }

  it("plan agregado de la rama Aulas en enero es > 0 (no devuelve 0 €)", () => {
    const { idx, aulas } = buildIdx();
    const planEnero = planAgregadoEnPeriodoIdx(idx, aulas, "mes", "2026-01", CONFIG);
    expect(planEnero).toBeDefined();
    expect(planEnero!).toBeGreaterThan(0);
  });

  it("la suma de los 12 meses de Aulas ≈ 4 × 9029.45 ≈ 36117.8 €", () => {
    const { idx, aulas } = buildIdx();
    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      const k = `2026-${String(m).padStart(2, "0")}`;
      sum += planAgregadoEnPeriodoIdx(idx, aulas, "mes", k, CONFIG) ?? 0;
    }
    // 4 hojas × 9029.45 = 36117.8 €. Tolerancia 1 € por redondeo de
    // reparto por días laborables.
    expect(Math.abs(sum - 4 * 9029.45)).toBeLessThan(1);
  });

  it("cada hoja también agrega > 0 en enero (la heurística aplica también a hojas)", () => {
    const { hojas } = buildIdx();
    for (const hoja of hojas) {
      const planHojaEnero = metaParaNodoEnPeriodo(hoja, "mes", "2026-01", 2026, CONFIG);
      expect(planHojaEnero).toBeDefined();
      expect(planHojaEnero!).toBeGreaterThan(0);
    }
  });

  it("el plan trimestral de Aulas también es > 0 en Q1 (no descuadra con el mensual)", () => {
    const { idx, aulas } = buildIdx();
    const planQ1 = planAgregadoEnPeriodoIdx(idx, aulas, "trimestre", "2026-Q1", CONFIG);
    let sumMesesQ1 = 0;
    for (const mk of ["2026-01", "2026-02", "2026-03"]) {
      sumMesesQ1 += planAgregadoEnPeriodoIdx(idx, aulas, "mes", mk, CONFIG) ?? 0;
    }
    expect(planQ1).toBeDefined();
    expect(planQ1!).toBeGreaterThan(0);
    // Plan trimestre = suma de los 3 meses (mismo origen: metaValor de
    // las hojas repartido por días laborables).
    expect(Math.abs((planQ1 as number) - sumMesesQ1)).toBeLessThan(0.5);
  });
});
