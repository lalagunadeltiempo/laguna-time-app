/**
 * Tests dirigidos de la migración v27 (`migrateDedupSesionesEntregable`).
 *
 * Para evitar el ciclo de imports `migrations.ts → seed-sops → store →
 * seed-sops` que rompe Vitest al cargar `runMigrations` directamente,
 * apuntamos a `planearDedupSesionesEnEstado`: la función pura que la
 * migración usa por debajo. Así validamos lo importante (qué sesiones
 * sobreviven) sin tocar el resto de la cadena de migraciones.
 */
import { describe, expect, it } from "vitest";
import { planearDedupSesionesEnEstado } from "./sesion-dedup";
import type { AppState, Entregable } from "./types";
import { EMPTY_ARBOL } from "./types";

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
    diasEstimados: 1,
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

describe("Migración v27: dedup de sesiones rotas heredadas", () => {
  it("colapsa la sesión 'Preparación de Taller' (rota 02:40-13:42 vs real 13:40-14:24)", () => {
    const state = baseState({
      entregables: [
        mkEntregable({
          id: "ent-taller",
          sesiones: [
            { inicioTs: "2026-05-04T02:40:00.000Z", finTs: "2026-05-04T13:42:00.000Z", autor: "Gabi" },
            { inicioTs: "2026-05-04T13:40:00.000Z", finTs: "2026-05-04T14:24:00.000Z", autor: "Gabi" },
          ],
        }),
      ],
    });
    const { cambios, eliminadasTotal } = planearDedupSesionesEnEstado(state);
    expect(eliminadasTotal).toBe(1);
    expect(cambios).toHaveLength(1);
    expect(cambios[0].id).toBe("ent-taller");
    const ses = cambios[0].sesiones;
    expect(ses).toHaveLength(1);
    expect(ses[0].inicioTs).toBe("2026-05-04T13:40:00.000Z");
    expect(ses[0].finTs).toBe("2026-05-04T14:24:00.000Z");
  });

  it("no produce cambios si todas las sesiones son legítimas", () => {
    const state = baseState({
      entregables: [
        mkEntregable({
          id: "ent-rituals",
          sesiones: [
            { inicioTs: "2026-05-04T08:20:00.000Z", finTs: "2026-05-04T08:35:00.000Z", autor: "Gabi" },
            { inicioTs: "2026-05-04T13:35:00.000Z", finTs: "2026-05-04T13:55:00.000Z", autor: "Gabi" },
          ],
        }),
      ],
    });
    const { cambios, eliminadasTotal } = planearDedupSesionesEnEstado(state);
    expect(cambios).toHaveLength(0);
    expect(eliminadasTotal).toBe(0);
  });

  it("colapsa varias copias en cadena del mismo entregable a la sesión real", () => {
    const state = baseState({
      entregables: [
        mkEntregable({
          id: "ent-multi",
          sesiones: [
            { inicioTs: "2026-05-04T01:00:00.000Z", finTs: "2026-05-04T13:30:00.000Z", autor: "Gabi" },
            { inicioTs: "2026-05-04T02:00:00.000Z", finTs: "2026-05-04T14:00:00.000Z", autor: "Gabi" },
            { inicioTs: "2026-05-04T13:00:00.000Z", finTs: "2026-05-04T14:00:00.000Z", autor: "Gabi" },
          ],
        }),
      ],
    });
    const { cambios, eliminadasTotal } = planearDedupSesionesEnEstado(state);
    expect(eliminadasTotal).toBe(2);
    expect(cambios).toHaveLength(1);
    expect(cambios[0].sesiones).toHaveLength(1);
    expect(cambios[0].sesiones[0].inicioTs).toBe("2026-05-04T13:00:00.000Z");
  });

  it("trabaja en paralelo sobre todos los entregables con duplicados", () => {
    const state = baseState({
      entregables: [
        mkEntregable({
          id: "ent-a",
          sesiones: [
            { inicioTs: "2026-05-04T02:00:00.000Z", finTs: "2026-05-04T14:00:00.000Z", autor: "Gabi" },
            { inicioTs: "2026-05-04T13:30:00.000Z", finTs: "2026-05-04T14:10:00.000Z", autor: "Gabi" },
          ],
        }),
        mkEntregable({
          id: "ent-b-limpio",
          sesiones: [
            { inicioTs: "2026-05-04T09:00:00.000Z", finTs: "2026-05-04T09:30:00.000Z", autor: "Gabi" },
          ],
        }),
        mkEntregable({
          id: "ent-c",
          sesiones: [
            { inicioTs: "2026-05-04T07:00:00.000Z", finTs: "2026-05-04T15:00:00.000Z", autor: "Gabi" },
            { inicioTs: "2026-05-04T14:00:00.000Z", finTs: "2026-05-04T15:00:00.000Z", autor: "Gabi" },
          ],
        }),
      ],
    });
    const { cambios, eliminadasTotal } = planearDedupSesionesEnEstado(state);
    expect(eliminadasTotal).toBe(2);
    const ids = cambios.map((c) => c.id).sort();
    expect(ids).toEqual(["ent-a", "ent-c"]);
  });
});
