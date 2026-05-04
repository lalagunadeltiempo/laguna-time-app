/**
 * Tests de regresión para el merge profundo introducido al blindar la
 * colaboración entre Gabi y Beltrán (viernes 1 mayo 2026).
 *
 * Antes: `preferMore` / `preferPaso` descartaban el objeto "perdedor" entero.
 * Cuando Gabi marcaba +1 día y Beltrán escribía una nota a la vez, la nota de
 * Beltrán se perdía porque su entregable tenía menos `diasHechos` y el merge
 * lo tiraba a la basura.
 *
 * Ahora: el ganador aporta campos escalares (diasHechos, estado, nombre…) y
 * los campos con id (notas, sesiones, implicados, review) se unen por id.
 * `contexto.notas` (string plano) conserva la versión más larga.
 */
import { describe, expect, it } from "vitest";
import { mergeStates, statesDiffer } from "./merge";
import type { AppState, Entregable, MensajeEntregable, Nota, Paso } from "./types";
import { EMPTY_ARBOL } from "./types";

function n(id: string, autor: string, texto = `nota ${id}`, creadoTs = "2026-05-01T12:00:00.000Z"): Nota {
  return { id, texto, autor, creadoTs };
}

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
  };
}

function mkPaso(overrides: Partial<Paso> & { id: string; entregableId: string }): Paso {
  return {
    nombre: "paso",
    estado: "abierto",
    inicioTs: "2026-05-01T09:00:00.000Z",
    finTs: null,
    siguientePaso: null,
    contexto: { urls: [], apps: [], notas: "" },
    implicados: [],
    pausas: [],
    ...overrides,
  } as unknown as Paso;
}

describe("Merge profundo de entregables", () => {
  it("preferMore une las notas de ambos clientes aunque uno tenga más diasHechos", () => {
    // Gabi: incrementó diasHechos y añadió una nota n-A.
    const a = baseState({
      entregables: [
        mkEntregable({
          id: "e-1",
          diasHechos: 2,
          notas: [n("n-A", "Gabi", "mi nota")],
        }),
      ],
    });
    // Beltrán: mantiene diasHechos=1 pero añade su nota n-B desde el otro cliente.
    const b = baseState({
      entregables: [
        mkEntregable({
          id: "e-1",
          diasHechos: 1,
          notas: [n("n-B", "Beltrán", "nota de beltrán")],
        }),
      ],
    });
    const merged = mergeStates(a, b);
    const ent = merged.entregables[0];
    expect(ent.diasHechos).toBe(2); // ganador aporta el escalar más alto
    const ids = (ent.notas ?? []).map((x) => x.id).sort();
    expect(ids).toEqual(["n-A", "n-B"]); // pero ambas notas se conservan
  });

  it("preferMore preserva el contexto con más texto cuando dos clientes escriben en la pizarra", () => {
    const textoGabi = "idea rápida";
    const textoBeltran = "idea rápida + ampliada con 3 puntos importantes";
    const a = baseState({
      entregables: [
        mkEntregable({
          id: "e-1",
          diasHechos: 2,
          contexto: { urls: [], apps: [], notas: textoGabi },
        }),
      ],
    });
    const b = baseState({
      entregables: [
        mkEntregable({
          id: "e-1",
          diasHechos: 1,
          contexto: { urls: [], apps: [], notas: textoBeltran },
        }),
      ],
    });
    const merged = mergeStates(a, b);
    expect(merged.entregables[0].contexto?.notas).toBe(textoBeltran);
  });

  it("preferMore preserva la pizarra personal de cada miembro (sin pisarse entre clientes)", () => {
    const a = baseState({
      entregables: [
        mkEntregable({
          id: "e-1",
          diasHechos: 1,
          pizarraByUser: { Gabi: "notas largas de Gabi con muchos datos", Beltrán: "bel corto" },
        }),
      ],
    });
    const b = baseState({
      entregables: [
        mkEntregable({
          id: "e-1",
          diasHechos: 2,
          pizarraByUser: { Gabi: "gab cortas", Beltrán: "beltran escribió un párrafo completo con info" },
        }),
      ],
    });
    const merged = mergeStates(a, b);
    const piz = merged.entregables[0].pizarraByUser ?? {};
    expect(piz.Gabi).toBe("notas largas de Gabi con muchos datos");
    expect(piz["Beltrán"]).toBe("beltran escribió un párrafo completo con info");
  });

  it("preferMore une sesiones por inicioTs sin duplicar", () => {
    const ses = (inicioTs: string) => ({ inicioTs, finTs: null });
    const a = baseState({
      entregables: [
        mkEntregable({ id: "e-1", diasHechos: 1, sesiones: [ses("2026-05-01T10:00:00.000Z")] }),
      ],
    });
    const b = baseState({
      entregables: [
        mkEntregable({ id: "e-1", diasHechos: 1, sesiones: [ses("2026-05-01T15:00:00.000Z")] }),
      ],
    });
    const merged = mergeStates(a, b);
    expect((merged.entregables[0].sesiones ?? []).map((s) => s.inicioTs).sort()).toEqual([
      "2026-05-01T10:00:00.000Z",
      "2026-05-01T15:00:00.000Z",
    ]);
  });

  it("preferPaso une notas del paso aunque gane el otro por inicioTs", () => {
    const a = baseState({
      pasos: [
        mkPaso({
          id: "p-1",
          entregableId: "e-1",
          inicioTs: "2026-05-01T09:00:00.000Z",
          notas: [n("pn-A", "Gabi")],
        }),
      ],
    });
    const b = baseState({
      pasos: [
        mkPaso({
          id: "p-1",
          entregableId: "e-1",
          inicioTs: "2026-05-01T11:00:00.000Z",
          notas: [n("pn-B", "Beltrán")],
        }),
      ],
    });
    const merged = mergeStates(a, b);
    const ids = (merged.pasos[0].notas ?? []).map((x) => x.id).sort();
    expect(ids).toEqual(["pn-A", "pn-B"]);
  });
});

describe("statesDiffer detecta cambios dentro de notas, mensajes y contexto", () => {
  it("detecta una nota nueva aunque el entregable tenga el mismo id", () => {
    const a = baseState({
      entregables: [mkEntregable({ id: "e-1", notas: [n("n-1", "Gabi")] })],
    });
    const b = baseState({
      entregables: [mkEntregable({ id: "e-1", notas: [n("n-1", "Gabi"), n("n-2", "Beltrán")] })],
    });
    expect(statesDiffer(a, b)).toBe(true);
  });

  it("detecta cambio de texto dentro de contexto.notas (string)", () => {
    const a = baseState({ entregables: [mkEntregable({ id: "e-1", contexto: { urls: [], apps: [], notas: "abc" } })] });
    const b = baseState({ entregables: [mkEntregable({ id: "e-1", contexto: { urls: [], apps: [], notas: "xyz" } })] });
    expect(statesDiffer(a, b)).toBe(true);
  });

  it("detecta mensaje nuevo en el hilo del entregable", () => {
    const msg = (id: string, texto: string): MensajeEntregable => ({
      id,
      entregableId: "e-1",
      autor: "Gabi",
      texto,
      creado: "2026-05-01T12:00:00.000Z",
    });
    const a = baseState({ mensajes: [msg("m-1", "hola")] });
    const b = baseState({ mensajes: [msg("m-1", "hola"), msg("m-2", "qué tal")] });
    expect(statesDiffer(a, b)).toBe(true);
  });

  it("no falsea diferencia cuando los estados son idénticos", () => {
    const a = baseState({ entregables: [mkEntregable({ id: "e-1", notas: [n("n-1", "Gabi")] })] });
    const b = baseState({ entregables: [mkEntregable({ id: "e-1", notas: [n("n-1", "Gabi")] })] });
    expect(statesDiffer(a, b)).toBe(false);
  });
});

describe("Mensajes de entregable: merge y tombstones", () => {
  const msg = (id: string, overrides: Partial<MensajeEntregable> = {}): MensajeEntregable => ({
    id,
    entregableId: "e-1",
    autor: "Gabi",
    texto: `texto ${id}`,
    creado: "2026-05-01T12:00:00.000Z",
    ...overrides,
  });

  it("une mensajes por id y conserva los leídoPor de ambos clientes", () => {
    const a = baseState({ mensajes: [msg("m-1", { leidoPor: ["Gabi"] })] });
    const b = baseState({ mensajes: [msg("m-1", { leidoPor: ["Beltrán"] })] });
    const merged = mergeStates(a, b);
    expect(merged.mensajes?.length).toBe(1);
    expect(new Set(merged.mensajes?.[0].leidoPor ?? [])).toEqual(new Set(["Gabi", "Beltrán"]));
  });

  it("tombstone en deleted.mensajes impide que el mensaje resucite", () => {
    const a = baseState({
      mensajes: [],
      deleted: {
        proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [],
        notas: [], mensajes: ["m-1"],
      },
    });
    const b = baseState({ mensajes: [msg("m-1")] });
    const merged = mergeStates(a, b);
    expect(merged.mensajes ?? []).toEqual([]);
  });

  it("borrar un entregable elimina en cascada sus mensajes en el merge", () => {
    const a = baseState({
      mensajes: [],
      deleted: {
        proyectos: [], resultados: [], entregables: ["e-1"], pasos: [], plantillas: [],
        notas: [], mensajes: [],
      },
    });
    const b = baseState({ mensajes: [msg("m-1")] });
    const merged = mergeStates(a, b);
    expect(merged.mensajes ?? []).toEqual([]);
  });

  it("resuelve un mensaje: gana la versión con `resueltoTs` más reciente", () => {
    const a = baseState({
      mensajes: [
        msg("m-1", {
          estado: "resuelto",
          resueltoPor: "Gabi",
          resueltoTs: "2026-05-02T10:00:00.000Z",
        }),
      ],
    });
    const b = baseState({
      mensajes: [msg("m-1", { estado: "abierto" })],
    });
    const merged = mergeStates(a, b);
    expect(merged.mensajes?.[0].estado).toBe("resuelto");
    expect(merged.mensajes?.[0].resueltoPor).toBe("Gabi");
  });

  it("reabrir posterior gana sobre resolver previo", () => {
    const a = baseState({
      mensajes: [
        msg("m-1", {
          estado: "resuelto",
          resueltoPor: "Gabi",
          resueltoTs: "2026-05-02T10:00:00.000Z",
        }),
      ],
    });
    const b = baseState({
      mensajes: [
        msg("m-1", {
          estado: "abierto",
          resueltoTs: "2026-05-02T11:00:00.000Z",
        }),
      ],
    });
    const merged = mergeStates(a, b);
    expect(merged.mensajes?.[0].estado).toBe("abierto");
    expect(merged.mensajes?.[0].resueltoPor).toBeUndefined();
  });

  it("preserva `paraQuien` explícito frente a broadcast al mergear", () => {
    const a = baseState({ mensajes: [msg("m-1", { paraQuien: ["Beltrán"] })] });
    const b = baseState({ mensajes: [msg("m-1")] });
    const merged = mergeStates(a, b);
    expect(merged.mensajes?.[0].paraQuien).toEqual(["Beltrán"]);
  });
});

describe("Lápidas de implicados", () => {
  it("deleted.implicados elimina al miembro del entregable aunque el otro cliente aún lo tenga", () => {
    const a = baseState({
      entregables: [
        mkEntregable({
          id: "e-1",
          implicados: [
            { tipo: "equipo", nombre: "Gabi" },
            { tipo: "equipo", nombre: "Beltrán" },
          ],
        }),
      ],
      deleted: {
        proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [],
        notas: [], mensajes: [], implicados: ["e-1::Beltrán"],
      },
    });
    const b = baseState({
      entregables: [
        mkEntregable({
          id: "e-1",
          implicados: [
            { tipo: "equipo", nombre: "Gabi" },
            { tipo: "equipo", nombre: "Beltrán" },
          ],
        }),
      ],
    });
    const merged = mergeStates(a, b);
    const imps = merged.entregables[0].implicados ?? [];
    expect(imps.map((i) => i.nombre)).toEqual(["Gabi"]);
    expect(merged.deleted?.implicados ?? []).toContain("e-1::Beltrán");
  });
});

describe("contexto.notas: no se pierde texto en merge concurrente", () => {
  it("concatena textos distintos de ambos clientes con un separador", () => {
    const a = baseState({
      entregables: [
        mkEntregable({
          id: "e-1",
          contexto: { urls: [], apps: [], notas: "Gabi escribió aquí\n- idea 1" },
        }),
      ],
    });
    const b = baseState({
      entregables: [
        mkEntregable({
          id: "e-1",
          contexto: { urls: [], apps: [], notas: "Beltrán añadió\n- idea 2" },
        }),
      ],
    });
    const merged = mergeStates(a, b);
    const notas = String(merged.entregables[0].contexto?.notas ?? "");
    expect(notas).toContain("Gabi escribió aquí");
    expect(notas).toContain("Beltrán añadió");
  });

  it("si un texto contiene al otro, se queda con el más completo (no duplica)", () => {
    const largo = "Gabi escribió aquí\n- idea 1\n- idea 2";
    const corto = "Gabi escribió aquí";
    const a = baseState({
      entregables: [
        mkEntregable({ id: "e-1", contexto: { urls: [], apps: [], notas: largo } }),
      ],
    });
    const b = baseState({
      entregables: [
        mkEntregable({ id: "e-1", contexto: { urls: [], apps: [], notas: corto } }),
      ],
    });
    const merged = mergeStates(a, b);
    expect(merged.entregables[0].contexto?.notas).toBe(largo);
  });
});
