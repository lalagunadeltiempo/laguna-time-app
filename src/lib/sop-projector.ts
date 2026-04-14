import type { AppState, PlantillaProceso, Area } from "./types";

interface ProjectedSOP {
  plantillaId: string;
  nombre: string;
  area: Area;
  responsable: string;
  pasosTotal: number;
  isVirtual: true;
}

function tocaFecha(prog: NonNullable<PlantillaProceso["programacion"]>, fecha: Date): boolean {
  const dow = fecha.getDay() === 0 ? 7 : fecha.getDay();
  const dom = fecha.getDate();
  const month = fecha.getMonth() + 1;
  const lastDay = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();

  switch (prog.tipo) {
    case "diario":
      return dow >= 1 && dow <= 5;
    case "semanal":
      return prog.diaSemana != null ? dow === prog.diaSemana : dow === 1;
    case "mensual": {
      if (prog.semanaMes === "primera") return dom >= 1 && dom <= 7 && dow === 1;
      if (prog.semanaMes === "ultima") return dom > lastDay - 7 && dow === 1;
      if (prog.diaMes === -1) return dom === lastDay;
      return prog.diaMes != null ? dom === prog.diaMes : false;
    }
    case "trimestral": {
      const meses = prog.mesesTrimestre ?? [1, 4, 7, 10];
      if (!meses.includes(month)) return false;
      if (prog.semanaMes === "primera") return dom >= 1 && dom <= 7 && dow === 1;
      if (prog.semanaMes === "ultima") return dom > lastDay - 7 && dow === 1;
      return dom >= 1 && dom <= 7 && dow === 1;
    }
    case "anual": {
      const targetMonth = (prog.mesAnual ?? 0) + 1;
      if (month !== targetMonth) return false;
      if (prog.semanaMes === "primera") return dom >= 1 && dom <= 7 && dow === 1;
      if (prog.semanaMes === "ultima") return dom > lastDay - 7 && dow === 1;
      if (prog.diaMes === -1) return dom === lastDay;
      return prog.diaMes != null ? dom === prog.diaMes : dom === 1;
    }
    case "demanda":
      return false;
  }
}

export function projectSOPsForDate(
  state: AppState,
  fecha: Date,
  usuario?: string,
): ProjectedSOP[] {
  const result: ProjectedSOP[] = [];

  for (const pl of state.plantillas) {
    if (!pl.programacion || pl.programacion.tipo === "demanda") continue;
    if (usuario && pl.responsableDefault && pl.responsableDefault.toLowerCase() !== usuario.toLowerCase()) continue;
    if (!tocaFecha(pl.programacion, fecha)) continue;

    result.push({
      plantillaId: pl.id,
      nombre: pl.nombre,
      area: pl.area,
      responsable: pl.responsableDefault,
      pasosTotal: pl.pasos.length,
      isVirtual: true,
    });
  }

  return result;
}

export function projectSOPsForRange(
  state: AppState,
  startDate: Date,
  endDate: Date,
  usuario?: string,
): Map<string, ProjectedSOP[]> {
  const map = new Map<string, ProjectedSOP[]>();
  const cur = new Date(startDate);
  cur.setHours(12, 0, 0, 0);
  const end = endDate.getTime();

  while (cur.getTime() <= end) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    const projected = projectSOPsForDate(state, cur, usuario);
    if (projected.length > 0) {
      const deduped = projected.filter(
        (sop) => !state.entregables.some((e) => e.tipo === "sop" && e.plantillaId === sop.plantillaId && e.fechaInicio === key),
      );
      if (deduped.length > 0) map.set(key, deduped);
    }
    cur.setDate(cur.getDate() + 1);
  }

  return map;
}

export interface SOPWeekSummary {
  weekIndex: number;
  sops: { nombre: string; count: number; minEstimados: number }[];
  totalOcurrencias: number;
  totalMinutos: number;
}

export function summarizeSOPsByWeek(
  sopMap: Map<string, ProjectedSOP[]>,
  weeks: { index: number; mondayMs: number; sundayMs: number }[],
  plantillas: AppState["plantillas"],
): SOPWeekSummary[] {
  return weeks.map((w) => {
    const counts = new Map<string, { nombre: string; count: number; minEstimados: number }>();
    for (const [key, sops] of sopMap) {
      const ms = new Date(key + "T12:00:00").getTime();
      if (ms < w.mondayMs || ms > w.sundayMs) continue;
      for (const sop of sops) {
        const existing = counts.get(sop.plantillaId);
        const pl = plantillas.find((p) => p.id === sop.plantillaId);
        const mins = pl?.pasos.reduce((s, p) => s + (p.minutosEstimados ?? 0), 0) ?? 0;
        if (existing) {
          existing.count++;
          existing.minEstimados += mins;
        } else {
          counts.set(sop.plantillaId, { nombre: sop.nombre, count: 1, minEstimados: mins });
        }
      }
    }
    const sops = Array.from(counts.values());
    return {
      weekIndex: w.index,
      sops,
      totalOcurrencias: sops.reduce((s, x) => s + x.count, 0),
      totalMinutos: sops.reduce((s, x) => s + x.minEstimados, 0),
    };
  });
}

export interface SOPMonthSummary {
  month: number;
  sops: { nombre: string; count: number; minEstimados: number }[];
  totalOcurrencias: number;
  totalMinutos: number;
}

export function summarizeSOPsByMonth(
  sopMap: Map<string, ProjectedSOP[]>,
  months: number[],
  plantillas: AppState["plantillas"],
): SOPMonthSummary[] {
  return months.map((month) => {
    const counts = new Map<string, { nombre: string; count: number; minEstimados: number }>();
    for (const [key, sops] of sopMap) {
      const d = new Date(key + "T12:00:00");
      if (d.getMonth() !== month) continue;
      for (const sop of sops) {
        const existing = counts.get(sop.plantillaId);
        const pl = plantillas.find((p) => p.id === sop.plantillaId);
        const mins = pl?.pasos.reduce((s, p) => s + (p.minutosEstimados ?? 0), 0) ?? 0;
        if (existing) {
          existing.count++;
          existing.minEstimados += mins;
        } else {
          counts.set(sop.plantillaId, { nombre: sop.nombre, count: 1, minEstimados: mins });
        }
      }
    }
    const sops = Array.from(counts.values());
    return {
      month,
      totalOcurrencias: sops.reduce((s, x) => s + x.count, 0),
      totalMinutos: sops.reduce((s, x) => s + x.minEstimados, 0),
      sops,
    };
  });
}

export type { ProjectedSOP };
