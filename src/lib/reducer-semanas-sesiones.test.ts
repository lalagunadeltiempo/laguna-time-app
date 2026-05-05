import { describe, expect, it } from "vitest";
import { reducer } from "./reducer";
import { legacySesionId } from "./sesion-id";
import type { AppState, Entregable } from "./types";
import { EMPTY_ARBOL } from "./types";

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

function mkEntregable(overrides: Partial<Entregable> & { id: string }): Entregable {
  return {
    nombre: `E-${overrides.id}`,
    resultadoId: "r-1",
    tipo: "raw",
    plantillaId: null,
    diasEstimados: 1,
    diasHechos: 0,
    esDiaria: false,
    responsable: "Gabi",
    estado: "planificado",
    creado: "2026-05-01T00:00:00.000Z",
    semana: null,
    fechaLimite: null,
    fechaInicio: null,
    contexto: { urls: [], apps: [], notas: "" },
    implicados: [],
    ...overrides,
    id: overrides.id,
  };
}

describe("Reducer: semanas no activas", () => {
  it("desmarcar una semana legacy deja tombstone de apertura y no la resucita en el array legacy", () => {
    const mk = "2025-08-04";
    const state = baseState({
      arbol: {
        ...EMPTY_ARBOL,
        configs: [{ anio: 2025, semanasNoActivas: [mk] }],
      },
    });
    const next = reducer(state, { type: "TOGGLE_SEMANA_NO_ACTIVA", anio: 2025, mondayKey: mk });
    const cfg = next.arbol?.configs.find((c) => c.anio === 2025);
    expect(cfg?.semanasActivasTs?.[mk]).toBeTruthy();
    expect(cfg?.semanasNoActivasTs).toBeUndefined();
    expect(cfg?.semanasNoActivas ?? []).not.toContain(mk);
  });
});

describe("Reducer: edición de sesiones en HOY", () => {
  it("al editar una sesión legacy, asigna id estable para que el merge no la duplique", () => {
    const entId = "e-1";
    const sesLegacy = { inicioTs: "2026-05-05T09:00:00.000Z", finTs: null as string | null, autor: "Gabi" };
    const state = baseState({
      entregables: [mkEntregable({ id: entId, sesiones: [sesLegacy] })],
    });
    const next = reducer(state, {
      type: "UPDATE_SESION_ENTREGABLE_TIMES",
      id: entId,
      sesionIdx: 0,
      inicioTs: "2026-05-05T10:00:00.000Z",
      finTs: null,
    });
    const ses = next.entregables[0].sesiones?.[0];
    expect(ses?.id).toBe(legacySesionId(entId, sesLegacy));
    expect(ses?.inicioTs).toBe("2026-05-05T10:00:00.000Z");
  });
});
