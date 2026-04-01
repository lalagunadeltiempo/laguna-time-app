"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react";
import type { AppState } from "./types";
import { loadState, saveState, didLoadSuccessfully, INITIAL_STATE } from "./store";
import { reducer, type Action } from "./reducer";
import { runMigrations } from "./migrations";

const StateCtx = createContext<AppState>(INITIAL_STATE);
const DispatchCtx = createContext<Dispatch<Action>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  useEffect(() => {
    const loaded = loadState();
    dispatch({ type: "INIT", state: loaded });
    if (didLoadSuccessfully()) {
      runMigrations(loaded, dispatch);
    }
  }, []);

  useEffect(() => {
    if (state !== INITIAL_STATE) {
      saveState(state);
    }
  }, [state]);

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
