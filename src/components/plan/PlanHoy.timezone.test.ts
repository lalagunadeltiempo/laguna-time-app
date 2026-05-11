/**
 * Regresión: el prefijo UTC de un ISO no coincide con el día local del usuario.
 * Ej. 00:30 en Madrid (CEST) el 7-mayo → ISO del 6-mayo en UTC.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { localDateKeyFromIso } from "@/lib/date-utils";

describe("PlanHoy / filtro día — fecha local desde ISO", () => {
  const prevTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Europe/Madrid";
  });

  afterAll(() => {
    process.env.TZ = prevTz;
  });

  it("incluye sesión 00:30 local como día siguiente al prefijo UTC (CEST)", () => {
    const inicioTs = "2026-05-06T22:30:00.000Z";
    const dateKey = "2026-05-07";
    expect(localDateKeyFromIso(inicioTs)).toBe(dateKey);
  });
});
