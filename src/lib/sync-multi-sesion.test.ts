/**
 * Test e2e final del bloque multi-sesión: reproduce el escenario que
 * la usuaria sufrió, ahora con todos los fixes aplicados.
 *
 * Estado V1: rama "Aulas" SIN metaValor, entregables linkados [e1].
 * Mac A: modifica metaValor=92100 y añade e2 a la hoja → V2A con
 *        `actualizado` reciente.
 * Mac B: en paralelo, modifica el nombre de OTRA rama → V2B con
 *        `actualizado` algo anterior.
 *
 * mergeStates(V2B, V2A) → resultado:
 *  - mantiene metaValor=92100 (Mac A es más reciente para 'Aulas'),
 *  - mantiene entregableIds=[e1, e2] (incluye la nueva relación),
 *  - mantiene el cambio de nombre de Mac B en la otra rama.
 */
import { describe, expect, it } from "vitest";
import { mergeStates } from "./merge";
import type { AppState, NodoArbol } from "./types";
import { EMPTY_ARBOL } from "./types";

const TS_V1 = "2026-05-04T08:00:00.000Z";
const TS_MAC_B = "2026-05-06T09:00:00.000Z"; // anterior
const TS_MAC_A = "2026-05-06T10:00:00.000Z"; // posterior

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
    actualizado: TS_V1,
    ...partial,
  };
}

function baseState(nodos: NodoArbol[]): AppState {
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
    arbol: { ...EMPTY_ARBOL, nodos },
    deleted: {
      proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [],
      notas: [], mensajes: [], implicados: [], arbolNodos: [], arbolRegistros: [],
    },
  };
}

describe("multi-sesión e2e: dos Macs editan en paralelo sin perder datos", () => {
  it("escenario completo: Mac A modifica meta+vínculo de Aulas, Mac B renombra otra rama", () => {
    // V1 común a ambos clientes.
    const aulasV1 = makeNodo("aulas", {
      nombre: "Aulas",
      metaValor: undefined,
      entregableIds: ["e1"],
      actualizado: TS_V1,
    });
    const sesionesV1 = makeNodo("sesiones", {
      nombre: "Sesiones",
      metaValor: 30000,
      actualizado: TS_V1,
    });

    // V2A: Mac A modifica metaValor=92100 y añade e2 a Aulas.
    const aulasV2A = {
      ...aulasV1,
      metaValor: 92100,
      entregableIds: ["e1", "e2"],
      actualizado: TS_MAC_A,
    };
    const sesionesV2A = sesionesV1; // sin tocar
    const v2A = baseState([aulasV2A, sesionesV2A]);

    // V2B: Mac B sólo renombra "Sesiones" → "Sesiones individuales".
    const sesionesV2B = {
      ...sesionesV1,
      nombre: "Sesiones individuales",
      actualizado: TS_MAC_B,
    };
    const aulasV2B = aulasV1; // sin tocar
    const v2B = baseState([aulasV2B, sesionesV2B]);

    // Merge en el orden que pediste explícitamente:
    // mergeStates(V2B, V2A) → V2A es el más reciente, debería ganar
    // los campos de Aulas; V2B debería ganar el nombre de Sesiones.
    const merged = mergeStates(v2B, v2A);
    const map = new Map(merged.arbol.nodos.map((n) => [n.id, n]));
    const aulas = map.get("aulas")!;
    const sesiones = map.get("sesiones")!;

    // 1. metaValor de Aulas se conserva (la pérdida que sufrió la usuaria).
    expect(aulas.metaValor).toBe(92100);
    // 2. entregableIds incluye el nuevo vínculo e2.
    expect((aulas.entregableIds ?? []).sort()).toEqual(["e1", "e2"]);
    // 3. El cambio de nombre del Mac B se conserva (LWW por nodo:
    //    Sesiones sólo lo tocó B, así que su versión gana).
    expect(sesiones.nombre).toBe("Sesiones individuales");
    // 4. La meta de Sesiones se mantiene en su valor original.
    expect(sesiones.metaValor).toBe(30000);

    // El merge en orden inverso debe dar el mismo resultado funcional
    // (mergeStates no es estrictamente conmutativo en la elección de ts
    // entre empates, pero las propiedades observables coinciden).
    const mergedReverso = mergeStates(v2A, v2B);
    const mapR = new Map(mergedReverso.arbol.nodos.map((n) => [n.id, n]));
    expect(mapR.get("aulas")!.metaValor).toBe(92100);
    expect((mapR.get("aulas")!.entregableIds ?? []).sort()).toEqual(["e1", "e2"]);
    expect(mapR.get("sesiones")!.nombre).toBe("Sesiones individuales");
  });

  it("además: si Mac A había desvinculado e1 (tombstone TS_MAC_A), el merge no resucita e1", () => {
    // Variante: Mac A no añadió e2, sino que QUITÓ e1 y dejó la lista vacía.
    // El reducer escribió un tombstone `aulas::e1` con TS_MAC_A.
    const aulasV1 = makeNodo("aulas", {
      entregableIds: ["e1"],
      actualizado: TS_V1,
    });
    const aulasV2A = {
      ...aulasV1,
      entregableIds: undefined,
      actualizado: TS_MAC_A,
    };
    const v2A: AppState = {
      ...baseState([aulasV2A]),
      deleted: {
        proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [],
        notas: [], mensajes: [], implicados: [], arbolNodos: [], arbolRegistros: [],
        entregableHojaLinks: { "aulas::e1": TS_MAC_A },
      },
    };
    const v2B = baseState([aulasV1]); // Mac B no se ha enterado del borrado

    const merged = mergeStates(v2B, v2A);
    const aulas = merged.arbol.nodos.find((n) => n.id === "aulas")!;
    expect(aulas.entregableIds ?? []).not.toContain("e1");
    expect(merged.deleted?.entregableHojaLinks?.["aulas::e1"]).toBe(TS_MAC_A);
  });

  it("además: Mac A añade un nodo nuevo y Mac B no lo conoce → el merge lo conserva", () => {
    const aulas = makeNodo("aulas", { actualizado: TS_V1 });
    const nodoNuevoMacA = makeNodo("hoja-nueva", {
      parentId: "aulas",
      nombre: "Hoja nueva creada en Mac A",
      actualizado: TS_MAC_A,
    });
    const v2A = baseState([aulas, nodoNuevoMacA]);
    const v2B = baseState([aulas]);

    const merged = mergeStates(v2B, v2A);
    const ids = merged.arbol.nodos.map((n) => n.id).sort();
    expect(ids).toEqual(["aulas", "hoja-nueva"]);
  });
});
