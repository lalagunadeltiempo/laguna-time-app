import type { Proyecto, Entregable, Resultado } from "./types";

export type EstadoRitmo = "verde" | "amarillo" | "rojo" | "imposible" | "sin-deadline" | "completado" | "vacio" | "vencido";

export interface ProyectoRitmo {
  diasTrabajoPendientes: number;
  diasTrabajoTotal: number;
  diasTrabajoHechos: number;
  diasCalendarioRestantes: number | null;
  ritmoRequerido: number | null;
  estadoRitmo: EstadoRitmo;
  deadline: string | null;
  porcentaje: number;
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

function computeRitmo(
  deadlineStr: string | null,
  entregables: Entregable[],
  hoy: Date,
): ProyectoRitmo {
  const activos = entregables.filter((e) => e.estado !== "cancelada");
  const diasTrabajoTotal = activos.reduce((s, e) => s + e.diasEstimados, 0);
  const diasTrabajoHechos = activos.reduce((s, e) => s + e.diasHechos, 0);
  const diasTrabajoPendientes = activos.reduce(
    (s, e) => s + Math.max(0, e.diasEstimados - e.diasHechos),
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
    };
  }

  if (diasTrabajoPendientes === 0) {
    return {
      diasTrabajoPendientes: 0,
      diasTrabajoTotal,
      diasTrabajoHechos,
      diasCalendarioRestantes: deadlineDiasRaw,
      ritmoRequerido: 0,
      estadoRitmo: "completado",
      deadline,
      porcentaje,
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
    };
  }

  const diasCalendarioRestantes = Math.max(1, deadlineDiasRaw ?? 1);
  const ritmoRequerido = diasTrabajoPendientes / diasCalendarioRestantes;

  let estadoRitmo: EstadoRitmo;
  if (ritmoRequerido > 1) estadoRitmo = "imposible";
  else if (ritmoRequerido > 0.7) estadoRitmo = "rojo";
  else if (ritmoRequerido > 0.3) estadoRitmo = "amarillo";
  else estadoRitmo = "verde";

  return {
    diasTrabajoPendientes,
    diasTrabajoTotal,
    diasTrabajoHechos,
    diasCalendarioRestantes,
    ritmoRequerido,
    estadoRitmo,
    deadline,
    porcentaje,
  };
}

export function computeProyectoRitmo(
  proyecto: Proyecto,
  entregables: Entregable[],
  _resultados: Resultado[],
  hoy: Date,
): ProyectoRitmo {
  return computeRitmo(proyecto.fechaLimite ?? null, entregables, hoy);
}

export function computeResultadoRitmo(
  resultado: Resultado,
  entregables: Entregable[],
  hoy: Date,
): ProyectoRitmo {
  const propia = entregables.filter((e) => e.resultadoId === resultado.id);
  const deadline = resultado.fechaLimite ?? inferDateRange(propia).fin;
  return computeRitmo(deadline, propia, hoy);
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

export function ritmoLabel(ritmo: ProyectoRitmo): string {
  if (ritmo.estadoRitmo === "completado") return "Completado";
  if (ritmo.estadoRitmo === "vacio") return "Sin entregables planificados";
  if (ritmo.estadoRitmo === "vencido") return `${ritmo.diasTrabajoPendientes}d pendientes · deadline vencido`;
  if (ritmo.estadoRitmo === "sin-deadline") return `${ritmo.diasTrabajoPendientes}d pendientes · sin fecha límite`;
  const pct = ritmo.ritmoRequerido != null ? Math.round(ritmo.ritmoRequerido * 100) : 0;
  return `${ritmo.diasTrabajoPendientes}d pendientes · ${ritmo.diasCalendarioRestantes}d calendario · ${pct}% diario`;
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
