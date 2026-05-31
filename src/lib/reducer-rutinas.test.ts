import { describe, expect, it } from "vitest";
import { reducer } from "./reducer";
import type { AppState, Entregable, Paso } from "./types";
import { EMPTY_ARBOL } from "./types";
import { rutinaApareceEnDia } from "./rutina-utils";

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
    deleted: { proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [], notas: [], mensajes: [] },
    ...overrides,
  };
}

function mkEnt(id: string, overrides: Partial<Entregable> = {}): Entregable {
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
  } as Entregable;
}

function mkPaso(id: string, entregableId: string, nombre: string): Paso {
  return {
    id, entregableId, nombre, inicioTs: null, finTs: null, estado: "pendiente",
    contexto: { urls: [], apps: [], notas: "" }, implicados: [], pausas: [], siguientePaso: null,
  };
}

describe("CONVERT_ENTREGABLE_TO_RUTINA", () => {
  it("marca el entregable como rutina con mes y días L-V por defecto", () => {
    const s0 = base({ entregables: [mkEnt("e-1")] });
    const s1 = reducer(s0, { type: "CONVERT_ENTREGABLE_TO_RUTINA", entregableId: "e-1", mes: "2026-05" });
    const e = s1.entregables[0];
    expect(e.tipo).toBe("rutina");
    expect(e.mesActivoRutina).toBe("2026-05");
    expect(e.diasSemanaRutina).toEqual([1, 2, 3, 4, 5]);
  });

  it("respeta diasSemanaRutina previos si ya existían", () => {
    const s0 = base({ entregables: [mkEnt("e-1", { diasSemanaRutina: [1, 3, 5] })] });
    const s1 = reducer(s0, { type: "CONVERT_ENTREGABLE_TO_RUTINA", entregableId: "e-1", mes: "2026-05" });
    expect(s1.entregables[0].diasSemanaRutina).toEqual([1, 3, 5]);
  });
});

describe("ROLAR_RUTINA_MES", () => {
  it("archiva el mes actual en histórico y conserva sólo lo seleccionado", () => {
    const ent = mkEnt("e-1", {
      tipo: "rutina",
      mesActivoRutina: "2026-05",
      notas: [
        { id: "n-1", texto: "Conservar", autor: "Gabi", creadoTs: "2026-05-02T00:00:00.000Z" },
        { id: "n-2", texto: "Archivar", autor: "Gabi", creadoTs: "2026-05-03T00:00:00.000Z" },
      ],
      contexto: { urls: [{ nombre: "Doc", descripcion: "", url: "https://a" }, { nombre: "Viejo", descripcion: "", url: "https://b" }], apps: [], notas: "" },
    });
    const s0 = base({
      entregables: [ent],
      pasos: [mkPaso("p-1", "e-1", "Paso vivo"), mkPaso("p-2", "e-1", "Paso viejo")],
    });
    const s1 = reducer(s0, {
      type: "ROLAR_RUTINA_MES",
      id: "e-1",
      nuevoMes: "2026-06",
      mantener: { notas: ["n-1"], urls: ["https://a"], pasos: ["p-1"] },
    });
    const e = s1.entregables[0];
    expect(e.mesActivoRutina).toBe("2026-06");
    expect(e.notas!.map((n) => n.id)).toEqual(["n-1"]);
    expect(e.contexto!.urls.map((u) => u.url)).toEqual(["https://a"]);
    expect(s1.pasos.map((p) => p.id)).toEqual(["p-1"]);

    const hist = e.historicoRutina!;
    expect(hist).toHaveLength(1);
    expect(hist[0].mes).toBe("2026-05");
    expect(hist[0].notas).toHaveLength(2);
    expect(hist[0].urls).toHaveLength(2);
    expect(hist[0].pasos.map((p) => p.nombre)).toEqual(["Paso vivo", "Paso viejo"]);
  });

  it("no hace nada si el entregable no es rutina", () => {
    const s0 = base({ entregables: [mkEnt("e-1", { tipo: "raw" })] });
    const s1 = reducer(s0, { type: "ROLAR_RUTINA_MES", id: "e-1", nuevoMes: "2026-06", mantener: { notas: [], urls: [], pasos: [] } });
    expect(s1).toBe(s0);
  });
});

describe("rutinaApareceEnDia", () => {
  const ent = mkEnt("e-1", { tipo: "rutina", mesActivoRutina: "2026-05", diasSemanaRutina: [1, 2, 3, 4, 5] });

  it("aparece los días laborables del mes activo", () => {
    expect(rutinaApareceEnDia(ent, "2026-05-04")).toBe(true); // lunes
    expect(rutinaApareceEnDia(ent, "2026-05-08")).toBe(true); // viernes
  });

  it("no aparece en fin de semana", () => {
    expect(rutinaApareceEnDia(ent, "2026-05-09")).toBe(false); // sábado
    expect(rutinaApareceEnDia(ent, "2026-05-10")).toBe(false); // domingo
  });

  it("no aparece fuera del mes activo", () => {
    expect(rutinaApareceEnDia(ent, "2026-06-01")).toBe(false); // lunes pero otro mes
    expect(rutinaApareceEnDia(ent, "2026-04-30")).toBe(false);
  });

  it("no aparece si no es rutina", () => {
    expect(rutinaApareceEnDia(mkEnt("e-2", { mesActivoRutina: "2026-05" }), "2026-05-04")).toBe(false);
  });

  it("usa L-V por defecto cuando diasSemanaRutina no está", () => {
    const sinDias = mkEnt("e-3", { tipo: "rutina", mesActivoRutina: "2026-05" });
    expect(rutinaApareceEnDia(sinDias, "2026-05-04")).toBe(true);
    expect(rutinaApareceEnDia(sinDias, "2026-05-09")).toBe(false);
  });
});
