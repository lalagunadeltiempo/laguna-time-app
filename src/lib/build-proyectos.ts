import type { AppState } from "./types";
import { minutosPaso } from "./utils";

export interface EntregableView {
  id: string;
  nombre: string;
  estado: string;
  diasEstimados: number;
  diasHechos: number;
  minutos: number;
  responsable: string;
  semana: string | null;
  fechaLimite: string | null;
  fechaInicio: string | null;
  fechaInicioReal: string | null;
}

export interface ResultadoView {
  id: string;
  nombre: string;
  descripcion: string | null;
  proyectoId: string;
  semana: string | null;
  semanasActivas: string[];
  fechaLimite: string | null;
  fechaInicio: string | null;
  fechaInicioReal: string | null;
  diasEstimados: number | null;
  entregables: EntregableView[];
  diasTotal: number;
  diasDone: number;
  minutosTotal: number;
}

export interface ProyectoView {
  id: string;
  nombre: string;
  area: string;
  fechaInicio: string | null;
  fechaInicioReal: string | null;
  descripcion: string | null;
  resultados: ResultadoView[];
  totalEntregables: number;
  entregablesHechos: number;
  diasTotal: number;
  diasDone: number;
  minutosTotal: number;
}

export function buildProyectos(state: AppState): ProyectoView[] {
  const minutosPorEntregable = new Map<string, number>();
  const primerPasoPorEntregable = new Map<string, string>();

  for (const p of state.pasos) {
    const m = minutosPaso(p);
    minutosPorEntregable.set(p.entregableId, (minutosPorEntregable.get(p.entregableId) ?? 0) + m);

    if (!p.inicioTs) continue;
    const current = primerPasoPorEntregable.get(p.entregableId);
    if (!current || p.inicioTs < current) {
      primerPasoPorEntregable.set(p.entregableId, p.inicioTs);
    }
  }

  return state.proyectos
    .map((proj) => {
      let projEarliest: string | null = null;

      const resultados = state.resultados
        .filter((r) => r.proyectoId === proj.id)
        .map((res): ResultadoView => {
          let resEarliest: string | null = null;

          const entregables = state.entregables
            .filter((e) => e.resultadoId === res.id)
            .map((ent): EntregableView => {
              const entReal = primerPasoPorEntregable.get(ent.id) ?? null;

              if (entReal) {
                if (!resEarliest || entReal < resEarliest) resEarliest = entReal;
                if (!projEarliest || entReal < projEarliest) projEarliest = entReal;
              }

              return {
                id: ent.id,
                nombre: ent.nombre,
                estado: ent.estado,
                diasEstimados: ent.diasEstimados,
                diasHechos: ent.diasHechos,
                minutos: minutosPorEntregable.get(ent.id) ?? 0,
                responsable: ent.responsable,
                semana: ent.semana,
                fechaLimite: ent.fechaLimite,
                fechaInicio: ent.fechaInicio,
                fechaInicioReal: entReal,
              };
            });

          return {
            id: res.id,
            nombre: res.nombre,
            descripcion: res.descripcion ?? null,
            proyectoId: proj.id,
            semana: (res.semanasActivas && res.semanasActivas.length > 0)
              ? res.semanasActivas[0]
              : res.semana,
            semanasActivas: res.semanasActivas ?? (res.semana ? [res.semana] : []),
            fechaLimite: res.fechaLimite,
            fechaInicio: res.fechaInicio,
            fechaInicioReal: resEarliest,
            diasEstimados: res.diasEstimados,
            entregables,
            diasTotal: entregables.reduce((s, e) => s + e.diasEstimados, 0),
            diasDone: entregables.reduce((s, e) => s + e.diasHechos, 0),
            minutosTotal: entregables.reduce((s, e) => s + e.minutos, 0),
          };
        });

      return {
        id: proj.id,
        nombre: proj.nombre,
        area: proj.area,
        fechaInicio: proj.fechaInicio ?? null,
        fechaInicioReal: projEarliest,
        descripcion: proj.descripcion ?? null,
        resultados,
        totalEntregables: resultados.reduce((s, r) => s + r.entregables.length, 0),
        entregablesHechos: resultados.reduce((s, r) => s + r.entregables.filter((e) => e.estado === "hecho").length, 0),
        diasTotal: resultados.reduce((s, r) => s + r.diasTotal, 0),
        diasDone: resultados.reduce((s, r) => s + r.diasDone, 0),
        minutosTotal: resultados.reduce((s, r) => s + r.minutosTotal, 0),
      };
    })
    .sort((a, b) => {
      if (a.minutosTotal !== b.minutosTotal) return b.minutosTotal - a.minutosTotal;
      return a.nombre.localeCompare(b.nombre);
    });
}
