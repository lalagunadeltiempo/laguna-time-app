import { describe, expect, it } from "vitest";
import { parseHora } from "./HoraTextInput";

// El proyecto no tiene setup de @testing-library/react ni jsdom (vitest corre en
// `node`), así que probamos sólo el helper puro `parseHora`. La interacción del
// componente se valida manualmente.

describe("parseHora", () => {
  it("normaliza 4 dígitos sin separador a HH:MM", () => {
    expect(parseHora("0830")).toBe("08:30");
  });

  it("normaliza un dígito de hora con separador", () => {
    expect(parseHora("8:30")).toBe("08:30");
  });

  it("acepta HH:MM canónico", () => {
    expect(parseHora("08:30")).toBe("08:30");
  });

  it("acepta el límite alto válido", () => {
    expect(parseHora("23:59")).toBe("23:59");
  });

  it("acepta media noche y mediodía", () => {
    expect(parseHora("00:00")).toBe("00:00");
    expect(parseHora("12:00")).toBe("12:00");
  });

  it("rechaza horas fuera de rango", () => {
    expect(parseHora("24:00")).toBeNull();
    expect(parseHora("99:99")).toBeNull();
  });

  it("rechaza minutos fuera de rango", () => {
    expect(parseHora("12:60")).toBeNull();
    expect(parseHora("12:99")).toBeNull();
  });

  it("rechaza cadena vacía", () => {
    expect(parseHora("")).toBeNull();
  });

  it("rechaza drafts incompletos de 1, 2 o 3 dígitos", () => {
    expect(parseHora("1")).toBeNull();
    expect(parseHora("12")).toBeNull();
    expect(parseHora("123")).toBeNull();
  });

  it("normaliza 4 dígitos arbitrarios válidos", () => {
    expect(parseHora("1234")).toBe("12:34");
    expect(parseHora("0000")).toBe("00:00");
    expect(parseHora("2359")).toBe("23:59");
  });

  it("rechaza minutos con menos de 2 dígitos cuando hay separador", () => {
    expect(parseHora("8:3")).toBeNull();
    expect(parseHora("08:3")).toBeNull();
    expect(parseHora("8:")).toBeNull();
  });

  it("rechaza separador sin minutos o sin hora", () => {
    expect(parseHora(":30")).toBeNull();
    expect(parseHora("12:")).toBeNull();
    expect(parseHora(":")).toBeNull();
  });

  it("rechaza separadores múltiples", () => {
    expect(parseHora("12::34")).toBeNull();
    expect(parseHora("1:2:3")).toBeNull();
  });

  it("rechaza caracteres no numéricos", () => {
    expect(parseHora("ab:cd")).toBeNull();
    expect(parseHora("12h30")).toBeNull();
    expect(parseHora("12-30")).toBeNull();
  });

  it("rechaza minutos de más de 2 dígitos", () => {
    expect(parseHora("8:300")).toBeNull();
    expect(parseHora("8:030")).toBeNull();
  });

  it("rechaza horas de más de 2 dígitos", () => {
    expect(parseHora("123:45")).toBeNull();
  });

  it("trim de espacios alrededor", () => {
    expect(parseHora("  08:30  ")).toBe("08:30");
    expect(parseHora("   ")).toBeNull();
  });
});
