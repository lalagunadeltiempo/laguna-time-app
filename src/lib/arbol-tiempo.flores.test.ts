import { describe, expect, it } from "vitest";
import type { NodoArbol, PlanArbolConfigAnio, RegistroNodo } from "./types";
import {
  defaultSemanasNoActivas,
  metaEfectivaNodo,
  planAgregadoEnPeriodo,
  realEfectivoEnPeriodo,
} from "./arbol-tiempo";

const year = 2026;
const config: PlanArbolConfigAnio = { anio: year, semanasNoActivas: defaultSemanasNoActivas(year) };

function mkNodo(p: Omit<NodoArbol, "creado">): NodoArbol {
  return { ...p, creado: "2026-01-01T00:00:00.000Z" };
}

function mkReg(p: Omit<RegistroNodo, "creado" | "actualizado">): RegistroNodo {
  const ts = "2026-01-01T00:00:00.000Z";
  return { ...p, creado: ts, actualizado: ts };
}

describe("sub-ramas (flores): meta efectiva y real agregado", () => {
  it("rama hoja: meta efectiva = meta propia; real = registros de ese nodo", () => {
    const raiz = mkNodo({
      id: "root",
      anio: year,
      orden: 0,
      nombre: "Total",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 120_000,
    });
    const rama = mkNodo({
      id: "rama-a",
      anio: year,
      parentId: "root",
      orden: 0,
      nombre: "Aulas",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 40_000,
    });
    const nodos = [raiz, rama];
    expect(metaEfectivaNodo(rama, nodos, year)).toBe(40_000);
    const mesKey = `${year}-01`;
    const plan = planAgregadoEnPeriodo(rama, nodos, "mes", mesKey, year, config);
    expect(plan).toBeDefined();
    const regs: RegistroNodo[] = [mkReg({ id: "r1", nodoId: "rama-a", periodoTipo: "mes", periodoKey: mesKey, valor: 1234 })];
    expect(realEfectivoEnPeriodo(regs, nodos, "rama-a", "mes", mesKey, year)).toBe(1234);
  });

  it("rama con dos flores: meta efectiva y plan de periodo = suma de flores; real = suma de reales", () => {
    const raiz = mkNodo({
      id: "root",
      anio: year,
      orden: 0,
      nombre: "Total",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 100_000,
    });
    const rama = mkNodo({
      id: "rama",
      anio: year,
      parentId: "root",
      orden: 0,
      nombre: "Mix",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 999_999,
    });
    const f1 = mkNodo({
      id: "flor1",
      anio: year,
      parentId: "rama",
      orden: 0,
      nombre: "F1",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 30_000,
    });
    const f2 = mkNodo({
      id: "flor2",
      anio: year,
      parentId: "rama",
      orden: 1,
      nombre: "F2",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 10_000,
    });
    const nodos = [raiz, rama, f1, f2];
    expect(metaEfectivaNodo(rama, nodos, year)).toBe(40_000);

    const mesKey = `${year}-06`;
    const pRama = planAgregadoEnPeriodo(rama, nodos, "mes", mesKey, year, config);
    const p1 = planAgregadoEnPeriodo(f1, nodos, "mes", mesKey, year, config);
    const p2 = planAgregadoEnPeriodo(f2, nodos, "mes", mesKey, year, config);
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(pRama).toBeCloseTo((p1 ?? 0) + (p2 ?? 0), 4);

    const regs: RegistroNodo[] = [
      mkReg({ id: "a", nodoId: "flor1", periodoTipo: "mes", periodoKey: mesKey, valor: 500 }),
      mkReg({ id: "b", nodoId: "flor2", periodoTipo: "mes", periodoKey: mesKey, valor: 250 }),
    ];
    expect(realEfectivoEnPeriodo(regs, nodos, "rama", "mes", mesKey, year)).toBe(750);
  });

  it("rama sin meta ni hijos: plan de mes undefined", () => {
    const raiz = mkNodo({
      id: "root",
      anio: year,
      orden: 0,
      nombre: "Total",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 50_000,
    });
    const rama = mkNodo({
      id: "rama",
      anio: year,
      parentId: "root",
      orden: 0,
      nombre: "Vacía",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
    });
    const nodos = [raiz, rama];
    expect(metaEfectivaNodo(rama, nodos, year)).toBeUndefined();
    const plan = planAgregadoEnPeriodo(rama, nodos, "mes", `${year}-03`, year, config);
    expect(plan).toBeUndefined();
  });

  it("caso Sin asignar: solo registros en la flor alimentan el real agregado de la rama", () => {
    const raiz = mkNodo({
      id: "root",
      anio: year,
      orden: 0,
      nombre: "Total",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 80_000,
    });
    const rama = mkNodo({
      id: "rama",
      anio: year,
      parentId: "root",
      orden: 0,
      nombre: "R",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 20_000,
    });
    const sinAsignar = mkNodo({
      id: "flor-sa",
      anio: year,
      parentId: "rama",
      orden: 0,
      nombre: "Sin asignar",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 20_000,
    });
    const nodos = [raiz, rama, sinAsignar];
    const mesKey = `${year}-02`;
    const regs: RegistroNodo[] = [
      mkReg({ id: "x", nodoId: "flor-sa", periodoTipo: "mes", periodoKey: mesKey, valor: 777 }),
    ];
    expect(realEfectivoEnPeriodo(regs, nodos, "rama", "mes", mesKey, year)).toBe(777);
    expect(realEfectivoEnPeriodo(regs, nodos, "flor-sa", "mes", mesKey, year)).toBe(777);
  });

  it("con flores, registros directos en la rama no suman al real agregado", () => {
    const raiz = mkNodo({
      id: "root",
      anio: year,
      orden: 0,
      nombre: "Total",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 50_000,
    });
    const rama = mkNodo({
      id: "rama",
      anio: year,
      parentId: "root",
      orden: 0,
      nombre: "R",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 10_000,
    });
    const flor = mkNodo({
      id: "flor1",
      anio: year,
      parentId: "rama",
      orden: 0,
      nombre: "F",
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      metaValor: 10_000,
    });
    const nodos = [raiz, rama, flor];
    const mesKey = `${year}-04`;
    const regs: RegistroNodo[] = [
      mkReg({ id: "en-rama", nodoId: "rama", periodoTipo: "mes", periodoKey: mesKey, valor: 99_999 }),
    ];
    expect(realEfectivoEnPeriodo(regs, nodos, "rama", "mes", mesKey, year)).toBe(0);
  });
});
