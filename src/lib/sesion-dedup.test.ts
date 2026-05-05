/**
 * Tests del helper de dedup de sesiones (`dedupSesionesEntregable`).
 *
 * Los casos reproducen lo que la usuaria veía en PLAN HOY → vista del
 * horario antes del fix (mayo 2026): el mismo entregable aparecía dos
 * veces porque cada cliente había guardado una copia con `inicioTs`
 * distinto y el merge antiguo (basado en `inicioTs`) no las unía.
 *
 * El helper es deliberadamente conservador: preferimos dejar una sesión
 * extra a borrar una real. Por eso los criterios cruzan varias señales
 * (mismo final, solape temporal, mismo autor) en lugar de comparar sólo
 * timestamps de inicio.
 */
import { describe, expect, it } from "vitest";
import { dedupSesionesEntregable } from "./sesion-dedup";
import { legacySesionId } from "./sesion-id";
import type { SesionEntregable } from "./types";

const ENT = "e-1";

function ses(inicio: string, fin: string | null, extras: Partial<SesionEntregable> = {}): SesionEntregable {
  return { inicioTs: inicio, finTs: fin, ...extras };
}

describe("dedupSesionesEntregable", () => {
  it("caso real 'Preparación de Taller': descarta la copia rota de 11h aunque el finTs no coincida", () => {
    // 02:40 → 13:42 (≈11h, claramente una hora editada mal en el pasado).
    // 13:40 → 14:24 (≈44 min, la sesión de verdad). Solapan en los 2 min
    // finales de la rota → la heurística ">=6h + indicio" lo detecta.
    const rota = ses("2026-05-04T02:40:00.000Z", "2026-05-04T13:42:00.000Z", { autor: "Gabi" });
    const real = ses("2026-05-04T13:40:00.000Z", "2026-05-04T14:24:00.000Z", { autor: "Gabi" });
    const { sesiones, eliminadas } = dedupSesionesEntregable(ENT, [rota, real]);
    expect(eliminadas).toBe(1);
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0].inicioTs).toBe("2026-05-04T13:40:00.000Z");
    expect(sesiones[0].finTs).toBe("2026-05-04T14:24:00.000Z");
  });

  it("caso real 'Ritual diurno' con mismo finTs y mismo autor: colapsa", () => {
    // Dos copias de la misma sesión: misma hora de fin (08:35) y mismo
    // autor; el inicio cambió tras una edición previa.
    const copiaVieja = ses("2026-05-04T08:20:00.000Z", "2026-05-04T08:35:00.000Z", { autor: "Gabi" });
    const copiaNueva = ses("2026-05-04T08:30:00.000Z", "2026-05-04T08:35:00.000Z", { autor: "Gabi" });
    const { sesiones, eliminadas } = dedupSesionesEntregable(ENT, [copiaVieja, copiaNueva]);
    expect(eliminadas).toBe(1);
    expect(sesiones).toHaveLength(1);
    // Sin `creado` ts disponible, la heurística se queda con la de menor
    // duración (la edición posterior suele acortar el rango).
    expect(sesiones[0].inicioTs).toBe("2026-05-04T08:30:00.000Z");
  });

  it("'Ritual diurno' con finTs distinto y duraciones razonables: NO colapsa", () => {
    // 08:20 → 08:35 (mañana) y 13:35 → 13:55 (tarde): mismo entregable,
    // mismo autor, pero son dos sesiones reales del mismo día.
    const manana = ses("2026-05-04T08:20:00.000Z", "2026-05-04T08:35:00.000Z", { autor: "Gabi" });
    const tarde = ses("2026-05-04T13:35:00.000Z", "2026-05-04T13:55:00.000Z", { autor: "Gabi" });
    const { sesiones, eliminadas } = dedupSesionesEntregable(ENT, [manana, tarde]);
    expect(eliminadas).toBe(0);
    expect(sesiones).toHaveLength(2);
  });

  it("dos miembros distintos cerrando a la misma hora: no se colapsan (trabajo en paralelo)", () => {
    // Cuando dos miembros tienen su propia sesión sobre el mismo
    // entregable y cierran a la misma hora, el helper NO debe juntarlas:
    // son trabajo paralelo, no copias del mismo. El criterio de autor
    // explícitamente distinto bloquea la heurística.
    const gabi = ses("2026-05-04T09:00:00.000Z", "2026-05-04T14:00:00.000Z", { autor: "Gabi" });
    const beltran = ses("2026-05-04T11:30:00.000Z", "2026-05-04T14:00:00.000Z", { autor: "Beltrán" });
    const { sesiones, eliminadas } = dedupSesionesEntregable(ENT, [gabi, beltran]);
    expect(eliminadas).toBe(0);
    expect(sesiones).toHaveLength(2);
  });

  it("una sesión >=6h pero con autor explícito distinto al de la corta: no se colapsa", () => {
    // Por más sospechosa que sea una sesión larga, si pertenece a otro
    // miembro distinto que la corta, podría ser trabajo legítimo de un
    // segundo miembro. Mantenemos ambas y ya las arreglará la usuaria.
    const larga = ses("2026-05-04T02:00:00.000Z", "2026-05-04T13:00:00.000Z", { autor: "Beltrán" });
    const corta = ses("2026-05-04T12:00:00.000Z", "2026-05-04T13:30:00.000Z", { autor: "Gabi" });
    const { sesiones, eliminadas } = dedupSesionesEntregable(ENT, [larga, corta]);
    expect(eliminadas).toBe(0);
    expect(sesiones).toHaveLength(2);
  });

  it("sesiones del mismo entregable en distintos días: nunca se deduplican", () => {
    const lunes = ses("2026-05-04T09:00:00.000Z", "2026-05-04T10:00:00.000Z", { autor: "Gabi" });
    const martes = ses("2026-05-05T09:00:00.000Z", "2026-05-05T10:00:00.000Z", { autor: "Gabi" });
    const { sesiones, eliminadas } = dedupSesionesEntregable(ENT, [lunes, martes]);
    expect(eliminadas).toBe(0);
    expect(sesiones).toHaveLength(2);
  });

  it("asigna id determinista a las sesiones supervivientes que no lo tenían", () => {
    const sin = ses("2026-05-04T09:00:00.000Z", "2026-05-04T09:30:00.000Z", { autor: "Gabi" });
    const yaConId = ses("2026-05-04T11:00:00.000Z", "2026-05-04T11:45:00.000Z", { id: "ses-existente", autor: "Gabi" });
    const { sesiones } = dedupSesionesEntregable(ENT, [sin, yaConId]);
    const conNuevoId = sesiones.find((s) => s.inicioTs === "2026-05-04T09:00:00.000Z");
    const conIdViejo = sesiones.find((s) => s.id === "ses-existente");
    expect(conNuevoId?.id).toBe(legacySesionId(ENT, sin));
    expect(conIdViejo).toBeDefined();
    expect(conIdViejo?.id).toBe("ses-existente");
  });

  it("descarta la copia de 6h+ aunque solapen y haya autor distinto", () => {
    // El bug original generaba copias con autor heredado vacío. Mientras
    // exista solape (la prueba de que comparten "el mismo bloque
    // temporal"), la heurística de duración monstruosa basta para
    // marcarla como sospechosa.
    const rota = ses("2026-05-04T02:40:00.000Z", "2026-05-04T13:42:00.000Z");
    const buena = ses("2026-05-04T13:40:00.000Z", "2026-05-04T14:24:00.000Z", { autor: "Gabi" });
    const { sesiones, eliminadas } = dedupSesionesEntregable(ENT, [rota, buena]);
    expect(eliminadas).toBe(1);
    expect(sesiones[0].inicioTs).toBe("2026-05-04T13:40:00.000Z");
  });

  it("no toca sesiones en curso (finTs null): el cronómetro vivo no es duplicado", () => {
    const enCurso = ses("2026-05-04T09:00:00.000Z", null, { autor: "Gabi" });
    const cerrada = ses("2026-05-04T09:00:00.000Z", "2026-05-04T09:30:00.000Z", { autor: "Gabi" });
    const { sesiones, eliminadas } = dedupSesionesEntregable(ENT, [enCurso, cerrada]);
    expect(eliminadas).toBe(0);
    expect(sesiones).toHaveLength(2);
  });

  it("lista vacía o de una sola sesión devuelve la entrada (sólo se asigna id si falta)", () => {
    expect(dedupSesionesEntregable(ENT, []).eliminadas).toBe(0);
    const una = ses("2026-05-04T09:00:00.000Z", "2026-05-04T09:30:00.000Z");
    const r = dedupSesionesEntregable(ENT, [una]);
    expect(r.eliminadas).toBe(0);
    expect(r.sesiones).toHaveLength(1);
    expect(r.sesiones[0].id).toBe(legacySesionId(ENT, una));
  });

  it("varias copias rotas en cadena: deja la única razonable y descarta el resto", () => {
    const rota1 = ses("2026-05-04T01:00:00.000Z", "2026-05-04T13:30:00.000Z", { autor: "Gabi" });
    const rota2 = ses("2026-05-04T02:00:00.000Z", "2026-05-04T14:00:00.000Z", { autor: "Gabi" });
    const real = ses("2026-05-04T13:00:00.000Z", "2026-05-04T14:00:00.000Z", { autor: "Gabi" });
    const { sesiones, eliminadas } = dedupSesionesEntregable(ENT, [rota1, rota2, real]);
    // Las dos rotas solapan con la real y duran >6h cada una → ambas
    // caen. Sobrevive la de duración razonable.
    expect(eliminadas).toBe(2);
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0].finTs).toBe("2026-05-04T14:00:00.000Z");
    expect(sesiones[0].inicioTs).toBe("2026-05-04T13:00:00.000Z");
  });
});
