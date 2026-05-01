import { describe, expect, it } from "vitest";
import {
  buildArbolIndices,
  normalizarNombreNodo,
  realAnioPasadoAgregadoIdx,
  realEfectivoEnPeriodoIdx,
  resolverNodoEquivalenteEnAnio,
} from "./arbol-tiempo";
import type { NodoArbol, RegistroNodo } from "./types";

const ts = "2026-01-01T00:00:00.000Z";

function mkNodo(p: Omit<NodoArbol, "creado">): NodoArbol {
  return { ...p, creado: ts };
}
function mkReg(p: Omit<RegistroNodo, "creado" | "actualizado">): RegistroNodo {
  return { ...p, creado: ts, actualizado: ts };
}

describe("normalizarNombreNodo", () => {
  it("quita tildes, pasa a minúsculas, quita espacios extras y s final", () => {
    expect(normalizarNombreNodo("Aulas")).toBe("aula");
    expect(normalizarNombreNodo("  Plan de Salud  ")).toBe("plan de salud");
    expect(normalizarNombreNodo("Psicoanálisis INDIVIDUAL")).toBe("psicoanalisis individual");
    expect(normalizarNombreNodo("Aulas")).toBe(normalizarNombreNodo("Aula"));
  });
  it("tolera vacíos", () => {
    expect(normalizarNombreNodo("")).toBe("");
    expect(normalizarNombreNodo(undefined)).toBe("");
  });
});

describe("resolverNodoEquivalenteEnAnio", () => {
  const raiz2025 = mkNodo({
    id: "r25",
    anio: 2025,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
  });
  const aulas2025 = mkNodo({
    id: "a25",
    anio: 2025,
    parentId: "r25",
    orden: 0,
    nombre: "Aulas",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const acidez2025 = mkNodo({
    id: "ac25",
    anio: 2025,
    parentId: "a25",
    orden: 0,
    nombre: "Acidez",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const raiz2026 = mkNodo({
    id: "r26",
    anio: 2026,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor: 624_000,
  });
  const aulas2026 = mkNodo({
    id: "a26",
    anio: 2026,
    parentId: "r26",
    orden: 0,
    // singular vs plural: el normalizador debe emparejar
    nombre: "Aula",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const acidez2026 = mkNodo({
    id: "ac26",
    anio: 2026,
    parentId: "a26",
    orden: 0,
    nombre: "Acidez",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const nuevoProducto2026 = mkNodo({
    id: "np26",
    anio: 2026,
    parentId: "a26",
    orden: 1,
    nombre: "Fase Clínica",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });

  const nodos = [raiz2025, aulas2025, acidez2025, raiz2026, aulas2026, acidez2026, nuevoProducto2026];

  it("empareja hojas con mismo path aunque difiera plural/tildes", () => {
    const idx = buildArbolIndices([], nodos, 2026);
    expect(resolverNodoEquivalenteEnAnio(idx, "ac26", 2025)).toBe("ac25");
    expect(resolverNodoEquivalenteEnAnio(idx, "a26", 2025)).toBe("a25");
    expect(resolverNodoEquivalenteEnAnio(idx, "r26", 2025)).toBe("r25");
  });

  it("devuelve null para nodos sin equivalente en el año pedido", () => {
    const idx = buildArbolIndices([], nodos, 2026);
    expect(resolverNodoEquivalenteEnAnio(idx, "np26", 2025)).toBeNull();
    expect(resolverNodoEquivalenteEnAnio(idx, "ac26", 2024)).toBeNull();
  });
});

describe("realAnioPasadoAgregadoIdx con cruce por path", () => {
  const raiz2025 = mkNodo({
    id: "r25",
    anio: 2025,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
  });
  const aulas2025 = mkNodo({
    id: "a25",
    anio: 2025,
    parentId: "r25",
    orden: 0,
    nombre: "Aulas",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const acidez2025 = mkNodo({
    id: "ac25",
    anio: 2025,
    parentId: "a25",
    orden: 0,
    nombre: "Acidez",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const raiz2026 = mkNodo({
    id: "r26",
    anio: 2026,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
    metaValor: 624_000,
  });
  const aulas2026 = mkNodo({
    id: "a26",
    anio: 2026,
    parentId: "r26",
    orden: 0,
    nombre: "Aulas",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const acidez2026 = mkNodo({
    id: "ac26",
    anio: 2026,
    parentId: "a26",
    orden: 0,
    nombre: "Acidez",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const productoNuevo2026 = mkNodo({
    id: "pn26",
    anio: 2026,
    parentId: "a26",
    orden: 1,
    nombre: "Producto Nuevo 2026",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });

  const nodos = [raiz2025, aulas2025, acidez2025, raiz2026, aulas2026, acidez2026, productoNuevo2026];

  it("hoja 2026 sin registros propios usa el equivalente 2025 por path", () => {
    const registros: RegistroNodo[] = [
      mkReg({ id: "rg1", nodoId: "ac25", periodoTipo: "mes", periodoKey: "2025-01", valor: 1037 }),
      mkReg({ id: "rg2", nodoId: "ac25", periodoTipo: "mes", periodoKey: "2025-02", valor: 60 }),
    ];
    const idx = buildArbolIndices(registros, nodos, 2026);
    expect(realAnioPasadoAgregadoIdx(idx, "ac26", "mes", "2026-01")).toBe(1037);
    expect(realAnioPasadoAgregadoIdx(idx, "ac26", "mes", "2026-02")).toBe(60);
  });

  it("rama 2026 con una hoja nueva suma el AY solo del equivalente existente", () => {
    const registros: RegistroNodo[] = [
      mkReg({ id: "rg1", nodoId: "ac25", periodoTipo: "mes", periodoKey: "2025-01", valor: 1037 }),
    ];
    const idx = buildArbolIndices(registros, nodos, 2026);
    // producto nuevo 2026 no tiene equivalente en 2025 → undefined
    expect(realAnioPasadoAgregadoIdx(idx, "pn26", "mes", "2026-01")).toBeUndefined();
    // la rama suma solo la hoja con equivalente
    expect(realAnioPasadoAgregadoIdx(idx, "a26", "mes", "2026-01")).toBe(1037);
  });

  it("registros directos en la raíz 2026 con periodoKey 2025-* tienen prioridad antes del cruce", () => {
    const registros: RegistroNodo[] = [
      // Hoja 2025 con 1000
      mkReg({ id: "h25", nodoId: "ac25", periodoTipo: "mes", periodoKey: "2025-01", valor: 1000 }),
      // Apunte manual de referencia en la raíz 2026 (periodoKey año anterior) con valor total
      mkReg({ id: "raizay", nodoId: "r26", periodoTipo: "mes", periodoKey: "2025-01", valor: 5000 }),
    ];
    const idx = buildArbolIndices(registros, nodos, 2026);
    // La raíz recurre en hijos (suma = 1000); el apunte directo sirve de fallback solo si hijos = 0
    expect(realAnioPasadoAgregadoIdx(idx, "r26", "mes", "2026-01")).toBe(1000);
  });

  it("si los hijos 2026 no aportan nada ni por path ni directo, la raíz cae al apunte manual en 2025-MM", () => {
    const registros: RegistroNodo[] = [
      mkReg({ id: "raizay", nodoId: "r26", periodoTipo: "mes", periodoKey: "2025-01", valor: 5000 }),
    ];
    const idx = buildArbolIndices(registros, nodos, 2026);
    expect(realAnioPasadoAgregadoIdx(idx, "r26", "mes", "2026-01")).toBe(5000);
  });

  it("producto nuevo 2026 sin nada en 2025 devuelve undefined", () => {
    const registros: RegistroNodo[] = [];
    const idx = buildArbolIndices(registros, nodos, 2026);
    expect(realAnioPasadoAgregadoIdx(idx, "pn26", "mes", "2026-01")).toBeUndefined();
  });

  it("cruce por path sirve también para la vista trimestre", () => {
    const registros: RegistroNodo[] = [
      mkReg({ id: "r1", nodoId: "ac25", periodoTipo: "mes", periodoKey: "2025-01", valor: 100 }),
      mkReg({ id: "r2", nodoId: "ac25", periodoTipo: "mes", periodoKey: "2025-02", valor: 200 }),
      mkReg({ id: "r3", nodoId: "ac25", periodoTipo: "mes", periodoKey: "2025-03", valor: 300 }),
    ];
    const idx = buildArbolIndices(registros, nodos, 2026);
    expect(realAnioPasadoAgregadoIdx(idx, "ac26", "trimestre", "2026-Q1")).toBe(600);
  });
});

describe("realEfectivoEnPeriodoIdx con fallback a registros directos", () => {
  const raiz2026 = mkNodo({
    id: "r26",
    anio: 2026,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
  });
  const rama2026 = mkNodo({
    id: "rm26",
    anio: 2026,
    parentId: "r26",
    orden: 0,
    nombre: "Aulas",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const hoja2026 = mkNodo({
    id: "h26",
    anio: 2026,
    parentId: "rm26",
    orden: 0,
    nombre: "Acidez",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });

  it("prioriza suma de hojas si aportan", () => {
    const registros = [
      mkReg({ id: "r1", nodoId: "h26", periodoTipo: "mes", periodoKey: "2026-01", valor: 500 }),
      mkReg({ id: "r2", nodoId: "r26", periodoTipo: "mes", periodoKey: "2026-01", valor: 9999 }),
    ];
    const idx = buildArbolIndices(registros, [raiz2026, rama2026, hoja2026], 2026);
    expect(realEfectivoEnPeriodoIdx(idx, "r26", "mes", "2026-01")).toBe(500);
  });

  it("si las hojas están vacías, usa apunte directo en la raíz", () => {
    const registros = [
      mkReg({ id: "r1", nodoId: "r26", periodoTipo: "mes", periodoKey: "2026-01", valor: 9999 }),
    ];
    const idx = buildArbolIndices(registros, [raiz2026, rama2026, hoja2026], 2026);
    expect(realEfectivoEnPeriodoIdx(idx, "r26", "mes", "2026-01")).toBe(9999);
  });
});

/**
 * Regresión del reset de datos: tras borrar todos los apuntes manuales en ramas y raíces,
 * el Real y el AY que se muestran en la raíz siguen cuadrando como suma de las hojas.
 */
describe("post-reset: raíz cuadra con suma de hojas", () => {
  const raiz2025 = mkNodo({
    id: "r25",
    anio: 2025,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
  });
  const aulas2025 = mkNodo({
    id: "a25",
    anio: 2025,
    parentId: "r25",
    orden: 0,
    nombre: "Aulas",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const acidez2025 = mkNodo({
    id: "ac25",
    anio: 2025,
    parentId: "a25",
    orden: 0,
    nombre: "Acidez",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const infertilidad2025 = mkNodo({
    id: "if25",
    anio: 2025,
    parentId: "a25",
    orden: 1,
    nombre: "Infertilidad",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const raiz2026 = mkNodo({
    id: "r26",
    anio: 2026,
    orden: 0,
    nombre: "Facturación",
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    contadorModo: "manual",
    metaUnidad: "€",
  });
  const aulas2026 = mkNodo({
    id: "a26",
    anio: 2026,
    parentId: "r26",
    orden: 0,
    nombre: "Aulas",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const acidez2026 = mkNodo({
    id: "ac26",
    anio: 2026,
    parentId: "a26",
    orden: 0,
    nombre: "Acidez",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });
  const infertilidad2026 = mkNodo({
    id: "if26",
    anio: 2026,
    parentId: "a26",
    orden: 1,
    nombre: "Infertilidad",
    tipo: "palanca",
    cadencia: "anual",
    relacionConPadre: "suma",
    contadorModo: "manual",
  });

  const nodos = [
    raiz2025,
    aulas2025,
    acidez2025,
    infertilidad2025,
    raiz2026,
    aulas2026,
    acidez2026,
    infertilidad2026,
  ];

  it("Real de la raíz 2026 = suma del Real de sus hojas (sin apuntes en ramas ni raíz)", () => {
    const registros = [
      mkReg({ id: "rac", nodoId: "ac26", periodoTipo: "mes", periodoKey: "2026-01", valor: 1200 }),
      mkReg({ id: "rif", nodoId: "if26", periodoTipo: "mes", periodoKey: "2026-01", valor: 800 }),
    ];
    const idx = buildArbolIndices(registros, nodos, 2026);
    expect(realEfectivoEnPeriodoIdx(idx, "ac26", "mes", "2026-01")).toBe(1200);
    expect(realEfectivoEnPeriodoIdx(idx, "if26", "mes", "2026-01")).toBe(800);
    expect(realEfectivoEnPeriodoIdx(idx, "a26", "mes", "2026-01")).toBe(2000);
    expect(realEfectivoEnPeriodoIdx(idx, "r26", "mes", "2026-01")).toBe(2000);
  });

  it("AY de la raíz 2026 = suma del AY de sus hojas por path (sin apuntes manuales en 2026)", () => {
    const registros = [
      mkReg({ id: "ay1", nodoId: "ac25", periodoTipo: "mes", periodoKey: "2025-01", valor: 1037 }),
      mkReg({ id: "ay2", nodoId: "if25", periodoTipo: "mes", periodoKey: "2025-01", valor: 500 }),
    ];
    const idx = buildArbolIndices(registros, nodos, 2026);
    expect(realAnioPasadoAgregadoIdx(idx, "ac26", "mes", "2026-01")).toBe(1037);
    expect(realAnioPasadoAgregadoIdx(idx, "if26", "mes", "2026-01")).toBe(500);
    expect(realAnioPasadoAgregadoIdx(idx, "a26", "mes", "2026-01")).toBe(1537);
    expect(realAnioPasadoAgregadoIdx(idx, "r26", "mes", "2026-01")).toBe(1537);
  });
});
