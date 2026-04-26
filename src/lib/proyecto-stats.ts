import type { Proyecto, Entregable, Resultado, MiembroInfo, Paso, PlanConfig } from "./types";
import { PLAN_CONFIG_DEFAULT } from "./types";
import { laborablesEntre, resolverMiembro } from "./auto-planner";
import { sesionesEfectivasEntregable, rangoProyectoMapa, rangoResultadoMapa } from "./fechas-efectivas";

export type EstadoRitmo = "verde" | "amarillo" | "rojo" | "imposible" | "sin-deadline" | "completado" | "vacio" | "vencido";

export interface RitmoPersona {
  miembro: string;
  carga: number;
  laborables: number;
  capacidadDiaria: number;
  sesionesPorDia: number;
  ratio: number;
}

export interface ProyectoRitmo {
  diasTrabajoPendientes: number;
  diasTrabajoTotal: number;
  diasTrabajoHechos: number;
  diasCalendarioRestantes: number | null;
  ritmoRequerido: number | null;
  estadoRitmo: EstadoRitmo;
  deadline: string | null;
  porcentaje: number;
  desglose: RitmoPersona[];
  peor: RitmoPersona | null;
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

export interface DateRange {
  inicio: string | null;
  fin: string | null;
}

export function inferDateRange(items: { fechaInicio: string | null; fechaLimite: string | null }[]): DateRange {
  let minI: string | null = null;
  let maxF: string | null = null;
  for (const it of items) {
    if (it.fechaInicio && (!minI || it.fechaInicio < minI)) minI = it.fechaInicio;
    if (it.fechaLimite && (!maxF || it.fechaLimite > maxF)) maxF = it.fechaLimite;
  }
  return { inicio: minI, fin: maxF };
}

interface ComputeOpts {
  miembros: MiembroInfo[];
  pasos: Paso[];
  config: PlanConfig;
}

function computeRitmo(
  deadlineStr: string | null,
  entregables: Entregable[],
  hoy: Date,
  opts: ComputeOpts,
): ProyectoRitmo {
  const { miembros, pasos, config } = opts;
  const activos = entregables.filter((e) => e.estado !== "cancelada");

  const sesionesPorEnt: Record<string, number> = {};
  for (const e of activos) sesionesPorEnt[e.id] = sesionesEfectivasEntregable(e, pasos, config);

  const diasTrabajoTotal = activos.reduce((s, e) => s + sesionesPorEnt[e.id], 0);
  const diasTrabajoHechos = activos.reduce((s, e) => s + Math.min(sesionesPorEnt[e.id], e.diasHechos), 0);
  const diasTrabajoPendientes = activos.reduce(
    (s, e) => s + Math.max(0, sesionesPorEnt[e.id] - e.diasHechos),
    0,
  );
  const porcentaje = diasTrabajoTotal > 0 ? diasTrabajoHechos / diasTrabajoTotal : 0;

  const deadline = deadlineStr ?? null;
  const deadlineDiasRaw = deadline ? daysBetween(hoy, new Date(deadline + "T23:59:59")) : null;

  if (diasTrabajoTotal === 0) {
    return {
      diasTrabajoPendientes: 0,
      diasTrabajoTotal: 0,
      diasTrabajoHechos: 0,
      diasCalendarioRestantes: deadlineDiasRaw,
      ritmoRequerido: null,
      estadoRitmo: "vacio",
      deadline,
      porcentaje: 0,
      desglose: [],
      peor: null,
    };
  }

  const allDone = activos.every((e) => e.estado === "hecho");
  if (allDone && activos.length > 0) {
    return {
      diasTrabajoPendientes: 0,
      diasTrabajoTotal,
      diasTrabajoHechos,
      diasCalendarioRestantes: deadlineDiasRaw,
      ritmoRequerido: 0,
      estadoRitmo: "completado",
      deadline,
      porcentaje: 1,
      desglose: [],
      peor: null,
    };
  }

  if (!deadline) {
    return {
      diasTrabajoPendientes,
      diasTrabajoTotal,
      diasTrabajoHechos,
      diasCalendarioRestantes: null,
      ritmoRequerido: null,
      estadoRitmo: "sin-deadline",
      deadline: null,
      porcentaje,
      desglose: [],
      peor: null,
    };
  }

  if (deadlineDiasRaw != null && deadlineDiasRaw < 1) {
    return {
      diasTrabajoPendientes,
      diasTrabajoTotal,
      diasTrabajoHechos,
      diasCalendarioRestantes: deadlineDiasRaw,
      ritmoRequerido: null,
      estadoRitmo: "vencido",
      deadline,
      porcentaje,
      desglose: [],
      peor: null,
    };
  }

  const deadlineDate = new Date(deadline + "T23:59:59");
  const desde = new Date(hoy);
  desde.setHours(0, 0, 0, 0);

  const cargaPorPersona = new Map<string, number>();
  for (const e of activos) {
    const pendiente = Math.max(0, sesionesPorEnt[e.id] - e.diasHechos);
    if (pendiente <= 0) continue;
    const key = e.responsable || "Sin asignar";
    cargaPorPersona.set(key, (cargaPorPersona.get(key) ?? 0) + pendiente);
  }

  const desglose: RitmoPersona[] = [];
  for (const [nombre, carga] of cargaPorPersona.entries()) {
    const m = resolverMiembro(miembros, nombre);
    const laborables = laborablesEntre(desde, deadlineDate, m.diasLaborables, m.diasNoDisponibles);
    const capacidad = Math.max(0.1, m.capacidadDiaria);
    const sesionesPorDia = laborables > 0 ? carga / laborables : Infinity;
    const ratio = sesionesPorDia / capacidad;
    desglose.push({
      miembro: nombre,
      carga,
      laborables,
      capacidadDiaria: capacidad,
      sesionesPorDia,
      ratio: Number.isFinite(ratio) ? ratio : 999,
    });
  }
  desglose.sort((a, b) => b.ratio - a.ratio);
  const peor = desglose[0] ?? null;
  const ritmoRequerido = peor ? peor.ratio : 0;

  // Umbrales (pactados con usuaria):
  //   verde    A tiempo   ≤ 60%
  //   amarillo Ajustado   60-90%
  //   rojo     Crítico    90-100%
  //   imposible No llegas > 100%
  let estadoRitmo: EstadoRitmo;
  if (ritmoRequerido > 1) estadoRitmo = "imposible";
  else if (ritmoRequerido > 0.9) estadoRitmo = "rojo";
  else if (ritmoRequerido > 0.6) estadoRitmo = "amarillo";
  else estadoRitmo = "verde";

  const diasCalendarioRestantes = Math.max(1, deadlineDiasRaw ?? 1);

  return {
    diasTrabajoPendientes,
    diasTrabajoTotal,
    diasTrabajoHechos,
    diasCalendarioRestantes,
    ritmoRequerido,
    estadoRitmo,
    deadline,
    porcentaje,
    desglose,
    peor,
  };
}

export function computeProyectoRitmo(
  proyecto: Proyecto,
  entregables: Entregable[],
  resultados: Resultado[],
  hoy: Date,
  miembros: MiembroInfo[] = [],
  pasos: Paso[] = [],
  config: PlanConfig = PLAN_CONFIG_DEFAULT,
): ProyectoRitmo {
  // Deadline efectivo: priorizar el final del rango por chips (último día del último
  // mes/trimestre activo). Sólo si no hay chips usamos el legacy `fechaLimite`.
  const rango = rangoProyectoMapa(proyecto, resultados, entregables);
  const deadline = rango.fin ?? proyecto.fechaLimite ?? null;
  return computeRitmo(deadline, entregables, hoy, { miembros, pasos, config });
}

export function computeResultadoRitmo(
  resultado: Resultado,
  entregables: Entregable[],
  hoy: Date,
  miembros: MiembroInfo[] = [],
  pasos: Paso[] = [],
  config: PlanConfig = PLAN_CONFIG_DEFAULT,
): ProyectoRitmo {
  const propia = entregables.filter((e) => e.resultadoId === resultado.id);
  // Deadline efectivo: chips primero, luego legacy, finalmente inferido.
  const rango = rangoResultadoMapa(resultado, propia);
  const deadline = rango.fin ?? resultado.fechaLimite ?? inferDateRange(propia).fin;
  return computeRitmo(deadline, propia, hoy, { miembros, pasos, config });
}

export interface RangeValidation {
  inRange: boolean;
  reason: string | null;
}

export function validateRange(
  child: { fechaInicio: string | null; fechaLimite: string | null },
  parent: DateRange,
): RangeValidation {
  if (child.fechaInicio && parent.inicio && child.fechaInicio < parent.inicio) {
    return { inRange: false, reason: `Empieza antes que su padre (${parent.inicio})` };
  }
  if (child.fechaLimite && parent.fin && child.fechaLimite > parent.fin) {
    return { inRange: false, reason: `Termina después que su padre (${parent.fin})` };
  }
  if (child.fechaInicio && child.fechaLimite && child.fechaInicio > child.fechaLimite) {
    return { inRange: false, reason: "Inicio posterior al fin" };
  }
  return { inRange: true, reason: null };
}

const RITMO_COLORS: Record<EstadoRitmo, string> = {
  verde: "#22c55e",
  amarillo: "#f59e0b",
  rojo: "#ef4444",
  imposible: "#dc2626",
  "sin-deadline": "#6b7280",
  completado: "#22c55e",
  vacio: "#9ca3af",
  vencido: "#991b1b",
};

export function ritmoColor(estado: EstadoRitmo): string {
  return RITMO_COLORS[estado];
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

export function ritmoLabel(ritmo: ProyectoRitmo): string {
  if (ritmo.estadoRitmo === "completado") return "Completado";
  if (ritmo.estadoRitmo === "vacio") return "Sin entregables planificados";
  if (ritmo.estadoRitmo === "vencido") return `${ritmo.diasTrabajoPendientes} sesiones pendientes · deadline vencido`;
  if (ritmo.estadoRitmo === "sin-deadline") return `${ritmo.diasTrabajoPendientes} sesiones pendientes · sin fecha límite`;
  if (ritmo.peor) {
    return `${ritmo.diasTrabajoPendientes} sesiones · peor: ${ritmo.peor.miembro} ${fmt(ritmo.peor.sesionesPorDia)}/día (cap ${fmt(ritmo.peor.capacidadDiaria)})`;
  }
  return `${ritmo.diasTrabajoPendientes} sesiones · ${ritmo.diasCalendarioRestantes}d calendario`;
}

export function ritmoTooltip(ritmo: ProyectoRitmo): string {
  if (ritmo.desglose.length === 0) return ritmoLabel(ritmo);
  const lines = ritmo.desglose.map(
    (p) => `${p.miembro}: ${p.carga} sesiones / ${p.laborables} días lab → ${fmt(p.sesionesPorDia)}/día (cap ${fmt(p.capacidadDiaria)})`,
  );
  return lines.join("\n");
}

export function ritmoLabelCorto(estado: EstadoRitmo): string {
  switch (estado) {
    case "verde": return "A tiempo";
    case "amarillo": return "Ajustado";
    case "rojo": return "Crítico";
    case "imposible": return "No llegas";
    case "vencido": return "Vencido";
    case "completado": return "Listo";
    case "vacio": return "Sin plan";
    case "sin-deadline": return "Sin deadline";
  }
}

export function ritmoExplicacion(ritmo: ProyectoRitmo): string {
  const peor = ritmo.peor;
  const pct = peor ? Math.round(peor.ratio * 100) : 0;

  switch (ritmo.estadoRitmo) {
    case "completado":
      return "Todos los entregables están hechos.";
    case "vacio":
      return "Este proyecto aún no tiene entregables planificados.";
    case "vencido":
      return `El deadline ya pasó y quedan ${ritmo.diasTrabajoPendientes} sesiones pendientes.`;
    case "sin-deadline":
      return `Hay ${ritmo.diasTrabajoPendientes} sesiones pendientes, pero no tiene fecha límite, así que no se puede calcular ritmo.`;
    case "verde":
      if (!peor) return "Vas cómoda: carga muy baja para el tiempo disponible.";
      return `Vas cómoda: ${pct}% de tu capacidad (${peor.miembro} ${fmt(peor.sesionesPorDia)}/día sobre ${fmt(peor.capacidadDiaria)}).`;
    case "amarillo":
      if (!peor) return "Ajustado, pero aún manejable.";
      return `Ajustado: ${pct}% de tu capacidad (${peor.miembro} ${fmt(peor.sesionesPorDia)}/día sobre ${fmt(peor.capacidadDiaria)}). Mientras sigas por debajo del 90%, es manejable.`;
    case "rojo":
      if (!peor) return "Crítico: la carga supera el 90% de la capacidad disponible.";
      return `Crítico: ${pct}% de tu capacidad. ${peor.miembro} necesita ${fmt(peor.sesionesPorDia)} sesiones/día (cap ${fmt(peor.capacidadDiaria)}) para cubrir ${peor.carga} sesiones en ${peor.laborables} días laborables. Apenas te queda colchón (umbral crítico: 90%).`;
    case "imposible": {
      if (!peor) return "No llegas: la carga supera tu capacidad.";
      const maxCarga = peor.laborables * peor.capacidadDiaria;
      const sesionesExtra = Math.max(0, Math.ceil(peor.carga - maxCarga));
      const diasExtra = peor.capacidadDiaria > 0 ? Math.ceil(sesionesExtra / peor.capacidadDiaria) : 0;
      return `No llegas: ${peor.miembro} necesita ${fmt(peor.sesionesPorDia)} sesiones/día y su capacidad máxima es ${fmt(peor.capacidadDiaria)}. Te faltan ~${sesionesExtra} sesiones o ~${diasExtra} días laborables más.`;
    }
  }
}
