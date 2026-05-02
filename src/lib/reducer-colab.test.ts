/**
 * Tests de regresión de la iteración "Optimizar entregables para trabajo en
 * equipo" (sábado 2 mayo 2026). Cubren:
 *  - REORDER_NOTA: mover notas arriba/abajo dentro del array de cada nivel.
 *  - Implicados automáticos: al asignar a un miembro como responsable de un
 *    paso, pasa a figurar como implicado del entregable con `auto: true`.
 */
import { describe, expect, it } from "vitest";
import { reducer } from "./reducer";
import type { AppState, Entregable, Nota, Paso } from "./types";
import { EMPTY_ARBOL } from "./types";

function makeNota(id: string, creadoTs = "2026-05-01T00:00:00.000Z"): Nota {
  return { id, texto: `t-${id}`, autor: "Gabi", creadoTs };
}

function makeEntregable(id: string, overrides: Partial<Entregable> = {}): Entregable {
  return {
    id,
    nombre: `E-${id}`,
    resultadoId: "r-1",
    tipo: "raw",
    plantillaId: null,
    diasEstimados: 3,
    diasHechos: 0,
    esDiaria: false,
    responsable: "Gabi",
    estado: "en_proceso",
    creado: "2026-05-01T00:00:00.000Z",
    semana: null,
    fechaLimite: null,
    fechaInicio: null,
    contexto: { urls: [], apps: [], notas: "" },
    implicados: [],
    ...overrides,
  } as unknown as Entregable;
}

function makePaso(id: string, overrides: Partial<Paso> = {}): Paso {
  return {
    id,
    entregableId: "e-1",
    nombre: `paso ${id}`,
    estado: "abierto",
    inicioTs: null,
    finTs: null,
    siguientePaso: null,
    contexto: { urls: [], apps: [], notas: "" },
    implicados: [],
    pausas: [],
    ...overrides,
  } as unknown as Paso;
}

function baseState(overrides: Partial<AppState> = {}): AppState {
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
    },
    ...overrides,
  };
}

describe("REORDER_NOTA", () => {
  it("baja una nota una posición dentro del entregable", () => {
    const state = baseState({
      entregables: [
        makeEntregable("e-1", {
          notas: [makeNota("n-1"), makeNota("n-2"), makeNota("n-3")],
        }),
      ],
    });
    const next = reducer(state, {
      type: "REORDER_NOTA",
      nivel: "entregable",
      targetId: "e-1",
      notaId: "n-1",
      direction: "down",
    });
    expect(next.entregables[0].notas?.map((n) => n.id)).toEqual(["n-2", "n-1", "n-3"]);
  });

  it("sube una nota una posición dentro del paso", () => {
    const state = baseState({
      entregables: [makeEntregable("e-1")],
      pasos: [
        makePaso("p-1", {
          notas: [makeNota("n-1"), makeNota("n-2"), makeNota("n-3")],
        }),
      ],
    });
    const next = reducer(state, {
      type: "REORDER_NOTA",
      nivel: "paso",
      targetId: "p-1",
      notaId: "n-3",
      direction: "up",
    });
    expect(next.pasos[0].notas?.map((n) => n.id)).toEqual(["n-1", "n-3", "n-2"]);
  });

  it("no se sale del array si la nota ya está en el borde", () => {
    const state = baseState({
      entregables: [
        makeEntregable("e-1", { notas: [makeNota("n-1"), makeNota("n-2")] }),
      ],
    });
    const next = reducer(state, {
      type: "REORDER_NOTA",
      nivel: "entregable",
      targetId: "e-1",
      notaId: "n-1",
      direction: "up",
    });
    expect(next.entregables[0].notas?.map((n) => n.id)).toEqual(["n-1", "n-2"]);
  });
});

describe("Implicados automáticos al asignar responsable de paso", () => {
  it("ADD_PASO con responsable añade al miembro como implicado auto del entregable", () => {
    const state = baseState({
      entregables: [makeEntregable("e-1", { implicados: [] })],
    });
    const next = reducer(state, {
      type: "ADD_PASO",
      payload: makePaso("p-1", { responsable: "Beltrán" }),
    });
    const implicados = next.entregables[0].implicados ?? [];
    expect(implicados).toEqual([{ tipo: "equipo", nombre: "Beltrán", auto: true }]);
  });

  it("UPDATE_PASO con cambio de responsable añade al nuevo como implicado auto", () => {
    const state = baseState({
      entregables: [makeEntregable("e-1")],
      pasos: [makePaso("p-1", { responsable: undefined })],
    });
    const next = reducer(state, {
      type: "UPDATE_PASO",
      id: "p-1",
      changes: { responsable: "Beltrán" },
    });
    const implicados = next.entregables[0].implicados ?? [];
    expect(implicados.some((i) => i.nombre === "Beltrán" && i.auto === true)).toBe(true);
  });

  it("UPDATE_PASO no duplica implicado si ya existía (y respeta su flag no-auto)", () => {
    const state = baseState({
      entregables: [
        makeEntregable("e-1", {
          implicados: [{ tipo: "equipo", nombre: "Beltrán" }],
        }),
      ],
      pasos: [makePaso("p-1", { responsable: undefined })],
    });
    const next = reducer(state, {
      type: "UPDATE_PASO",
      id: "p-1",
      changes: { responsable: "Beltrán" },
    });
    const implicados = next.entregables[0].implicados ?? [];
    expect(implicados).toHaveLength(1);
    expect(implicados[0].auto).toBeUndefined();
  });

  it("START_PASO con responsable añade al implicado auto", () => {
    const state = baseState({
      entregables: [makeEntregable("e-1")],
    });
    const next = reducer(state, {
      type: "START_PASO",
      payload: makePaso("p-1", {
        responsable: "Beltrán",
        inicioTs: "2026-05-02T10:00:00.000Z",
      }),
    });
    const implicados = next.entregables[0].implicados ?? [];
    expect(implicados.some((i) => i.nombre === "Beltrán" && i.auto)).toBe(true);
  });

  it("CLOSE_PASO con responsable añade al implicado auto", () => {
    const state = baseState({
      entregables: [makeEntregable("e-1")],
      pasos: [makePaso("p-1", { responsable: "Beltrán", inicioTs: "2026-05-02T09:00:00.000Z" })],
    });
    const next = reducer(state, {
      type: "CLOSE_PASO",
      payload: makePaso("p-1", {
        responsable: "Beltrán",
        inicioTs: "2026-05-02T09:00:00.000Z",
        finTs: "2026-05-02T10:00:00.000Z",
        estado: "hecho",
        siguientePaso: { tipo: "fin" },
      }),
    });
    const implicados = next.entregables[0].implicados ?? [];
    expect(implicados.some((i) => i.nombre === "Beltrán" && i.auto)).toBe(true);
  });
});

describe("RESOLVER_MENSAJE / REABRIR_MENSAJE", () => {
  it("RESOLVER_MENSAJE marca el mensaje con estado resuelto y rellena resueltoPor/resueltoTs", () => {
    const state = baseState({
      mensajes: [
        {
          id: "m-1",
          entregableId: "e-1",
          autor: "Gabi",
          texto: "¿quedamos mañana?",
          creado: "2026-05-02T09:00:00.000Z",
        },
      ],
    });
    const next = reducer(state, { type: "RESOLVER_MENSAJE", id: "m-1", usuario: "Beltrán" });
    const m = next.mensajes?.[0];
    expect(m?.estado).toBe("resuelto");
    expect(m?.resueltoPor).toBe("Beltrán");
    expect(typeof m?.resueltoTs).toBe("string");
  });

  it("REABRIR_MENSAJE limpia resueltoPor y pone estado abierto con nuevo resueltoTs", () => {
    const state = baseState({
      mensajes: [
        {
          id: "m-1",
          entregableId: "e-1",
          autor: "Gabi",
          texto: "hola",
          creado: "2026-05-02T09:00:00.000Z",
          estado: "resuelto",
          resueltoPor: "Beltrán",
          resueltoTs: "2026-05-02T10:00:00.000Z",
        },
      ],
    });
    const next = reducer(state, { type: "REABRIR_MENSAJE", id: "m-1" });
    const m = next.mensajes?.[0];
    expect(m?.estado).toBe("abierto");
    expect(m?.resueltoPor).toBeUndefined();
    expect(m?.resueltoTs && m.resueltoTs > "2026-05-02T10:00:00.000Z").toBe(true);
  });
});
