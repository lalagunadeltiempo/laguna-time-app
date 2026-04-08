import type { Action } from "./reducer";
import type { AppState } from "./types";
import { buildSeedSOPs } from "./seed-sops";
import { buildPersonalSeedData } from "./seed-personal";

export const CURRENT_MIGRATION = 10;

type Dispatch = (action: Action) => void;

export function runMigrations(state: AppState, dispatch: Dispatch): void {
  const version = state._migrationVersion ?? 0;

  if (version < 10) {
    migrationSeedPersonal(state, dispatch);
    syncMissingSOPs(state, dispatch);
  }

  if (version < CURRENT_MIGRATION) {
    dispatch({ type: "SET_MIGRATION_VERSION", version: CURRENT_MIGRATION });
  }
}

function migrationSeedPersonal(state: AppState, dispatch: Dispatch): void {
  if (state.proyectos.length > 0) return;
  if (state.entregables.length > 0 || state.resultados.length > 0) return;
  const { proyectos, resultados, entregables } = buildPersonalSeedData();
  dispatch({ type: "IMPORT_DATA", proyectos, resultados, entregables });
}

function syncMissingSOPs(state: AppState, dispatch: Dispatch): void {
  const existingNames = new Set(state.plantillas.map((p) => p.nombre));
  const missing = buildSeedSOPs().filter((s) => !existingNames.has(s.nombre));
  if (missing.length > 0) {
    dispatch({ type: "IMPORT_PLANTILLAS", plantillas: missing });
  }
}
