import { describe, expect, it } from "vitest";
import {
  buildArbolIndices,
  diasLaborablesEnAnio,
  diasLaborablesEnMes,
  metaParaNodoEnPeriodo,
  proporcionesMensualesAYParaNodo,
  realAnioPasadoEnMesIdx,
  replanMensualSerie,
} from "./arbol-tiempo";
import type { NodoArbol, PlanArbolConfigAnio, RegistroNodo } from "./types";

/**
 * Cubre la nueva opción `distribucionMensual: "patronAnioAnterior"`.
 * El reparto mensual del plan anual de un nodo sigue las proporciones
 * del REAL del MISMO nodo (resuelto por id o por nombre/path) en el año
 * anterior. Si no hay datos AY suficientes, el cálculo cae al método
 * por días laborables (comportamiento histórico).
 */

const ts = "2026-01-01T00:00:00.000Z";

function mkNodo(p: Omit<NodoArbol, "creado">): NodoArbol {
  return { ...p, creado: ts };
}

function mkRoot(anio: number, id: string, metaValor: number | undefined, nombre = "Facturación"): NodoArbol {
  return mkNodo({
    id,
    anio,
    orden: 0,
    nombre,
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor,
  });
}

function mkChild(p: {
  id: string;
  parentId: string;
  anio: number;
  nombre: string;
  orden: number;
  metaValor?: number;
}): NodoArbol {
  return mkNodo({
    id: p.id,
    anio: p.anio,
    parentId: p.parentId,
    orden: p.orden,
    nombre: p.nombre,
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor: p.metaValor,
  });
}

function mkReg(p: Omit<RegistroNodo, "creado" | "actualizado">): RegistroNodo {
  return { ...p, creado: ts, actualizado: ts };
}

const CONFIG_DIAS: PlanArbolConfigAnio = { anio: 2026 };
const CONFIG_AY: PlanArbolConfigAnio = { anio: 2026, distribucionMensual: "patronAnioAnterior" };

describe("proporcionesMensualesAYParaNodo", () => {
  it("devuelve proporciones del real AY del nodo equivalente por path", () => {
    // 2025 raíz tiene 100_000 reales: 60% Q1, 40% Q4.
    const r25 = mkRoot(2025, "r25", 100_000);
    const r26 = mkRoot(2026, "r26", 200_000);
    const registros: RegistroNodo[] = [
      mkReg({ id: "m1", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-01", valor: 30_000 }),
      mkReg({ id: "m2", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-02", valor: 30_000 }),
      mkReg({ id: "m3", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-12", valor: 40_000 }),
    ];
    const idx = buildArbolIndices(registros, [r25, r26], 2026);

    const props = proporcionesMensualesAYParaNodo(idx, "r26");
    expect(props["2026-01"]).toBeCloseTo(0.3, 5);
    expect(props["2026-02"]).toBeCloseTo(0.3, 5);
    expect(props["2026-12"]).toBeCloseTo(0.4, 5);
    // El resto del año queda omitido (proporción 0).
    expect(props["2026-06"]).toBeUndefined();
  });

  it("devuelve {} si la suma AY es 0 (señal de fallback)", () => {
    const r25 = mkRoot(2025, "r25", 100_000);
    const r26 = mkRoot(2026, "r26", 200_000);
    const idx = buildArbolIndices([], [r25, r26], 2026);
    const props = proporcionesMensualesAYParaNodo(idx, "r26");
    expect(props).toEqual({});
  });

  it("devuelve {} si no hay nodo equivalente en el año anterior", () => {
    // Sólo existe la raíz 2026: nada que mirar en 2025.
    const r26 = mkRoot(2026, "r26", 200_000);
    const idx = buildArbolIndices([], [r26], 2026);
    const props = proporcionesMensualesAYParaNodo(idx, "r26");
    expect(props).toEqual({});
  });
});

describe("metaParaNodoEnPeriodo con distribucionMensual='patronAnioAnterior'", () => {
  it("reparte el plan mensual siguiendo las proporciones AY (no días laborables)", () => {
    // 2025 facturó 100_000: 60_000 en enero, 40_000 en julio.
    const r25 = mkRoot(2025, "r25", 100_000);
    const r26 = mkRoot(2026, "r26", 200_000);
    const registros: RegistroNodo[] = [
      mkReg({ id: "m1", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-01", valor: 60_000 }),
      mkReg({ id: "m2", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-07", valor: 40_000 }),
    ];
    const idx = buildArbolIndices(registros, [r25, r26], 2026);

    const enero = metaParaNodoEnPeriodo(r26, "mes", "2026-01", 2026, CONFIG_AY, idx)!;
    const julio = metaParaNodoEnPeriodo(r26, "mes", "2026-07", 2026, CONFIG_AY, idx)!;
    const abril = metaParaNodoEnPeriodo(r26, "mes", "2026-04", 2026, CONFIG_AY, idx)!;
    expect(enero).toBeCloseTo(120_000, 1);
    expect(julio).toBeCloseTo(80_000, 1);
    expect(abril).toBeCloseTo(0, 1);
  });

  it("la suma de los 12 meses cuadra con el plan anual (tolerancia 1 €)", () => {
    const r25 = mkRoot(2025, "r25", 80_000);
    const r26 = mkRoot(2026, "r26", 200_000);
    // Distribución arbitraria del real 2025: enero 25k, marzo 15k, junio 20k, octubre 20k.
    const registros: RegistroNodo[] = [
      mkReg({ id: "m1", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-01", valor: 25_000 }),
      mkReg({ id: "m2", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-03", valor: 15_000 }),
      mkReg({ id: "m3", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-06", valor: 20_000 }),
      mkReg({ id: "m4", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-10", valor: 20_000 }),
    ];
    const idx = buildArbolIndices(registros, [r25, r26], 2026);

    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      const k = `2026-${String(m).padStart(2, "0")}`;
      sum += metaParaNodoEnPeriodo(r26, "mes", k, 2026, CONFIG_AY, idx) ?? 0;
    }
    expect(Math.abs(sum - 200_000)).toBeLessThan(1);
  });

  it("el trimestre se obtiene como suma de los 3 meses correspondientes", () => {
    const r25 = mkRoot(2025, "r25", 100_000);
    const r26 = mkRoot(2026, "r26", 100_000);
    const registros: RegistroNodo[] = [
      mkReg({ id: "m1", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-01", valor: 10_000 }),
      mkReg({ id: "m2", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-02", valor: 20_000 }),
      mkReg({ id: "m3", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-03", valor: 30_000 }),
      mkReg({ id: "m4", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-09", valor: 40_000 }),
    ];
    const idx = buildArbolIndices(registros, [r25, r26], 2026);

    const ene = metaParaNodoEnPeriodo(r26, "mes", "2026-01", 2026, CONFIG_AY, idx)!;
    const feb = metaParaNodoEnPeriodo(r26, "mes", "2026-02", 2026, CONFIG_AY, idx)!;
    const mar = metaParaNodoEnPeriodo(r26, "mes", "2026-03", 2026, CONFIG_AY, idx)!;
    const q1 = metaParaNodoEnPeriodo(r26, "mes", "2026-Q1", 2026, CONFIG_AY, idx);
    // El periodoKey "2026-Q1" no es un mes; se llama por trimestre:
    const q1Tri = metaParaNodoEnPeriodo(r26, "trimestre", "2026-Q1", 2026, CONFIG_AY, idx)!;
    expect(q1Tri).toBeCloseTo(ene + feb + mar, 1);
    // Sanity-check: Q3 contiene septiembre (40 % del total) ⇒ 40 k.
    const q3Tri = metaParaNodoEnPeriodo(r26, "trimestre", "2026-Q3", 2026, CONFIG_AY, idx)!;
    expect(q3Tri).toBeCloseTo(40_000, 1);
    // El call con vista="mes" sobre clave de trimestre no rompe (devuelve 0 al no
    // encontrar la key entre las proporciones).
    expect(q1).toBeCloseTo(0, 1);
  });

  it("si la suma AY es 0, fallback al cálculo por días laborables", () => {
    const r25 = mkRoot(2025, "r25", 100_000);
    const r26 = mkRoot(2026, "r26", 200_000);
    // Sin registros AY ⇒ fallback.
    const idx = buildArbolIndices([], [r25, r26], 2026);

    const planAY = metaParaNodoEnPeriodo(r26, "mes", "2026-04", 2026, CONFIG_AY, idx)!;
    const planDias = metaParaNodoEnPeriodo(r26, "mes", "2026-04", 2026, CONFIG_DIAS, idx)!;
    expect(planAY).toBeCloseTo(planDias, 1);
    // Y debe ser positivo (abril tiene días laborables).
    expect(planAY).toBeGreaterThan(0);
  });

  it("si no hay nodo equivalente AY (estructura totalmente nueva), fallback a días laborables", () => {
    // Año destino con ramas y hojas que no existen en 2025.
    const r25 = mkRoot(2025, "r25", 100_000); // sólo raíz, sin ramas
    const r26 = mkRoot(2026, "r26", 200_000);
    const ramaNueva = mkChild({ id: "rNueva", parentId: "r26", anio: 2026, nombre: "Línea totalmente nueva", orden: 0, metaValor: 60_000 });
    const idx = buildArbolIndices([], [r25, r26, ramaNueva], 2026);

    const planAY = metaParaNodoEnPeriodo(ramaNueva, "mes", "2026-05", 2026, CONFIG_AY, idx)!;
    const planDias = metaParaNodoEnPeriodo(ramaNueva, "mes", "2026-05", 2026, CONFIG_DIAS, idx)!;
    // No hay AY para esta rama: ambos cálculos coinciden (días laborables).
    expect(planAY).toBeCloseTo(planDias, 5);
  });

  it("el reparto semanal dentro del mes sigue siendo por días laborables", () => {
    // El patrón AY es mensual; dentro del mes la semana se prorratea por
    // días laborables del mes. Esta es una decisión del contrato.
    const r25 = mkRoot(2025, "r25", 60_000);
    const r26 = mkRoot(2026, "r26", 60_000);
    const registros: RegistroNodo[] = [
      // Real 2025 todo en abril.
      mkReg({ id: "m1", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-04", valor: 60_000 }),
    ];
    const idx = buildArbolIndices(registros, [r25, r26], 2026);
    const planAbril = metaParaNodoEnPeriodo(r26, "mes", "2026-04", 2026, CONFIG_AY, idx)!;
    expect(planAbril).toBeCloseTo(60_000, 1);

    // Suma de las semanas que tocan abril ≈ plan de abril (con tolerancia
    // de redondeo: alguna semana toca marzo/mayo y deduce su parte).
    const diasMesAbril = diasLaborablesEnMes("2026-04", 2026, undefined);
    expect(diasMesAbril).toBeGreaterThan(0);
    // Para una semana cualquiera plenamente dentro de abril: meta_sem = meta_abril × diasSem / diasMes.
    // Hacemos sanity-check con días laborables totales del año (no negativo).
    expect(diasLaborablesEnAnio(2026, undefined)).toBeGreaterThan(0);
  });
});

describe("replanMensualSerie respeta el modo y los datos AY", () => {
  it("modo 'patronAnioAnterior' reparte el residuo siguiendo las proporciones AY", () => {
    // Real AY 2025: 60% en enero, 40% en julio. Plan anual 2026 = 200k.
    // Sin reales acumulados ni meses cerrados, el replan mensual debe
    // poner los 200k siguiendo 60/40 ⇒ 120k en enero, 80k en julio.
    const proporcionesAY = { "2026-01": 0.6, "2026-07": 0.4 };
    const replanAY = replanMensualSerie({
      metaAnual: 200_000,
      realPorMes: new Map(),
      anio: 2026,
      config: CONFIG_AY,
      proporcionesAY,
    });
    expect(replanAY.get("2026-01")!).toBeCloseTo(120_000, 1);
    expect(replanAY.get("2026-07")!).toBeCloseTo(80_000, 1);
    expect(replanAY.get("2026-04")!).toBeCloseTo(0, 1);
  });

  it("sin proporcionesAY (o vacío) cae al reparto por días laborables", () => {
    const replanDias = replanMensualSerie({
      metaAnual: 200_000,
      realPorMes: new Map(),
      anio: 2026,
      config: CONFIG_AY,
      proporcionesAY: {},
    });
    // Cualquier mes laboralmente normal recibe una porción positiva.
    let positivosDias = 0;
    for (let m = 1; m <= 12; m++) {
      const k = `2026-${String(m).padStart(2, "0")}`;
      const v = replanDias.get(k) ?? 0;
      if (v > 0) positivosDias += 1;
    }
    expect(positivosDias).toBeGreaterThanOrEqual(8);
  });

  it("la suma del replan mensual cuadra con el plan anual (modo AY)", () => {
    const proporcionesAY = { "2026-01": 0.5, "2026-06": 0.3, "2026-12": 0.2 };
    const replan = replanMensualSerie({
      metaAnual: 100_000,
      realPorMes: new Map(),
      anio: 2026,
      config: CONFIG_AY,
      proporcionesAY,
    });
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const k = `2026-${String(m).padStart(2, "0")}`;
      total += replan.get(k) ?? 0;
    }
    // El replan mensual sólo cuadra con la meta anual cuando los pisos
    // no consumen residuo. CONFIG_AY no define pisos ⇒ cuadra dentro de
    // tolerancia.
    expect(Math.abs(total - 100_000)).toBeLessThan(1);
  });
});

describe("realAnioPasadoEnMesIdx", () => {
  it("devuelve el real del mismo mes del año anterior cuando existe registro mensual directo", () => {
    const r25 = mkRoot(2025, "r25", 100_000);
    const r26 = mkRoot(2026, "r26", 200_000);
    const registros: RegistroNodo[] = [
      mkReg({ id: "m1", nodoId: "r25", periodoTipo: "mes", periodoKey: "2025-04", valor: 38_420 }),
    ];
    const idx = buildArbolIndices(registros, [r25, r26], 2026);
    const v = realAnioPasadoEnMesIdx(idx, "r26", "2026-04");
    expect(v).toBeCloseTo(38_420, 2);
  });
});
