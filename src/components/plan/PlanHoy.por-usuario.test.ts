import { describe, expect, it } from "vitest";
import { sesionMatchesTargetUser } from "./plan-hoy-sesion-filter";
import type { Entregable, SesionEntregable } from "@/lib/types";

function mkEnt(overrides: Partial<Entregable> & { id: string }): Entregable {
  const { id, ...rest } = overrides;
  return {
    id,
    nombre: "X",
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

describe("PlanHoy — sesiones por usuario (filtro target)", () => {
  it("con target Gabi, la sesión abierta de Beltrán no cuenta como suya", () => {
    const ent = mkEnt({ id: "e-1", responsable: "Gabi" });
    const s: SesionEntregable = {
      inicioTs: "2026-05-07T08:00:00.000Z",
      finTs: null,
      autor: "Beltrán",
    };
    expect(sesionMatchesTargetUser(s, ent, "Gabi")).toBe(false);
  });

  it("sin filtro de miembro (null), cualquier sesión pasa", () => {
    const ent = mkEnt({ id: "e-1" });
    const s: SesionEntregable = {
      inicioTs: "2026-05-07T08:00:00.000Z",
      finTs: null,
      autor: "Beltrán",
    };
    expect(sesionMatchesTargetUser(s, ent, null)).toBe(true);
  });

  it("legacy sin autor se atribuye al responsable del entregable", () => {
    const ent = mkEnt({ id: "e-1", responsable: "Gabi" });
    const s: SesionEntregable = {
      inicioTs: "2026-05-07T08:00:00.000Z",
      finTs: null,
    };
    expect(sesionMatchesTargetUser(s, ent, "Gabi")).toBe(true);
    expect(sesionMatchesTargetUser(s, ent, "Beltrán")).toBe(false);
  });
});
