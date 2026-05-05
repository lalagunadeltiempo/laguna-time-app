import { describe, expect, it } from "vitest";
import {
  buildArbolIndices,
  clonarEstructuraDeAnioAnterior,
  findRaizOrigenAnioAnterior,
  hijosSumaDirectosIdx,
  ordenarPorPctDesc,
} from "./arbol-tiempo";
import type { NodoArbol, RegistroNodo } from "./types";

const ts = "2026-01-01T00:00:00.000Z";

function mkNodo(p: Omit<NodoArbol, "creado">): NodoArbol {
  return { ...p, creado: ts };
}

function mkRoot(anio: number, id: string, metaValor: number | undefined): NodoArbol {
  return mkNodo({
    id,
    anio,
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

function mkChild(p: {
  id: string;
  parentId: string;
  anio: number;
  nombre: string;
  orden: number;
  metaValor?: number;
}): NodoArbol {
  return mkNodo({
    id: p.id,
    anio: p.anio,
    parentId: p.parentId,
    orden: p.orden,
    nombre: p.nombre,
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor: p.metaValor,
  });
}

/** Generador determinista para que los tests sean reproducibles. */
function makeIdGen(prefix = "new"): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe("clonarEstructuraDeAnioAnterior", () => {
  it("clona 2 ramas × 3 hojas del año anterior con ids nuevos y parentIds remapeados", () => {
    const raiz25 = mkRoot(2026, "r26", 600_000);
    const ramaA = mkChild({ id: "ra26", parentId: "r26", anio: 2026, nombre: "Aulas", orden: 0, metaValor: 360_000 });
    const ramaB = mkChild({ id: "rb26", parentId: "r26", anio: 2026, nombre: "Programas", orden: 1, metaValor: 240_000 });
    const hojas = [
      mkChild({ id: "ha1", parentId: "ra26", anio: 2026, nombre: "Aula A1", orden: 0, metaValor: 180_000 }),
      mkChild({ id: "ha2", parentId: "ra26", anio: 2026, nombre: "Aula A2", orden: 1, metaValor: 120_000 }),
      mkChild({ id: "ha3", parentId: "ra26", anio: 2026, nombre: "Aula A3", orden: 2, metaValor: 60_000 }),
      mkChild({ id: "hb1", parentId: "rb26", anio: 2026, nombre: "Programa B1", orden: 0, metaValor: 120_000 }),
      mkChild({ id: "hb2", parentId: "rb26", anio: 2026, nombre: "Programa B2", orden: 1, metaValor: 80_000 }),
      mkChild({ id: "hb3", parentId: "rb26", anio: 2026, nombre: "Programa B3", orden: 2, metaValor: 40_000 }),
    ];
    const raiz27 = mkRoot(2027, "r27", 900_000);
    const nodos = [raiz25, ramaA, ramaB, ...hojas, raiz27];

    const { nuevosNodos, copiados } = clonarEstructuraDeAnioAnterior({
      nodos,
      anioDestino: 2027,
      raizDestinoId: "r27",
      generateId: makeIdGen(),
    });

    expect(copiados).toBe(8);
    expect(nuevosNodos).toHaveLength(8);
    expect(new Set(nuevosNodos.map((n) => n.anio))).toEqual(new Set([2027]));
    // Ids son todos nuevos y distintos del origen.
    const idsOrigen = new Set([raiz25.id, ramaA.id, ramaB.id, ...hojas.map((h) => h.id)]);
    for (const n of nuevosNodos) {
      expect(idsOrigen.has(n.id)).toBe(false);
    }
    // Las dos ramas nuevas apuntan a la raíz destino (no al raíz origen).
    const ramasNuevas = nuevosNodos.filter((n) => n.parentId === "r27");
    expect(ramasNuevas).toHaveLength(2);
    expect(new Set(ramasNuevas.map((n) => n.nombre))).toEqual(new Set(["Aulas", "Programas"]));
    // Cada hoja nueva apunta a una rama nueva, no a la rama origen.
    for (const n of nuevosNodos) {
      if (n.parentId !== "r27") {
        const padre = nuevosNodos.find((m) => m.id === n.parentId);
        expect(padre, `Hoja ${n.nombre} debería referenciar una rama nueva`).toBeDefined();
        expect(padre!.anio).toBe(2027);
      }
    }
  });

  it("conserva los porcentajes y recalcula los € contra el nuevo objetivo anual", () => {
    const r26 = mkRoot(2026, "r26", 600_000);
    const ramaA = mkChild({ id: "a26", parentId: "r26", anio: 2026, nombre: "Aulas", orden: 0, metaValor: 300_000 });
    const ramaB = mkChild({ id: "b26", parentId: "r26", anio: 2026, nombre: "Programas", orden: 1, metaValor: 150_000 });
    const r27 = mkRoot(2027, "r27", 900_000); // 1.5×
    const nodos = [r26, ramaA, ramaB, r27];

    const { nuevosNodos } = clonarEstructuraDeAnioAnterior({
      nodos,
      anioDestino: 2027,
      raizDestinoId: "r27",
      generateId: makeIdGen(),
    });

    const ramaACopia = nuevosNodos.find((n) => n.nombre === "Aulas")!;
    const ramaBCopia = nuevosNodos.find((n) => n.nombre === "Programas")!;
    expect(ramaACopia.metaValor).toBeCloseTo(450_000, 5);
    expect(ramaBCopia.metaValor).toBeCloseTo(225_000, 5);
    // Pcts conservados: 50 % y 25 % respectivamente.
    expect((ramaACopia.metaValor! / 900_000) * 100).toBeCloseTo(50, 5);
    expect((ramaBCopia.metaValor! / 900_000) * 100).toBeCloseTo(25, 5);
  });

  it("si no existe raíz equivalente en el año anterior, copiados === 0 y no genera nodos", () => {
    const r27 = mkRoot(2027, "r27", 900_000);
    const { nuevosNodos, copiados } = clonarEstructuraDeAnioAnterior({
      nodos: [r27],
      anioDestino: 2027,
      raizDestinoId: "r27",
      generateId: makeIdGen(),
    });
    expect(copiados).toBe(0);
    expect(nuevosNodos).toEqual([]);
  });

  it("si origen no tiene metaValor en raíz, los nodos clonados quedan con metaValor undefined", () => {
    const r26 = mkRoot(2026, "r26", undefined);
    const rama = mkChild({ id: "a26", parentId: "r26", anio: 2026, nombre: "Aulas", orden: 0, metaValor: 100_000 });
    const r27 = mkRoot(2027, "r27", 900_000);
    const nodos = [r26, rama, r27];
    const { nuevosNodos, copiados } = clonarEstructuraDeAnioAnterior({
      nodos,
      anioDestino: 2027,
      raizDestinoId: "r27",
      generateId: makeIdGen(),
    });
    expect(copiados).toBe(1);
    expect(nuevosNodos[0].metaValor).toBeUndefined();
  });

  it("si destino aún no tiene metaValor, conserva la estructura sin propagar €", () => {
    const r26 = mkRoot(2026, "r26", 600_000);
    const rama = mkChild({ id: "a26", parentId: "r26", anio: 2026, nombre: "Aulas", orden: 0, metaValor: 300_000 });
    const r27 = mkRoot(2027, "r27", undefined);
    const nodos = [r26, rama, r27];
    const { nuevosNodos } = clonarEstructuraDeAnioAnterior({
      nodos,
      anioDestino: 2027,
      raizDestinoId: "r27",
      generateId: makeIdGen(),
    });
    expect(nuevosNodos).toHaveLength(1);
    expect(nuevosNodos[0].metaValor).toBeUndefined();
    expect(nuevosNodos[0].nombre).toBe("Aulas");
  });
});

describe("clonarEstructuraDeAnioAnterior modo='real'", () => {
  function mkReg(p: Omit<RegistroNodo, "creado" | "actualizado">): RegistroNodo {
    return { ...p, creado: ts, actualizado: ts };
  }

  it("usa proporciones REALES del año anterior, no las planificadas", () => {
    // 2025: plan A=70%/B=30%, pero realidad A=60%/B=40%.
    const r25 = mkRoot(2025, "r25", 100_000);
    const ramaA25 = mkChild({ id: "a25", parentId: "r25", anio: 2025, nombre: "Aulas", orden: 0, metaValor: 70_000 });
    const ramaB25 = mkChild({ id: "b25", parentId: "r25", anio: 2025, nombre: "Programas", orden: 1, metaValor: 30_000 });
    const r26 = mkRoot(2026, "r26", 100_000);
    const registros: RegistroNodo[] = [
      mkReg({ id: "rA", nodoId: "a25", periodoTipo: "anio", periodoKey: "2025", valor: 60_000 }),
      mkReg({ id: "rB", nodoId: "b25", periodoTipo: "anio", periodoKey: "2025", valor: 40_000 }),
    ];

    const res = clonarEstructuraDeAnioAnterior({
      nodos: [r25, ramaA25, ramaB25, r26],
      anioDestino: 2026,
      raizDestinoId: "r26",
      generateId: makeIdGen(),
      modo: "real",
      registros,
    });

    expect(res.modoEfectivo).toBe("real");
    const aulas = res.nuevosNodos.find((n) => n.nombre === "Aulas")!;
    const programas = res.nuevosNodos.find((n) => n.nombre === "Programas")!;
    expect(aulas.metaValor).toBeCloseTo(60_000, 2);
    expect(programas.metaValor).toBeCloseTo(40_000, 2);
  });

  it("ramas y hojas cuadran: la rama tiene la suma de sus hojas (reales)", () => {
    const r25 = mkRoot(2025, "r25", 100_000);
    const ramaA25 = mkChild({ id: "a25", parentId: "r25", anio: 2025, nombre: "Aulas", orden: 0, metaValor: 70_000 });
    const h1 = mkChild({ id: "h1", parentId: "a25", anio: 2025, nombre: "Aula 1", orden: 0, metaValor: 50_000 });
    const h2 = mkChild({ id: "h2", parentId: "a25", anio: 2025, nombre: "Aula 2", orden: 1, metaValor: 20_000 });
    const ramaB25 = mkChild({ id: "b25", parentId: "r25", anio: 2025, nombre: "Programas", orden: 1, metaValor: 30_000 });
    const r26 = mkRoot(2026, "r26", 100_000);
    const registros: RegistroNodo[] = [
      // Total real Aulas = 60 (h1=45 + h2=15); Programas = 40.
      mkReg({ id: "h1r", nodoId: "h1", periodoTipo: "anio", periodoKey: "2025", valor: 45_000 }),
      mkReg({ id: "h2r", nodoId: "h2", periodoTipo: "anio", periodoKey: "2025", valor: 15_000 }),
      mkReg({ id: "rB", nodoId: "b25", periodoTipo: "anio", periodoKey: "2025", valor: 40_000 }),
    ];
    const res = clonarEstructuraDeAnioAnterior({
      nodos: [r25, ramaA25, h1, h2, ramaB25, r26],
      anioDestino: 2026,
      raizDestinoId: "r26",
      generateId: makeIdGen(),
      modo: "real",
      registros,
    });

    const aulas = res.nuevosNodos.find((n) => n.nombre === "Aulas")!;
    const aula1 = res.nuevosNodos.find((n) => n.nombre === "Aula 1")!;
    const aula2 = res.nuevosNodos.find((n) => n.nombre === "Aula 2")!;
    const programas = res.nuevosNodos.find((n) => n.nombre === "Programas")!;
    expect(aulas.metaValor).toBeCloseTo(60_000, 2);
    expect(aula1.metaValor).toBeCloseTo(45_000, 2);
    expect(aula2.metaValor).toBeCloseTo(15_000, 2);
    expect(programas.metaValor).toBeCloseTo(40_000, 2);
    // Hojas suman exactamente la rama padre (cuadre).
    expect(aula1.metaValor! + aula2.metaValor!).toBeCloseTo(aulas.metaValor!, 2);
  });

  it("si el año anterior no tiene reales, cae a modo 'plan' silenciosamente", () => {
    const r25 = mkRoot(2025, "r25", 100_000);
    const ramaA25 = mkChild({ id: "a25", parentId: "r25", anio: 2025, nombre: "Aulas", orden: 0, metaValor: 70_000 });
    const ramaB25 = mkChild({ id: "b25", parentId: "r25", anio: 2025, nombre: "Programas", orden: 1, metaValor: 30_000 });
    const r26 = mkRoot(2026, "r26", 100_000);
    const res = clonarEstructuraDeAnioAnterior({
      nodos: [r25, ramaA25, ramaB25, r26],
      anioDestino: 2026,
      raizDestinoId: "r26",
      generateId: makeIdGen(),
      modo: "real",
      registros: [], // sin reales 2025
    });
    expect(res.modoEfectivo).toBe("plan");
    const aulas = res.nuevosNodos.find((n) => n.nombre === "Aulas")!;
    expect(aulas.metaValor).toBeCloseTo(70_000, 2); // proporción del plan
  });

  it("una rama sin real (con plan>0) recibe metaValor=0; la otra absorbe el 100%", () => {
    // Caso límite: si una rama no tuvo nada en 2025 pero la otra sí,
    // por consistencia matemática la sin-real queda en 0 y la usuaria
    // ajusta a mano. Es preferible ser explícito a mezclar % de plan y
    // % de real (rompería la coherencia rama=Σhojas).
    const r25 = mkRoot(2025, "r25", 100_000);
    const ramaA25 = mkChild({ id: "a25", parentId: "r25", anio: 2025, nombre: "Aulas", orden: 0, metaValor: 50_000 });
    const ramaB25 = mkChild({ id: "b25", parentId: "r25", anio: 2025, nombre: "Programas", orden: 1, metaValor: 50_000 });
    const r26 = mkRoot(2026, "r26", 100_000);
    const registros: RegistroNodo[] = [
      mkReg({ id: "rA", nodoId: "a25", periodoTipo: "anio", periodoKey: "2025", valor: 80_000 }),
      // Programas 2025 sin apuntes reales.
    ];
    const res = clonarEstructuraDeAnioAnterior({
      nodos: [r25, ramaA25, ramaB25, r26],
      anioDestino: 2026,
      raizDestinoId: "r26",
      generateId: makeIdGen(),
      modo: "real",
      registros,
    });
    expect(res.modoEfectivo).toBe("real");
    const aulas = res.nuevosNodos.find((n) => n.nombre === "Aulas")!;
    const programas = res.nuevosNodos.find((n) => n.nombre === "Programas")!;
    // 80 / 80 = 100% de la raíz destino.
    expect(aulas.metaValor).toBeCloseTo(100_000, 2);
    expect(programas.metaValor).toBeCloseTo(0, 2);
  });
});

describe("findRaizOrigenAnioAnterior y fallback al clonar por nombre distinto", () => {
  it("si hay raíz origen con NOMBRE DISTINTO, la usa igualmente como fuente", () => {
    // 2025 = "Ventas", 2026 = "Cifra". Antes los botones "Traer estructura"
    // no aparecían porque la búsqueda exigía nombre normalizado idéntico.
    const r25 = mkRoot(2025, "r25", 100_000);
    const r25Renombrado: NodoArbol = { ...r25, nombre: "Ventas" };
    const ramaA = mkChild({ id: "a25", parentId: "r25", anio: 2025, nombre: "Aulas", orden: 0, metaValor: 70_000 });
    const ramaB = mkChild({ id: "b25", parentId: "r25", anio: 2025, nombre: "Programas", orden: 1, metaValor: 30_000 });
    const r26 = mkRoot(2026, "r26", 200_000);
    const r26Renombrado: NodoArbol = { ...r26, nombre: "Cifra" };

    const raizFound = findRaizOrigenAnioAnterior(
      [r25Renombrado, ramaA, ramaB, r26Renombrado],
      2026,
      "r26",
    );
    expect(raizFound?.id).toBe("r25");
    expect(raizFound?.nombre).toBe("Ventas");

    const res = clonarEstructuraDeAnioAnterior({
      nodos: [r25Renombrado, ramaA, ramaB, r26Renombrado],
      anioDestino: 2026,
      raizDestinoId: "r26",
      generateId: makeIdGen(),
    });
    expect(res.copiados).toBe(2);
    expect(res.nombreOrigen).toBe("Ventas");
    const aulas = res.nuevosNodos.find((n) => n.nombre === "Aulas")!;
    expect(aulas.metaValor).toBeCloseTo(140_000, 5); // 70% de 200k
  });

  it("si hay varias raíces en el año anterior, prefiere match por nombre", () => {
    const r25Otra = mkRoot(2025, "r25b", 50_000);
    const r25OtraRenombrada: NodoArbol = { ...r25Otra, nombre: "Personal", orden: 1 };
    const r25Match = mkRoot(2025, "r25", 100_000);
    const r25MatchOk: NodoArbol = { ...r25Match, orden: 0 };
    const r26 = mkRoot(2026, "r26", 200_000);
    const raiz = findRaizOrigenAnioAnterior([r25OtraRenombrada, r25MatchOk, r26], 2026, "r26");
    expect(raiz?.id).toBe("r25"); // match por nombre "Facturación"
  });

  it("sin ninguna raíz en año origen sigue devolviendo undefined / copiados=0", () => {
    const r27 = mkRoot(2027, "r27", 900_000);
    expect(findRaizOrigenAnioAnterior([r27], 2027, "r27")).toBeUndefined();
    const res = clonarEstructuraDeAnioAnterior({
      nodos: [r27],
      anioDestino: 2027,
      raizDestinoId: "r27",
      generateId: makeIdGen(),
    });
    expect(res.copiados).toBe(0);
  });
});

describe("ordenarPorPctDesc / hijosSumaDirectosIdx ordena por % descendente", () => {
  it("hijosSumaDirectosIdx ordena tres ramas [20, 50, 30] como [50, 30, 20]", () => {
    const raiz = mkRoot(2026, "r26", 1_000_000);
    const r1 = mkChild({ id: "r1", parentId: "r26", anio: 2026, nombre: "Veinte", orden: 0, metaValor: 200_000 });
    const r2 = mkChild({ id: "r2", parentId: "r26", anio: 2026, nombre: "Cincuenta", orden: 1, metaValor: 500_000 });
    const r3 = mkChild({ id: "r3", parentId: "r26", anio: 2026, nombre: "Treinta", orden: 2, metaValor: 300_000 });
    const idx = buildArbolIndices([], [raiz, r1, r2, r3], 2026);
    const orden = hijosSumaDirectosIdx(idx, "r26").map((n) => n.nombre);
    expect(orden).toEqual(["Cincuenta", "Treinta", "Veinte"]);
  });

  it("ramas sin metaValor (pct undefined) van al final, estables por nombre", () => {
    const raiz = mkRoot(2026, "r26", 600_000);
    const r1 = mkChild({ id: "r1", parentId: "r26", anio: 2026, nombre: "Con meta alta", orden: 1, metaValor: 400_000 });
    const r2 = mkChild({ id: "r2", parentId: "r26", anio: 2026, nombre: "Con meta baja", orden: 2, metaValor: 200_000 });
    const sin = mkChild({ id: "rs", parentId: "r26", anio: 2026, nombre: "Sin pct", orden: 0 });
    const sin2 = mkChild({ id: "rs2", parentId: "r26", anio: 2026, nombre: "Otro sin pct", orden: 3 });
    const idx = buildArbolIndices([], [raiz, r1, r2, sin, sin2], 2026);
    const ord = hijosSumaDirectosIdx(idx, "r26").map((n) => n.nombre);
    expect(ord.slice(0, 2)).toEqual(["Con meta alta", "Con meta baja"]);
    // Las dos sin meta caen al final, ordenadas estable por orden y luego nombre.
    expect(ord.slice(2)).toEqual(["Sin pct", "Otro sin pct"]);
  });

  it("ordenarPorPctDesc es estable: empate de pct rompe por orden y luego por nombre", () => {
    const a = mkChild({ id: "a", parentId: "p", anio: 2026, nombre: "Banana", orden: 1, metaValor: 100 });
    const b = mkChild({ id: "b", parentId: "p", anio: 2026, nombre: "Albaricoque", orden: 1, metaValor: 100 });
    const c = mkChild({ id: "c", parentId: "p", anio: 2026, nombre: "Cereza", orden: 0, metaValor: 100 });
    const ord = ordenarPorPctDesc([a, b, c]).map((n) => n.nombre);
    expect(ord).toEqual(["Cereza", "Albaricoque", "Banana"]);
  });
});
