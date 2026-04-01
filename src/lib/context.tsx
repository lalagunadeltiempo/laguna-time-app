"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
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
  INITIAL_STATE,
} from "./store";
import { reducer, type Action } from "./reducer";
import { runMigrations } from "./migrations";

const StateCtx = createContext<AppState>(INITIAL_STATE);
const DispatchCtx = createContext<Dispatch<Action>>(() => {});

interface ProviderProps {
  userId: string;
  children: ReactNode;
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

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function init() {
      const cloudState = await loadStateCloud(userId);

      if (cloudState) {
        setLoadedSuccessfully(true);
        dispatch({ type: "INIT", state: cloudState });
        saveStateLocal(cloudState);
        runMigrations(cloudState, dispatch);
        return;
      }

      const localState = loadStateLocal();
      dispatch({ type: "INIT", state: localState });

      if (didLoadSuccessfully()) {
        runMigrations(localState, dispatch);

        if (userId !== "local" && localState !== INITIAL_STATE) {
          saveStateCloud(userId, localState);
          console.log("[init] Datos locales migrados a la nube");
        }
      }
    }

    init();
  }, [userId]);

  // Persist state changes
  useEffect(() => {
    if (state === INITIAL_STATE) return;
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

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useAppState() {
  return useContext(StateCtx);
}

export function useAppDispatch() {
  return useContext(DispatchCtx);
}
