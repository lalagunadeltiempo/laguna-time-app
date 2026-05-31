import { describe, expect, it } from "vitest";
import { planearSeedFranjasV29 } from "./migration-plan-v29-franjas";
import { FRANJAS_DEFAULT } from "./franjas";
import type { FranjaDia } from "./types";

describe("Migración v29 — seed de franjas de time blocking", () => {
  it("siembra las 8 franjas por defecto cuando no hay ninguna", () => {
    const franjas = planearSeedFranjasV29(undefined);
    expect(franjas).not.toBeNull();
    expect(franjas).toHaveLength(8);
    expect(franjas!.map((f) => f.id)).toEqual(FRANJAS_DEFAULT.map((f) => f.id));
  });

  it("también siembra cuando el array está vacío", () => {
    const franjas = planearSeedFranjasV29([]);
    expect(franjas).toHaveLength(8);
  });

  it("no toca las franjas si ya existen (respeta ediciones de la usuaria)", () => {
    const propias: FranjaDia[] = [
      { id: "mia", nombre: "Mi franja", inicio: "07:00", fin: "09:00", color: "#000000" },
    ];
    expect(planearSeedFranjasV29(propias)).toBeNull();
  });

  it("devuelve copias nuevas, no referencias a FRANJAS_DEFAULT", () => {
    const franjas = planearSeedFranjasV29(undefined)!;
    expect(franjas[0]).not.toBe(FRANJAS_DEFAULT[0]);
    expect(franjas[0]).toEqual(FRANJAS_DEFAULT[0]);
  });
});
