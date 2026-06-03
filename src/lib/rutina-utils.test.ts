import { describe, expect, it } from "vitest";
import { dateKeysDeMesPorDiaSemana, diaSemanaLunes1 } from "./rutina-utils";

describe("dateKeysDeMesPorDiaSemana", () => {
  it("expande L-V sobre un mes de 31 días (mayo 2026)", () => {
    // Mayo 2026: el 1 cae viernes. Lunes-viernes del mes.
    const dias = dateKeysDeMesPorDiaSemana("2026-05", [1, 2, 3, 4, 5]);
    expect(dias[0]).toBe("2026-05-01"); // viernes
    expect(dias).toContain("2026-05-04"); // lunes
    expect(dias).not.toContain("2026-05-02"); // sábado
    expect(dias).not.toContain("2026-05-03"); // domingo
    // Todos los resultados son días entre semana y dentro del mes.
    for (const d of dias) {
      expect(d.startsWith("2026-05-")).toBe(true);
      const dow = diaSemanaLunes1(d);
      expect(dow).toBeGreaterThanOrEqual(1);
      expect(dow).toBeLessThanOrEqual(5);
    }
    // Mayo 2026 tiene 21 días laborables (L-V).
    expect(dias).toHaveLength(21);
  });

  it("devuelve los resultados ordenados ascendentemente", () => {
    const dias = dateKeysDeMesPorDiaSemana("2026-05", [5, 1, 3]);
    const ordenado = [...dias].sort();
    expect(dias).toEqual(ordenado);
  });

  it("filtra por un único día de la semana (todos los lunes de junio 2026)", () => {
    // Junio 2026: lunes 1, 8, 15, 22, 29.
    const lunes = dateKeysDeMesPorDiaSemana("2026-06", [1]);
    expect(lunes).toEqual(["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"]);
  });

  it("incluye sábados y domingos cuando se piden (6 y 7)", () => {
    const finde = dateKeysDeMesPorDiaSemana("2026-05", [6, 7]);
    expect(finde).toContain("2026-05-02"); // sábado
    expect(finde).toContain("2026-05-03"); // domingo
    for (const d of finde) {
      expect([6, 7]).toContain(diaSemanaLunes1(d));
    }
  });

  it("cubre correctamente febrero de un año bisiesto (29 días, 2028)", () => {
    const todos = dateKeysDeMesPorDiaSemana("2028-02", [1, 2, 3, 4, 5, 6, 7]);
    expect(todos).toHaveLength(29);
    expect(todos[0]).toBe("2028-02-01");
    expect(todos[todos.length - 1]).toBe("2028-02-29");
  });

  it("febrero no bisiesto tiene 28 días (2026)", () => {
    const todos = dateKeysDeMesPorDiaSemana("2026-02", [1, 2, 3, 4, 5, 6, 7]);
    expect(todos).toHaveLength(28);
    expect(todos[todos.length - 1]).toBe("2026-02-28");
  });

  it("patrón vacío → []", () => {
    expect(dateKeysDeMesPorDiaSemana("2026-05", [])).toEqual([]);
  });

  it("mes mal formado o fuera de rango → []", () => {
    expect(dateKeysDeMesPorDiaSemana("2026-5", [1, 2, 3])).toEqual([]);
    expect(dateKeysDeMesPorDiaSemana("no-es-un-mes", [1])).toEqual([]);
    expect(dateKeysDeMesPorDiaSemana("2026-13", [1, 2, 3, 4, 5])).toEqual([]);
    expect(dateKeysDeMesPorDiaSemana("2026-00", [1, 2, 3, 4, 5])).toEqual([]);
  });

  it("ignora días de la semana duplicados o fuera de 1..7 sin romper", () => {
    const dias = dateKeysDeMesPorDiaSemana("2026-06", [1, 1, 8, 0]);
    // Sólo los lunes (1) tienen efecto; 0 y 8 no existen como día de semana.
    expect(dias).toEqual(["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29"]);
  });
});
