/**
 * Tests del módulo de rentabilidad por línea (€/hora mensual).
 *
 * Cubren las decisiones de la usuaria: sesiones cerradas vs abiertas, pausas
 * descontadas, reparto a partes iguales de un entregable compartido por
 * varias hojas, mantenimiento contabilizado en su hoja, y horas = 0 → €/h
 * null (sin dividir por cero).
 */
import { describe, expect, it } from "vitest";
import type { Entregable, SesionEntregable } from "./types";
import {
  minutosDeSesionesEnMes,
  minutosEfectivosSesion,
  rentabilidadHojaDesdeTiempo,
  rentabilidadPorHojaEnMes,
  tiempoPorHojaEnMes,
  type HojaRentabilidad,
} from "./rentabilidad";

const MES = "2026-03";

function ses(
  inicio: string,
  fin: string | null,
  extras: Partial<SesionEntregable> = {},
): SesionEntregable {
  return { inicioTs: inicio, finTs: fin, ...extras };
}

function ent(
  id: string,
  sesiones: SesionEntregable[],
  extras: Partial<Entregable> = {},
): Entregable {
  return { id, sesiones, ...extras } as Entregable;
}

function hoja(id: string, entregableIds: string[], extras: Partial<HojaRentabilidad> = {}): HojaRentabilidad {
  return { id, entregableIds, ...extras };
}

describe("minutosEfectivosSesion", () => {
  it("sesión cerrada simple: minutos = fin − inicio", () => {
    expect(
      minutosEfectivosSesion(ses("2026-03-10T09:00:00.000Z", "2026-03-10T10:00:00.000Z")),
    ).toBe(60);
  });

  it("sesión abierta (finTs null) se ignora → 0", () => {
    expect(minutosEfectivosSesion(ses("2026-03-10T09:00:00.000Z", null))).toBe(0);
  });

  it("descuenta las pausas dentro de la sesión", () => {
    const s = ses("2026-03-10T09:00:00.000Z", "2026-03-10T10:00:00.000Z", {
      pausas: [{ pauseTs: "2026-03-10T09:20:00.000Z", resumeTs: "2026-03-10T09:30:00.000Z" }],
    });
    expect(minutosEfectivosSesion(s)).toBe(50);
  });
});

describe("minutosDeSesionesEnMes", () => {
  it("suma sólo las sesiones del mes, ignorando otras y las abiertas", () => {
    const e = ent("e1", [
      ses("2026-03-01T09:00:00.000Z", "2026-03-01T10:00:00.000Z"), // 60, marzo
      ses("2026-03-05T09:00:00.000Z", "2026-03-05T09:30:00.000Z"), // 30, marzo
      ses("2026-02-20T09:00:00.000Z", "2026-02-20T11:00:00.000Z"), // febrero → fuera
      ses("2026-03-09T09:00:00.000Z", null), // abierta → fuera
    ]);
    expect(minutosDeSesionesEnMes(e, MES)).toBe(90);
  });
});

describe("tiempoPorHojaEnMes", () => {
  it("entregable en 2 hojas reparte el tiempo a partes iguales (mitad y mitad)", () => {
    const compartido = ent("comp", [
      ses("2026-03-02T08:00:00.000Z", "2026-03-02T10:00:00.000Z"), // 120 min
    ]);
    const hojas = [hoja("hA", ["comp"]), hoja("hB", ["comp"])];
    const { porHoja } = tiempoPorHojaEnMes(hojas, [compartido], MES);
    expect(porHoja.get("hA")?.minutos).toBe(60);
    expect(porHoja.get("hB")?.minutos).toBe(60);
  });

  it("mantenimiento cuenta en su hoja y se reporta como horas de mantenimiento", () => {
    const normal = ent("n", [ses("2026-03-02T08:00:00.000Z", "2026-03-02T09:00:00.000Z")]); // 60
    const manten = ent(
      "m",
      [ses("2026-03-03T08:00:00.000Z", "2026-03-03T08:30:00.000Z")], // 30
      { esMantenimiento: true },
    );
    const hojas = [hoja("hA", ["n", "m"])];
    const { porHoja } = tiempoPorHojaEnMes(hojas, [normal, manten], MES);
    expect(porHoja.get("hA")?.minutos).toBe(90);
    expect(porHoja.get("hA")?.minutosMantenimiento).toBe(30);
  });

  it("entregable sin hoja se reporta en 'sinLinea'", () => {
    const huerfano = ent("x", [ses("2026-03-02T08:00:00.000Z", "2026-03-02T09:00:00.000Z")]);
    const { porHoja, sinLinea } = tiempoPorHojaEnMes([hoja("hA", [])], [huerfano], MES);
    expect(porHoja.size).toBe(0);
    expect(sinLinea.minutos).toBe(60);
  });
});

describe("rentabilidadHojaDesdeTiempo", () => {
  it("calcula €/hora con ventas y horas", () => {
    const r = rentabilidadHojaDesdeTiempo(420, { minutos: 600, minutosMantenimiento: 0 }, false);
    expect(r.horas).toBe(10);
    expect(r.eurosPorHora).toBe(42);
  });

  it("horas = 0 → €/hora null (no divide por cero)", () => {
    const r = rentabilidadHojaDesdeTiempo(1000, { minutos: 0, minutosMantenimiento: 0 }, false);
    expect(r.horas).toBe(0);
    expect(r.eurosPorHora).toBeNull();
  });
});

describe("rentabilidadPorHojaEnMes", () => {
  it("combina ventas + tiempo y marca esFlor", () => {
    const e = ent("e1", [
      ses("2026-03-02T08:00:00.000Z", "2026-03-02T10:00:00.000Z"), // 120 min = 2 h
    ]);
    const hojas = [
      hoja("hFruto", ["e1"], { prioridadEstrategica: "fruto" }),
      hoja("hFlor", ["e1"], { prioridadEstrategica: "flor" }),
    ];
    const ventas = new Map<string, number>([
      ["hFruto", 100],
      ["hFlor", 0],
    ]);
    const { porHoja } = rentabilidadPorHojaEnMes(hojas, [e], MES, (id) => ventas.get(id) ?? 0);
    // 120 min repartidos entre 2 hojas → 1 h cada una.
    const fruto = porHoja.get("hFruto")!;
    expect(fruto.horas).toBe(1);
    expect(fruto.eurosPorHora).toBe(100);
    expect(fruto.esFlor).toBe(false);
    const flor = porHoja.get("hFlor")!;
    expect(flor.esFlor).toBe(true);
    expect(flor.eurosPorHora).toBe(0);
  });
});
