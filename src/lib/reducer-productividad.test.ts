import { describe, expect, it } from "vitest";
import { reducer } from "./reducer";
import type { AppState, RegistroProductividad } from "./types";
import { EMPTY_ARBOL } from "./types";
import { productividadDeRegistro, matrizFranjaPorDia, diaSemanaDeFecha, registroCompleto } from "./productividad";
import type { FranjaDia } from "./types";

function base(overrides: Partial<AppState> = {}): AppState {
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
      proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [], notas: [], mensajes: [],
    },
    ...overrides,
  };
}

function mkReg(overrides: Partial<RegistroProductividad> & { id: string }): RegistroProductividad {
  return {
    fecha: "2026-05-04",
    franjaId: "franja-foco",
    energia: 3,
    foco: 3,
    animo: 3,
    autor: "Gabi",
    ...overrides,
  };
}

describe("Productividad por franja (reducer)", () => {
  it("UPSERT crea un registro nuevo", () => {
    const s0 = base({ productividadFranjas: [] });
    const s1 = reducer(s0, { type: "UPSERT_REGISTRO_PRODUCTIVIDAD", payload: mkReg({ id: "r-1", energia: 4, foco: 5, animo: 3 }) });
    expect(s1.productividadFranjas).toHaveLength(1);
    const r = s1.productividadFranjas![0];
    expect(r.energia).toBe(4);
    expect(productividadDeRegistro(r)).toBeCloseTo(4);
    expect(r.actualizado).toBeTruthy();
  });

  it("UPSERT actualiza por id sin duplicar", () => {
    const s0 = base({ productividadFranjas: [mkReg({ id: "r-1", energia: 2 })] });
    const s1 = reducer(s0, { type: "UPSERT_REGISTRO_PRODUCTIVIDAD", payload: mkReg({ id: "r-1", energia: 5, foco: 5, animo: 5 }) });
    expect(s1.productividadFranjas).toHaveLength(1);
    expect(s1.productividadFranjas![0].energia).toBe(5);
  });

  it("UPSERT recorta las puntuaciones al rango 0..5 (0 = sin puntuar)", () => {
    const s0 = base({ productividadFranjas: [] });
    const s1 = reducer(s0, { type: "UPSERT_REGISTRO_PRODUCTIVIDAD", payload: mkReg({ id: "r-1", energia: 9, foco: 0, animo: 3 }) });
    const r = s1.productividadFranjas![0];
    expect(r.energia).toBe(5);
    expect(r.foco).toBe(0);
  });

  it("DELETE elimina el registro por id", () => {
    const s0 = base({ productividadFranjas: [mkReg({ id: "r-1" }), mkReg({ id: "r-2" })] });
    const s1 = reducer(s0, { type: "DELETE_REGISTRO_PRODUCTIVIDAD", id: "r-1" });
    expect(s1.productividadFranjas!.map((r) => r.id)).toEqual(["r-2"]);
  });
});

describe("Productividad — analítica derivada", () => {
  const franjas: FranjaDia[] = [
    { id: "franja-foco", nombre: "Foco", inicio: "16:00", fin: "19:00", color: "#000" },
  ];

  it("diaSemanaDeFecha usa hora local (1=lunes..7=domingo)", () => {
    expect(diaSemanaDeFecha("2026-05-04")).toBe(1); // lunes
    expect(diaSemanaDeFecha("2026-05-10")).toBe(7); // domingo
  });

  it("registroCompleto solo cuando las tres dimensiones >0", () => {
    expect(registroCompleto(mkReg({ id: "x", energia: 3, foco: 3, animo: 3 }))).toBe(true);
    expect(registroCompleto(mkReg({ id: "x", energia: 3, foco: 0, animo: 3 }))).toBe(false);
  });

  it("matrizFranjaPorDia promedia por franja y día, ignorando incompletos", () => {
    const registros = [
      mkReg({ id: "a", fecha: "2026-05-04", energia: 4, foco: 4, animo: 4 }), // lunes -> 4
      mkReg({ id: "b", fecha: "2026-05-11", energia: 2, foco: 2, animo: 2 }), // lunes -> 2
      mkReg({ id: "c", fecha: "2026-05-05", energia: 5, foco: 0, animo: 5 }), // martes incompleto
    ];
    const matriz = matrizFranjaPorDia(registros, franjas, "Gabi");
    const lunes = matriz[0][0];
    expect(lunes.diaSemana).toBe(1);
    expect(lunes.media).toBeCloseTo(3); // (4+2)/2
    expect(lunes.n).toBe(2);
    const martes = matriz[0][1];
    expect(martes.media).toBeNull();
  });

  it("productividadDeRegistro es la media de las tres dimensiones", () => {
    expect(productividadDeRegistro(mkReg({ id: "x", energia: 3, foco: 4, animo: 5 }))).toBeCloseTo(4);
  });
});
