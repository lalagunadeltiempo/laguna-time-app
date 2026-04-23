import type { Action } from "./reducer";
import type { AppState } from "./types";
import { buildSeedSOPs } from "./seed-sops";
import { buildPersonalSeedData } from "./seed-personal";
import { buildEmpresaSeedProyectos } from "./seed-proyectos-empresa";
import { mondayKey, mesKey, mesesDeTrimestre } from "./semana-utils";

export const CURRENT_MIGRATION = 17;

type Dispatch = (action: Action) => void;

export function runMigrations(state: AppState, dispatch: Dispatch): void {
  const version = state._migrationVersion ?? 0;

  if (version < 10) {
    migrationSeedPersonal(state, dispatch);
    syncMissingSOPs(state, dispatch);
  }

  if (version < 11) {
    migrateContextoNotasToPasoNotas(state, dispatch);
  }

  if (version < 12) {
    seedEmpresaProyectos(state, dispatch);
  }

  if (version < 13) {
    migratePlanNivelAndObjetivos(state, dispatch);
  }

  if (version < 14) {
    migrateProyectoEstado(state, dispatch);
  }

  if (version < 15) {
    migrateProyectoEstadoV2(state, dispatch);
  }

  if (version < 16) {
    migrateSemanasYMeses(state, dispatch);
  }

  if (version < 17) {
    migrateSemanasActivasYTrimestreAMeses(state, dispatch);
  }

  if (version < CURRENT_MIGRATION) {
    dispatch({ type: "SET_MIGRATION_VERSION", version: CURRENT_MIGRATION });
  }
}

/**
 * Migración al modelo "planificación por unidades":
 *  - Si un entregable tiene fecha y no tiene semana asignada → ent.semana = lunes de esa fecha.
 *  - Si un resultado tiene fecha y no tiene semana asignada → res.semana = lunes.
 *  - Si un proyecto tiene trimestresActivos y no mesesActivos → deriva mesesActivos de las semanas/fechas existentes; fallback a los 3 meses de cada trimestre marcado.
 */
function migrateSemanasYMeses(state: AppState, dispatch: Dispatch): void {
  for (const ent of state.entregables) {
    if (ent.semana) continue;
    const src = ent.fechaInicio ?? ent.fechaLimite;
    const mk = mondayKey(src);
    if (mk) dispatch({ type: "SET_ENTREGABLE_SEMANA", id: ent.id, semana: mk });
  }
  for (const res of state.resultados) {
    if (res.semana) continue;
    const src = res.fechaInicio ?? res.fechaLimite;
    const mk = mondayKey(src);
    if (mk) dispatch({ type: "SET_RESULTADO_SEMANA", id: res.id, semana: mk });
  }
  for (const proj of state.proyectos) {
    if (proj.mesesActivos && proj.mesesActivos.length > 0) continue;
    const derivedMeses = new Set<string>();

    const resultadosDelProj = state.resultados.filter((r) => r.proyectoId === proj.id);
    const resIds = new Set(resultadosDelProj.map((r) => r.id));
    const entregablesDelProj = state.entregables.filter((e) => resIds.has(e.resultadoId));

    for (const r of resultadosDelProj) {
      const mk = r.semana ?? mondayKey(r.fechaInicio ?? r.fechaLimite);
      const m = mesKey(mk);
      if (m) derivedMeses.add(m);
    }
    for (const e of entregablesDelProj) {
      const mk = e.semana ?? mondayKey(e.fechaInicio ?? e.fechaLimite);
      const m = mesKey(mk);
      if (m) derivedMeses.add(m);
    }

    if (derivedMeses.size === 0 && proj.trimestresActivos && proj.trimestresActivos.length > 0) {
      for (const t of proj.trimestresActivos) {
        for (const m of mesesDeTrimestre(t)) derivedMeses.add(m);
      }
    }

    if (derivedMeses.size > 0) {
      dispatch({ type: "UPDATE_PROYECTO", id: proj.id, changes: { mesesActivos: [...derivedMeses].sort() } });
    }
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

function seedEmpresaProyectos(state: AppState, dispatch: Dispatch): void {
  const existingNames = new Set(state.proyectos.map((p) => p.nombre));
  const nuevos = buildEmpresaSeedProyectos().filter((p) => !existingNames.has(p.nombre));
  if (nuevos.length > 0) {
    dispatch({ type: "IMPORT_DATA", proyectos: nuevos, resultados: [], entregables: [] });
  }
}

function migratePlanNivelAndObjetivos(_state: AppState, _dispatch: Dispatch): void {
  // planNivel defaults to undefined (null) which is handled as legacy in views
  // objetivos defaults to [] via the state initializer / cloud load
  // Heuristic: entregables with fechaInicio on the 1st of a month → planNivel "mes", others → "dia"
  for (const ent of _state.entregables) {
    if (ent.fechaInicio && !ent.planNivel) {
      const day = parseInt(ent.fechaInicio.slice(8, 10), 10);
      const nivel = day === 1 ? "mes" : "dia";
      _dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { planNivel: nivel } });
    }
  }
}

/**
 * Migración v17:
 *  - Resultados con semanasActivas vacío: derivar de las semanas de sus entregables
 *    (o de resultado.semana si no hay entregables con semana).
 *  - Proyectos con trimestresActivos: mesesActivos ← union(mesesActivos, meses de esos trimestres).
 */
function migrateSemanasActivasYTrimestreAMeses(state: AppState, dispatch: Dispatch): void {
  for (const res of state.resultados) {
    if ((res.semanasActivas ?? []).length > 0) continue;
    const entregables = state.entregables.filter((e) => e.resultadoId === res.id);
    const semanas = new Set<string>();
    for (const e of entregables) {
      if (e.semana) semanas.add(e.semana);
    }
    if (semanas.size === 0 && res.semana) semanas.add(res.semana);
    if (semanas.size > 0) {
      dispatch({ type: "SET_RESULTADO_SEMANAS", id: res.id, semanas: [...semanas].sort() });
    }
  }

  for (const proj of state.proyectos) {
    const trimestres = proj.trimestresActivos ?? [];
    if (trimestres.length === 0) continue;
    const derivados = new Set<string>(proj.mesesActivos ?? []);
    for (const t of trimestres) for (const m of mesesDeTrimestre(t)) derivados.add(m);
    const next = [...derivados].sort();
    const prev = [...(proj.mesesActivos ?? [])].sort();
    if (next.length !== prev.length || next.some((m, i) => m !== prev[i])) {
      dispatch({ type: "UPDATE_PROYECTO", id: proj.id, changes: { mesesActivos: next } });
    }
  }
}

function migrateProyectoEstado(state: AppState, dispatch: Dispatch): void {
  for (const proj of state.proyectos) {
    if (!proj.estado) {
      dispatch({ type: "UPDATE_PROYECTO", id: proj.id, changes: { estado: "plan" } });
    }
  }
}

function migrateProyectoEstadoV2(state: AppState, dispatch: Dispatch): void {
  for (const proj of state.proyectos) {
    if ((proj.estado as string) === "activo") {
      const resIds = new Set(state.resultados.filter((r) => r.proyectoId === proj.id).map((r) => r.id));
      const entIds = state.entregables.filter((e) => resIds.has(e.resultadoId)).map((e) => e.id);
      const hasStartedWork = state.pasos.some((p) => entIds.includes(p.entregableId) && p.inicioTs);
      dispatch({ type: "UPDATE_PROYECTO", id: proj.id, changes: { estado: hasStartedWork ? "en_marcha" : "plan" } });
    }
  }
}

function migrateContextoNotasToPasoNotas(state: AppState, dispatch: Dispatch): void {
  for (const paso of state.pasos) {
    if (paso.contexto.notas && paso.contexto.notas.trim()) {
      const alreadyMigrated = (paso.notas ?? []).some((n) => n.texto === paso.contexto.notas);
      if (!alreadyMigrated) {
        dispatch({
          type: "ADD_NOTA",
          nivel: "paso",
          targetId: paso.id,
          nota: {
            id: `migrated-${paso.id}`,
            texto: paso.contexto.notas,
            autor: "Sistema",
            creadoTs: paso.inicioTs ?? new Date().toISOString(),
          },
        });
      }
    }
  }
}
