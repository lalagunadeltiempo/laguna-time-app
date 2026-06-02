import { describe, expect, it } from "vitest";
import {
  buildArbolIndices,
  crecimientoVsAY,
  metaParaNodoEnPeriodo,
  planAgregadoEnPeriodoIdx,
  realAnioPasadoAgregadoIdx,
  realAnioPasadoYTDIdx,
  realEfectivoEnPeriodoIdx,
  realYTDEnMesesActivosIdx,
} from "./arbol-tiempo";
import type { NodoArbol, PlanArbolConfigAnio, RegistroNodo } from "./types";

const ts = "2024-01-01T00:00:00.000Z";

function mkNodo(p: Omit<NodoArbol, "creado">): NodoArbol {
  return { ...p, creado: ts };
}

function mkReg(p: Omit<RegistroNodo, "creado" | "actualizado">): RegistroNodo {
  return { ...p, creado: ts, actualizado: ts };
}

/**
 * Las nuevas filas de comparación del bloque ANUAL deben basarse en el TOTAL
 * del año (año completo), no en el acumulado por meses activos (YTD). Este
 * test fija ese contrato a nivel total/rama/hoja para un año ya cerrado: el
 * real, el año anterior y el plan se calculan con los helpers de TOTAL.
 */
describe("Comparativa ANUAL basada en el TOTAL del año (no YTD)", () => {
  const year = 2024;
  const raiz = mkNodo({
    id: "raiz",
    anio: year,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor: 120_000,
  });
  const rama = mkNodo({
    id: "rama",
    anio: year,
    parentId: "raiz",
    orden: 0,
    nombre: "Servicios",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor: 120_000,
  });
  const hoja = mkNodo({
    id: "hoja",
    anio: year,
    parentId: "rama",
    orden: 0,
    nombre: "Programa",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor: 120_000,
  });

  // Real 2024 (año cerrado): meses activos = enero, julio, diciembre → 35.000.
  // Año anterior 2023: enero (mes activo) y junio (mes NO activo en 2024).
  // El junio del año anterior SÓLO entra si usamos el total del año, no el YTD.
  const registros: RegistroNodo[] = [
    mkReg({ id: "r1", nodoId: "hoja", periodoTipo: "mes", periodoKey: "2024-01", valor: 10_000 }),
    mkReg({ id: "r2", nodoId: "hoja", periodoTipo: "mes", periodoKey: "2024-07", valor: 20_000 }),
    mkReg({ id: "r3", nodoId: "hoja", periodoTipo: "mes", periodoKey: "2024-12", valor: 5_000 }),
    mkReg({ id: "ay1", nodoId: "hoja", periodoTipo: "mes", periodoKey: "2023-01", valor: 8_000 }),
    mkReg({ id: "ay2", nodoId: "hoja", periodoTipo: "mes", periodoKey: "2023-06", valor: 12_000 }),
  ];
  const idx = buildArbolIndices(registros, [raiz, rama, hoja], year);
  const config: PlanArbolConfigAnio = { anio: year };

  it("real total del año = suma de TODOS los meses (total/rama/hoja)", () => {
    expect(realEfectivoEnPeriodoIdx(idx, "hoja", "anio", String(year))).toBe(35_000);
    expect(realEfectivoEnPeriodoIdx(idx, "rama", "anio", String(year))).toBe(35_000);
    expect(realEfectivoEnPeriodoIdx(idx, "raiz", "anio", String(year))).toBe(35_000);
  });

  it("año anterior usa el TOTAL del año (incluye meses no activos), no el YTD", () => {
    // TOTAL: incluye enero (8.000) + junio (12.000) = 20.000.
    expect(realAnioPasadoAgregadoIdx(idx, "hoja", "anio", String(year))).toBe(20_000);
    expect(realAnioPasadoAgregadoIdx(idx, "rama", "anio", String(year))).toBe(20_000);
    expect(realAnioPasadoAgregadoIdx(idx, "raiz", "anio", String(year))).toBe(20_000);

    // YTD (mismo tramo de meses activos): sólo enero → 8.000. Distinto del total,
    // lo que demuestra que la comparativa anual debe usar el total.
    expect(realAnioPasadoYTDIdx(idx, "raiz", config)).toBe(8_000);
    expect(realYTDEnMesesActivosIdx(idx, "raiz", config)).toBe(35_000);
  });

  it("plan total del año = meta anual del nodo (total/rama/hoja)", () => {
    expect(metaParaNodoEnPeriodo(raiz, "anio", String(year), year, config, idx)).toBe(120_000);
    expect(planAgregadoEnPeriodoIdx(idx, rama, "anio", String(year), config)).toBe(120_000);
    expect(planAgregadoEnPeriodoIdx(idx, hoja, "anio", String(year), config)).toBe(120_000);
  });

  it("vs año anterior (€ y %) se calcula sobre el total", () => {
    const c = crecimientoVsAY(35_000, 20_000);
    expect(c?.deltaEur).toBe(15_000);
    expect(c?.deltaPct).toBeCloseTo(75);
  });
});
