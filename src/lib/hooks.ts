"use client";

import { useMemo } from "react";
import { useAppState } from "./context";
import { AREAS_PERSONAL, AREAS_EMPRESA, ambitoDeArea, type DependeDe, type Entregable, type Paso } from "./types";
import { USUARIO_ACTUAL } from "./usuario";
import { getSOPsHoy, getSOPsDemanda, type SOPHoy } from "./sop-scheduler";
import type { PlantillaProceso } from "./types";

const AREA_LABELS: Record<string, string> = Object.fromEntries([
  ...AREAS_PERSONAL.map((a) => [a.id, a.label]),
  ...AREAS_EMPRESA.map((a) => [a.id, a.label]),
]);

export function useArbol(entregableId: string | undefined) {
  const state = useAppState();

  return useMemo(() => {
    const entregable = entregableId
      ? state.entregables.find((e) => e.id === entregableId)
      : undefined;
    const resultado = entregable
      ? state.resultados.find((r) => r.id === entregable.resultadoId)
      : undefined;
    const proyecto = resultado
      ? state.proyectos.find((p) => p.id === resultado.proyectoId)
      : undefined;

    const areaLabel = proyecto
      ? `${ambitoDeArea(proyecto.area) === "empresa" ? state.ambitoLabels.empresa : state.ambitoLabels.personal} · ${AREA_LABELS[proyecto.area] ?? proyecto.area}`
      : undefined;

    return { entregable, resultado, proyecto, areaLabel };
  }, [state, entregableId]);
}

export function usePasosActivos() {
  const state = useAppState();

  return useMemo(() => {
    return state.pasosActivos
      .map((id) => state.pasos.find((p) => p.id === id))
      .filter((p): p is Paso => {
        if (!p) return false;
        const ent = state.entregables.find((e) => e.id === p.entregableId);
        return !!ent;
      });
  }, [state.pasosActivos, state.pasos, state.entregables]);
}

export interface Pendiente {
  entregable: Entregable;
  siguientePasoNombre: string | null;
  pendingPasoId: string | null;
  ultimoPaso: Paso | null;
  resultadoNombre: string;
  resultadoSemana: string | null;
  proyectoNombre: string;
}

export function usePendientes(): Pendiente[] {
  const state = useAppState();

  return useMemo(() => {
    const entregablesActivosIds = new Set(
      state.pasosActivos
        .map((id) => state.pasos.find((p) => p.id === id)?.entregableId)
        .filter(Boolean) as string[],
    );

    const latestByEntregable = new Map<string, Paso>();
    const pendingByEntregable = new Map<string, Paso>();
    for (const p of state.pasos) {
      if (p.inicioTs === null) {
        pendingByEntregable.set(p.entregableId, p);
        continue;
      }
      if (!p.finTs) continue;
      const existing = latestByEntregable.get(p.entregableId);
      if (!existing || new Date(p.finTs).getTime() > new Date(existing.finTs!).getTime()) {
        latestByEntregable.set(p.entregableId, p);
      }
    }

    const order: Record<string, number> = { en_proceso: 0, a_futuro: 1, en_espera: 2 };

    return state.entregables
      .filter((e) => e.estado !== "hecho" && e.estado !== "cancelada")
      .filter((e) => e.responsable === USUARIO_ACTUAL)
      .filter((e) => !entregablesActivosIds.has(e.id))
      .map((e) => {
        const pendingPaso = pendingByEntregable.get(e.id) ?? null;
        const ultimoPaso = latestByEntregable.get(e.id) ?? null;
        const siguientePasoNombre =
          pendingPaso?.nombre
          ?? (ultimoPaso?.siguientePaso?.tipo === "continuar"
            ? ultimoPaso.siguientePaso.nombre ?? null
            : null);
        const resultado = state.resultados.find((r) => r.id === e.resultadoId);
        const proyecto = resultado
          ? state.proyectos.find((p) => p.id === resultado.proyectoId)
          : undefined;
        return {
          entregable: e,
          siguientePasoNombre,
          pendingPasoId: pendingPaso?.id ?? null,
          ultimoPaso,
          resultadoNombre: resultado?.nombre ?? "",
          resultadoSemana: resultado?.semana ?? null,
          proyectoNombre: proyecto?.nombre ?? "",
        };
      })
      .sort((a, b) => {
        const oa = order[a.entregable.estado] ?? 9;
        const ob = order[b.entregable.estado] ?? 9;
        if (oa !== ob) return oa - ob;
        return new Date(b.entregable.creado).getTime() - new Date(a.entregable.creado).getTime();
      });
  }, [state]);
}

export interface EsperandoItem {
  paso: Paso;
  entregableNombre: string;
  resultadoNombre: string;
  proyectoNombre: string;
  dependeDe: DependeDe[];
  fechaProgramada?: string;
}

export function useEsperandoRespuesta(): EsperandoItem[] {
  const state = useAppState();
  return useMemo(() => {
    const items: EsperandoItem[] = [];

    const latestByEnt = new Map<string, Paso>();
    for (const p of state.pasos) {
      if (!p.finTs) continue;
      const existing = latestByEnt.get(p.entregableId);
      if (!existing || new Date(p.finTs).getTime() > new Date(existing.finTs!).getTime()) {
        latestByEnt.set(p.entregableId, p);
      }
    }

    for (const [entId, paso] of latestByEnt) {
      if (paso.siguientePaso?.cuando !== "depende") continue;
      if (!paso.siguientePaso.dependeDe?.length) continue;

      const ent = state.entregables.find((e) => e.id === entId);
      if (!ent || ent.estado === "hecho" || ent.estado === "cancelada") continue;

      const hasNewerActive = state.pasos.some(
        (p) =>
          p.entregableId === entId &&
          p.id !== paso.id &&
          p.inicioTs &&
          new Date(p.inicioTs).getTime() > new Date(paso.finTs!).getTime(),
      );
      if (hasNewerActive) continue;

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;

      items.push({
        paso,
        entregableNombre: ent.nombre,
        resultadoNombre: res?.nombre ?? "",
        proyectoNombre: proj?.nombre ?? "",
        dependeDe: paso.siguientePaso.dependeDe,
        fechaProgramada: paso.siguientePaso.fechaProgramada,
      });
    }

    return items;
  }, [state]);
}

export function usePasosHoy() {
  const state = useAppState();

  return useMemo(() => {
    const today = new Date();
    return state.pasos.filter((p) => {
      if (!p.finTs || !p.inicioTs) return false;
      const d = new Date(p.inicioTs);
      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      );
    });
  }, [state.pasos]);
}

export function useSOPsHoy(): { mios: SOPHoy[]; equipo: SOPHoy[] } {
  const state = useAppState();
  return useMemo(() => {
    const todos = getSOPsHoy(state);
    const mios = todos.filter((s) => s.plantilla.responsableDefault === USUARIO_ACTUAL);
    const equipo = todos.filter((s) => s.plantilla.responsableDefault !== USUARIO_ACTUAL);
    return { mios, equipo };
  }, [state]);
}

export function useSOPsDemanda(): PlantillaProceso[] {
  const state = useAppState();
  return useMemo(
    () => getSOPsDemanda(state).filter((pl) => pl.responsableDefault === USUARIO_ACTUAL),
    [state],
  );
}

export type Agrupados<T> = { entregable: string; entregableId: string; items: T[] }[];

export function agruparPorEntregable<T extends { entregableId: string }>(
  items: T[],
  entregables: { id: string; nombre: string }[],
): Agrupados<T> {
  const map = new Map<string, { entregable: string; entregableId: string; items: T[] }>();

  for (const item of items) {
    if (!map.has(item.entregableId)) {
      const e = entregables.find((ent) => ent.id === item.entregableId);
      map.set(item.entregableId, {
        entregable: e?.nombre ?? "Sin entregable",
        entregableId: item.entregableId,
        items: [],
      });
    }
    map.get(item.entregableId)!.items.push(item);
  }

  return Array.from(map.values());
}
