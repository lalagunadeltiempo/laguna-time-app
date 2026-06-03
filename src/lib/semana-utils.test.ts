import { describe, expect, it } from "vitest";
import { semanasDeMes, mesKey } from "./semana-utils";

describe("semanasDeMes", () => {
  it("devuelve los lunes ISO de TODAS las semanas que tocan el mes (mes que empieza en lunes)", () => {
    // Junio 2026 empieza en lunes (2026-06-01 es lunes).
    const semanas = semanasDeMes("2026-06");
    expect(semanas).toEqual([
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
    ]);
  });

  it("incluye el lunes del mes anterior cuando el mes empieza en domingo", () => {
    // Febrero 2026 empieza en domingo (2026-02-01 es domingo); la primera
    // semana que toca febrero arranca el lunes 26 de enero.
    const semanas = semanasDeMes("2026-02");
    expect(semanas[0]).toBe("2026-01-26");
    expect(semanas).toEqual([
      "2026-01-26",
      "2026-02-02",
      "2026-02-09",
      "2026-02-16",
      "2026-02-23",
    ]);
  });

  it("maneja el cruce diciembre→enero", () => {
    // La última semana de diciembre 2026 continúa en enero 2027; su lunes
    // (2026-12-28) representa esa semana y pertenece a diciembre.
    const dic = semanasDeMes("2026-12");
    expect(dic).toContain("2026-12-28");
    // Enero 2027 empieza en viernes; la primera semana que lo toca arranca
    // el lunes 28 de diciembre de 2026.
    const ene = semanasDeMes("2027-01");
    expect(ene[0]).toBe("2026-12-28");
  });

  it("todos los lunes devueltos son efectivamente lunes (ISO)", () => {
    for (const mes of ["2026-02", "2026-06", "2026-12", "2027-01"]) {
      for (const monday of semanasDeMes(mes)) {
        const d = new Date(monday + "T12:00:00");
        expect(d.getDay()).toBe(1); // 1 = lunes
      }
    }
  });

  it("es coherente: el mes de cada semana (por su jueves) cubre el mes pedido", () => {
    // Cada semana del mes solapa el mes; al menos una semana tiene su mesKey
    // igual al mes pedido.
    const semanas = semanasDeMes("2026-06");
    expect(semanas.some((m) => mesKey(m) === "2026-06")).toBe(true);
  });

  it("devuelve [] para un mes inválido", () => {
    expect(semanasDeMes("no-es-un-mes")).toEqual([]);
  });
});
