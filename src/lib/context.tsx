"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type Dispatch,
} from "react";
import type { AppState } from "./types";
import {
  loadStateLocal,
  saveStateLocal,
  loadStateCloud,
  saveStateCloud,
  flushPendingCloudSave,
  setLoadedSuccessfully,
  didLoadSuccessfully,
  markCloudLoadOk,
  getLocalSavedAt,
  INITIAL_STATE,
  generateId,
} from "./store";
import { reducer, type Action } from "./reducer";
import { runMigrations } from "./migrations";

const StateCtx = createContext<AppState>(INITIAL_STATE);
const DispatchCtx = createContext<Dispatch<Action>>(() => {});

interface ProviderProps {
  userId: string;
  displayName?: string;
  children: ReactNode;
}

function buildRuta(state: AppState, opts: { pasoId?: string; entregableId?: string; proyectoId?: string }): string {
  let proj = "", res = "", ent = "", paso = "";
  if (opts.pasoId) {
    const p = state.pasos.find((x) => x.id === opts.pasoId);
    if (p) { paso = p.nombre; opts = { ...opts, entregableId: p.entregableId }; }
  }
  if (opts.entregableId) {
    const e = state.entregables.find((x) => x.id === opts.entregableId);
    if (e) {
      ent = e.nombre;
      const r = state.resultados.find((x) => x.id === e.resultadoId);
      if (r) { res = r.nombre; const pr = state.proyectos.find((x) => x.id === r.proyectoId); if (pr) proj = pr.nombre; }
    }
  }
  if (opts.proyectoId && !proj) { const pr = state.proyectos.find((x) => x.id === opts.proyectoId); if (pr) proj = pr.nombre; }
  return [proj, res, ent, paso].filter(Boolean).join(" → ");
}

function targetName(state: AppState, nivel: string, targetId: string): string {
  if (nivel === "paso") { const p = state.pasos.find((x) => x.id === targetId); return p ? `"${p.nombre}"` : ""; }
  if (nivel === "entregable") { const e = state.entregables.find((x) => x.id === targetId); return e ? `"${e.nombre}"` : ""; }
  if (nivel === "resultado") { const r = state.resultados.find((x) => x.id === targetId); return r ? `"${r.nombre}"` : ""; }
  if (nivel === "proyecto") { const p = state.proyectos.find((x) => x.id === targetId); return p ? `"${p.nombre}"` : ""; }
  if (nivel === "plantilla") { const t = state.plantillas.find((x) => x.id === targetId); return t ? `"${t.nombre}"` : ""; }
  return "";
}

function collectPasoNotas(state: AppState, pasoId: string): string {
  const p = state.pasos.find((x) => x.id === pasoId);
  if (!p) return "";
  const parts: string[] = [];
  if (p.contexto.notas) parts.push(p.contexto.notas);
  for (const n of p.notas ?? []) parts.push(`[${n.autor}] ${n.texto}`);
  return parts.join("\n");
}

function actionToLog(action: Action, _userName: string, state: AppState): { action: string; descripcion: string; detalle?: string; ruta?: string; entregableId?: string; pasoId?: string; proyectoId?: string } | null {
  switch (action.type) {
    case "START_PASO": {
      const ruta = buildRuta(state, { entregableId: action.payload.entregableId });
      return { action: "start_paso", descripcion: `Inicio paso "${action.payload.nombre}"`, ruta, entregableId: action.payload.entregableId, pasoId: action.payload.id };
    }
    case "CLOSE_PASO": {
      const ruta = buildRuta(state, { entregableId: action.payload.entregableId });
      const detalle = collectPasoNotas(state, action.payload.id);
      return { action: "close_paso", descripcion: `Paso dado "${action.payload.nombre}"`, detalle: detalle || undefined, ruta, entregableId: action.payload.entregableId, pasoId: action.payload.id };
    }
    case "ADD_ENTREGABLE": {
      const ruta = buildRuta(state, { entregableId: action.payload.id });
      return { action: "add_entregable", descripcion: `Nuevo entregable "${action.payload.nombre}"`, ruta, entregableId: action.payload.id };
    }
    case "ADD_PROYECTO":
      return { action: "add_proyecto", descripcion: `Nuevo proyecto "${action.payload.nombre}"`, proyectoId: action.payload.id };
    case "ADD_RESULTADO": {
      const pr = state.proyectos.find((p) => p.id === action.payload.proyectoId);
      return { action: "add_resultado", descripcion: `Nuevo resultado "${action.payload.nombre}"`, ruta: pr?.nombre };
    }
    case "CONVERT_ENTREGABLE_TO_SOP": {
      const ruta = buildRuta(state, { entregableId: action.entregableId });
      return { action: "convert_to_sop", descripcion: `Entregable convertido en SOP`, ruta, entregableId: action.entregableId };
    }
    case "ADD_NOTA": {
      const name = targetName(state, action.nivel, action.targetId);
      const ruta = buildRuta(state, { pasoId: action.nivel === "paso" ? action.targetId : undefined, entregableId: action.nivel === "entregable" ? action.targetId : undefined, proyectoId: action.nivel === "proyecto" ? action.targetId : undefined });
      return { action: "add_nota", descripcion: `Nota en ${action.nivel} ${name}`, detalle: action.nota.texto, ruta, pasoId: action.nivel === "paso" ? action.targetId : undefined, entregableId: action.nivel === "entregable" ? action.targetId : undefined };
    }
    case "MATERIALIZE_SOP": {
      const pl = state.plantillas.find((p) => p.id === action.plantillaId);
      const areaLabel = pl?.area ? pl.area.charAt(0).toUpperCase() + pl.area.slice(1) : "";
      return { action: "start_sop", descripcion: `SOP iniciado "${pl?.nombre ?? action.plantillaId}"`, ruta: areaLabel };
    }
    case "PAUSE_PASO": {
      const p = state.pasos.find((x) => x.id === action.id);
      const ruta = buildRuta(state, { pasoId: action.id });
      return { action: "pause_paso", descripcion: `Paso pausado "${p?.nombre ?? ""}"`, ruta, pasoId: action.id };
    }
    case "RESUME_PASO": {
      const p = state.pasos.find((x) => x.id === action.id);
      const ruta = buildRuta(state, { pasoId: action.id });
      return { action: "resume_paso", descripcion: `Paso reanudado "${p?.nombre ?? ""}"`, ruta, pasoId: action.id };
    }
    case "DISCARD_PASO": {
      const p = state.pasos.find((x) => x.id === action.id);
      const ruta = buildRuta(state, { pasoId: action.id });
      return { action: "discard_paso", descripcion: `Paso descartado "${p?.nombre ?? ""}"`, ruta, pasoId: action.id };
    }
    case "RESCHEDULE_NEXT_PASO": {
      const p = state.pasos.find((x) => x.id === action.pasoId);
      const ruta = buildRuta(state, { pasoId: action.pasoId });
      const desc = action.newDate
        ? `Siguiente paso reprogramado a ${action.newDate} ("${p?.siguientePaso?.nombre ?? p?.nombre ?? ""}")`
        : `Siguiente paso eliminado de planificación ("${p?.siguientePaso?.nombre ?? p?.nombre ?? ""}")`;
      return { action: "reschedule_next_paso", descripcion: desc, ruta, pasoId: action.pasoId };
    }
    case "UPDATE_NOTA": {
      const name = targetName(state, action.nivel, action.targetId);
      return { action: "update_nota", descripcion: `Nota editada en ${action.nivel} ${name}` };
    }
    case "RENAME_PASO": {
      const ruta = buildRuta(state, { pasoId: action.id });
      return { action: "rename_paso", descripcion: `Paso renombrado a "${action.nombre}"`, ruta, pasoId: action.id };
    }
    case "SYNC_ENTREGABLE_TO_PLANTILLA": {
      const syncEnt = state.entregables.find((e) => e.id === action.entregableId);
      const syncPl = syncEnt?.plantillaId ? state.plantillas.find((pl) => pl.id === syncEnt.plantillaId) : null;
      return { action: "sync_sop", descripcion: `SOP "${syncPl?.nombre ?? "?"}" actualizado con mejoras del entregable`, entregableId: action.entregableId };
    }
    case "SET_REVIEW": {
      const statusLabels: Record<string, string> = { pendiente: "pendiente", revisado: "revisado", sugerencia: "con sugerencias", aprobado: "aprobado" };
      const label = statusLabels[action.review.status] ?? action.review.status;
      const name = targetName(state, action.nivel, action.targetId);
      return { action: "set_review", descripcion: `${action.nivel} "${name}" marcado como ${label} por ${action.review.autor}` };
    }
    default:
      return null;
  }
}

function mergeStates(a: AppState, b: AppState): AppState {
  function unionById<T extends { id: string }>(arrA: T[], arrB: T[], prefer?: (x: T, y: T) => T): T[] {
    const map = new Map<string, T>();
    for (const item of arrA) map.set(item.id, item);
    for (const item of arrB) {
      const existing = map.get(item.id);
      if (!existing) { map.set(item.id, item); continue; }
      map.set(item.id, prefer ? prefer(existing, item) : existing);
    }
    return Array.from(map.values());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preferPaso = (x: any, y: any) => {
    if (x.finTs && !y.finTs) return x;
    if (y.finTs && !x.finTs) return y;
    return (x.inicioTs ?? "") >= (y.inicioTs ?? "") ? x : y;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preferMore = (x: any, y: any) => {
    if ((x.diasHechos ?? 0) > (y.diasHechos ?? 0)) return x;
    if ((y.diasHechos ?? 0) > (x.diasHechos ?? 0)) return y;
    return x;
  };

  const merged: AppState = {
    ...a,
    proyectos: unionById(a.proyectos, b.proyectos),
    resultados: unionById(a.resultados, b.resultados),
    entregables: unionById(a.entregables, b.entregables, preferMore),
    pasos: unionById(a.pasos, b.pasos, preferPaso),
    contactos: unionById(a.contactos ?? [], b.contactos ?? []),
    inbox: unionById(a.inbox ?? [], b.inbox ?? []),
    plantillas: unionById(a.plantillas, b.plantillas),
    ejecuciones: unionById(a.ejecuciones ?? [], b.ejecuciones ?? []),
    miembros: unionById(a.miembros ?? [], b.miembros ?? []),
    activityLog: unionById(a.activityLog ?? [], b.activityLog ?? []),
    objetivos: unionById(a.objetivos ?? [], b.objetivos ?? []),
    pasosActivos: Array.from(new Set([...a.pasosActivos, ...b.pasosActivos])),
    _migrationVersion: Math.max(a._migrationVersion ?? 0, b._migrationVersion ?? 0),
  };
  return merged;
}

export function AppProvider({ userId, displayName, children }: ProviderProps) {
  const logName = displayName || userId;
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const initialized = useRef(false);
  const prevUserId = useRef(userId);

  // Reset initialization when userId changes
  if (prevUserId.current !== userId) {
    prevUserId.current = userId;
    initialized.current = false;
  }

  const initDone = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    initDone.current = false;

    async function init() {
      const cloudResult = await loadStateCloud(userId);

      if (cloudResult.data) {
        setLoadedSuccessfully(true);

        const isMentorUser = userId === "mentor";

        if (isMentorUser) {
          markCloudLoadOk();
          dispatch({ type: "INIT", state: cloudResult.data });
          runMigrations(cloudResult.data, dispatch);
          initDone.current = true;
          return;
        }

        const localState = loadStateLocal();
        const hasLocal = localState !== INITIAL_STATE;

        if (hasLocal) {
          const merged = mergeStates(cloudResult.data, localState);
          console.log("[init] Merge cloud + local (union por IDs)");
          dispatch({ type: "INIT", state: merged });
          runMigrations(merged, dispatch);
          markCloudLoadOk();
          saveStateCloud(userId, merged);
        } else {
          dispatch({ type: "INIT", state: cloudResult.data });
          saveStateLocal(cloudResult.data);
          runMigrations(cloudResult.data, dispatch);
        }
        initDone.current = true;
        return;
      }

      if (cloudResult.error) {
        console.warn("[init] Cloud load failed — loading local only, cloud saves blocked");
        const localState = loadStateLocal();
        dispatch({ type: "INIT", state: localState });
        if (userId === "mentor") {
          runMigrations(localState, dispatch);
          markCloudLoadOk();
        }
        initDone.current = true;
        return;
      }

      const localState = loadStateLocal();
      dispatch({ type: "INIT", state: localState });

      if (didLoadSuccessfully()) {
        runMigrations(localState, dispatch);

        if (userId === "mentor") {
          markCloudLoadOk();
        } else if (userId !== "local" && localState !== INITIAL_STATE) {
          markCloudLoadOk();
          saveStateCloud(userId, localState);
          console.log("[init] Datos locales migrados a la nube");
        }
      }
      initDone.current = true;
    }

    init();
  }, [userId]);

  useEffect(() => {
    if (state === INITIAL_STATE) return;
    if (!initDone.current) return;
    if (userId !== "mentor") saveStateLocal(state);
    saveStateCloud(userId, state);
    flushPendingCloudSave();
  }, [state, userId]);

  // Flush pending cloud save on page close or tab switch
  useEffect(() => {
    function handleBeforeUnload() {
      flushPendingCloudSave();
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushPendingCloudSave();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const loggingDispatch = useCallback((action: Action) => {
    const log = actionToLog(action, logName, state);
    dispatch(action);
    if (log) {
      dispatch({
        type: "LOG_ACTIVITY",
        entry: {
          id: generateId(),
          timestamp: new Date().toISOString(),
          userId: logName,
          ...log,
        },
      });
    }
  }, [logName, state]);

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={loggingDispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useAppState() {
  return useContext(StateCtx);
}

export function useAppDispatch() {
  return useContext(DispatchCtx);
}
