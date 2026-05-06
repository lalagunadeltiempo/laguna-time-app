import { describe, expect, it } from "vitest";
import { mergeStates } from "./merge";
import { reducer } from "./reducer";
import type { AppState, MensajeEntregable } from "./types";
import { EMPTY_ARBOL } from "./types";

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

function mkMensaje(
  id: string,
  entregableId: string,
  creado: string,
  texto = id,
): MensajeEntregable {
  return {
    id,
    entregableId,
    autor: "Gabi",
    texto,
    creado,
  };
}

describe("sync de mensajes por mergeStates", () => {
  it("Caso 1: A crea M1 y B crea M2 desde V1, el merge conserva ambos", () => {
    const v1 = baseState();
    const a = reducer(v1, {
      type: "ADD_MENSAJE",
      payload: mkMensaje("m1", "ent-1", "2026-05-06T10:00:00.000Z", "M1"),
    });
    const b = reducer(v1, {
      type: "ADD_MENSAJE",
      payload: mkMensaje("m2", "ent-1", "2026-05-06T10:01:00.000Z", "M2"),
    });
    const merged = mergeStates(b, a);
    const ids = (merged.mensajes ?? []).map((m) => m.id).sort();
    expect(ids).toEqual(["m1", "m2"]);
  });

  it("Caso 2: edición posterior gana por LWW (editado)", () => {
    const base = baseState({
      mensajes: [mkMensaje("m1", "ent-1", "2026-05-06T10:00:00.000Z", "texto original")],
    });
    const a = reducer(base, {
      type: "UPDATE_MENSAJE",
      id: "m1",
      changes: {
        texto: "texto editado",
        editado: "2026-05-06T10:10:00.000Z",
      },
    });
    const b = base;
    const merged = mergeStates(b, a);
    expect(merged.mensajes?.[0].texto).toBe("texto editado");
    expect(merged.mensajes?.[0].editado).toBe("2026-05-06T10:10:00.000Z");
  });

  it("Caso 3: borrar M1 deja tombstone y no resucita", () => {
    const base = baseState({
      mensajes: [mkMensaje("m1", "ent-1", "2026-05-06T10:00:00.000Z", "M1")],
    });
    const a = reducer(base, { type: "DELETE_MENSAJE", id: "m1" });
    const b = base;
    const merged = mergeStates(a, b);
    expect(merged.mensajes ?? []).toEqual([]);
    expect(merged.deleted?.mensajes ?? []).toContain("m1");
  });

  it("Caso 4: escrituras concurrentes 10:00 y 10:01 sobreviven en ambos sentidos", () => {
    const v1 = baseState();
    const a = reducer(v1, {
      type: "ADD_MENSAJE",
      payload: mkMensaje("m1", "ent-1", "2026-05-06T10:00:00.000Z", "M1"),
    });
    const b = reducer(v1, {
      type: "ADD_MENSAJE",
      payload: mkMensaje("m2", "ent-1", "2026-05-06T10:01:00.000Z", "M2"),
    });
    const ab = mergeStates(a, b);
    const ba = mergeStates(b, a);
    expect((ab.mensajes ?? []).map((m) => m.id).sort()).toEqual(["m1", "m2"]);
    expect((ba.mensajes ?? []).map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });
});
