import { describe, expect, it } from "vitest";
import {
  clonarEstructuraDeAnioAnterior,
  reescalarSubarbolProporcional,
} from "./arbol-tiempo";
import { reducer } from "./reducer";
import { EMPTY_ARBOL, type AppState, type NodoArbol } from "./types";

/**
 * Cubre el flujo de edición del bloque ANUAL del Árbol de objetivos
 * después de "Traer estructura de {año-1}":
 *  - editar la meta€ de una rama reescala sus hojas proporcionalmente
 *    (vía la nueva acción `UPDATE_META_NODO_RESCALAR_HIJOS` y vía el
 *    helper puro `reescalarSubarbolProporcional`),
 *  - editar la meta€ de la raíz reescala el subárbol entero,
 *  - editar la meta de una hoja individual NO afecta a las demás hojas
 *    (sigue usando `UPDATE_NODO_ARBOL`),
 *  - eliminar una rama tras importar deja la estructura limpia y editable
 *    (sin nodos huérfanos).
 */

const ts = "2026-01-01T00:00:00.000Z";

function mkNodo(p: Omit<NodoArbol, "creado">): NodoArbol {
  return { ...p, creado: ts };
}

function mkRoot(anio: number, id: string, metaValor: number | undefined): NodoArbol {
  return mkNodo({
    id,
    anio,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor,
  });
}

function mkChild(p: {
  id: string;
  parentId: string;
  anio: number;
  nombre: string;
  orden: number;
  metaValor?: number;
  relacionConPadre?: NodoArbol["relacionConPadre"];
}): NodoArbol {
  return mkNodo({
    id: p.id,
    anio: p.anio,
    parentId: p.parentId,
    orden: p.orden,
    nombre: p.nombre,
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: p.relacionConPadre ?? "suma",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor: p.metaValor,
  });
}

function makeIdGen(prefix = "new"): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function baseState(nodos: NodoArbol[]): AppState {
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
    arbol: { ...EMPTY_ARBOL, nodos },
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
  };
}

describe("reescalarSubarbolProporcional (helper puro)", () => {
  it("reescala las hojas de una rama manteniendo proporciones cuando cambia la meta de la rama", () => {
    const raiz = mkRoot(2026, "r26", 1_000_000);
    const rama = mkChild({ id: "ra", parentId: "r26", anio: 2026, nombre: "Aulas", orden: 0, metaValor: 100_000 });
    const h1 = mkChild({ id: "h1", parentId: "ra", anio: 2026, nombre: "A1", orden: 0, metaValor: 60_000 });
    const h2 = mkChild({ id: "h2", parentId: "ra", anio: 2026, nombre: "A2", orden: 1, metaValor: 30_000 });
    const h3 = mkChild({ id: "h3", parentId: "ra", anio: 2026, nombre: "A3", orden: 2, metaValor: 10_000 });
    const cambios = reescalarSubarbolProporcional({
      nodos: [raiz, rama, h1, h2, h3],
      rootId: "ra",
      nuevaMetaRoot: 200_000,
    });
    // Factor 2x sobre las hojas, sólo descendientes (la propia rama no aparece).
    expect(cambios.size).toBe(3);
    expect(cambios.get("h1")).toBeCloseTo(120_000, 2);
    expect(cambios.get("h2")).toBeCloseTo(60_000, 2);
    expect(cambios.get("h3")).toBeCloseTo(20_000, 2);
    expect(cambios.has("ra")).toBe(false);
  });

  it("propaga en cascada: cambiar la meta de la raíz reescala ramas y hojas", () => {
    const raiz = mkRoot(2026, "r26", 600_000);
    const ramaA = mkChild({ id: "ra", parentId: "r26", anio: 2026, nombre: "Aulas", orden: 0, metaValor: 400_000 });
    const ramaB = mkChild({ id: "rb", parentId: "r26", anio: 2026, nombre: "Programas", orden: 1, metaValor: 200_000 });
    const ha1 = mkChild({ id: "ha1", parentId: "ra", anio: 2026, nombre: "A1", orden: 0, metaValor: 300_000 });
    const ha2 = mkChild({ id: "ha2", parentId: "ra", anio: 2026, nombre: "A2", orden: 1, metaValor: 100_000 });
    const cambios = reescalarSubarbolProporcional({
      nodos: [raiz, ramaA, ramaB, ha1, ha2],
      rootId: "r26",
      nuevaMetaRoot: 1_200_000,
    });
    expect(cambios.get("ra")).toBeCloseTo(800_000, 2);
    expect(cambios.get("rb")).toBeCloseTo(400_000, 2);
    expect(cambios.get("ha1")).toBeCloseTo(600_000, 2);
    expect(cambios.get("ha2")).toBeCloseTo(200_000, 2);
  });

  it("ignora hijos cuyo `relacionConPadre === 'explica'`: no se reescalan", () => {
    const raiz = mkRoot(2026, "r26", 100_000);
    const ramaSuma = mkChild({ id: "rs", parentId: "r26", anio: 2026, nombre: "Suma", orden: 0, metaValor: 80_000 });
    const ramaInfo = mkChild({
      id: "ri",
      parentId: "r26",
      anio: 2026,
      nombre: "InformaSolo",
      orden: 1,
      metaValor: 20_000,
      relacionConPadre: "explica",
    });
    const cambios = reescalarSubarbolProporcional({
      nodos: [raiz, ramaSuma, ramaInfo],
      rootId: "r26",
      nuevaMetaRoot: 200_000,
    });
    // La rama "explica" se queda intacta; la "suma" absorbe el nuevo total.
    expect(cambios.has("ri")).toBe(false);
    expect(cambios.get("rs")).toBeCloseTo(200_000, 2);
  });

  it("no reescala si la suma actual de hijos es 0 o si los hijos no tienen meta definida", () => {
    const raiz = mkRoot(2026, "r26", 100_000);
    const r1 = mkChild({ id: "r1", parentId: "r26", anio: 2026, nombre: "Sin", orden: 0 });
    const r2 = mkChild({ id: "r2", parentId: "r26", anio: 2026, nombre: "Tampoco", orden: 1 });
    const cambios = reescalarSubarbolProporcional({
      nodos: [raiz, r1, r2],
      rootId: "r26",
      nuevaMetaRoot: 500_000,
    });
    expect(cambios.size).toBe(0);
  });

  it("nuevaMetaRoot=0 lleva a 0 todos los descendientes con meta", () => {
    const raiz = mkRoot(2026, "r26", 100_000);
    const r1 = mkChild({ id: "r1", parentId: "r26", anio: 2026, nombre: "Uno", orden: 0, metaValor: 60_000 });
    const r2 = mkChild({ id: "r2", parentId: "r26", anio: 2026, nombre: "Dos", orden: 1, metaValor: 40_000 });
    const cambios = reescalarSubarbolProporcional({
      nodos: [raiz, r1, r2],
      rootId: "r26",
      nuevaMetaRoot: 0,
    });
    expect(cambios.get("r1")).toBe(0);
    expect(cambios.get("r2")).toBe(0);
  });

  it("ignora hijos de otro año (no contamina entre 2025 y 2026)", () => {
    const raiz26 = mkRoot(2026, "r26", 100_000);
    const r26a = mkChild({ id: "ra", parentId: "r26", anio: 2026, nombre: "A", orden: 0, metaValor: 100_000 });
    const raiz25 = mkRoot(2025, "r25", 80_000);
    const r25a = mkChild({ id: "r25a", parentId: "r25", anio: 2025, nombre: "A", orden: 0, metaValor: 80_000 });
    const cambios = reescalarSubarbolProporcional({
      nodos: [raiz26, r26a, raiz25, r25a],
      rootId: "r26",
      nuevaMetaRoot: 200_000,
    });
    expect(cambios.size).toBe(1);
    expect(cambios.get("ra")).toBeCloseTo(200_000, 2);
    expect(cambios.has("r25a")).toBe(false);
  });
});

describe("UPDATE_META_NODO_RESCALAR_HIJOS (reducer)", () => {
  function importAndState(): { state: AppState; ramaIdAulas: string; ramaIdProgramas: string; hojaIds: string[] } {
    // Año pasado: 100 k€ totales repartidos 70/30 entre Aulas y Programas;
    // Aulas tiene 2 hojas (A1=50k, A2=20k) y Programas otra (P1=30k).
    const r25 = mkRoot(2025, "r25", 100_000);
    const ramaA25 = mkChild({ id: "a25", parentId: "r25", anio: 2025, nombre: "Aulas", orden: 0, metaValor: 70_000 });
    const ha1_25 = mkChild({ id: "ha1_25", parentId: "a25", anio: 2025, nombre: "A1", orden: 0, metaValor: 50_000 });
    const ha2_25 = mkChild({ id: "ha2_25", parentId: "a25", anio: 2025, nombre: "A2", orden: 1, metaValor: 20_000 });
    const ramaB25 = mkChild({ id: "b25", parentId: "r25", anio: 2025, nombre: "Programas", orden: 1, metaValor: 30_000 });
    const hb1_25 = mkChild({ id: "hb1_25", parentId: "b25", anio: 2025, nombre: "P1", orden: 0, metaValor: 30_000 });
    const r26 = mkRoot(2026, "r26", 100_000);
    const nodos = [r25, ramaA25, ha1_25, ha2_25, ramaB25, hb1_25, r26];

    // Importamos directamente con la función pura (la acción del reducer
    // hace lo mismo y ya está cubierta en arbol-clonar.test.ts).
    const { nuevosNodos } = clonarEstructuraDeAnioAnterior({
      nodos,
      anioDestino: 2026,
      raizDestinoId: "r26",
      generateId: makeIdGen("c"),
    });
    const todos = [...nodos, ...nuevosNodos];
    const aulas26 = nuevosNodos.find((n) => n.nombre === "Aulas")!;
    const programas26 = nuevosNodos.find((n) => n.nombre === "Programas")!;
    const hojas26 = nuevosNodos.filter(
      (n) => n.parentId === aulas26.id || n.parentId === programas26.id,
    );
    return {
      state: baseState(todos),
      ramaIdAulas: aulas26.id,
      ramaIdProgramas: programas26.id,
      hojaIds: hojas26.map((h) => h.id),
    };
  }

  it("editar la meta€ de una rama reescala sus hojas proporcionalmente", () => {
    const { state, ramaIdAulas } = importAndState();
    // Tras importar: rama Aulas 70 k€, hojas A1=50k, A2=20k.
    const aulasAntes = state.arbol!.nodos.find((n) => n.id === ramaIdAulas)!;
    expect(aulasAntes.metaValor).toBeCloseTo(70_000, 2);

    const nextState = reducer(state, {
      type: "UPDATE_META_NODO_RESCALAR_HIJOS",
      id: ramaIdAulas,
      metaValor: 140_000, // duplicar
    });
    const aulasDespues = nextState.arbol!.nodos.find((n) => n.id === ramaIdAulas)!;
    expect(aulasDespues.metaValor).toBeCloseTo(140_000, 2);
    const hojasAulas = nextState.arbol!.nodos.filter((n) => n.parentId === ramaIdAulas);
    const sumHojas = hojasAulas.reduce((acc, h) => acc + (h.metaValor ?? 0), 0);
    expect(sumHojas).toBeCloseTo(140_000, 2);
    // Proporciones conservadas: A1 ≈ 100k (50/70 * 140), A2 ≈ 40k (20/70 * 140).
    const a1 = hojasAulas.find((h) => h.nombre === "A1")!;
    const a2 = hojasAulas.find((h) => h.nombre === "A2")!;
    expect(a1.metaValor).toBeCloseTo(100_000, 2);
    expect(a2.metaValor).toBeCloseTo(40_000, 2);
  });

  it("editar el % de una rama (vía conversión a €) actualiza € coherentemente y reescala hojas", () => {
    const { state, ramaIdAulas } = importAndState();
    // Simulamos lo que hace el PercentInput: para el 50 % de 100 k = 50 k€.
    const metaAnual = 100_000;
    const nuevoPct = 50;
    const nuevoEur = Math.round(((metaAnual * nuevoPct) / 100) * 100) / 100;
    expect(nuevoEur).toBe(50_000);
    const nextState = reducer(state, {
      type: "UPDATE_META_NODO_RESCALAR_HIJOS",
      id: ramaIdAulas,
      metaValor: nuevoEur,
    });
    const aulas = nextState.arbol!.nodos.find((n) => n.id === ramaIdAulas)!;
    expect(aulas.metaValor).toBe(50_000);
    const hojasAulas = nextState.arbol!.nodos.filter((n) => n.parentId === ramaIdAulas);
    expect(hojasAulas.reduce((a, h) => a + (h.metaValor ?? 0), 0)).toBeCloseTo(50_000, 2);
  });

  it("editar la meta de una hoja individual con UPDATE_NODO_ARBOL NO afecta a las demás hojas", () => {
    const { state, ramaIdAulas } = importAndState();
    const hojas = state.arbol!.nodos.filter((n) => n.parentId === ramaIdAulas);
    const a1 = hojas.find((h) => h.nombre === "A1")!;
    const a2Antes = hojas.find((h) => h.nombre === "A2")!;
    expect(a1.metaValor).toBeCloseTo(50_000, 2);
    expect(a2Antes.metaValor).toBeCloseTo(20_000, 2);

    const nextState = reducer(state, {
      type: "UPDATE_NODO_ARBOL",
      id: a1.id,
      changes: { metaValor: 90_000 },
    });
    const a1Despues = nextState.arbol!.nodos.find((n) => n.id === a1.id)!;
    const a2Despues = nextState.arbol!.nodos.find((n) => n.id === a2Antes.id)!;
    const aulasDespues = nextState.arbol!.nodos.find((n) => n.id === ramaIdAulas)!;
    expect(a1Despues.metaValor).toBe(90_000);
    // Las demás hojas y la propia rama NO se tocan.
    expect(a2Despues.metaValor).toBeCloseTo(20_000, 2);
    expect(aulasDespues.metaValor).toBeCloseTo(70_000, 2);
  });

  it("editar la meta de la raíz reescala todo el subárbol (ramas y hojas)", () => {
    const { state } = importAndState();
    // La raíz importada tiene metaValor 100 k. La duplicamos a 200 k.
    const nextState = reducer(state, {
      type: "UPDATE_META_NODO_RESCALAR_HIJOS",
      id: "r26",
      metaValor: 200_000,
    });
    const raiz = nextState.arbol!.nodos.find((n) => n.id === "r26")!;
    expect(raiz.metaValor).toBeCloseTo(200_000, 2);
    const ramas26 = nextState.arbol!.nodos.filter((n) => n.parentId === "r26");
    const sumRamas = ramas26.reduce((a, r) => a + (r.metaValor ?? 0), 0);
    expect(sumRamas).toBeCloseTo(200_000, 2);
    // Las hojas también: cada una se duplica respecto a su valor importado.
    const aulas = ramas26.find((r) => r.nombre === "Aulas")!;
    const hojasAulas = nextState.arbol!.nodos.filter((n) => n.parentId === aulas.id);
    expect(hojasAulas.reduce((a, h) => a + (h.metaValor ?? 0), 0)).toBeCloseTo(
      aulas.metaValor!,
      2,
    );
  });

  it("borrar una rama tras importar deja la estructura limpia (sin hojas huérfanas) y editable", () => {
    const { state, ramaIdAulas, ramaIdProgramas, hojaIds } = importAndState();
    const idsAulasYHojas = new Set([
      ramaIdAulas,
      ...state.arbol!.nodos.filter((n) => n.parentId === ramaIdAulas).map((h) => h.id),
    ]);
    expect(idsAulasYHojas.size).toBeGreaterThan(1);

    const nextState = reducer(state, { type: "DELETE_NODO_ARBOL", id: ramaIdAulas });

    const arbolNodos = nextState.arbol!.nodos;
    // Aulas y todas sus hojas desaparecen del árbol.
    for (const id of idsAulasYHojas) {
      expect(arbolNodos.some((n) => n.id === id)).toBe(false);
    }
    // No quedan hojas huérfanas: cualquier nodo con parentId tiene un padre vivo.
    const ids2026 = new Set(arbolNodos.filter((n) => n.anio === 2026).map((n) => n.id));
    for (const n of arbolNodos.filter((x) => x.anio === 2026 && x.parentId)) {
      expect(ids2026.has(n.parentId!)).toBe(true);
    }
    // Programas y sus hojas siguen presentes y editables (vía las acciones normales).
    const programas = arbolNodos.find((n) => n.id === ramaIdProgramas)!;
    expect(programas).toBeDefined();
    const hojasProgramas = arbolNodos.filter((n) => n.parentId === ramaIdProgramas);
    expect(hojasProgramas.length).toBeGreaterThan(0);

    // Edición posterior funciona sin recargar nada (UPDATE_NODO_ARBOL sigue
    // operando sobre el resto de la estructura).
    const reEdit = reducer(nextState, {
      type: "UPDATE_NODO_ARBOL",
      id: programas.id,
      changes: { nombre: "Programas 2.0" },
    });
    expect(reEdit.arbol!.nodos.find((n) => n.id === programas.id)!.nombre).toBe("Programas 2.0");

    // Tombstones generados para que el merge multi-cliente no resucite los borrados.
    expect(reEdit.deleted?.arbolNodos ?? []).toEqual(
      expect.arrayContaining([ramaIdAulas, ...hojaIds.filter((id) => idsAulasYHojas.has(id))]),
    );
  });

  it("añadir una nueva rama tras importar funciona y la nueva acción de reescalar la incluye", () => {
    const { state } = importAndState();
    // ADD_NODO_ARBOL como hace el formulario inline de "Nueva rama".
    const nuevaRama: NodoArbol = mkChild({
      id: "rNueva",
      parentId: "r26",
      anio: 2026,
      nombre: "Nueva línea",
      orden: 99,
      metaValor: 50_000,
    });
    const conNueva = reducer(state, { type: "ADD_NODO_ARBOL", payload: nuevaRama });
    expect(conNueva.arbol!.nodos.some((n) => n.id === "rNueva")).toBe(true);

    // Reescalar la raíz con la nueva rama incluida en el reparto.
    const total = conNueva.arbol!.nodos
      .filter((n) => n.parentId === "r26" && n.relacionConPadre === "suma")
      .reduce((a, r) => a + (r.metaValor ?? 0), 0);
    const reEsc = reducer(conNueva, {
      type: "UPDATE_META_NODO_RESCALAR_HIJOS",
      id: "r26",
      metaValor: total * 2,
    });
    const ramas2026 = reEsc.arbol!.nodos.filter(
      (n) => n.parentId === "r26" && n.relacionConPadre === "suma",
    );
    const sum = ramas2026.reduce((a, r) => a + (r.metaValor ?? 0), 0);
    expect(sum).toBeCloseTo(total * 2, 2);
    const nueva = ramas2026.find((r) => r.id === "rNueva")!;
    expect(nueva.metaValor).toBeCloseTo(100_000, 2); // 50 k duplicado
  });

  it("metaValor undefined no reescala (no inventa proporciones), sólo borra la meta del nodo", () => {
    const { state, ramaIdAulas } = importAndState();
    const hojasAntes = state.arbol!.nodos.filter((n) => n.parentId === ramaIdAulas);
    const valoresAntes = new Map(hojasAntes.map((h) => [h.id, h.metaValor]));
    const nextState = reducer(state, {
      type: "UPDATE_META_NODO_RESCALAR_HIJOS",
      id: ramaIdAulas,
      metaValor: undefined,
    });
    const rama = nextState.arbol!.nodos.find((n) => n.id === ramaIdAulas)!;
    expect(rama.metaValor).toBeUndefined();
    const hojasDespues = nextState.arbol!.nodos.filter((n) => n.parentId === ramaIdAulas);
    for (const h of hojasDespues) {
      expect(h.metaValor).toBeCloseTo(valoresAntes.get(h.id)!, 2);
    }
  });
});
