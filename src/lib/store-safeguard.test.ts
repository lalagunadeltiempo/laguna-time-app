import { describe, expect, it } from "vitest";
import {
  detectarPerdidaInjustificada,
  detectarCambioSignificativo,
  vaciariaArbolDeCloud,
} from "./store-safeguard";
import type { AppState, NodoArbol, PlanArbolState } from "./types";
import { EMPTY_ARBOL, EQUIPO_DEFAULT, PLAN_CONFIG_DEFAULT } from "./types";

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

function makeArbol(nodos: NodoArbol[]): PlanArbolState {
  return { ...EMPTY_ARBOL, nodos };
}

function makeState(arbol: PlanArbolState, deletedArbolNodos: string[] = []): AppState {
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
    arbol,
    deleted: {
      proyectos: [],
      resultados: [],
      entregables: [],
      pasos: [],
      plantillas: [],
      notas: [],
      arbolNodos: deletedArbolNodos,
    },
    planConfig: PLAN_CONFIG_DEFAULT,
  };
}

describe("detectarPerdidaInjustificada", () => {
  it("permite cuando el snapshot es null (primer guardado)", () => {
    const next = makeState(makeArbol([makeNodo("a")]));
    expect(detectarPerdidaInjustificada(null, next).aborta).toBe(false);
  });

  it("permite cuando el snapshot está vacío", () => {
    const snap = makeState(makeArbol([]));
    const next = makeState(makeArbol([makeNodo("a")]));
    expect(detectarPerdidaInjustificada(snap, next).aborta).toBe(false);
  });

  it("permite estado idéntico al snapshot", () => {
    const nodos = [makeNodo("a", { metaValor: 100 }), makeNodo("b", { metaValor: 200 })];
    const snap = makeState(makeArbol(nodos));
    const next = makeState(makeArbol(nodos));
    expect(detectarPerdidaInjustificada(snap, next).aborta).toBe(false);
  });

  it("permite añadir +5 nodos nuevos", () => {
    const base = [makeNodo("a", { metaValor: 100 }), makeNodo("b", { metaValor: 200 })];
    const snap = makeState(makeArbol(base));
    const extra = [
      makeNodo("c"), makeNodo("d"), makeNodo("e"),
      makeNodo("f"), makeNodo("g"),
    ];
    const next = makeState(makeArbol([...base, ...extra]));
    expect(detectarPerdidaInjustificada(snap, next).aborta).toBe(false);
  });

  it("permite borrar un nodo si está en deleted.arbolNodos (tombstone)", () => {
    const base = [makeNodo("a"), makeNodo("b"), makeNodo("c"), makeNodo("d"), makeNodo("e")];
    const snap = makeState(makeArbol(base));
    const next = makeState(makeArbol(base.filter((n) => n.id !== "c")), ["c"]);
    expect(detectarPerdidaInjustificada(snap, next).aborta).toBe(false);
  });

  it("bloquea si pierde 10 nodos sin tombstone", () => {
    const base = Array.from({ length: 15 }, (_, i) => makeNodo(`n${i}`));
    const snap = makeState(makeArbol(base));
    const next = makeState(makeArbol(base.slice(0, 5)));
    const r = detectarPerdidaInjustificada(snap, next);
    expect(r.aborta).toBe(true);
    expect(r.motivo).toMatch(/nodos del árbol/);
  });

  it("permite quitar 1-2 nodos sin tombstone (margen anti-flaky)", () => {
    const base = Array.from({ length: 10 }, (_, i) => makeNodo(`n${i}`));
    const snap = makeState(makeArbol(base));
    const next = makeState(makeArbol(base.slice(0, 9)));
    expect(detectarPerdidaInjustificada(snap, next).aborta).toBe(false);
  });

  it("bloquea si pierde más del 50% de nodos con meta", () => {
    const base = [
      makeNodo("a", { metaValor: 100 }),
      makeNodo("b", { metaValor: 200 }),
      makeNodo("c", { metaValor: 300 }),
      makeNodo("d", { metaValor: 400 }),
      makeNodo("e"),
      makeNodo("f"),
    ];
    const snap = makeState(makeArbol(base));
    // Nuevo estado conserva los 6 nodos pero sin metas en la mayoría.
    const nuevos: NodoArbol[] = base.map((n, i) =>
      i === 0 ? { ...n, metaValor: 100 } : { ...n, metaValor: undefined },
    );
    const next = makeState(makeArbol(nuevos));
    const r = detectarPerdidaInjustificada(snap, next);
    expect(r.aborta).toBe(true);
    expect(r.motivo).toMatch(/nodos con meta/);
  });

  it("bloquea si pierde todos los nodos con meta sin tombstone", () => {
    const base = [
      makeNodo("a", { metaValor: 100 }),
      makeNodo("b", { metaValor: 200 }),
      makeNodo("c", { metaValor: 300 }),
    ];
    const snap = makeState(makeArbol(base));
    const next = makeState(makeArbol(base.map((n) => ({ ...n, metaValor: undefined }))));
    const r = detectarPerdidaInjustificada(snap, next);
    expect(r.aborta).toBe(true);
  });

  it("bloquea si pierde más del 50% de relaciones entregable→hoja", () => {
    const base = [
      makeNodo("a", { entregableIds: ["e1", "e2", "e3", "e4"] }),
      makeNodo("b", { entregableIds: ["e5", "e6"] }),
      makeNodo("c", { entregableIds: ["e7", "e8", "e9", "e10"] }),
    ];
    const snap = makeState(makeArbol(base));
    // 10 relaciones antes; ahora solo 2.
    const next = makeState(
      makeArbol(base.map((n, i) => (i === 0 ? { ...n, entregableIds: ["e1", "e2"] } : { ...n, entregableIds: [] }))),
    );
    const r = detectarPerdidaInjustificada(snap, next);
    expect(r.aborta).toBe(true);
    expect(r.motivo).toMatch(/MAPA/);
  });

  it("permite añadir relaciones (no es pérdida)", () => {
    const base = [makeNodo("a", { entregableIds: ["e1"] })];
    const snap = makeState(makeArbol(base));
    const next = makeState(makeArbol([{ ...base[0], entregableIds: ["e1", "e2", "e3"] }]));
    expect(detectarPerdidaInjustificada(snap, next).aborta).toBe(false);
  });

  it("tolera metaPorTrimestre como única forma de meta", () => {
    const base = [
      makeNodo("a", { metaPorTrimestre: { Q1: 100, Q2: 200 } }),
      makeNodo("b", { metaPorTrimestre: { Q1: 50 } }),
      makeNodo("c", { metaValor: 300 }),
    ];
    const snap = makeState(makeArbol(base));
    const next = makeState(makeArbol(base));
    expect(detectarPerdidaInjustificada(snap, next).aborta).toBe(false);
  });
});

describe("vaciariaArbolDeCloud (Bloque 4)", () => {
  it("bloquea cuando el state a guardar tiene árbol vacío y el snapshot tenía nodos", () => {
    const snap = makeState(makeArbol([makeNodo("a"), makeNodo("b")]));
    const next = makeState(makeArbol([]));
    expect(vaciariaArbolDeCloud(snap, next)).toBe(true);
  });

  it("permite cuando ambos están vacíos (bootstrap)", () => {
    const snap = makeState(makeArbol([]));
    const next = makeState(makeArbol([]));
    expect(vaciariaArbolDeCloud(snap, next)).toBe(false);
  });

  it("permite cuando el snapshot es null (primer guardado)", () => {
    const next = makeState(makeArbol([]));
    expect(vaciariaArbolDeCloud(null, next)).toBe(false);
  });

  it("permite cuando el state tiene nodos (no es vaciado)", () => {
    const snap = makeState(makeArbol([makeNodo("a")]));
    const next = makeState(makeArbol([makeNodo("a"), makeNodo("b")]));
    expect(vaciariaArbolDeCloud(snap, next)).toBe(false);
  });
});

describe("detectarPerdidaInjustificada · escenarios de flush keepalive (Bloque 4)", () => {
  // El flush en `beforeunload` aplica el mismo `detectarPerdidaInjustificada`
  // que el save normal, comparando contra el último `_lastCloudSnapshot`
  // disponible (no puede re-leer cloud). Estos tests documentan que el
  // mismo helper sigue siendo correcto en ese contexto.
  it("flush con árbol vaciado: se detecta como pérdida (mismo trato que save)", () => {
    const base = Array.from({ length: 12 }, (_, i) =>
      makeNodo(`n${i}`, { metaValor: 100 }),
    );
    const snap = makeState(makeArbol(base));
    const next = makeState(makeArbol([])); // beforeunload mandaría esto
    const r = detectarPerdidaInjustificada(snap, next);
    expect(r.aborta).toBe(true);
  });

  it("flush sin pérdida: no bloquea aunque el árbol sea idéntico", () => {
    const base = [makeNodo("a", { metaValor: 100 })];
    const snap = makeState(makeArbol(base));
    const next = makeState(makeArbol(base));
    const r = detectarPerdidaInjustificada(snap, next);
    expect(r.aborta).toBe(false);
  });
});

describe("detectarCambioSignificativo", () => {
  it("considera el primer estado como cambio significativo", () => {
    const next = makeState(makeArbol([makeNodo("a")]));
    expect(detectarCambioSignificativo(null, next)).toBe(true);
  });

  it("no marca cambio si los estados son iguales", () => {
    const nodos = [makeNodo("a", { metaValor: 100 })];
    const a = makeState(makeArbol(nodos));
    const b = makeState(makeArbol(nodos));
    expect(detectarCambioSignificativo(a, b)).toBe(false);
  });

  it("marca cambio cuando se añaden 3+ nodos", () => {
    const a = makeState(makeArbol([makeNodo("a")]));
    const b = makeState(makeArbol([makeNodo("a"), makeNodo("b"), makeNodo("c"), makeNodo("d"), makeNodo("e")]));
    expect(detectarCambioSignificativo(a, b)).toBe(true);
  });

  it("marca cambio cuando aparece una meta nueva", () => {
    const a = makeState(makeArbol([makeNodo("a")]));
    const b = makeState(makeArbol([makeNodo("a", { metaValor: 100 })]));
    expect(detectarCambioSignificativo(a, b)).toBe(true);
  });

  it("marca cambio cuando aparece una relación entregable nueva", () => {
    const a = makeState(makeArbol([makeNodo("a", { entregableIds: [] })]));
    const b = makeState(makeArbol([makeNodo("a", { entregableIds: ["e1"] })]));
    expect(detectarCambioSignificativo(a, b)).toBe(true);
  });
});
