import { describe, expect, it } from "vitest";
import { planearSaneoRutinaSemanas } from "./migration-plan-v30-rutina-semanas";
import { semanasDeMes } from "./semana-utils";
import type { Entregable } from "./types";

function mkEnt(id: string, overrides: Partial<Entregable> = {}): Entregable {
  return {
    id,
    nombre: `E-${id}`,
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
  } as Entregable;
}

describe("Migración v30: saneo de semanasActivas en rutinas", () => {
  it("reemplaza semanas 'pegadas' de un mes antiguo por las del mes activo", () => {
    // Rutina de junio que arrastra semanas de mayo (el bug real).
    const ent = mkEnt("e-1", {
      tipo: "rutina",
      mesActivoRutina: "2026-06",
      semanasActivas: semanasDeMes("2026-05"),
    });
    const cambios = planearSaneoRutinaSemanas([ent]);
    expect(cambios).toHaveLength(1);
    expect(cambios[0].id).toBe("e-1");
    expect(cambios[0].semanasActivas).toEqual(semanasDeMes("2026-06"));
  });

  it("rellena cuando la rutina no tiene ninguna semana", () => {
    const ent = mkEnt("e-1", { tipo: "rutina", mesActivoRutina: "2026-06" });
    const cambios = planearSaneoRutinaSemanas([ent]);
    expect(cambios).toHaveLength(1);
    expect(cambios[0].semanasActivas).toEqual(semanasDeMes("2026-06"));
  });

  it("es idempotente: no emite cambios si ya está saneado", () => {
    const ent = mkEnt("e-1", {
      tipo: "rutina",
      mesActivoRutina: "2026-06",
      semanasActivas: semanasDeMes("2026-06"),
    });
    expect(planearSaneoRutinaSemanas([ent])).toHaveLength(0);
  });

  it("ignora entregables que no son rutina o sin mes activo", () => {
    const raw = mkEnt("e-raw", { tipo: "raw", semanasActivas: ["2026-05-04"] });
    const sinMes = mkEnt("e-sinmes", { tipo: "rutina" });
    expect(planearSaneoRutinaSemanas([raw, sinMes])).toHaveLength(0);
  });
});
