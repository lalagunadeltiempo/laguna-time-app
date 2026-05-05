import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reducer } from "./reducer";
import type { AppState, Entregable, NodoArbol } from "./types";
import { EMPTY_ARBOL } from "./types";

function makeEntregable(id: string, overrides: Partial<Entregable> = {}): Entregable {
  return {
    id,
    nombre: `Entregable ${id}`,
    resultadoId: "res-1",
    tipo: "raw",
    plantillaId: null,
    diasEstimados: 1,
    diasHechos: 0,
    esDiaria: false,
    responsable: "Gabi",
    estado: "planificado",
    creado: "2026-01-01T00:00:00.000Z",
    semana: null,
    fechaLimite: null,
    fechaInicio: null,
    ...overrides,
  };
}

function makeNodo(id: string, anio: number, parentId: string | undefined, nombre: string): NodoArbol {
  return {
    id,
    anio,
    parentId,
    orden: 0,
    nombre,
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
    creado: "2026-01-01T00:00:00.000Z",
  };
}

function baseState(overrides: Partial<AppState> = {}): AppState {
  return {
    ambitoLabels: { personal: "Personal", empresa: "Empresa" },
    proyectos: [],
    resultados: [],
    entregables: [],
    pasos: [],
    contactos: [],
    inbox: [],
    plantillas: [],
    ejecuciones: [],
    pasosActivos: [],
    miembros: [],
    activityLog: [],
    mensajes: [],
    arbol: EMPTY_ARBOL,
    deleted: {
      proyectos: [],
      resultados: [],
      entregables: [],
      pasos: [],
      plantillas: [],
      notas: [],
      mensajes: [],
      implicados: [],
      arbolNodos: [],
      arbolRegistros: [],
    },
    ...overrides,
  };
}

describe("Reducer árbol-entregables", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("LINK_ENTREGABLE_HOJA añade el id la primera vez", () => {
    const hoja = makeNodo("hoja-1", 2026, "rama-1", "Hoja 1");
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [hoja] } });
    const next = reducer(state, {
      type: "LINK_ENTREGABLE_HOJA",
      entregableId: "ent-1",
      hojaId: "hoja-1",
    });
    expect(next.arbol.nodos[0].entregableIds).toEqual(["ent-1"]);
  });

  it("LINK_ENTREGABLE_HOJA no duplica un id existente", () => {
    const hoja = { ...makeNodo("hoja-1", 2026, "rama-1", "Hoja 1"), entregableIds: ["ent-1"] };
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [hoja] } });
    const next = reducer(state, {
      type: "LINK_ENTREGABLE_HOJA",
      entregableId: "ent-1",
      hojaId: "hoja-1",
    });
    expect(next.arbol.nodos[0].entregableIds).toEqual(["ent-1"]);
  });

  it("UNLINK_ENTREGABLE_HOJA quita el id y no afecta otras hojas", () => {
    const hojaA = { ...makeNodo("hoja-a", 2026, "rama-1", "Hoja A"), entregableIds: ["ent-1", "ent-2"] };
    const hojaB = { ...makeNodo("hoja-b", 2026, "rama-1", "Hoja B"), entregableIds: ["ent-1"] };
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [hojaA, hojaB] } });
    const next = reducer(state, {
      type: "UNLINK_ENTREGABLE_HOJA",
      entregableId: "ent-1",
      hojaId: "hoja-a",
    });
    const hojaANext = next.arbol.nodos.find((n) => n.id === "hoja-a");
    const hojaBNext = next.arbol.nodos.find((n) => n.id === "hoja-b");
    expect(hojaANext?.entregableIds).toEqual(["ent-2"]);
    expect(hojaBNext?.entregableIds).toEqual(["ent-1"]);
  });

  it("SET_HOJAS_DE_ENTREGABLE mueve el entregable de una hoja a otra", () => {
    const raiz = makeNodo("raiz-2026", 2026, undefined, "Objetivo 2026");
    const rama = makeNodo("rama-1", 2026, "raiz-2026", "Rama 1");
    const hojaA = { ...makeNodo("hoja-a", 2026, "rama-1", "Hoja A"), entregableIds: ["ent-1"] };
    const hojaB = makeNodo("hoja-b", 2026, "rama-1", "Hoja B");
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [raiz, rama, hojaA, hojaB] } });
    const next = reducer(state, {
      type: "SET_HOJAS_DE_ENTREGABLE",
      entregableId: "ent-1",
      hojaIds: ["hoja-b"],
      anio: 2026,
    });
    const hojaANext = next.arbol.nodos.find((n) => n.id === "hoja-a");
    const hojaBNext = next.arbol.nodos.find((n) => n.id === "hoja-b");
    expect(hojaANext?.entregableIds ?? []).not.toContain("ent-1");
    expect(hojaBNext?.entregableIds).toContain("ent-1");
  });

  it("SET_HOJAS_DE_ENTREGABLE con hojaIds vacío desconecta de todas las hojas del año", () => {
    const raiz = makeNodo("raiz-2026", 2026, undefined, "Objetivo 2026");
    const rama = makeNodo("rama-1", 2026, "raiz-2026", "Rama 1");
    const hojaA = { ...makeNodo("hoja-a", 2026, "rama-1", "Hoja A"), entregableIds: ["ent-1"] };
    const hojaB = { ...makeNodo("hoja-b", 2026, "rama-1", "Hoja B"), entregableIds: ["ent-1"] };
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [raiz, rama, hojaA, hojaB] } });
    const next = reducer(state, {
      type: "SET_HOJAS_DE_ENTREGABLE",
      entregableId: "ent-1",
      hojaIds: [],
      anio: 2026,
    });
    const hojaANext = next.arbol.nodos.find((n) => n.id === "hoja-a");
    const hojaBNext = next.arbol.nodos.find((n) => n.id === "hoja-b");
    expect(hojaANext?.entregableIds ?? []).not.toContain("ent-1");
    expect(hojaBNext?.entregableIds ?? []).not.toContain("ent-1");
  });

  it("DELETE_NODO_ARBOL no elimina ni modifica el entregable enlazado", () => {
    const raiz = makeNodo("raiz-2026", 2026, undefined, "Objetivo 2026");
    const rama = makeNodo("rama-1", 2026, "raiz-2026", "Rama 1");
    const hoja = { ...makeNodo("hoja-a", 2026, "rama-1", "Hoja A"), entregableIds: ["ent-1"] };
    const entregable = makeEntregable("ent-1", {
      nombre: "Entregable intacto",
      semanasActivas: ["2026-01-05"],
    });
    const state = baseState({
      entregables: [entregable],
      arbol: { ...EMPTY_ARBOL, nodos: [raiz, rama, hoja] },
    });
    const next = reducer(state, { type: "DELETE_NODO_ARBOL", id: "hoja-a" });
    expect(next.entregables).toHaveLength(1);
    expect(next.entregables[0]).toEqual(entregable);
    expect(next.arbol.nodos.find((n) => n.id === "hoja-a")).toBeUndefined();
  });

  it("cada modificación actualiza el timestamp `actualizado` del nodo", () => {
    const hoja = makeNodo("hoja-1", 2026, "rama-1", "Hoja 1");
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [hoja] } });
    const linked = reducer(state, {
      type: "LINK_ENTREGABLE_HOJA",
      entregableId: "ent-1",
      hojaId: "hoja-1",
    });
    expect(linked.arbol.nodos[0].actualizado).toBe("2026-06-01T10:00:00.000Z");

    vi.setSystemTime(new Date("2026-06-01T10:05:00.000Z"));
    const unlinked = reducer(linked, {
      type: "UNLINK_ENTREGABLE_HOJA",
      entregableId: "ent-1",
      hojaId: "hoja-1",
    });
    expect(unlinked.arbol.nodos[0].actualizado).toBe("2026-06-01T10:05:00.000Z");
  });
});
