import { describe, expect, it } from "vitest";
import {
  buildArbolIndices,
  defaultSemanasNoActivas,
  metaParaNodoEnPeriodo,
  planAgregadoEnPeriodoIdx,
} from "./arbol-tiempo";
import type { NodoArbol, PlanArbolConfigAnio, TrimestreKey } from "./types";

const ANIO = 2026;

function nodo(
  id: string,
  parentId: string | undefined,
  metaValor: number,
  relacionConPadre: NodoArbol["relacionConPadre"],
  trimestresPlan?: TrimestreKey[],
): NodoArbol {
  return {
    id,
    anio: ANIO,
    parentId,
    orden: 0,
    nombre: id,
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre,
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor,
    trimestresPlan,
    creado: "2026-01-01T00:00:00.000Z",
  };
}

// Reproduce la config real de la usuaria: piso de 10.000 € en agosto
// declarado a nivel del TOTAL (raíz = 614.000 €). Agosto queda sin días
// laborables (descanso completo) por defaultSemanasNoActivas.
const config: PlanArbolConfigAnio = {
  anio: ANIO,
  semanasNoActivas: defaultSemanasNoActivas(ANIO),
  pisoMensual: { [`${ANIO}-08`]: 10000 },
};

const ROOT_META = 614_000;
const HOJA_AULA = 4_605;
const N_AULAS = 20;
const META_AULAS = HOJA_AULA * N_AULAS; // 92.100

// Hoja "Resto" que completa las hojas hasta cuadrar con la raíz, para poder
// comprobar que la suma de TODAS las hojas en agosto reconstituye el piso.
const META_RESTO = ROOT_META - META_AULAS; // 521.900

function arbolAulas(): { nodos: NodoArbol[]; idx: ReturnType<typeof buildArbolIndices> } {
  const raiz = nodo("raiz", undefined, ROOT_META, "explica");
  const aulas = nodo("aulas", "raiz", META_AULAS, "suma");
  const resto = nodo("resto", "raiz", META_RESTO, "suma");
  const hojasAulas: NodoArbol[] = [];
  for (let i = 0; i < N_AULAS; i++) {
    hojasAulas.push(nodo(`aula-${i}`, "aulas", HOJA_AULA, "suma"));
  }
  const nodos = [raiz, aulas, resto, ...hojasAulas];
  const idx = buildArbolIndices([], nodos, ANIO);
  return { nodos, idx };
}

describe("piso mensual proporcional por nodo", () => {
  it("Aulas reparte plan en Q1 y Q2 (ya no cae entero en Q3)", () => {
    const { idx } = arbolAulas();
    const aulas = idx.nodosById.get("aulas")!;
    const q1 = planAgregadoEnPeriodoIdx(idx, aulas, "trimestre", `${ANIO}-Q1`, config) ?? 0;
    const q2 = planAgregadoEnPeriodoIdx(idx, aulas, "trimestre", `${ANIO}-Q2`, config) ?? 0;
    const q3 = planAgregadoEnPeriodoIdx(idx, aulas, "trimestre", `${ANIO}-Q3`, config) ?? 0;
    expect(q1).toBeGreaterThan(0);
    expect(q2).toBeGreaterThan(0);
    // Y Q3 ya no concentra el total de Aulas.
    expect(q3).toBeLessThan(META_AULAS * 0.9);
  });

  it("el plan anual de Aulas cuadra con metaValor (~92.100)", () => {
    const { idx } = arbolAulas();
    const aulas = idx.nodosById.get("aulas")!;
    let sumaQ = 0;
    for (const q of ["Q1", "Q2", "Q3", "Q4"] as TrimestreKey[]) {
      sumaQ += planAgregadoEnPeriodoIdx(idx, aulas, "trimestre", `${ANIO}-${q}`, config) ?? 0;
    }
    expect(sumaQ).toBeCloseTo(META_AULAS, 0);
  });

  it("la suma de TODAS las hojas en agosto reconstituye el piso global (~10.000)", () => {
    const { idx } = arbolAulas();
    let sumaAgosto = 0;
    for (const n of idx.nodosById.values()) {
      // Solo hojas (sin hijos suma).
      const tieneHijos = (idx.nodosPorParent.get(n.id) ?? []).some(
        (h) => h.relacionConPadre === "suma",
      );
      if (tieneHijos) continue;
      if (n.relacionConPadre !== "suma") continue; // excluye la raíz "explica"
      sumaAgosto += metaParaNodoEnPeriodo(n, "mes", `${ANIO}-08`, ANIO, config, idx) ?? 0;
    }
    expect(sumaAgosto).toBeCloseTo(10_000, 0);
  });

  it("ninguna hoja pequeña de Aulas se traga el piso entero en agosto", () => {
    const { idx } = arbolAulas();
    const aula0 = idx.nodosById.get("aula-0")!;
    const agosto = metaParaNodoEnPeriodo(aula0, "mes", `${ANIO}-08`, ANIO, config, idx) ?? 0;
    // pisoScale ≈ 4605/614000 ≈ 0.0075 → pisoAgosto ≈ 75 €, muy lejos de 10.000.
    expect(agosto).toBeGreaterThan(0);
    expect(agosto).toBeLessThan(HOJA_AULA * 0.5);
  });

  it("una hoja con trimestresPlan ['Q1'] sigue yendo entera a Q1 (el piso no la afecta)", () => {
    const raiz = nodo("raiz", undefined, ROOT_META, "explica");
    const hoja = nodo("hojaQ1", "raiz", HOJA_AULA, "suma", ["Q1"]);
    const idx = buildArbolIndices([], [raiz, hoja], ANIO);
    const q1 = metaParaNodoEnPeriodo(hoja, "trimestre", `${ANIO}-Q1`, ANIO, config, idx) ?? 0;
    const q3 = metaParaNodoEnPeriodo(hoja, "trimestre", `${ANIO}-Q3`, ANIO, config, idx) ?? 0;
    const agosto = metaParaNodoEnPeriodo(hoja, "mes", `${ANIO}-08`, ANIO, config, idx) ?? 0;
    expect(q1).toBeCloseTo(HOJA_AULA, 2);
    expect(q3).toBe(0);
    expect(agosto).toBe(0);
  });
});
