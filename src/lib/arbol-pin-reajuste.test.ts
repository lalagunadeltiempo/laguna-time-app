import { describe, expect, it, vi } from "vitest";
import { reajustarHermanosPorPin } from "./arbol-tiempo";
import type { NodoArbol } from "./types";

const TS = "2026-01-01T00:00:00.000Z";

function mkNodo(
  id: string,
  parentId: string,
  metaValor: number,
  metaPctFijo = false,
  orden = 0,
): NodoArbol {
  return {
    id,
    anio: 2026,
    parentId,
    orden,
    nombre: id,
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "suma",
    metaValor,
    metaUnidad: "€",
    metaPctFijo,
    contadorModo: "manual",
    creado: TS,
  };
}

const pct = (metaValor: number, metaPadre: number): number => (metaValor / metaPadre) * 100;

describe("reajustarHermanosPorPin", () => {
  it("4 ramas al 25% + nueva al 10% -> las 4 quedan en 22.5%", () => {
    const metaPadre = 1000;
    const nodos = [
      mkNodo("A", "root", 250, false, 0),
      mkNodo("B", "root", 250, false, 1),
      mkNodo("C", "root", 250, false, 2),
      mkNodo("D", "root", 250, false, 3),
    ];
    const map = reajustarHermanosPorPin({
      nodos,
      parentId: "root",
      cambioId: "E",
      nuevoPctCambio: 10,
      metaPadre,
    });
    expect(map.size).toBe(4);
    for (const id of ["A", "B", "C", "D"]) {
      const next = map.get(id)!;
      expect(next).toBeCloseTo(225, 2);
    }
    const sumPct = [...map.values()].reduce((acc, v) => acc + pct(v, metaPadre), 0);
    expect(sumPct).toBeCloseTo(90, 6);
    expect(sumPct + 10).toBeCloseTo(100, 6);
  });

  it("3 ramas {30,30,40} + nueva al 10% -> resultado suma 90 y snap a .5", () => {
    const metaPadre = 1000;
    const nodos = [
      mkNodo("A", "root", 300, false, 0),
      mkNodo("B", "root", 300, false, 1),
      mkNodo("C", "root", 400, false, 2),
    ];
    const map = reajustarHermanosPorPin({
      nodos,
      parentId: "root",
      cambioId: "E",
      nuevoPctCambio: 10,
      metaPadre,
    });
    expect(map.size).toBeGreaterThan(0);
    const actualById = new Map(nodos.map((n) => [n.id, n.metaValor ?? 0]));
    const pcts = ["A", "B", "C"].map((id) => {
      const meta = map.get(id) ?? actualById.get(id)!;
      return pct(meta, metaPadre);
    });
    const sum = pcts.reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(90, 6);
    for (const v of pcts) {
      expect(Number.isInteger(v * 2)).toBe(true);
    }
    // La mayor original (C=40) no puede subir en un ajuste de recorte.
    expect(pct(map.get("C")!, metaPadre)).toBeLessThanOrEqual(40);
  });

  it("si hay pin al 50%, no se toca y no aparece en el map", () => {
    const metaPadre = 1000;
    const nodos = [
      mkNodo("P", "root", 500, true, 0),
      mkNodo("B", "root", 250, false, 1),
      mkNodo("C", "root", 250, false, 2),
    ];
    const map = reajustarHermanosPorPin({
      nodos,
      parentId: "root",
      cambioId: "E",
      nuevoPctCambio: 10,
      metaPadre,
    });
    expect(map.has("P")).toBe(false);
    expect(map.size).toBe(2);
    const sumNoPin = [...map.values()].reduce((acc, v) => acc + pct(v, metaPadre), 0);
    expect(sumNoPin).toBeCloseTo(40, 6);
  });

  it("si bajas un nodo de 30% a 10%, los hermanos absorben +20%", () => {
    const metaPadre = 1000;
    const nodos = [
      mkNodo("A", "root", 300, false, 0),
      mkNodo("B", "root", 300, false, 1),
      mkNodo("C", "root", 400, false, 2),
    ];
    const map = reajustarHermanosPorPin({
      nodos,
      parentId: "root",
      cambioId: "A",
      nuevoPctCambio: 10,
      metaPadre,
    });
    expect(map.size).toBe(2);
    const pB = pct(map.get("B")!, metaPadre);
    const pC = pct(map.get("C")!, metaPadre);
    expect(pB + pC).toBeCloseTo(90, 6);
    expect(Number.isInteger(pB * 2)).toBe(true);
    expect(Number.isInteger(pC * 2)).toBe(true);
  });

  it("si todas están pinadas, devuelve vacío y hace warn", () => {
    const metaPadre = 1000;
    const nodos = [
      mkNodo("A", "root", 300, true, 0),
      mkNodo("B", "root", 300, true, 1),
      mkNodo("C", "root", 400, true, 2),
    ];
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const map = reajustarHermanosPorPin({
      nodos,
      parentId: "root",
      cambioId: "E",
      nuevoPctCambio: 10,
      metaPadre,
    });
    expect(map.size).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("borrado: {25,25,25} absorbe hasta 100 con snap a .5", () => {
    const metaPadre = 1000;
    const nodosSinEliminado = [
      mkNodo("B", "root", 250, false, 1),
      mkNodo("C", "root", 250, false, 2),
      mkNodo("D", "root", 250, false, 3),
    ];
    const map = reajustarHermanosPorPin({
      nodos: nodosSinEliminado,
      parentId: "root",
      cambioId: "A",
      nuevoPctCambio: 0,
      metaPadre,
    });
    expect(map.size).toBe(3);
    const pcts = ["B", "C", "D"].map((id) => pct(map.get(id)!, metaPadre));
    const sum = pcts.reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(100, 6);
    for (const v of pcts) {
      expect(Number.isInteger(v * 2)).toBe(true);
    }
  });

  it("edge: nuevoPctCambio=0 y suma actual=0 -> no toca nada", () => {
    const map = reajustarHermanosPorPin({
      nodos: [
        mkNodo("A", "root", 0, false, 0),
        mkNodo("B", "root", 0, false, 1),
      ],
      parentId: "root",
      cambioId: "X",
      nuevoPctCambio: 0,
      metaPadre: 1000,
    });
    expect(map.size).toBe(0);
  });
});
