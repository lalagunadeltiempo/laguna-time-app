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
  INITIAL_STATE,
  generateId,
} from "./store";
import { reducer, type Action } from "./reducer";
import { runMigrations } from "./migrations";

const StateCtx = createContext<AppState>(INITIAL_STATE);
const DispatchCtx = createContext<Dispatch<Action>>(() => {});

interface ProviderProps {
  userId: string;
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
    case "CONVERT_ENTREGABLE_TO_SOP":
      return { action: "convert_to_sop", descripcion: `Entregable convertido en SOP`, entregableId: action.entregableId };
    default:
      return null;
  }
}

export function AppProvider({ userId, children }: ProviderProps) {
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
        dispatch({ type: "INIT", state: cloudResult.data });
        saveStateLocal(cloudResult.data);
        runMigrations(cloudResult.data, dispatch);
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

  // Flush pending cloud save on page close
  useEffect(() => {
    function handleBeforeUnload() {
      flushPendingCloudSave();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const loggingDispatch = useCallback((action: Action) => {
    dispatch(action);
    const log = actionToLog(action, userId);
    if (log) {
      dispatch({
        type: "LOG_ACTIVITY",
        entry: {
          id: generateId(),
          timestamp: new Date().toISOString(),
          userId,
          ...log,
        },
      });
    }
  }, [userId]);

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
