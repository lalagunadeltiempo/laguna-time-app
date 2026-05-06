/**
 * Tests Bloque 1 (multi-sesión): cada acción del reducer que muta o crea
 * un nodo del árbol debe sellar `actualizado` con el ts actual. Es la
 * pieza que hace que `preferNodoLWW` (ver `merge.ts`) pueda decidir el
 * ganador entre dos copias del mismo nodo viniendo de clientes distintos
 * sin perder los campos rellenados por el más reciente.
 *
 * Cobertura por acción:
 * - ADD_NODO_ARBOL
 * - UPDATE_NODO_ARBOL
 * - UPDATE_META_NODO_RESCALAR_HIJOS (root + hijos reescalados)
 * - LINK_ENTREGABLE_HOJA
 * - UNLINK_ENTREGABLE_HOJA
 * - SET_HOJAS_DE_ENTREGABLE
 * - MOVE_NODO_ARBOL
 * - IMPORT_SUBARBOL_ANIO_ANTERIOR
 * - DELETE_NODO_ARBOL (debe registrar tombstone en `deleted.arbolNodos`)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reducer } from "./reducer";
import type { AppState, NodoArbol } from "./types";
import { EMPTY_ARBOL } from "./types";

const TS_ANTES = "2026-05-01T08:00:00.000Z";
const TS_AHORA = "2026-06-01T10:00:00.000Z";

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
    actualizado: TS_ANTES,
    ...partial,
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
      proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [],
      notas: [], mensajes: [], implicados: [], arbolNodos: [], arbolRegistros: [],
    },
    ...overrides,
  };
}

describe("reducer · sello `actualizado` en nodos del árbol", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TS_AHORA));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ADD_NODO_ARBOL: nodo nuevo recibe `actualizado` si el payload no lo trae", () => {
    const nodo: NodoArbol = {
      id: "nuevo-1",
      anio: 2026,
      orden: 0,
      nombre: "Nuevo",
      tipo: "resultado",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      creado: TS_AHORA,
    };
    const next = reducer(baseState(), { type: "ADD_NODO_ARBOL", payload: nodo });
    expect(next.arbol.nodos[0].actualizado).toBe(TS_AHORA);
  });

  it("ADD_NODO_ARBOL: respeta `actualizado` explícito del payload", () => {
    const explicit = "2026-04-15T12:00:00.000Z";
    const nodo: NodoArbol = {
      id: "nuevo-2",
      anio: 2026,
      orden: 0,
      nombre: "Nuevo",
      tipo: "resultado",
      cadencia: "anual",
      relacionConPadre: "suma",
      contadorModo: "manual",
      creado: TS_AHORA,
      actualizado: explicit,
    };
    const next = reducer(baseState(), { type: "ADD_NODO_ARBOL", payload: nodo });
    expect(next.arbol.nodos[0].actualizado).toBe(explicit);
  });

  it("UPDATE_NODO_ARBOL: bumps `actualizado` y posterior al original", () => {
    const nodo = makeNodo("a", { metaValor: 100 });
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [nodo] } });
    const next = reducer(state, {
      type: "UPDATE_NODO_ARBOL",
      id: "a",
      changes: { metaValor: 200 },
    });
    const out = next.arbol.nodos[0];
    expect(out.metaValor).toBe(200);
    expect(out.actualizado).toBe(TS_AHORA);
    expect(out.actualizado!.localeCompare(TS_ANTES)).toBeGreaterThan(0);
  });

  it("TOGGLE_PIN_PORCENTAJE invierte `metaPctFijo` y bumps `actualizado`", () => {
    const nodo = makeNodo("pin-1", { metaPctFijo: false });
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [nodo] } });
    const next = reducer(state, { type: "TOGGLE_PIN_PORCENTAJE", id: "pin-1" });
    const out = next.arbol.nodos[0];
    expect(out.metaPctFijo).toBe(true);
    expect(out.actualizado).toBe(TS_AHORA);
    expect(out.actualizado!.localeCompare(TS_ANTES)).toBeGreaterThan(0);
  });

  it("UPDATE_META_NODO_RESCALAR_HIJOS: root + hijos reescalados con `actualizado` nuevo", () => {
    const root = makeNodo("root", { metaValor: 1000 });
    const hijo1 = makeNodo("h1", { parentId: "root", metaValor: 600 });
    const hijo2 = makeNodo("h2", { parentId: "root", metaValor: 400 });
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [root, hijo1, hijo2] } });

    const next = reducer(state, {
      type: "UPDATE_META_NODO_RESCALAR_HIJOS",
      id: "root",
      metaValor: 2000,
    });
    const map = new Map(next.arbol.nodos.map((n) => [n.id, n]));
    expect(map.get("root")!.actualizado).toBe(TS_AHORA);
    expect(map.get("h1")!.actualizado).toBe(TS_AHORA);
    expect(map.get("h2")!.actualizado).toBe(TS_AHORA);
    // y los valores escalan al doble.
    expect(map.get("h1")!.metaValor).toBe(1200);
    expect(map.get("h2")!.metaValor).toBe(800);
  });

  it("UPDATE_META_NODO_RESCALAR_HIJOS con metaValor=undefined: solo root recibe actualizado", () => {
    const root = makeNodo("root", { metaValor: 1000 });
    const hijo = makeNodo("h1", { parentId: "root", metaValor: 600 });
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [root, hijo] } });
    const next = reducer(state, {
      type: "UPDATE_META_NODO_RESCALAR_HIJOS",
      id: "root",
      metaValor: undefined,
    });
    const map = new Map(next.arbol.nodos.map((n) => [n.id, n]));
    expect(map.get("root")!.metaValor).toBeUndefined();
    expect(map.get("root")!.actualizado).toBe(TS_AHORA);
    // Hijo intacto: metaValor original conservado, sin bump (no se reescaló).
    expect(map.get("h1")!.metaValor).toBe(600);
    expect(map.get("h1")!.actualizado).toBe(TS_ANTES);
  });

  it("LINK_ENTREGABLE_HOJA actualiza `actualizado` de la hoja afectada", () => {
    const hoja = makeNodo("hoja-1", { parentId: "rama" });
    const otra = makeNodo("otra", { parentId: "rama" });
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [hoja, otra] } });
    const next = reducer(state, {
      type: "LINK_ENTREGABLE_HOJA",
      entregableId: "ent-1",
      hojaId: "hoja-1",
    });
    const map = new Map(next.arbol.nodos.map((n) => [n.id, n]));
    expect(map.get("hoja-1")!.actualizado).toBe(TS_AHORA);
    expect(map.get("otra")!.actualizado).toBe(TS_ANTES);
  });

  it("UNLINK_ENTREGABLE_HOJA actualiza `actualizado` de la hoja afectada", () => {
    const hoja = makeNodo("hoja-1", { parentId: "rama", entregableIds: ["ent-1"] });
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [hoja] } });
    const next = reducer(state, {
      type: "UNLINK_ENTREGABLE_HOJA",
      entregableId: "ent-1",
      hojaId: "hoja-1",
    });
    expect(next.arbol.nodos[0].actualizado).toBe(TS_AHORA);
  });

  it("SET_HOJAS_DE_ENTREGABLE actualiza `actualizado` solo en las hojas que cambian", () => {
    const raiz = makeNodo("raiz", { parentId: undefined });
    const rama = makeNodo("rama", { parentId: "raiz" });
    const hojaA = makeNodo("hoja-a", { parentId: "rama", entregableIds: ["ent-1"] });
    const hojaB = makeNodo("hoja-b", { parentId: "rama" });
    const hojaC = makeNodo("hoja-c", { parentId: "rama", entregableIds: ["ent-1"] });
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [raiz, rama, hojaA, hojaB, hojaC] } });
    // Reasignamos: ent-1 va de a→b. hoja-a pierde, hoja-b gana, hoja-c también pierde.
    const next = reducer(state, {
      type: "SET_HOJAS_DE_ENTREGABLE",
      entregableId: "ent-1",
      hojaIds: ["hoja-b"],
      anio: 2026,
    });
    const map = new Map(next.arbol.nodos.map((n) => [n.id, n]));
    expect(map.get("hoja-a")!.actualizado).toBe(TS_AHORA);
    expect(map.get("hoja-b")!.actualizado).toBe(TS_AHORA);
    expect(map.get("hoja-c")!.actualizado).toBe(TS_AHORA);
    // raíz y rama no se tocan.
    expect(map.get("raiz")!.actualizado).toBe(TS_ANTES);
    expect(map.get("rama")!.actualizado).toBe(TS_ANTES);
  });

  it("MOVE_NODO_ARBOL actualiza `actualizado` del nodo movido", () => {
    const a = makeNodo("a");
    const b = makeNodo("b", { parentId: "a" });
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [a, b] } });
    const next = reducer(state, { type: "MOVE_NODO_ARBOL", id: "b", parentId: null });
    const map = new Map(next.arbol.nodos.map((n) => [n.id, n]));
    expect(map.get("b")!.parentId).toBeUndefined();
    expect(map.get("b")!.actualizado).toBe(TS_AHORA);
    expect(map.get("a")!.actualizado).toBe(TS_ANTES);
  });

  it("IMPORT_SUBARBOL_ANIO_ANTERIOR sella `actualizado` en cada nodo clonado", () => {
    // Año anterior: una raíz con dos hojas.
    const raizPrev = makeNodo("raiz-2025", {
      anio: 2025,
      nombre: "Ingresos",
      metaValor: 10000,
    });
    const hojaPrev1 = makeNodo("h1-2025", {
      anio: 2025,
      parentId: "raiz-2025",
      nombre: "Aulas",
      metaValor: 6000,
    });
    const hojaPrev2 = makeNodo("h2-2025", {
      anio: 2025,
      parentId: "raiz-2025",
      nombre: "Sesiones",
      metaValor: 4000,
    });
    // Año destino: solo raíz vacía con misma estructura nominal.
    const raizDest = makeNodo("raiz-2026", {
      anio: 2026,
      nombre: "Ingresos",
      metaValor: 20000,
    });
    const state = baseState({
      arbol: { ...EMPTY_ARBOL, nodos: [raizPrev, hojaPrev1, hojaPrev2, raizDest] },
    });

    const next = reducer(state, {
      type: "IMPORT_SUBARBOL_ANIO_ANTERIOR",
      raizId: "raiz-2026",
      modo: "plan",
    });

    const nuevos = next.arbol.nodos.filter(
      (n) => n.anio === 2026 && n.parentId === "raiz-2026",
    );
    expect(nuevos.length).toBeGreaterThan(0);
    for (const n of nuevos) {
      expect(n.actualizado).toBe(TS_AHORA);
    }
  });

  it("DELETE_NODO_ARBOL registra el id en `deleted.arbolNodos`", () => {
    const raiz = makeNodo("raiz");
    const hoja = makeNodo("hoja", { parentId: "raiz" });
    const state = baseState({ arbol: { ...EMPTY_ARBOL, nodos: [raiz, hoja] } });
    const next = reducer(state, { type: "DELETE_NODO_ARBOL", id: "raiz" });
    expect(next.arbol.nodos).toHaveLength(0);
    // Tanto la raíz como su hijo se borran en cascada y ambos van a tombstones.
    const tomb = new Set(next.deleted?.arbolNodos ?? []);
    expect(tomb.has("raiz")).toBe(true);
    expect(tomb.has("hoja")).toBe(true);
  });
});
