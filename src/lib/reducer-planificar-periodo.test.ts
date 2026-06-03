/**
 * Tests de `PLANIFICAR_PERIODO_ENTREGABLE`: planificación por días explícitos
 * (frecuencias MENSUAL/TRIMESTRAL del panel), con alcance personal o de equipo.
 * Cubre: alcance equipo vs usuario, rellenar/limpiar y unión sin duplicar.
 */
import { describe, expect, it } from "vitest";
import { reducer } from "./reducer";
import type { AppState, Entregable, MiembroInfo } from "./types";
import { EMPTY_ARBOL } from "./types";

function makeEntregable(id: string, overrides: Partial<Entregable> = {}): Entregable {
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
  } as unknown as Entregable;
}

function makeMiembro(nombre: string): MiembroInfo {
  return { id: nombre.toLowerCase(), nombre, color: "#000", capacidadDiaria: 1, diasLaborables: [1, 2, 3, 4, 5] };
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
    deleted: { proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [], notas: [], mensajes: [] },
    ...overrides,
  };
}

describe("PLANIFICAR_PERIODO_ENTREGABLE", () => {
  it("alcance usuario: añade los días sólo al usuario actual", () => {
    const state = baseState({
      miembros: [makeMiembro("Gabi"), makeMiembro("Beltrán")],
      entregables: [makeEntregable("e-1")],
    });
    const next = reducer(state, {
      type: "PLANIFICAR_PERIODO_ENTREGABLE",
      id: "e-1",
      dias: ["2026-01-15", "2026-02-10"],
      alcance: "usuario",
      usuario: "Gabi",
      modo: "rellenar",
    });
    const byUser = next.entregables[0].diasPlanificadosByUser ?? {};
    expect(byUser["Gabi"]).toEqual(["2026-01-15", "2026-02-10"]);
    expect(byUser["Beltrán"]).toBeUndefined();
  });

  it("alcance equipo: escribe los MISMOS días a todos los miembros", () => {
    const state = baseState({
      miembros: [makeMiembro("Gabi"), makeMiembro("Beltrán"), makeMiembro("Helen")],
      entregables: [makeEntregable("e-1")],
    });
    const next = reducer(state, {
      type: "PLANIFICAR_PERIODO_ENTREGABLE",
      id: "e-1",
      dias: ["2026-03-20"],
      alcance: "equipo",
      usuario: "Gabi",
      modo: "rellenar",
    });
    const byUser = next.entregables[0].diasPlanificadosByUser ?? {};
    expect(byUser["Gabi"]).toEqual(["2026-03-20"]);
    expect(byUser["Beltrán"]).toEqual(["2026-03-20"]);
    expect(byUser["Helen"]).toEqual(["2026-03-20"]);
  });

  it("equipo sin miembros recae en el usuario", () => {
    const state = baseState({ miembros: [], entregables: [makeEntregable("e-1")] });
    const next = reducer(state, {
      type: "PLANIFICAR_PERIODO_ENTREGABLE",
      id: "e-1",
      dias: ["2026-03-20"],
      alcance: "equipo",
      usuario: "Gabi",
      modo: "rellenar",
    });
    const byUser = next.entregables[0].diasPlanificadosByUser ?? {};
    expect(byUser["Gabi"]).toEqual(["2026-03-20"]);
  });

  it("rellenar hace unión sin duplicar ni pisar lo existente", () => {
    const state = baseState({
      miembros: [makeMiembro("Gabi")],
      entregables: [makeEntregable("e-1", { diasPlanificadosByUser: { Gabi: ["2026-01-15"] } })],
    });
    const next = reducer(state, {
      type: "PLANIFICAR_PERIODO_ENTREGABLE",
      id: "e-1",
      dias: ["2026-01-15", "2026-02-10"],
      alcance: "usuario",
      usuario: "Gabi",
      modo: "rellenar",
    });
    expect(next.entregables[0].diasPlanificadosByUser?.["Gabi"]).toEqual(["2026-01-15", "2026-02-10"]);
  });

  it("limpiar elimina exactamente los días indicados del alcance, sin tocar los demás", () => {
    const state = baseState({
      miembros: [makeMiembro("Gabi"), makeMiembro("Beltrán")],
      entregables: [
        makeEntregable("e-1", {
          diasPlanificadosByUser: { Gabi: ["2026-01-15", "2026-02-10"], Beltrán: ["2026-01-15", "2026-02-10"] },
        }),
      ],
    });
    const next = reducer(state, {
      type: "PLANIFICAR_PERIODO_ENTREGABLE",
      id: "e-1",
      dias: ["2026-01-15"],
      alcance: "equipo",
      usuario: "Gabi",
      modo: "limpiar",
    });
    const byUser = next.entregables[0].diasPlanificadosByUser ?? {};
    expect(byUser["Gabi"]).toEqual(["2026-02-10"]);
    expect(byUser["Beltrán"]).toEqual(["2026-02-10"]);
  });

  it("rellenar sincroniza semanasActivas con la semana del día añadido", () => {
    const state = baseState({
      miembros: [makeMiembro("Gabi")],
      entregables: [makeEntregable("e-1")],
    });
    // 2026-01-15 es jueves; su lunes ISO es 2026-01-12.
    const next = reducer(state, {
      type: "PLANIFICAR_PERIODO_ENTREGABLE",
      id: "e-1",
      dias: ["2026-01-15"],
      alcance: "usuario",
      usuario: "Gabi",
      modo: "rellenar",
    });
    expect(next.entregables[0].semanasActivas).toContain("2026-01-12");
  });

  it("rellenar reabre un entregable en espera", () => {
    const state = baseState({
      miembros: [makeMiembro("Gabi")],
      entregables: [makeEntregable("e-1", { estado: "en_espera", enEsperaDe: { tipo: "externo", nombre: "X" } })],
    });
    const next = reducer(state, {
      type: "PLANIFICAR_PERIODO_ENTREGABLE",
      id: "e-1",
      dias: ["2026-01-15"],
      alcance: "usuario",
      usuario: "Gabi",
      modo: "rellenar",
    });
    expect(next.entregables[0].estado).toBe("planificado");
    expect(next.entregables[0].enEsperaDe).toBeNull();
  });

  it("no toca rutinas", () => {
    const state = baseState({
      miembros: [makeMiembro("Gabi")],
      entregables: [makeEntregable("e-1", { tipo: "rutina" })],
    });
    const next = reducer(state, {
      type: "PLANIFICAR_PERIODO_ENTREGABLE",
      id: "e-1",
      dias: ["2026-01-15"],
      alcance: "usuario",
      usuario: "Gabi",
      modo: "rellenar",
    });
    expect(next).toBe(state);
  });

  it("rellenar sin cambios reales (días ya presentes) devuelve el mismo state", () => {
    const state = baseState({
      miembros: [makeMiembro("Gabi")],
      entregables: [makeEntregable("e-1", { diasPlanificadosByUser: { Gabi: ["2026-01-15"] } })],
    });
    const next = reducer(state, {
      type: "PLANIFICAR_PERIODO_ENTREGABLE",
      id: "e-1",
      dias: ["2026-01-15"],
      alcance: "usuario",
      usuario: "Gabi",
      modo: "rellenar",
    });
    expect(next).toBe(state);
  });
});
