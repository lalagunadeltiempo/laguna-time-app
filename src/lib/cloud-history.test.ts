import { describe, expect, it } from "vitest";
import { detectarCambioSignificativo } from "./store-safeguard";
import type { AppState, NodoArbol, PlanArbolState } from "./types";
import { EMPTY_ARBOL, EQUIPO_DEFAULT, PLAN_CONFIG_DEFAULT } from "./types";

function makeNodo(id: string, partial: Partial<NodoArbol> = {}): NodoArbol {
  return {
    id,
    anio: 2026,
    orden: 0,
    nombre: `Nodo ${id}`,
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
    creado: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function makeArbol(nodos: NodoArbol[]): PlanArbolState {
  return { ...EMPTY_ARBOL, nodos };
}

function makeState(arbol: PlanArbolState): AppState {
  return {
    ambitoLabels: { personal: "p", empresa: "e" },
    proyectos: [],
    resultados: [],
    entregables: [],
    pasos: [],
    contactos: [],
    inbox: [],
    plantillas: [],
    ejecuciones: [],
    pasosActivos: [],
    miembros: EQUIPO_DEFAULT,
    activityLog: [],
    arbol,
    deleted: { proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [], notas: [] },
    planConfig: PLAN_CONFIG_DEFAULT,
  };
}

/**
 * Re-cubre las propiedades clave de `detectarCambioSignificativo` desde
 * el ángulo de "¿debería materializarse una entrada de historia?".
 * Es esencialmente la lógica del bloque 3 invertida: cualquier
 * variación apreciable en nodos/metas/relaciones se considera digna
 * de un snapshot.
 */
describe("detectarCambioSignificativo (cloud-history)", () => {
  it("considera el primer estado como cambio significativo", () => {
    expect(detectarCambioSignificativo(null, makeState(makeArbol([makeNodo("a")])))).toBe(true);
  });

  it("ignora cambios en proyectos/entregables que no afecten al árbol", () => {
    const arbol = makeArbol([makeNodo("a", { metaValor: 100 })]);
    const a = makeState(arbol);
    const b = { ...makeState(arbol), proyectos: [{ id: "p1" } as never] };
    expect(detectarCambioSignificativo(a, b)).toBe(false);
  });

  it("dispara cambio cuando se añade una meta", () => {
    const a = makeState(makeArbol([makeNodo("a")]));
    const b = makeState(makeArbol([makeNodo("a", { metaValor: 100 })]));
    expect(detectarCambioSignificativo(a, b)).toBe(true);
  });

  it("dispara cambio cuando se borra una meta", () => {
    const a = makeState(makeArbol([makeNodo("a", { metaValor: 100 })]));
    const b = makeState(makeArbol([makeNodo("a")]));
    expect(detectarCambioSignificativo(a, b)).toBe(true);
  });

  it("dispara cambio al añadir una relación entregable→hoja", () => {
    const a = makeState(makeArbol([makeNodo("a", { entregableIds: [] })]));
    const b = makeState(makeArbol([makeNodo("a", { entregableIds: ["e1"] })]));
    expect(detectarCambioSignificativo(a, b)).toBe(true);
  });

  it("no dispara cambio si solo cambia el orden de un nodo", () => {
    const a = makeState(makeArbol([makeNodo("a", { orden: 0 })]));
    const b = makeState(makeArbol([makeNodo("a", { orden: 5 })]));
    expect(detectarCambioSignificativo(a, b)).toBe(false);
  });
});
