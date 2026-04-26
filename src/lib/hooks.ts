"use client";

import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import { useAppState, useAppDispatch } from "./context";
import { AREAS_PERSONAL, AREAS_EMPRESA, ambitoDeArea, AREA_COLORS, type Area, type DependeDe, type Entregable, type Paso } from "./types";
import { useUsuario } from "./usuario";
import { getSOPsHoy, getSOPsDemanda, type SOPHoy } from "./sop-scheduler";
import { toDateKey } from "./date-utils";
import { subtituloEntregable } from "./display";
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

/**
 * Pasos en marcha del usuario activo, o de un miembro concreto si se indica.
 *
 * - `targetUser === undefined` → filtra por el `currentUser` (comportamiento por defecto).
 * - `targetUser === null` → no filtra (modo "Todos / Equipo").
 * - `targetUser === string` → filtra por ese miembro.
 */
export function usePasosActivos(targetUser?: string | null) {
  const state = useAppState();
  const { nombre: currentUser } = useUsuario();
  const effectiveTarget = targetUser === undefined ? currentUser : targetUser;

  return useMemo(() => {
    return state.pasosActivos
      .map((id) => state.pasos.find((p) => p.id === id))
      .filter((p): p is Paso => {
        if (!p) return false;
        const ent = state.entregables.find((e) => e.id === p.entregableId);
        if (!ent) return false;
        if (effectiveTarget === null) return true;
        const isTargetTask =
          ent.responsable === effectiveTarget ||
          p.responsable === effectiveTarget ||
          p.implicados.some((i) => i.nombre === effectiveTarget);
        return isTargetTask;
      });
  }, [state.pasosActivos, state.pasos, state.entregables, effectiveTarget]);
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

export function usePendientes(targetUser?: string | null): Pendiente[] {
  const state = useAppState();
  const { nombre: currentUser } = useUsuario();
  const effectiveTarget = targetUser === undefined ? currentUser : targetUser;

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

    const order: Record<string, number> = { en_proceso: 0, planificado: 1, a_futuro: 2, en_espera: 3 };

    return state.entregables
      .filter((e) => e.estado !== "hecho" && e.estado !== "cancelada")
      .filter((e) => {
        if (effectiveTarget === null) return true;
        if (e.responsable === effectiveTarget) return true;
        return state.pasos.some((p) => p.entregableId === e.id && p.responsable === effectiveTarget);
      })
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
  }, [state, effectiveTarget]);
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
  const { nombre: currentUser } = useUsuario();
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
      if (!paso.implicados.some((i) => i.nombre === currentUser)) continue;

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
  }, [state, currentUser]);
}

export interface DependenciaEntrante {
  paso: Paso;
  entregableNombre: string;
  proyectoNombre: string;
  remitente: string;
  fechaProgramada?: string;
}

export function useDependenciasEntrantes(): DependenciaEntrante[] {
  const state = useAppState();
  const { nombre: currentUser } = useUsuario();

  return useMemo(() => {
    const items: DependenciaEntrante[] = [];

    for (const paso of state.pasos) {
      if (!paso.finTs || !paso.siguientePaso) continue;
      if (paso.siguientePaso.cuando !== "depende") continue;
      const deps = paso.siguientePaso.dependeDe;
      if (!deps?.some((d) => d.tipo === "equipo" && d.nombre === currentUser)) continue;

      const ent = state.entregables.find((e) => e.id === paso.entregableId);
      if (!ent || ent.estado === "hecho" || ent.estado === "cancelada") continue;

      const hasNewerWork = state.pasos.some(
        (p) => p.entregableId === paso.entregableId && p.id !== paso.id && p.inicioTs
          && new Date(p.inicioTs).getTime() > new Date(paso.finTs!).getTime(),
      );
      if (hasNewerWork) continue;

      const remitente = paso.implicados.find((i) => i.nombre !== currentUser)?.nombre
        ?? paso.implicados[0]?.nombre ?? "Alguien";

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;

      items.push({
        paso,
        entregableNombre: ent.nombre,
        proyectoNombre: proj?.nombre ?? "",
        remitente,
        fechaProgramada: paso.siguientePaso.fechaProgramada,
      });
    }

    return items;
  }, [state, currentUser]);
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
  const { nombre: currentUser } = useUsuario();
  return useMemo(() => {
    const todos = getSOPsHoy(state);
    const mios = todos.filter((s) => s.plantilla.responsableDefault === currentUser);
    const equipo = todos.filter((s) => s.plantilla.responsableDefault !== currentUser);
    return { mios, equipo };
  }, [state, currentUser]);
}

export function useSOPsDemanda(): PlantillaProceso[] {
  const state = useAppState();
  const { nombre: currentUser } = useUsuario();
  return useMemo(
    () => getSOPsDemanda(state).filter((pl) => pl.responsableDefault === currentUser),
    [state, currentUser],
  );
}

/* ============================================================
   useFocoProyectos — shared hook para "Modo foco" en HOY
   Persistencia en localStorage. No toca el reducer.
   ============================================================ */

const FOCO_STORAGE_KEY = "laguna-foco-proyectos";
const FOCO_MAX = 3;

export function useFocoProyectos() {
  const [focoIds, setFocoIdsState] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(FOCO_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, FOCO_MAX) : [];
    } catch {
      return [];
    }
  });

  const persist = useCallback((next: string[]) => {
    if (typeof window === "undefined") return;
    try {
      if (next.length === 0) window.localStorage.removeItem(FOCO_STORAGE_KEY);
      else window.localStorage.setItem(FOCO_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota/unavailable
    }
  }, []);

  const setFocoIds = useCallback(
    (updater: string[] | ((prev: string[]) => string[])) => {
      setFocoIdsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        const clean = next.slice(0, FOCO_MAX);
        persist(clean);
        return clean;
      });
    },
    [persist],
  );

  const toggleFoco = useCallback(
    (proyectoId: string) => {
      setFocoIdsState((prev) => {
        let next: string[];
        if (prev.includes(proyectoId)) {
          next = prev.filter((id) => id !== proyectoId);
        } else if (prev.length >= FOCO_MAX) {
          next = [...prev.slice(1), proyectoId];
        } else {
          next = [...prev, proyectoId];
        }
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clearFoco = useCallback(() => {
    persist([]);
    setFocoIdsState([]);
  }, [persist]);

  return { focoIds, setFocoIds, toggleFoco, clearFoco, focoMax: FOCO_MAX };
}

/* ============================================================
   usePlannedBlocks — shared hook for "planned for date" blocks
   Both PantallaHoy and PlanHoy consume this single source of truth.
   ============================================================ */

export type PlannedBlockOrigen = "hoy" | "arrastrado" | "en_marcha";

export interface PlannedBlock {
  id: string;
  title: string;
  subtitle: string;
  entregableId: string;
  /** Paso "contextual" asociado (siguiente paso o paso legacy activo). Informativo para la UI. */
  pasoId?: string;
  /** Nombre del siguiente paso (próximo en la checklist o paso legacy). Se usa para texto auxiliar. */
  siguientePasoNombre?: string;
  area: Area;
  proyectoId?: string;
  proyectoNombre?: string;
  resultadoNombre?: string;
  entregableNombre?: string;
  hex: string;
  /** Hora planificada de inicio (ISO). Solo relevante si origen === "hoy". */
  planInicioTs?: string | null;
  /**
   * Clasifica el bloque por su relación con `dateKey`:
   * - "en_marcha": el entregable tiene una sesión abierta (finTs=null) o está en_proceso.
   * - "hoy": planificado exactamente para dateKey (planInicioTs, fechaInicio, next/pending paso hoy).
   * - "arrastrado": anclado a una fecha anterior a dateKey y aún no cerrado.
   */
  origen: PlannedBlockOrigen;
  /** Responsable del entregable (si está). */
  responsable?: string;
  /** El bloque aparece por un paso del `targetUser`, no porque el entregable sea suyo. */
  pasoTuyo?: boolean;
}

export interface PlannedBlocksSplit {
  hoy: PlannedBlock[];
  arrastrado: PlannedBlock[];
  enMarcha: PlannedBlock[];
}

export function splitPlannedBlocks(blocks: PlannedBlock[]): PlannedBlocksSplit {
  const hoy: PlannedBlock[] = [];
  const arrastrado: PlannedBlock[] = [];
  const enMarcha: PlannedBlock[] = [];
  for (const b of blocks) {
    if (b.origen === "hoy") hoy.push(b);
    else if (b.origen === "arrastrado") arrastrado.push(b);
    else enMarcha.push(b);
  }
  return { hoy, arrastrado, enMarcha };
}

export function usePlannedBlocks(dateKey: string, targetUser?: string | null): PlannedBlock[] {
  const state = useAppState();
  const { nombre: currentUser } = useUsuario();
  const effectiveTarget = targetUser === undefined ? currentUser : targetUser;

  return useMemo(() => {
    const { pasos, entregables, resultados, proyectos } = state;

    const estaOcultoHoy = (ent: { ocultoHasta?: string | null }): boolean =>
      !!ent.ocultoHasta && ent.ocultoHasta >= dateKey;

    const pasosPorEnt = new Map<string, Paso[]>();
    for (const p of pasos) {
      const arr = pasosPorEnt.get(p.entregableId) ?? [];
      arr.push(p);
      pasosPorEnt.set(p.entregableId, arr);
    }

    const result: PlannedBlock[] = [];

    for (const ent of entregables) {
      if (ent.estado === "hecho" || ent.estado === "cancelada" || ent.estado === "en_espera") continue;
      if (estaOcultoHoy(ent)) continue;
      // Filtro por target:
      //  - effectiveTarget === null → no filtra (Todos / Equipo).
      //  - effectiveTarget definido → entregable es del target O algún paso lo es.
      let esEntregableMio = true;
      let tienePasoMio = false;
      if (effectiveTarget !== null) {
        esEntregableMio = ent.responsable === effectiveTarget;
        tienePasoMio = !esEntregableMio && pasos.some(
          (p) => p.entregableId === ent.id && p.responsable === effectiveTarget,
        );
        if (!esEntregableMio && !tienePasoMio) continue;
      }

      const sesiones = Array.isArray(ent.sesiones) ? ent.sesiones : [];
      const tieneSesionAbierta = sesiones.some((s) => s.finTs === null);

      // Señales hoy / arrastrado
      let hoy = false;
      let arrastrado = false;

      const planKey = ent.planInicioTs ? ent.planInicioTs.slice(0, 10) : null;
      if (planKey) {
        if (planKey === dateKey) hoy = true;
        else if (planKey < dateKey) arrastrado = true;
        else continue; // planInicioTs futuro: no aparece hoy (ni arrastrado)
      }

      if (!hoy && ent.fechaInicio) {
        if (ent.fechaInicio === dateKey) hoy = true;
        else if (ent.fechaInicio < dateKey) arrastrado = true;
      }

      // Señal diasPlanificados (modelo nuevo multi-día en Plan Semana)
      if (Array.isArray(ent.diasPlanificados) && ent.diasPlanificados.length > 0) {
        if (ent.diasPlanificados.includes(dateKey)) {
          hoy = true;
        } else if (!hoy && ent.diasPlanificados.some((k) => k < dateKey)) {
          arrastrado = true;
        }
      }

      // Señales procedentes de pasos (legacy next-* / pending-*).
      let siguientePasoId: string | undefined;
      let siguientePasoNombre: string | undefined;

      const pasosE = pasosPorEnt.get(ent.id) ?? [];

      // "next": paso cerrado con siguientePaso continuar + fechaProgramada.
      for (const paso of pasosE) {
        if (!paso.finTs || !paso.siguientePaso) continue;
        if (paso.siguientePaso.tipo !== "continuar") continue;
        let fp = paso.siguientePaso.fechaProgramada;
        if (!fp) continue;
        if (fp === "manana") {
          const finDate = new Date(paso.finTs);
          finDate.setDate(finDate.getDate() + 1);
          fp = toDateKey(finDate);
        }
        const newerPasoExists = pasosE.some((p2) =>
          p2.id !== paso.id && p2.inicioTs && paso.finTs && p2.inicioTs >= paso.finTs,
        );
        if (newerPasoExists) continue;
        if (fp === dateKey) {
          hoy = true;
          siguientePasoId = siguientePasoId ?? paso.id;
          siguientePasoNombre = siguientePasoNombre ?? (paso.siguientePaso.nombre ?? paso.nombre);
        } else if (fp < dateKey) {
          arrastrado = true;
          siguientePasoId = siguientePasoId ?? paso.id;
          siguientePasoNombre = siguientePasoNombre ?? (paso.siguientePaso.nombre ?? paso.nombre);
        }
      }

      // "pending": paso sin inicio y sin fin, con o sin planInicioTs.
      const pendingPaso = pasosE.find((p) => !p.inicioTs && !p.finTs);
      if (pendingPaso) {
        const pk = pendingPaso.planInicioTs ? pendingPaso.planInicioTs.slice(0, 10) : null;
        if (pk === dateKey) {
          hoy = true;
          siguientePasoId = siguientePasoId ?? pendingPaso.id;
          siguientePasoNombre = siguientePasoNombre ?? pendingPaso.nombre;
        } else if (pk && pk < dateKey) {
          arrastrado = true;
          siguientePasoId = siguientePasoId ?? pendingPaso.id;
          siguientePasoNombre = siguientePasoNombre ?? pendingPaso.nombre;
        } else if (!pk && ent.estado === "en_proceso") {
          // paso pendiente sin fecha pero entregable en proceso → se considera "en_marcha"
          siguientePasoId = siguientePasoId ?? pendingPaso.id;
          siguientePasoNombre = siguientePasoNombre ?? pendingPaso.nombre;
        }
      }

      // Determina origen del bloque.
      let origen: PlannedBlockOrigen | null = null;
      if (tieneSesionAbierta) origen = "en_marcha";
      else if (hoy) origen = "hoy";
      else if (arrastrado) origen = "arrastrado";
      else if (ent.estado === "en_proceso" && !!siguientePasoId) origen = "en_marcha";
      else continue;

      const res = resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? proyectos.find((pr) => pr.id === res.proyectoId) : undefined;

      // `planInicioTs` solo es relevante para la UI si pertenece al día que se
      // está viendo. Los bloques "en_marcha" o "arrastrado" pueden tener una
      // hora antigua que no debe colarse al ordenar por hora ni mostrarse como
      // badge horario en otro día.
      const planMatchesDate = ent.planInicioTs ? ent.planInicioTs.slice(0, 10) === dateKey : false;

      result.push({
        id: `ent-${ent.id}`,
        title: ent.nombre,
        subtitle: subtituloEntregable(ent, state),
        entregableId: ent.id,
        pasoId: siguientePasoId,
        siguientePasoNombre,
        area: (proj?.area ?? "operativa") as Area,
        proyectoId: proj?.id,
        proyectoNombre: proj?.nombre,
        resultadoNombre: res?.nombre,
        entregableNombre: ent.nombre,
        hex: AREA_COLORS[proj?.area ?? ""]?.hex ?? "#888",
        planInicioTs: planMatchesDate ? ent.planInicioTs : null,
        origen,
        responsable: ent.responsable,
        pasoTuyo: tienePasoMio,
      });
    }

    return result;
  }, [state, dateKey, effectiveTarget]);
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

/* ============================================================
   buildClosedPaso — shared helper for auto-closing stale steps
   ============================================================ */

export function buildClosedPaso(paso: Paso, targetDate?: string): Paso {
  const startDay = paso.inicioTs ? paso.inicioTs.slice(0, 10) : toDateKey(new Date());
  const endOfDay = `${startDay}T23:59:59.999Z`;
  const target = targetDate ?? toDateKey(nextDay());
  return {
    ...paso,
    finTs: endOfDay,
    estado: paso.nombre,
    siguientePaso: {
      tipo: "continuar",
      nombre: paso.nombre,
      cuando: "manana",
      fechaProgramada: target,
    },
  };
}

function nextDay(): Date {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return t;
}

/* ============================================================
   SOP-aware stale step helpers
   ============================================================ */

export interface StaleSopStep {
  paso: Paso;
  entregableId: string;
  plantillaId: string;
  plantillaNombre: string;
}

export function buildClosedPasoFin(paso: Paso): Paso {
  const startDay = paso.inicioTs ? paso.inicioTs.slice(0, 10) : toDateKey(new Date());
  const endOfDay = `${startDay}T23:59:59.999Z`;
  return {
    ...paso,
    finTs: endOfDay,
    estado: paso.nombre,
    siguientePaso: { tipo: "fin" },
  };
}

/* ============================================================
   useStaleStepCleanup — global hook for auto-closing overnight steps
   Separates SOP steps (which need user decision) from normal steps
   (which are auto-rescheduled silently).
   ============================================================ */

export function useStaleStepCleanup(): { rescheduledNames: string[]; staleSopSteps: StaleSopStep[] } {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const pasosActivos = usePasosActivos();
  const [rescheduledNames, setRescheduledNames] = useState<string[]>([]);
  const [staleSopSteps, setStaleSopSteps] = useState<StaleSopStep[]>([]);

  function classifyAndProcess(pasos: Paso[], targetDate: string) {
    const sopSteps: StaleSopStep[] = [];
    const reopenedNames: string[] = [];

    for (const paso of pasos) {
      const ent = state.entregables.find((e) => e.id === paso.entregableId);
      if (ent?.plantillaId) {
        const pl = state.plantillas.find((p) => p.id === ent.plantillaId);
        const esDiario = pl?.programacion?.tipo === "diario";
        if (esDiario) {
          sopSteps.push({ paso, entregableId: ent.id, plantillaId: ent.plantillaId, plantillaNombre: pl?.nombre ?? ent.nombre });
        } else {
          dispatch({ type: "CLOSE_PASO", payload: buildClosedPaso(paso, targetDate) });
          dispatch({ type: "REOPEN_PASO", id: paso.id });
          reopenedNames.push(paso.nombre);
        }
      } else {
        dispatch({ type: "CLOSE_PASO", payload: buildClosedPaso(paso, targetDate) });
        dispatch({ type: "REOPEN_PASO", id: paso.id });
        reopenedNames.push(paso.nombre);
      }
    }

    return { sopSteps, reopenedNames };
  }

  const staleCleaned = useRef(false);
  useEffect(() => {
    if (staleCleaned.current || pasosActivos.length === 0) return;
    const today = toDateKey(new Date());
    const stale = pasosActivos.filter((p) => p.inicioTs && p.inicioTs.slice(0, 10) < today);
    if (stale.length === 0) { staleCleaned.current = true; return; }
    staleCleaned.current = true;

    const { sopSteps, reopenedNames } = classifyAndProcess(stale, today);
    if (reopenedNames.length > 0) setRescheduledNames(reopenedNames);
    if (sopSteps.length > 0) setStaleSopSteps(sopSteps);
  }, [pasosActivos, dispatch, state.entregables, state.plantillas]);

  const autoCloseAtMidnight = useCallback(() => {
    if (pasosActivos.length === 0) return;
    const tomorrow = toDateKey(nextDay());
    const { sopSteps, reopenedNames } = classifyAndProcess(pasosActivos, tomorrow);
    if (reopenedNames.length > 0) setRescheduledNames(reopenedNames);
    if (sopSteps.length > 0) setStaleSopSteps(sopSteps);
  }, [pasosActivos, dispatch, state.entregables, state.plantillas]);

  useEffect(() => {
    if (pasosActivos.length === 0) return;
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const ms = midnight.getTime() - now.getTime();
    const timer = setTimeout(autoCloseAtMidnight, ms);
    return () => clearTimeout(timer);
  }, [pasosActivos, autoCloseAtMidnight]);

  return { rescheduledNames, staleSopSteps };
}
