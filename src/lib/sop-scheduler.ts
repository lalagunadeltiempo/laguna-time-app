import type { Programacion, PlantillaProceso, PasoPlantilla, EjecucionSOP, AppState } from "./types";

function tocaHoy(prog: Programacion, fecha: Date): boolean {
  const dow = fecha.getDay() === 0 ? 7 : fecha.getDay(); // 1=lun..7=dom
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

export function fechaKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface SOPHoy {
  plantilla: PlantillaProceso;
  pasosHoy: PasoPlantilla[];
  ejecucion: EjecucionSOP | null;
  completadoHoy: boolean;
}

/**
 * Returns all SOPs scheduled for today, including those already completed.
 * Also includes "bajo demanda" SOPs that have an active execution for today
 * (i.e., manually launched).
 */
export function getSOPsHoy(state: AppState, fecha: Date = new Date()): SOPHoy[] {
  const hoy = fechaKey(fecha);
  const result: SOPHoy[] = [];

  for (const pl of state.plantillas) {
    const ejecucionesHoy = state.ejecuciones.filter(
      (ej) => ej.plantillaId === pl.id && ej.fecha === hoy,
    );
    const completada = ejecucionesHoy.find((ej) => ej.estado === "completado") ?? null;
    const activa = ejecucionesHoy.find((ej) => ej.estado !== "completado") ?? null;

    if (!pl.programacion) {
      // "bajo demanda" without explicit programacion — only show if manually launched today
      if (ejecucionesHoy.length > 0) {
        result.push({
          plantilla: pl,
          pasosHoy: pl.pasos,
          ejecucion: activa ?? completada,
          completadoHoy: !!completada,
        });
      }
      continue;
    }

    if (pl.programacion.tipo === "demanda") {
      // Explicit "bajo demanda" — only if manually launched
      if (ejecucionesHoy.length > 0) {
        result.push({
          plantilla: pl,
          pasosHoy: pl.pasos,
          ejecucion: activa ?? completada,
          completadoHoy: !!completada,
        });
      }
      continue;
    }

    const tieneOverrides = pl.pasos.some((p) => p.programacion);
    let pasosHoy: PasoPlantilla[];

    if (tieneOverrides) {
      pasosHoy = pl.pasos.filter((p) => {
        if (p.programacion) return tocaHoy(p.programacion, fecha);
        return tocaHoy(pl.programacion!, fecha);
      });
    } else {
      pasosHoy = tocaHoy(pl.programacion, fecha) ? pl.pasos : [];
    }

    if (pasosHoy.length === 0 && ejecucionesHoy.length === 0) continue;
    if (pasosHoy.length === 0) pasosHoy = pl.pasos; // fallback if ejecucion exists

    result.push({
      plantilla: pl,
      pasosHoy,
      ejecucion: activa ?? completada,
      completadoHoy: !!completada,
    });
  }

  return result;
}

/**
 * Returns "bajo demanda" SOPs that can be manually launched.
 * Excludes those already active/completed today.
 */
export function getSOPsDemanda(state: AppState, fecha: Date = new Date()): PlantillaProceso[] {
  const hoy = fechaKey(fecha);
  return state.plantillas.filter((pl) => {
    const isDemanda = !pl.programacion || pl.programacion.tipo === "demanda";
    if (!isDemanda) return false;
    const yaLanzado = state.ejecuciones.some(
      (ej) => ej.plantillaId === pl.id && ej.fecha === hoy,
    );
    return !yaLanzado;
  });
}

export function progLabel(p: Programacion): string {
  const dias = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  switch (p.tipo) {
    case "diario": return "Diario";
    case "semanal": return p.diaSemana ? `Semanal · ${dias[p.diaSemana]}` : "Semanal";
    case "mensual": {
      if (p.semanaMes === "primera") return "Mensual · primera semana";
      if (p.semanaMes === "ultima") return "Mensual · última semana";
      if (p.diaMes === -1) return "Mensual · último día";
      return p.diaMes ? `Mensual · día ${p.diaMes}` : "Mensual";
    }
    case "trimestral": return `Trimestral${p.semanaMes === "primera" ? " · primera semana" : ""}`;
    case "anual": {
      const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
      return `Anual · ${meses[p.mesAnual ?? 0]}`;
    }
    case "demanda": return "Bajo demanda";
  }
}
