import { describe, expect, it } from "vitest";
import { mergeStates, statesDiffer } from "./merge";
import { reducer } from "./reducer";
import type { AppState, Entregable, Nota } from "./types";
import { EMPTY_ARBOL } from "./types";

function makeNota(id: string, texto = "n"): Nota {
  return { id, texto, autor: "Gabi", creadoTs: "2026-04-30T00:00:00.000Z" };
}

function makeEntregable(id: string, notas: Nota[]): Entregable {
  return {
    id,
    nombre: `Entregable ${id}`,
    descripcion: null,
    resultadoId: "res-1",
    creado: "2026-01-01T00:00:00.000Z",
    diasHechos: 0,
    fechaProgramada: null,
    contexto: { urls: [], apps: [], notas: "" },
    siguientePaso: null,
    notas,
    estado: "a_futuro",
  } as unknown as Entregable;
}

function makeState(notas: Nota[], deletedNotas: string[] = []): AppState {
  return {
    ambitoLabels: { personal: "p", empresa: "e" },
    proyectos: [],
    resultados: [],
    entregables: [makeEntregable("e-1", notas)],
    pasos: [],
    contactos: [],
    inbox: [],
    plantillas: [],
    ejecuciones: [],
    pasosActivos: [],
    miembros: [],
    activityLog: [],
    arbol: EMPTY_ARBOL,
    deleted: {
      proyectos: [],
      resultados: [],
      entregables: [],
      pasos: [],
      plantillas: [],
      notas: deletedNotas,
    },
  };
}

describe("notas: tombstones y borrado distribuido", () => {
  it("DELETE_NOTA quita la nota del entregable y deja un tombstone", () => {
    const state = makeState([makeNota("n-1"), makeNota("n-2")]);
    const next = reducer(state, {
      type: "DELETE_NOTA",
      nivel: "entregable",
      targetId: "e-1",
      notaId: "n-1",
    });
    expect(next.entregables[0].notas?.map((n) => n.id)).toEqual(["n-2"]);
    expect(next.deleted?.notas ?? []).toContain("n-1");
  });

  it("mergeStates no resucita una nota cuyo id está en deleted.notas (otro cliente la borró)", () => {
    /** El cliente A (Gabi) ya borró n-1 y subió tombstones; el cliente B (Beltrán) trae aún la nota. */
    const cloud = makeState([makeNota("n-1"), makeNota("n-2")], ["n-1"]);
    const local = makeState([makeNota("n-1"), makeNota("n-2")]);
    const merged = mergeStates(local, cloud);
    expect(merged.entregables[0].notas?.map((n) => n.id)).toEqual(["n-2"]);
    expect(merged.deleted?.notas ?? []).toContain("n-1");
  });

  it("mergeStates conserva la unión de tombstones aunque la nota ya no exista en ningún lado", () => {
    const a = makeState([makeNota("n-2")], ["n-1"]);
    const b = makeState([makeNota("n-2")], ["n-3"]);
    const merged = mergeStates(a, b);
    expect(new Set(merged.deleted?.notas ?? [])).toEqual(new Set(["n-1", "n-3"]));
  });

  it("statesDiffer detecta cambios en deleted.notas", () => {
    const a = makeState([makeNota("n-1")]);
    const b = makeState([], ["n-1"]);
    expect(statesDiffer(a, b)).toBe(true);
  });
});
