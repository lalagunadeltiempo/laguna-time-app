import { describe, expect, it } from "vitest";
import {
  buildArbolIndices,
  crecimientoVsAY,
  mesesActivosEnAnio,
  realAnioPasadoYTDIdx,
  realYTDEnMesesActivosIdx,
} from "./arbol-tiempo";
import type { NodoArbol, PlanArbolConfigAnio, RegistroNodo } from "./types";

const ts = "2026-01-01T00:00:00.000Z";

function mkNodo(p: Omit<NodoArbol, "creado">): NodoArbol {
  return { ...p, creado: ts };
}

function mkReg(p: Omit<RegistroNodo, "creado" | "actualizado">): RegistroNodo {
  return { ...p, creado: ts, actualizado: ts };
}

describe("crecimientoVsAY", () => {
  it("devuelve null si ambos son 0", () => {
    expect(crecimientoVsAY(0, 0)).toBeNull();
    expect(crecimientoVsAY(0, undefined)).toBeNull();
  });

  it("marca nuevo si AY=0 y real>0", () => {
    const c = crecimientoVsAY(500, 0);
    expect(c?.esNuevo).toBe(true);
    expect(c?.deltaEur).toBe(500);
    expect(c?.deltaPct).toBeUndefined();
  });

  it("calcula delta en euros y porcentaje", () => {
    const c = crecimientoVsAY(120, 100);
    expect(c?.esNuevo).toBe(false);
    expect(c?.deltaEur).toBe(20);
    expect(c?.deltaPct).toBeCloseTo(20);
  });
});

describe("realAnioPasadoYTDIdx", () => {
  const r25 = mkNodo({
    id: "r25",
    anio: 2025,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor: 100_000,
  });
  const r26 = mkNodo({
    id: "r26",
    anio: 2026,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor: 200_000,
  });
  const registros: RegistroNodo[] = [
    mkReg({ id: "a1", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-01", valor: 10_000 }),
    mkReg({ id: "a2", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-02", valor: 20_000 }),
    mkReg({ id: "a3", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-03", valor: 5_000 }),
    mkReg({ id: "b1", nodoId: "r26", periodoTipo: "mes", periodoKey: "2026-01", valor: 12_000 }),
    mkReg({ id: "b2", nodoId: "r26", periodoTipo: "mes", periodoKey: "2026-02", valor: 8_000 }),
  ];
  const idx = buildArbolIndices(registros, [r25, r26], 2026);
  const config: PlanArbolConfigAnio = {
    anio: 2026,
    mesesCerradosTs: { "2026-01": ts, "2026-02": ts, "2026-03": ts },
  };

  it("mesesActivos incluye meses con real o cerrados", () => {
    const meses = mesesActivosEnAnio(idx, "r26", config);
    expect(meses).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("realYTD suma solo meses activos", () => {
    expect(realYTDEnMesesActivosIdx(idx, "r26", config)).toBe(20_000);
  });

  it("realAnioPasadoYTD suma AY de los mismos meses por path", () => {
    expect(realAnioPasadoYTDIdx(idx, "r26", config)).toBe(35_000);
  });
});
