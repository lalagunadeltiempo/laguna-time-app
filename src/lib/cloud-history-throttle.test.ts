import { describe, expect, it } from "vitest";
import { debeAppendHistoryEntry } from "./cloud-history";
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

const FIVE_MIN_MS = 5 * 60 * 1000;

describe("debeAppendHistoryEntry (throttle de cloud-history)", () => {
  it("siempre permite el primer append", () => {
    const next = makeState(makeArbol([makeNodo("a")]));
    expect(debeAppendHistoryEntry({}, next, 1_000_000)).toBe(true);
  });

  it("bloquea si han pasado < 5min desde el último append y no hay cambio significativo", () => {
    const arbol = makeArbol([makeNodo("a", { metaValor: 100 })]);
    const prevState = makeState(arbol);
    const nextState = makeState(arbol);
    const lastTs = 1_000_000;
    const now = lastTs + 60_000; // 1 minuto después
    expect(debeAppendHistoryEntry({ lastSavedTs: lastTs, lastState: prevState }, nextState, now)).toBe(false);
  });

  it("permite si han pasado exactamente 5min desde el último append", () => {
    const arbol = makeArbol([makeNodo("a", { metaValor: 100 })]);
    const lastTs = 1_000_000;
    const now = lastTs + FIVE_MIN_MS;
    expect(
      debeAppendHistoryEntry({ lastSavedTs: lastTs, lastState: makeState(arbol) }, makeState(arbol), now),
    ).toBe(true);
  });

  it("permite si han pasado > 5min", () => {
    const arbol = makeArbol([makeNodo("a", { metaValor: 100 })]);
    const lastTs = 1_000_000;
    const now = lastTs + FIVE_MIN_MS + 1;
    expect(
      debeAppendHistoryEntry({ lastSavedTs: lastTs, lastState: makeState(arbol) }, makeState(arbol), now),
    ).toBe(true);
  });

  it("permite cambios significativos aunque no haya pasado el cooldown", () => {
    const arbolA = makeArbol([makeNodo("a", { metaValor: 100 })]);
    const arbolB = makeArbol([
      makeNodo("a", { metaValor: 100 }),
      makeNodo("b", { metaValor: 200 }),
      makeNodo("c", { metaValor: 300 }),
      makeNodo("d", { metaValor: 400 }),
    ]);
    const lastTs = 1_000_000;
    const now = lastTs + 1_000;
    expect(
      debeAppendHistoryEntry({ lastSavedTs: lastTs, lastState: makeState(arbolA) }, makeState(arbolB), now),
    ).toBe(true);
  });

  it("bloquea cambios menores antes del cooldown (ej. solo cambia el orden)", () => {
    const arbolA = makeArbol([makeNodo("a", { metaValor: 100, orden: 0 })]);
    const arbolB = makeArbol([makeNodo("a", { metaValor: 100, orden: 5 })]);
    const lastTs = 1_000_000;
    const now = lastTs + 30_000;
    expect(
      debeAppendHistoryEntry({ lastSavedTs: lastTs, lastState: makeState(arbolA) }, makeState(arbolB), now),
    ).toBe(false);
  });
});
