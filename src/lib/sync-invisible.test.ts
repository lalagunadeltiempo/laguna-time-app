import { describe, expect, it } from "vitest";
import type { AppState, NodoArbol } from "./types";
import { EMPTY_ARBOL, EQUIPO_DEFAULT, PLAN_CONFIG_DEFAULT } from "./types";
import { aplicarMergeRemotoSiSeguro, tieneFocoEdicion } from "./sync-invisible";

function makeNodo(id: string, partial: Partial<NodoArbol> = {}): NodoArbol {
  return {
    id,
    anio: 2026,
    orden: 0,
    nombre: id,
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
    creado: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function makeState(nodos: NodoArbol[]): AppState {
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
    arbol: { ...EMPTY_ARBOL, nodos },
    deleted: {
      proyectos: [],
      resultados: [],
      entregables: [],
      pasos: [],
      plantillas: [],
      notas: [],
    },
    planConfig: PLAN_CONFIG_DEFAULT,
  };
}

describe("sync invisible con foco activo", () => {
  it("aplaza merge remoto con input enfocado y aplica al liberar foco", () => {
    const localV1 = makeState([
      makeNodo("aulas", {
        nombre: "Aulas",
        metaValor: undefined,
        actualizado: "2026-05-06T09:00:00.000Z",
      }),
    ]);
    const remoto = makeState([
      makeNodo("aulas", {
        nombre: "Aulas",
        metaValor: 92100,
        actualizado: "2026-05-06T10:00:00.000Z",
      }),
    ]);

    const activeInputMock = { tagName: "INPUT", isContentEditable: false } as unknown as Element;

    const intentoConFoco = aplicarMergeRemotoSiSeguro(
      localV1,
      remoto,
      tieneFocoEdicion(activeInputMock),
    );
    expect(intentoConFoco.merge).toBe(false);
    expect(intentoConFoco.merged.arbol.nodos.find((n) => n.id === "aulas")?.metaValor).toBeUndefined();

    const intentoSinFoco = aplicarMergeRemotoSiSeguro(
      localV1,
      remoto,
      tieneFocoEdicion(null),
    );
    expect(intentoSinFoco.merged.arbol.nodos.find((n) => n.id === "aulas")?.metaValor).toBe(92100);
  });
});
