import { describe, expect, it } from "vitest";
import { reducer } from "./reducer";
import type { AppState, Entregable } from "./types";
import { EMPTY_ARBOL } from "./types";

function mkEnt(id: string, overrides: Partial<Entregable> = {}): Entregable {
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
  } as Entregable;
}

function base(overrides: Partial<AppState> = {}): AppState {
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

describe("Sesiones por autor (reducer)", () => {
  it("START_ENTREGABLE con autor crea sesión con ese autor", () => {
    const s0 = base({ entregables: [mkEnt("e-1", { sesiones: [] })] });
    const s1 = reducer(s0, { type: "START_ENTREGABLE", id: "e-1", autor: "Gabi", ts: "2026-05-07T09:00:00.000Z" });
    const ses = s1.entregables[0].sesiones ?? [];
    expect(ses).toHaveLength(1);
    expect(ses[0].autor).toBe("Gabi");
    expect(ses[0].finTs).toBeNull();
  });

  it("END_ENTREGABLE_SESION sólo cierra la sesión abierta del autor indicado", () => {
    const s0 = base({
      entregables: [
        mkEnt("e-1", {
          sesiones: [
            { id: "a", inicioTs: "2026-05-07T08:00:00.000Z", finTs: null, pausas: [], autor: "Beltrán" },
            { id: "b", inicioTs: "2026-05-07T08:05:00.000Z", finTs: null, pausas: [], autor: "Gabi" },
          ],
        }),
      ],
    });
    const s1 = reducer(s0, { type: "END_ENTREGABLE_SESION", id: "e-1", autor: "Gabi", ts: "2026-05-07T10:00:00.000Z" });
    const ses = s1.entregables[0].sesiones ?? [];
    expect(ses.find((x) => x.id === "a")?.finTs).toBeNull();
    expect(ses.find((x) => x.id === "b")?.finTs).toBe("2026-05-07T10:00:00.000Z");
  });

  it("UPDATE_SESION_ENTREGABLE_TIMES con editor distinto del autor no modifica", () => {
    const s0 = base({
      entregables: [
        mkEnt("e-1", {
          sesiones: [
            {
              id: "s-1",
              inicioTs: "2026-05-07T08:00:00.000Z",
              finTs: "2026-05-07T09:00:00.000Z",
              pausas: [],
              autor: "Beltrán",
            },
          ],
        }),
      ],
    });
    const s1 = reducer(s0, {
      type: "UPDATE_SESION_ENTREGABLE_TIMES",
      id: "e-1",
      sesionIdx: 0,
      inicioTs: "2026-05-07T07:00:00.000Z",
      finTs: "2026-05-07T09:30:00.000Z",
      editor: "Gabi",
    });
    expect(s1.entregables[0].sesiones?.[0].inicioTs).toBe("2026-05-07T08:00:00.000Z");
  });
});
