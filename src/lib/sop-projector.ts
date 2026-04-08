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
      return dom >= 1 && dom <= 7 && dow === 1;
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

export type { ProjectedSOP };
