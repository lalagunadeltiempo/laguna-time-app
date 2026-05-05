/**
 * Test de estrés de `mergeStates` con dos estados densos.
 *
 * Cada cliente trae 200 entregables con notas, mensajes de chat,
 * `diasPlanificadosByUser` y `pizarraByUser`. Comprobamos:
 *  - el merge termina en un presupuesto razonable (×3 margen para CI),
 *  - no se pierden notas ni mensajes (unión completa),
 *  - los días planificados se unen por usuario sin pisar a nadie.
 */
import { describe, expect, it } from "vitest";
import { mergeStates } from "./merge";
import type { AppState, Entregable, MensajeEntregable, Nota } from "./types";
import { EMPTY_ARBOL } from "./types";

const CI_MARGIN = 3;

function nota(id: string, autor: string): Nota {
  return { id, texto: `t-${id}`, autor, creadoTs: "2026-05-01T00:00:00.000Z" };
}

function entregable(id: string, overrides: Partial<Entregable>): Entregable {
  return {
    id,
    nombre: `E-${id}`,
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

function mensaje(id: string, entregableId: string, autor: string): MensajeEntregable {
  return {
    id,
    entregableId,
    autor,
    texto: `msg ${id}`,
    creado: "2026-05-01T12:00:00.000Z",
  };
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

function buildLado(autor: string, otroAutor: string) {
  const N = 200;
  const entregables: Entregable[] = [];
  const mensajes: MensajeEntregable[] = [];
  for (let i = 0; i < N; i++) {
    const id = `e-${i}`;
    entregables.push(
      entregable(id, {
        diasHechos: autor === "Gabi" ? 2 : 1,
        notas: [nota(`n-${id}-${autor}`, autor)],
        diasPlanificadosByUser: {
          [autor]: ["2026-05-04", "2026-05-05", "2026-05-06"],
        },
        contexto: { urls: [], apps: [], notas: `texto ${autor} ${id}` },
        pizarraByUser: { [autor]: `pizarra de ${autor} en ${id}` },
        implicados: [{ tipo: "equipo", nombre: autor }],
      }),
    );
    // Dos mensajes por entregable: uno propio del autor (id distinto entre lados),
    // y uno compartido por id (m-shared-i) con `leidoPor` distinto en cada lado.
    mensajes.push(mensaje(`m-${id}-${autor}`, id, autor));
    mensajes.push({
      ...mensaje(`m-shared-${i}`, id, "Gabi"),
      leidoPor: [autor],
    });
    void otroAutor;
  }
  return baseState({ entregables, mensajes });
}

describe("mergeStates: estrés con 200 entregables × 2 clientes", () => {
  it("termina en menos de 150 ms y no pierde notas, mensajes ni planificación por usuario", () => {
    const a = buildLado("Gabi", "Beltrán");
    const b = buildLado("Beltrán", "Gabi");

    const t0 = performance.now();
    const merged = mergeStates(a, b);
    const dt = performance.now() - t0;

    expect(dt).toBeLessThan(150 * CI_MARGIN);

    expect(merged.entregables).toHaveLength(200);

    // Conteo total de notas único: 200 entregables × 2 notas (una por lado).
    let totalNotas = 0;
    const notaIds = new Set<string>();
    for (const e of merged.entregables) {
      for (const n of e.notas ?? []) {
        totalNotas++;
        notaIds.add(n.id);
      }
    }
    expect(totalNotas).toBe(400);
    expect(notaIds.size).toBe(400);

    // Mensajes: por entregable hay 1 (Gabi) + 1 (Beltrán) + 1 compartido.
    expect((merged.mensajes ?? []).length).toBe(200 * 3);
    // El mensaje compartido conserva la unión de leidoPor.
    const compartidos = (merged.mensajes ?? []).filter((m) => m.id.startsWith("m-shared-"));
    expect(compartidos).toHaveLength(200);
    for (const m of compartidos) {
      expect(new Set(m.leidoPor ?? [])).toEqual(new Set(["Gabi", "Beltrán"]));
    }

    // Días planificados: cada usuario conserva los suyos sin pisar al otro.
    for (const e of merged.entregables) {
      const dias = e.diasPlanificadosByUser ?? {};
      expect(dias.Gabi).toEqual(["2026-05-04", "2026-05-05", "2026-05-06"]);
      expect(dias["Beltrán"]).toEqual(["2026-05-04", "2026-05-05", "2026-05-06"]);
    }

    // Implicados: el merge debe mantener a ambos miembros (uno por lado).
    for (const e of merged.entregables) {
      const nombres = (e.implicados ?? []).map((i) => i.nombre).sort();
      expect(nombres).toEqual(["Beltrán", "Gabi"]);
    }
  });
});
