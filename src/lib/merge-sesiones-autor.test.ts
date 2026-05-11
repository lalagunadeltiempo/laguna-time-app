import { describe, expect, it } from "vitest";
import { mergeStates } from "./merge";
import type { AppState, Entregable } from "./types";
import { EMPTY_ARBOL } from "./types";

function mkEnt(overrides: Partial<Entregable> & { id: string }): Entregable {
  return {
    nombre: `E-${overrides.id}`,
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

describe("mergeStates — preserva autor en sesiones", () => {
  it("cuando el ganador por diasHechos no tiene la sesión, incorpora la del otro cliente con autor", () => {
    const ses = {
      id: "sess-gabi",
      inicioTs: "2026-05-05T10:00:00.000Z",
      finTs: null as string | null,
      pausas: [] as { pauseTs: string; resumeTs: string | null }[],
      autor: "Gabi",
    };
    const winner = base({
      entregables: [mkEnt({ id: "e-1", diasHechos: 3, sesiones: [] })],
    });
    const loser = base({
      entregables: [mkEnt({ id: "e-1", diasHechos: 0, sesiones: [ses] })],
    });
    const merged = mergeStates(winner, loser);
    const out = merged.entregables.find((e) => e.id === "e-1")?.sesiones ?? [];
    const g = out.find((s) => s.id === "sess-gabi");
    expect(g?.autor).toBe("Gabi");
  });
});
