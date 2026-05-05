/**
 * Tests de estrés de los caminos calientes del Árbol de objetivos.
 *
 * Generamos un estado denso (3 raíces × 6 ramas × 5 hojas = 90 hojas) con
 * registros reales para 52 semanas + 12 meses + 4 trimestres por hoja
 * (~5400 registros) y comprobamos que las funciones que se ejecutan en
 * el render del Árbol terminan en un presupuesto razonable.
 *
 * El umbral está calibrado para entornos de desarrollo modernos; usamos
 * un margen ×3 para evitar flakiness en CI compartido. Si el código
 * regresa a una variante O(N²), estos tests tardarán órdenes de
 * magnitud más y fallarán de forma evidente.
 */
import { describe, expect, it } from "vitest";
import type { NodoArbol, PlanArbolConfigAnio, RegistroNodo } from "./types";
import {
  buildArbolIndices,
  defaultSemanasNoActivas,
  metaEfectivaNodoIdx,
  mondaysInCalendarYear,
  planAgregadoEnPeriodoIdx,
  realEfectivoEnPeriodoIdx,
  replanMensualSerie,
  replanTrimestralSerie,
} from "./arbol-tiempo";

const YEAR = 2026;
// Margen ×4 sobre el presupuesto local para absorber el ruido de CI
// compartidos: en local Apple Silicon medimos ~90 ms; con un núcleo bajo
// presión por otros tests llega a ~170 ms. Si el código regresa a una
// variante O(N²) los tiempos crecerán órdenes de magnitud y este margen
// no salvará el test (que es lo que queremos).
const CI_MARGIN = 4;
const config: PlanArbolConfigAnio = {
  anio: YEAR,
  semanasNoActivas: defaultSemanasNoActivas(YEAR),
};

interface ArbolDenso {
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  raices: NodoArbol[];
  hojas: NodoArbol[];
}

function buildDenso(): ArbolDenso {
  const nodos: NodoArbol[] = [];
  const registros: RegistroNodo[] = [];
  const raices: NodoArbol[] = [];
  const hojas: NodoArbol[] = [];
  const ahora = "2026-01-01T00:00:00.000Z";

  let regSeq = 0;
  for (let r = 0; r < 3; r++) {
    const raiz: NodoArbol = {
      id: `raiz-${r}`,
      anio: YEAR,
      orden: r,
      nombre: `Raíz ${r}`,
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 600_000,
      metaUnidad: "€",
      creado: ahora,
    };
    nodos.push(raiz);
    raices.push(raiz);

    for (let b = 0; b < 6; b++) {
      const ramaId = `r${r}-b${b}`;
      nodos.push({
        id: ramaId,
        anio: YEAR,
        parentId: raiz.id,
        orden: b,
        nombre: `Rama ${r}.${b}`,
        tipo: "palanca",
        cadencia: "anual",
        relacionConPadre: "suma",
        contadorModo: "manual",
        metaValor: 100_000,
        metaUnidad: "€",
        creado: ahora,
      });

      for (let h = 0; h < 5; h++) {
        const hojaId = `r${r}-b${b}-h${h}`;
        const hoja: NodoArbol = {
          id: hojaId,
          anio: YEAR,
          parentId: ramaId,
          orden: h,
          nombre: `Hoja ${r}.${b}.${h}`,
          tipo: "resultado",
          cadencia: "anual",
          relacionConPadre: "suma",
          contadorModo: "manual",
          metaValor: 20_000,
          metaUnidad: "€",
          creado: ahora,
        };
        nodos.push(hoja);
        hojas.push(hoja);

        // 52 semanas + 12 meses + 4 trimestres = 68 registros por hoja.
        for (const monday of mondaysInCalendarYear(YEAR)) {
          regSeq++;
          registros.push({
            id: `reg-${regSeq}`,
            nodoId: hojaId,
            periodoTipo: "semana",
            periodoKey: monday,
            valor: 100,
            creado: ahora,
            actualizado: ahora,
          });
        }
        for (let m = 1; m <= 12; m++) {
          regSeq++;
          registros.push({
            id: `reg-${regSeq}`,
            nodoId: hojaId,
            periodoTipo: "mes",
            periodoKey: `${YEAR}-${String(m).padStart(2, "0")}`,
            valor: 1_000,
            creado: ahora,
            actualizado: ahora,
          });
        }
        for (let q = 1; q <= 4; q++) {
          regSeq++;
          registros.push({
            id: `reg-${regSeq}`,
            nodoId: hojaId,
            periodoTipo: "trimestre",
            periodoKey: `${YEAR}-Q${q}`,
            valor: 5_000,
            creado: ahora,
            actualizado: ahora,
          });
        }
      }
    }
  }

  return { nodos, registros, raices, hojas };
}

describe("Árbol de objetivos: estrés con 90 hojas y miles de registros", () => {
  it("buildArbolIndices + replan mensual/trimestral por raíz corren en presupuesto", () => {
    const denso = buildDenso();
    expect(denso.hojas).toHaveLength(90);
    // 3 raíces + 18 ramas + 90 hojas + (52 + 12 + 4) × 90 registros.
    expect(denso.nodos).toHaveLength(3 + 18 + 90);
    expect(denso.registros.length).toBeGreaterThan(90 * 60);

    const t0 = performance.now();
    const idx = buildArbolIndices(denso.registros, denso.nodos, YEAR);

    for (const raiz of denso.raices) {
      const realPorMes = new Map<string, number>();
      for (let m = 1; m <= 12; m++) {
        const k = `${YEAR}-${String(m).padStart(2, "0")}`;
        realPorMes.set(k, realEfectivoEnPeriodoIdx(idx, raiz.id, "mes", k));
      }
      replanMensualSerie({
        metaAnual: raiz.metaValor ?? 0,
        realPorMes,
        anio: YEAR,
        config,
      });
      replanTrimestralSerie({
        metaAnual: raiz.metaValor ?? 0,
        realPorMes,
        anio: YEAR,
        config,
      });
    }
    const dt = performance.now() - t0;

    // Presupuesto duro: 50 ms en local; ×3 para CI compartido.
    expect(dt).toBeLessThan(50 * CI_MARGIN);
  });

  it("metaEfectivaNodoIdx y planAgregadoEnPeriodoIdx por hoja escalan a 90 hojas", () => {
    const denso = buildDenso();
    const idx = buildArbolIndices(denso.registros, denso.nodos, YEAR);

    const t0 = performance.now();
    let sumMeta = 0;
    let sumPlan = 0;
    for (const hoja of denso.hojas) {
      sumMeta += metaEfectivaNodoIdx(idx, hoja) ?? 0;
      // Plan agregado en cada uno de los 12 meses + cada uno de los 4 trimestres.
      for (let m = 1; m <= 12; m++) {
        const k = `${YEAR}-${String(m).padStart(2, "0")}`;
        sumPlan += planAgregadoEnPeriodoIdx(idx, hoja, "mes", k, config) ?? 0;
      }
      for (let q = 1; q <= 4; q++) {
        sumPlan += planAgregadoEnPeriodoIdx(idx, hoja, "trimestre", `${YEAR}-Q${q}`, config) ?? 0;
      }
    }
    const dt = performance.now() - t0;

    expect(sumMeta).toBeGreaterThan(0);
    expect(sumPlan).toBeGreaterThan(0);
    expect(dt).toBeLessThan(150 * CI_MARGIN);
  });
});
