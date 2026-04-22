import type { Proyecto, Resultado, Entregable, Paso, MiembroInfo, PlanConfig, DiaNoDisponible } from "./types";
import { PLAN_CONFIG_DEFAULT } from "./types";
import { toDateKey } from "./date-utils";

/**
 * Calcula sesiones automáticas para un entregable según su número de pasos.
 * Si el entregable ya tiene `diasEstimados > 0`, ese valor manda.
 */
export function sesionesAutomaticas(numPasos: number, config: PlanConfig = PLAN_CONFIG_DEFAULT): number {
  return Math.max(1, Math.ceil(numPasos / Math.max(1, config.pasosPorSesion)));
}

/**
 * Calcula semanas automáticas para un resultado según su número de entregables.
 * Si el resultado ya tiene fechas propias, esas mandan.
 */
export function semanasAutomaticas(numEntregables: number, config: PlanConfig = PLAN_CONFIG_DEFAULT): number {
  return Math.max(1, Math.ceil(numEntregables / Math.max(1, config.entregablesPorSemana)));
}

function parseDateLocal(s: string): Date {
  return new Date(s + "T00:00:00");
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isInRange(date: Date, ranges: DiaNoDisponible[] | undefined): boolean {
  if (!ranges?.length) return false;
  const k = toDateKey(date);
  return ranges.some((r) => k >= r.desde && k <= r.hasta);
}

/**
 * Avanza n días laborables desde `from`, saltando días no disponibles.
 * Si no hay diasLaborables (raro), trata todos los días como laborables.
 */
function addLaborables(
  from: Date,
  nDias: number,
  diasLaborables: number[],
  diasNoDisponibles?: DiaNoDisponible[],
): Date {
  if (nDias <= 0) return from;
  const labSet = new Set(diasLaborables.length ? diasLaborables : [0, 1, 2, 3, 4, 5, 6]);
  let cur = new Date(from);
  let restantes = nDias;
  let safety = 0;
  while (restantes > 0 && safety < 5000) {
    safety += 1;
    if (labSet.has(cur.getDay()) && !isInRange(cur, diasNoDisponibles)) {
      restantes -= 1;
      if (restantes === 0) return cur;
    }
    cur = addDays(cur, 1);
  }
  return cur;
}

/**
 * Avanza al siguiente día laborable disponible (o devuelve `from` si ya lo es).
 */
function nextLaborable(
  from: Date,
  diasLaborables: number[],
  diasNoDisponibles?: DiaNoDisponible[],
): Date {
  const labSet = new Set(diasLaborables.length ? diasLaborables : [0, 1, 2, 3, 4, 5, 6]);
  let cur = new Date(from);
  let safety = 0;
  while (safety < 5000) {
    safety += 1;
    if (labSet.has(cur.getDay()) && !isInRange(cur, diasNoDisponibles)) return cur;
    cur = addDays(cur, 1);
  }
  return cur;
}

export interface VentanaResultado {
  resultadoId: string;
  inicio: string;
  fin: string;
  semanas: number;
  fija: boolean;
}

export interface PlanSugerido {
  ventanas: Record<string, { inicio: string; fin: string; semanas: number; fija: boolean }>;
  sesiones: Record<string, number>;
  overflow: string[];
  sesionesTotales: number;
  semanasTotales: number;
}

const EMPTY_PLAN: PlanSugerido = {
  ventanas: {},
  sesiones: {},
  overflow: [],
  sesionesTotales: 0,
  semanasTotales: 0,
};

function resolverMiembroPrincipal(
  responsables: string[],
  miembros: MiembroInfo[],
): MiembroInfo {
  for (const r of responsables) {
    const m = miembros.find((mb) => mb.nombre === r);
    if (m) return m;
  }
  return {
    id: "default",
    nombre: "Sin asignar",
    color: "#9ca3af",
    capacidadDiaria: 1,
    diasLaborables: [1, 2, 3, 4, 5],
  };
}

/**
 * Planifica automáticamente las ventanas de un proyecto.
 *
 * Estrategia:
 * - Para cada resultado en orden:
 *   - Si tiene fechas propias, las respeta (ventana fija) y avanza el cursor tras su fin.
 *   - Si no, calcula semanasAutomaticas y coloca la ventana desde el cursor actual,
 *     saltando días no disponibles del responsable principal del resultado.
 * - Si la ventana excede `proyecto.fechaLimite`, lo marca en `overflow`.
 */
export function planificarProyecto(
  proyecto: Proyecto,
  resultados: Resultado[],
  entregables: Entregable[],
  pasos: Paso[],
  miembros: MiembroInfo[],
  config: PlanConfig = PLAN_CONFIG_DEFAULT,
  hoy: Date = new Date(),
): PlanSugerido {
  if (!proyecto || resultados.length === 0) return EMPTY_PLAN;

  const ventanas: PlanSugerido["ventanas"] = {};
  const sesiones: PlanSugerido["sesiones"] = {};
  const overflow: string[] = [];

  const startBase = proyecto.fechaInicio
    ? parseDateLocal(proyecto.fechaInicio)
    : new Date(hoy);
  const todayDate = new Date(toDateKey(hoy) + "T00:00:00");
  const cursorStart = startBase < todayDate ? todayDate : startBase;
  const deadline = proyecto.fechaLimite ? parseDateLocal(proyecto.fechaLimite) : null;

  let cursor = new Date(cursorStart);
  let sesionesTotales = 0;
  let semanasTotales = 0;

  for (const res of resultados) {
    const resEntregables = entregables.filter((e) => e.resultadoId === res.id);

    for (const ent of resEntregables) {
      const numPasos = pasos.filter((p) => p.entregableId === ent.id).length;
      const auto = sesionesAutomaticas(numPasos, config);
      const efectivas = ent.diasEstimados > 0 ? ent.diasEstimados : auto;
      sesiones[ent.id] = efectivas;
      sesionesTotales += efectivas;
    }

    const responsablesRes: string[] = [];
    if (res.responsable) responsablesRes.push(res.responsable);
    for (const ent of resEntregables) {
      if (ent.responsable && !responsablesRes.includes(ent.responsable)) {
        responsablesRes.push(ent.responsable);
      }
    }
    const miembro = resolverMiembroPrincipal(responsablesRes, miembros);

    if (res.fechaInicio && res.fechaLimite) {
      ventanas[res.id] = {
        inicio: res.fechaInicio,
        fin: res.fechaLimite,
        semanas: 0,
        fija: true,
      };
      const finDate = parseDateLocal(res.fechaLimite);
      if (finDate > cursor) cursor = addDays(finDate, 1);
      if (deadline && finDate > deadline) overflow.push(res.id);
      continue;
    }

    const semanas = semanasAutomaticas(resEntregables.length, config);
    const numLaborables = semanas * miembro.diasLaborables.length || 5;
    const inicioVentana = nextLaborable(cursor, miembro.diasLaborables, miembro.diasNoDisponibles);
    const finVentana = addLaborables(
      inicioVentana,
      Math.max(1, numLaborables),
      miembro.diasLaborables,
      miembro.diasNoDisponibles,
    );

    ventanas[res.id] = {
      inicio: toDateKey(inicioVentana),
      fin: toDateKey(finVentana),
      semanas,
      fija: false,
    };
    semanasTotales += semanas;

    cursor = addDays(finVentana, 1);

    if (deadline && finVentana > deadline) {
      overflow.push(res.id);
    }
  }

  return { ventanas, sesiones, overflow, sesionesTotales, semanasTotales };
}

export function laborablesEntre(
  desde: Date,
  hasta: Date,
  diasLaborables: number[],
  diasNoDisponibles?: DiaNoDisponible[],
): number {
  if (hasta < desde) return 0;
  const labSet = new Set(diasLaborables.length ? diasLaborables : [0, 1, 2, 3, 4, 5, 6]);
  let count = 0;
  let cur = new Date(desde);
  let safety = 0;
  while (cur <= hasta && safety < 10000) {
    safety += 1;
    if (labSet.has(cur.getDay()) && !isInRange(cur, diasNoDisponibles)) count += 1;
    cur = addDays(cur, 1);
  }
  return count;
}

export function resolverMiembro(
  miembros: MiembroInfo[],
  nombre: string | undefined | null,
): MiembroInfo {
  if (nombre) {
    const m = miembros.find((x) => x.nombre === nombre);
    if (m) return m;
  }
  return {
    id: "default",
    nombre: "Sin asignar",
    color: "#9ca3af",
    capacidadDiaria: 1,
    diasLaborables: [1, 2, 3, 4, 5],
  };
}
