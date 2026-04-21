import type { Proyecto, Entregable, Resultado } from "./types";

export type EstadoRitmo = "verde" | "amarillo" | "rojo" | "imposible" | "sin-deadline" | "completado";

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

export function computeProyectoRitmo(
  proyecto: Proyecto,
  entregables: Entregable[],
  _resultados: Resultado[],
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

  const deadline = proyecto.fechaLimite ?? null;

  if (diasTrabajoPendientes === 0) {
    return {
      diasTrabajoPendientes: 0,
      diasTrabajoTotal,
      diasTrabajoHechos,
      diasCalendarioRestantes: deadline ? daysBetween(hoy, new Date(deadline + "T23:59:59")) : null,
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

  const diasCalendarioRestantes = Math.max(1, daysBetween(hoy, new Date(deadline + "T23:59:59")));
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

const RITMO_COLORS: Record<EstadoRitmo, string> = {
  verde: "#22c55e",
  amarillo: "#f59e0b",
  rojo: "#ef4444",
  imposible: "#dc2626",
  "sin-deadline": "#6b7280",
  completado: "#22c55e",
};

export function ritmoColor(estado: EstadoRitmo): string {
  return RITMO_COLORS[estado];
}

export function ritmoLabel(ritmo: ProyectoRitmo): string {
  if (ritmo.estadoRitmo === "completado") return "Completado";
  if (ritmo.estadoRitmo === "sin-deadline") return `${ritmo.diasTrabajoPendientes}d pendientes · sin fecha límite`;
  const pct = ritmo.ritmoRequerido != null ? Math.round(ritmo.ritmoRequerido * 100) : 0;
  return `${ritmo.diasTrabajoPendientes}d pendientes · ${ritmo.diasCalendarioRestantes}d calendario · ${pct}% diario`;
}
