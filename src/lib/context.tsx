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

function actionToLog(action: Action, userId: string): { action: string; descripcion: string; entregableId?: string; pasoId?: string; proyectoId?: string } | null {
  switch (action.type) {
    case "START_PASO":
      return { action: "start_paso", descripcion: `Inicio paso "${action.payload.nombre}"`, entregableId: action.payload.entregableId, pasoId: action.payload.id };
    case "CLOSE_PASO":
      return { action: "close_paso", descripcion: `Paso dado "${action.payload.nombre}"`, entregableId: action.payload.entregableId, pasoId: action.payload.id };
    case "ADD_ENTREGABLE":
      return { action: "add_entregable", descripcion: `Nuevo entregable "${action.payload.nombre}"`, entregableId: action.payload.id };
    case "ADD_PROYECTO":
      return { action: "add_proyecto", descripcion: `Nuevo proyecto "${action.payload.nombre}"`, proyectoId: action.payload.id };
    case "ADD_RESULTADO":
      return { action: "add_resultado", descripcion: `Nuevo resultado "${action.payload.nombre}"` };
    case "CONVERT_ENTREGABLE_TO_SOP":
      return { action: "convert_to_sop", descripcion: `Entregable convertido en SOP`, entregableId: action.entregableId };
    case "ADD_NOTA":
      return { action: "add_nota", descripcion: `Nota añadida en ${action.nivel}`, pasoId: action.nivel === "paso" ? action.targetId : undefined, entregableId: action.nivel === "entregable" ? action.targetId : undefined };
    case "MATERIALIZE_SOP":
      return { action: "start_sop", descripcion: `SOP iniciado (plantilla ${action.plantillaId.slice(0, 8)}...)` };
    case "PAUSE_PASO":
      return { action: "pause_paso", descripcion: `Paso pausado`, pasoId: action.id };
    case "RESUME_PASO":
      return { action: "resume_paso", descripcion: `Paso reanudado`, pasoId: action.id };
    default:
      return null;
  }
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

        // Compare cloud vs local: use whichever is newer
        const localState = loadStateLocal();
        const localTs = getLocalSavedAt();
        const cloudTs = cloudResult.updatedAt;
        const localIsNewer = localTs && cloudTs && localTs > cloudTs;

        if (localIsNewer && localState !== INITIAL_STATE) {
          console.log("[init] Local es más reciente que cloud — usando local");
          dispatch({ type: "INIT", state: localState });
          runMigrations(localState, dispatch);
          markCloudLoadOk();
          saveStateCloud(userId, localState);
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
        initDone.current = true;
        return;
      }

      const localState = loadStateLocal();
      dispatch({ type: "INIT", state: localState });

      if (didLoadSuccessfully()) {
        runMigrations(localState, dispatch);

        if (userId !== "local" && localState !== INITIAL_STATE) {
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
    saveStateLocal(state);
    saveStateCloud(userId, state);
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
    dispatch(action);
    const log = actionToLog(action, logName);
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
  }, [logName]);

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
