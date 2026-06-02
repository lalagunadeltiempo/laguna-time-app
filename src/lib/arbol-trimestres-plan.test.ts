import { describe, expect, it } from "vitest";
import {
  buildArbolIndices,
  distribucionDesdeTrimestresPlan,
  metaParaNodoEnPeriodo,
  planAgregadoEnPeriodo,
  sanitizarTrimestresPlan,
} from "./arbol-tiempo";
import type { NodoArbol, TrimestreKey } from "./types";

function hoja(
  id: string,
  parentId: string,
  metaValor: number,
  trimestresPlan?: TrimestreKey[],
  metaPorTrimestre?: Partial<Record<TrimestreKey, number>>,
): NodoArbol {
  return {
    id,
    anio: 2026,
    parentId,
    orden: 0,
    nombre: id,
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor,
    trimestresPlan,
    metaPorTrimestre,
    creado: "2026-01-01T00:00:00.000Z",
  };
}

const rama = hoja("rama", "raiz", 10_000);
const raiz: NodoArbol = {
  ...rama,
  id: "raiz",
  parentId: undefined,
  metaValor: 10_000,
  relacionConPadre: "explica",
};

describe("sanitizarTrimestresPlan", () => {
  it("filtra claves inválidas y deduplica", () => {
    expect(sanitizarTrimestresPlan(["Q2", "Q1", "Q2", "foo"])).toEqual(["Q1", "Q2"]);
  });
  it("devuelve undefined para array vacío", () => {
    expect(sanitizarTrimestresPlan([])).toBeUndefined();
  });
});

describe("distribucionDesdeTrimestresPlan", () => {
  it("concentra el importe en un solo trimestre", () => {
    const n = hoja("h1", "rama", 4605, ["Q2"]);
    const dist = distribucionDesdeTrimestresPlan(n, 2026, undefined);
    expect(dist).not.toBeNull();
    expect(dist!.Q2).toBeCloseTo(4605, 2);
    expect(dist!.Q1 + dist!.Q3 + dist!.Q4).toBe(0);
  });

  it("reparte entre dos trimestres por días laborables", () => {
    const n = hoja("h1", "rama", 12_000, ["Q1", "Q2"]);
    const dist = distribucionDesdeTrimestresPlan(n, 2026, undefined);
    expect(dist).not.toBeNull();
    expect(dist!.Q1 + dist!.Q2).toBeCloseTo(12_000, 0);
    expect(dist!.Q3 + dist!.Q4).toBe(0);
  });

  it("ignora cuando hay 4 trimestres (repartido)", () => {
    const n = hoja("h1", "rama", 1000, ["Q1", "Q2", "Q3", "Q4"]);
    expect(distribucionDesdeTrimestresPlan(n, 2026, undefined)).toBeNull();
  });
});

describe("metaParaNodoEnPeriodo con trimestresPlan", () => {
  it("tiene precedencia sobre metaPorTrimestre legacy", () => {
    const n = hoja("h1", "rama", 9000, ["Q1"], { Q1: 0, Q2: 0 });
    const q1 = metaParaNodoEnPeriodo(n, "trimestre", "2026-Q1", 2026, undefined);
    const q3 = metaParaNodoEnPeriodo(n, "trimestre", "2026-Q3", 2026, undefined);
    expect(q1).toBeCloseTo(9000, 2);
    expect(q3).toBe(0);
  });

  it("plan mensual solo en meses del trimestre asignado", () => {
    const n = hoja("h1", "rama", 9000, ["Q2"]);
    const ene = metaParaNodoEnPeriodo(n, "mes", "2026-01", 2026, undefined);
    const abr = metaParaNodoEnPeriodo(n, "mes", "2026-04", 2026, undefined);
    expect(ene).toBe(0);
    expect(abr).toBeGreaterThan(0);
    let sumaMes = 0;
    for (let m = 1; m <= 12; m++) {
      const mk = `2026-${String(m).padStart(2, "0")}`;
      sumaMes += metaParaNodoEnPeriodo(n, "mes", mk, 2026, undefined) ?? 0;
    }
    expect(sumaMes).toBeCloseTo(9000, 0);
  });

  it("plan trimestral anual cuadra con metaValor", () => {
    const n = hoja("h1", "rama", 4605, ["Q3"]);
    let sumaQ = 0;
    for (const q of ["Q1", "Q2", "Q3", "Q4"] as TrimestreKey[]) {
      sumaQ += metaParaNodoEnPeriodo(n, "trimestre", `2026-${q}`, 2026, undefined) ?? 0;
    }
    expect(sumaQ).toBeCloseTo(4605, 2);
  });
});

describe("metaParaNodoEnPeriodo ignora metaPorTrimestre legacy sin trimestresPlan", () => {
  it("reparte lineal por días laborables aunque metaPorTrimestre concentre en Q3", () => {
    // Residuo legacy típico de Aulas/Máster/Colaboraciones: {Q1:0,Q3:x}.
    // Sin `trimestresPlan`, el "cuándo" no está fijado: debe repartir lineal
    // (Q1 > 0) en lugar de arrastrar la concentración heredada.
    const n = hoja("h1", "rama", 9000, undefined, { Q1: 0, Q2: 0, Q3: 9000 });
    const q1 = metaParaNodoEnPeriodo(n, "trimestre", "2026-Q1", 2026, undefined) ?? 0;
    const q2 = metaParaNodoEnPeriodo(n, "trimestre", "2026-Q2", 2026, undefined) ?? 0;
    expect(q1).toBeGreaterThan(0);
    expect(q2).toBeGreaterThan(0);
    let sumaQ = 0;
    for (const q of ["Q1", "Q2", "Q3", "Q4"] as TrimestreKey[]) {
      sumaQ += metaParaNodoEnPeriodo(n, "trimestre", `2026-${q}`, 2026, undefined) ?? 0;
    }
    expect(sumaQ).toBeCloseTo(9000, 0);
  });

  it("el plan mensual de enero es > 0 con metaPorTrimestre residual {Q1:0}", () => {
    const n = hoja("h1", "rama", 12000, undefined, { Q1: 0, Q2: 0 });
    const ene = metaParaNodoEnPeriodo(n, "mes", "2026-01", 2026, undefined) ?? 0;
    expect(ene).toBeGreaterThan(0);
  });
});

describe("planAgregadoEnPeriodo agrega hojas por trimestre", () => {
  it("rama suma hojas en distintos trimestres", () => {
    const h1 = hoja("h1", "rama", 3000, ["Q1"]);
    const h2 = hoja("h2", "rama", 6000, ["Q2"]);
    const nodos = [raiz, rama, h1, h2];
    const idx = buildArbolIndices([], nodos, 2026);
    const planQ1 = planAgregadoEnPeriodo(rama, nodos, "trimestre", "2026-Q1", 2026, undefined, idx);
    const planQ2 = planAgregadoEnPeriodo(rama, nodos, "trimestre", "2026-Q2", 2026, undefined, idx);
    expect(planQ1).toBeCloseTo(3000, 2);
    expect(planQ2).toBeCloseTo(6000, 2);
  });
});
