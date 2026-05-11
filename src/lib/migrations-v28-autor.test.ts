import { describe, expect, it } from "vitest";
import { planearMigracionV28AutorSesiones } from "./migration-plan-v28-autor-sesiones";
import type { Entregable } from "./types";

function mkEnt(overrides: Partial<Entregable> & { id: string }): Entregable {
  const { id, ...rest } = overrides;
  return {
    id,
    nombre: "E",
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
    ...rest,
  } as Entregable;
}

describe("Migración v28 — autor en sesiones legacy", () => {
  it("asigna responsable como autor cuando falta", () => {
    const entregables = [
      mkEnt({
        id: "e-1",
        responsable: "Beltrán",
        sesiones: [{ inicioTs: "2026-05-04T08:00:00.000Z", finTs: "2026-05-04T09:00:00.000Z" }],
      }),
    ];
    const cambios = planearMigracionV28AutorSesiones(entregables);
    expect(cambios).toHaveLength(1);
    expect(cambios[0].sesiones[0].autor).toBe("Beltrán");
  });

  it("no toca sesiones que ya tienen autor", () => {
    const entregables = [
      mkEnt({
        id: "e-1",
        responsable: "Beltrán",
        sesiones: [{ inicioTs: "2026-05-04T08:00:00.000Z", finTs: null, autor: "Gabi" }],
      }),
    ];
    const cambios = planearMigracionV28AutorSesiones(entregables);
    expect(cambios).toHaveLength(0);
  });

  it("sin responsable no rellena autor", () => {
    const entregables = [
      mkEnt({
        id: "e-1",
        responsable: "",
        sesiones: [{ inicioTs: "2026-05-04T08:00:00.000Z", finTs: null }],
      }),
    ];
    const cambios = planearMigracionV28AutorSesiones(entregables);
    expect(cambios).toHaveLength(0);
  });

  it("varias sesiones sin autor en el mismo entregable", () => {
    const entregables = [
      mkEnt({
        id: "e-1",
        responsable: "Gabi",
        sesiones: [
          { inicioTs: "2026-05-04T08:00:00.000Z", finTs: "2026-05-04T09:00:00.000Z" },
          { inicioTs: "2026-05-05T08:00:00.000Z", finTs: "2026-05-05T09:00:00.000Z" },
        ],
      }),
    ];
    const cambios = planearMigracionV28AutorSesiones(entregables);
    expect(cambios[0].sesiones.every((s) => s.autor === "Gabi")).toBe(true);
  });
});
