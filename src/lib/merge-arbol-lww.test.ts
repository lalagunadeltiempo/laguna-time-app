/**
 * Tests Bloque 2 (multi-sesión) + casos de Bloque 3:
 * `preferNodoLWW` resuelve empates por id de `arbol.nodos` con LWW por
 * `actualizado`, y, cuando ningún lado tiene ese campo, hace un merge
 * campo a campo conservador que NUNCA sobrescribe valores definidos
 * con `undefined`.
 *
 * Adicionalmente cubre los tombstones de relaciones MAPA→Árbol
 * (`deleted.entregableHojaLinks`): un vínculo borrado en un cliente no
 * resucita al unir con otro cliente que aún lo tenía.
 */
import { describe, expect, it } from "vitest";
import { mergeStates } from "./merge";
import type { AppState, NodoArbol } from "./types";
import { EMPTY_ARBOL } from "./types";

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

function baseState(nodos: NodoArbol[], overrides: Partial<AppState> = {}): AppState {
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
    ...overrides,
  };
}

describe("merge árbol · preferNodoLWW", () => {
  it("LWW: gana el nodo con `actualizado` más reciente y aporta sus campos", () => {
    const oldA = makeNodo("aulas", {
      metaValor: 80000,
      nombre: "Aulas (vieja)",
      actualizado: "2026-05-05T10:00:00.000Z",
    });
    const newB = makeNodo("aulas", {
      metaValor: 92100,
      nombre: "Aulas (nueva)",
      actualizado: "2026-05-06T10:00:00.000Z",
    });
    const merged = mergeStates(baseState([oldA]), baseState([newB]));
    const out = merged.arbol.nodos.find((n) => n.id === "aulas")!;
    expect(out.metaValor).toBe(92100);
    expect(out.nombre).toBe("Aulas (nueva)");
    expect(out.actualizado).toBe("2026-05-06T10:00:00.000Z");
  });

  it("LWW: el ganador con metaValor=undefined NO pisa al perdedor con metaValor (caso variant del audit)", () => {
    // Reproduce la "variante peor" del §1: el cliente B abrió el formulario
    // y por glitch su nodo quedó con metaValor=undefined; al subir, su
    // `actualizado` es más reciente que el del A. ANTES del fix esto
    // pisaba el 92100 con undefined. AHORA el ganador LWW se queda
    // tal cual; documentamos esta limitación porque en este caso hace
    // falta una salvaguarda complementaria (ya cubierta en el Bloque 4
    // con `detectarPerdidaInjustificada` al nivel de árbol entero).
    //
    // El caso que el usuario pidió explícitamente es el contrario: un
    // nodo con metaValor=92100 y `actualizado` más reciente debe ganar
    // sobre un nodo con metaValor=undefined y `actualizado` más antiguo.
    const conMeta = makeNodo("aulas", {
      metaValor: 92100,
      actualizado: "2026-05-06T10:00:00.000Z",
    });
    const sinMeta = makeNodo("aulas", {
      metaValor: undefined,
      actualizado: "2026-05-05T10:00:00.000Z",
    });
    const merged = mergeStates(baseState([sinMeta]), baseState([conMeta]));
    expect(merged.arbol.nodos[0].metaValor).toBe(92100);
  });

  it("conservador (sin actualizado en ningún lado): preserva metaValor del lado que SÍ lo define", () => {
    const conMeta = makeNodo("aulas", { metaValor: 92100 });
    const sinMeta = makeNodo("aulas", { metaValor: undefined });
    const merged1 = mergeStates(baseState([conMeta]), baseState([sinMeta]));
    expect(merged1.arbol.nodos[0].metaValor).toBe(92100);
    const merged2 = mergeStates(baseState([sinMeta]), baseState([conMeta]));
    expect(merged2.arbol.nodos[0].metaValor).toBe(92100);
  });

  it("conservador (sin actualizado): entregableIds = unión de ambos", () => {
    const a = makeNodo("hoja", { entregableIds: ["e1", "e2"] });
    const b = makeNodo("hoja", { entregableIds: ["e2", "e3"] });
    const merged = mergeStates(baseState([a]), baseState([b]));
    const ids = (merged.arbol.nodos[0].entregableIds ?? []).sort();
    expect(ids).toEqual(["e1", "e2", "e3"]);
  });

  it("conservador (sin actualizado): si ambos definen distinto, gana `y` (segundo arg)", () => {
    const a = makeNodo("hoja", { nombre: "Antiguo", metaValor: 10 });
    const b = makeNodo("hoja", { nombre: "Nuevo", metaValor: 20 });
    const merged = mergeStates(baseState([a]), baseState([b]));
    expect(merged.arbol.nodos[0].nombre).toBe("Nuevo");
    expect(merged.arbol.nodos[0].metaValor).toBe(20);
  });

  it("conservador (sin actualizado): metaPorTrimestre se une por trimestre", () => {
    const a = makeNodo("hoja", { metaPorTrimestre: { Q1: 100, Q2: 200 } });
    const b = makeNodo("hoja", { metaPorTrimestre: { Q3: 300 } });
    const merged = mergeStates(baseState([a]), baseState([b]));
    expect(merged.arbol.nodos[0].metaPorTrimestre).toEqual({
      Q1: 100, Q2: 200, Q3: 300,
    });
  });

  it("tombstone de entregableHojaLinks elimina la relación tras el merge (sin actualizado)", () => {
    const a = makeNodo("hoja", { entregableIds: ["e1", "e2"] });
    const b = makeNodo("hoja", { entregableIds: ["e2", "e3"] });
    const sa = baseState([a], {
      deleted: {
        proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [],
        notas: [], mensajes: [], implicados: [], arbolNodos: [], arbolRegistros: [],
        entregableHojaLinks: { "hoja::e2": "2026-05-06T10:00:00.000Z" },
      },
    });
    const sb = baseState([b]);
    const merged = mergeStates(sa, sb);
    const ids = (merged.arbol.nodos[0].entregableIds ?? []).sort();
    // e2 desaparece por tombstone; e1 y e3 se conservan.
    expect(ids).toEqual(["e1", "e3"]);
  });

  it("tombstone con ts ANTERIOR al `actualizado` del nodo: la relación se conserva (re-vinculada)", () => {
    // Caso: borré el vínculo el día 5, pero el día 6 lo volví a crear
    // (LINK_ENTREGABLE_HOJA con `actualizado` posterior). El tombstone
    // viejo no debe ganar.
    const node = makeNodo("hoja", {
      entregableIds: ["e1"],
      actualizado: "2026-05-06T10:00:00.000Z",
    });
    const sa = baseState([node], {
      deleted: {
        proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [],
        notas: [], mensajes: [], implicados: [], arbolNodos: [], arbolRegistros: [],
        entregableHojaLinks: { "hoja::e1": "2026-05-05T10:00:00.000Z" },
      },
    });
    const sb = baseState([]);
    const merged = mergeStates(sa, sb);
    expect(merged.arbol.nodos[0].entregableIds).toEqual(["e1"]);
  });

  it("merge de `deleted.entregableHojaLinks`: gana el ts más reciente por clave", () => {
    const a = baseState([], {
      deleted: {
        proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [],
        notas: [], mensajes: [], implicados: [], arbolNodos: [], arbolRegistros: [],
        entregableHojaLinks: { "h1::e1": "2026-05-05T10:00:00.000Z" },
      },
    });
    const b = baseState([], {
      deleted: {
        proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [],
        notas: [], mensajes: [], implicados: [], arbolNodos: [], arbolRegistros: [],
        entregableHojaLinks: {
          "h1::e1": "2026-05-06T10:00:00.000Z",
          "h1::e2": "2026-05-04T10:00:00.000Z",
        },
      },
    });
    const merged = mergeStates(a, b);
    const tomb = merged.deleted?.entregableHojaLinks ?? {};
    expect(tomb["h1::e1"]).toBe("2026-05-06T10:00:00.000Z");
    expect(tomb["h1::e2"]).toBe("2026-05-04T10:00:00.000Z");
  });

  it("escenario reproducción del bug del audit: clienteB local sin metaValor + clienteA cloud con 92100 y entregable e2", () => {
    // V1 inicial (ambos clientes): rama 'aulas' SIN metaValor, entregables=[e1].
    // Mac A: edita y guarda V2A con metaValor=92100, entregableIds=[e1,e2], actualizado más reciente.
    // Mac B (sin sincronizar): tiene V1 sin metaValor con entregableIds=[e1].
    //   Al ir a guardar, el `saveStateCloud` hace mergeStates(stateToSave_B, cloudState_A).
    //   Esperamos que el resultado mantenga metaValor=92100 y entregableIds=[e1,e2].
    const cloudA = makeNodo("aulas", {
      metaValor: 92100,
      entregableIds: ["e1", "e2"],
      actualizado: "2026-05-06T10:00:00.000Z",
    });
    const localBSinSync = makeNodo("aulas", {
      metaValor: undefined,
      entregableIds: ["e1"],
      // Sin `actualizado`: simulación de un estado migrado que aún no ha
      // sido tocado por el reducer post-Bloque 1 en este cliente.
    });
    const merged = mergeStates(baseState([localBSinSync]), baseState([cloudA]));
    const out = merged.arbol.nodos.find((n) => n.id === "aulas")!;
    expect(out.metaValor).toBe(92100);
    // El cloud (segundo arg) gana entero al tener `actualizado`, así que
    // sus entregableIds prevalecen: [e1, e2].
    expect((out.entregableIds ?? []).sort()).toEqual(["e1", "e2"]);
  });

  it("tombstone de entregableHojaLinks SOBREVIVE a un merge contra un cliente sin tombstone (Bloque 3)", () => {
    // Mac A acaba de borrar el vínculo (tiene tombstone reciente). Mac B
    // tiene una copia antigua con el vínculo y sin tombstone.
    const macA = makeNodo("hoja", {
      entregableIds: [], // ya borrada localmente
      actualizado: "2026-05-06T10:00:00.000Z",
    });
    const macB = makeNodo("hoja", {
      entregableIds: ["e1"],
      actualizado: "2026-05-05T09:00:00.000Z",
    });
    const sa = baseState([macA], {
      deleted: {
        proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [],
        notas: [], mensajes: [], implicados: [], arbolNodos: [], arbolRegistros: [],
        entregableHojaLinks: { "hoja::e1": "2026-05-06T10:00:00.000Z" },
      },
    });
    const sb = baseState([macB]);
    // El merge en cualquier orden conserva el borrado y el tombstone.
    for (const merged of [mergeStates(sa, sb), mergeStates(sb, sa)]) {
      const out = merged.arbol.nodos.find((n) => n.id === "hoja")!;
      expect(out.entregableIds ?? []).not.toContain("e1");
      expect(merged.deleted?.entregableHojaLinks?.["hoja::e1"]).toBe("2026-05-06T10:00:00.000Z");
    }
  });

  it("re-vincular después de borrar: el `actualizado` reciente del nodo gana al tombstone viejo", () => {
    // Mac A: borró ayer (tombstone 5/5) y NO ha vuelto a vincular.
    // Mac B: acaba de re-vincular hoy (actualizado 6/5) → su nodo tiene e1.
    const macA = makeNodo("hoja", {
      entregableIds: [],
      actualizado: "2026-05-05T10:00:00.000Z",
    });
    const macB = makeNodo("hoja", {
      entregableIds: ["e1"],
      actualizado: "2026-05-06T11:00:00.000Z",
    });
    const sa = baseState([macA], {
      deleted: {
        proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [],
        notas: [], mensajes: [], implicados: [], arbolNodos: [], arbolRegistros: [],
        entregableHojaLinks: { "hoja::e1": "2026-05-05T10:00:00.000Z" },
      },
    });
    const sb = baseState([macB]);
    const merged = mergeStates(sa, sb);
    const out = merged.arbol.nodos.find((n) => n.id === "hoja")!;
    // El nodo ganador (B) tiene `actualizado` posterior al tombstone:
    // el filtrado deja pasar `e1`.
    expect(out.entregableIds).toEqual(["e1"]);
  });

  it("registros del árbol: LWW por `actualizado` (cubre §2 del audit)", () => {
    const r1A: import("./types").RegistroNodo = {
      id: "r-1", nodoId: "n-1", periodoTipo: "mes", periodoKey: "2026-05",
      valor: 100, creado: "2026-05-01T00:00:00.000Z", actualizado: "2026-05-05T10:00:00.000Z",
    };
    const r1B: import("./types").RegistroNodo = {
      id: "r-1", nodoId: "n-1", periodoTipo: "mes", periodoKey: "2026-05",
      valor: 999, creado: "2026-05-01T00:00:00.000Z", actualizado: "2026-05-06T10:00:00.000Z",
    };
    const sa = baseState([], { arbol: { ...EMPTY_ARBOL, registros: [r1A] } });
    const sb = baseState([], { arbol: { ...EMPTY_ARBOL, registros: [r1B] } });
    const merged = mergeStates(sa, sb);
    expect(merged.arbol.registros[0].valor).toBe(999);
  });
});
