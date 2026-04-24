import type {
  AppState,
  Area,
  Paso,
  Entregable,
  Resultado,
  Proyecto,
  Nota,
  InboxItem,
  ContactoExterno,
  PlantillaProceso,
  PasoPlantilla,
  MiembroInfo,
  EjecucionSOP,
  AmbitoLabels,
  ActivityEntry,
  Objetivo,
  ReviewMark,
  DeletedTombstones,
  PlanConfig,
} from "./types";
import { PLAN_CONFIG_DEFAULT } from "./types";
import { minutosEfectivos } from "./duration";
import { toDateKey } from "./date-utils";
import { mesKey, mesesDeTrimestre, mondayKey } from "./semana-utils";

export type Action =
  | { type: "INIT"; state: AppState }
  | { type: "SET_AMBITO_LABELS"; labels: Partial<AmbitoLabels> }
  | { type: "ADD_PROYECTO"; payload: Proyecto }
  | { type: "ADD_RESULTADO"; payload: Resultado }
  | { type: "ADD_ENTREGABLE"; payload: Entregable }
  | { type: "START_PASO"; payload: Paso }
  | { type: "ADD_PASO"; payload: Paso }
  | { type: "ACTIVATE_PASO"; id: string }
  | { type: "UPDATE_PASO_CONTEXTO"; id: string; contexto: Paso["contexto"] }
  | { type: "UPDATE_PASO_IMPLICADOS"; id: string; implicados: Paso["implicados"] }
  | { type: "CLOSE_PASO"; payload: Paso }
  | { type: "DISCARD_PASO"; id: string }
  | { type: "RESCHEDULE_NEXT_PASO"; pasoId: string; newDate: string | null }
  | { type: "RENAME_PASO"; id: string; nombre: string }
  | { type: "UPDATE_PASO_TIMES"; id: string; inicioTs: string; finTs: string | null }
  | { type: "DELETE_PASO"; id: string }
  | { type: "RENAME_ENTREGABLE"; id: string; nombre: string }
  | { type: "UPDATE_ENTREGABLE"; id: string; changes: Partial<Pick<Entregable, "nombre" | "responsable" | "tipo" | "plantillaId" | "diasEstimados" | "estado" | "fechaLimite" | "fechaInicio" | "planNivel" | "semana">> }
  | { type: "OCULTAR_ENTREGABLE_HASTA"; id: string; hasta: string | null }
  // --- Sesiones del entregable (cronómetro al nivel de entregable) ---
  | { type: "START_ENTREGABLE"; id: string; ts?: string }
  | { type: "PAUSE_ENTREGABLE_SESION"; id: string; ts?: string }
  | { type: "RESUME_ENTREGABLE_SESION"; id: string; ts?: string }
  | { type: "END_ENTREGABLE_SESION"; id: string; ts?: string }
  | { type: "FINISH_ENTREGABLE"; id: string; ts?: string }
  | { type: "DISCARD_ENTREGABLE_SESION"; id: string }
  | { type: "APPEND_SESION_ENTREGABLE"; id: string; inicioTs: string; finTs: string }
  | { type: "UPDATE_ENTREGABLE_CONTEXTO"; id: string; contexto: Entregable["contexto"] }
  | { type: "UPDATE_ENTREGABLE_IMPLICADOS"; id: string; implicados: Entregable["implicados"] }
  | { type: "SET_ENTREGABLE_PLAN_INICIO"; id: string; ts: string | null }
  | { type: "TOGGLE_ENTREGABLE_DIA"; id: string; dateKey: string }
  | { type: "SET_ENTREGABLE_DIAS"; id: string; dias: string[] }
  // --- Checklist de pasos ---
  | { type: "CHECK_PASO"; id: string; ts?: string }
  | { type: "UNCHECK_PASO"; id: string }
  | { type: "SET_ENTREGABLE_SEMANA"; id: string; semana: string | null }
  | { type: "SET_RESULTADO_SEMANA"; id: string; semana: string | null }
  | { type: "TOGGLE_PROYECTO_MES"; id: string; mes: string }
  | { type: "TOGGLE_RESULTADO_MES"; id: string; mes: string }
  | { type: "SET_PLAN_INICIO"; pasoId: string; ts: string | null }
  | { type: "RESTORE_PASO"; id: string }
  | { type: "CANCEL_INICIO_PASO"; id: string }
  | { type: "DELETE_ENTREGABLE"; id: string }
  | { type: "PROMOTE_PASO_TO_ENTREGABLE"; pasoId: string; nuevoEntregableId: string }
  | { type: "PROMOTE_ENTREGABLE_TO_RESULTADO"; entregableId: string; nuevoResultadoId: string }
  | { type: "MOVE_RESULTADO"; resultadoId: string; nuevoProyectoId: string }
  | { type: "MOVE_ENTREGABLE"; entregableId: string; nuevoResultadoId: string }
  | { type: "MOVE_PASO"; pasoId: string; nuevoEntregableId: string }
  | { type: "PROMOTE_RESULTADO"; resultadoId: string; area: Proyecto["area"]; nuevoProyectoId: string }
  | { type: "DELETE_RESULTADO"; id: string }
  | { type: "RENAME_RESULTADO"; id: string; nombre: string }
  | { type: "UPDATE_RESULTADO"; id: string; changes: Partial<Pick<Resultado, "nombre" | "descripcion" | "semana" | "fechaLimite" | "fechaInicio" | "diasEstimados" | "planNivel" | "responsable" | "semanasExplicitas" | "mesesActivos" | "semanasActivas">> }
  | { type: "TOGGLE_RESULTADO_SEMANA"; id: string; semana: string }
  | { type: "TOGGLE_RESULTADO_SEMANA_ACTIVA"; id: string; semana: string }
  | { type: "SET_RESULTADO_SEMANAS"; id: string; semanas: string[] }
  | { type: "DELETE_PROYECTO"; id: string }
  | { type: "RENAME_PROYECTO"; id: string; nombre: string }
  | { type: "UPDATE_PROYECTO"; id: string; changes: Partial<Pick<Proyecto, "nombre" | "descripcion" | "area" | "fechaInicio" | "fechaLimite" | "planNivel" | "tipo" | "estado" | "responsable" | "trimestresActivos" | "semanasExplicitas" | "mesesActivos">> }
  | { type: "SET_PROYECTO_TRIMESTRES"; id: string; trimestres: string[] }
  | { type: "TOGGLE_PROYECTO_SEMANA"; id: string; semana: string }
  | { type: "IMPORT_DATA"; proyectos: Proyecto[]; resultados: Resultado[]; entregables: Entregable[] }
  | { type: "ADD_INBOX"; payload: InboxItem }
  | { type: "PROCESS_INBOX"; id: string }
  | { type: "ADD_CONTACTO"; payload: ContactoExterno }
  | { type: "IMPORT_PLANTILLAS"; plantillas: PlantillaProceso[] }
  | { type: "ADD_PLANTILLA"; payload: PlantillaProceso }
  | { type: "DELETE_PLANTILLA"; id: string }
  | { type: "UPDATE_PLANTILLA"; id: string; changes: Partial<Pick<PlantillaProceso, "nombre" | "area" | "objetivo" | "disparador" | "programacion" | "excepciones" | "responsableDefault" | "pasos" | "herramientas" | "dependeDeIds" | "proyectoId" | "resultadoId">> }
  | { type: "ADD_MIEMBRO"; payload: MiembroInfo }
  | { type: "UPDATE_MIEMBRO"; id: string; changes: Partial<Pick<MiembroInfo, "nombre" | "rol" | "color" | "capacidadDiaria" | "diasLaborables" | "diasNoDisponibles">> }
  | { type: "DELETE_MIEMBRO"; id: string }
  | { type: "UPDATE_PLAN_CONFIG"; changes: Partial<PlanConfig> }
  | { type: "ADD_EJECUCION"; payload: EjecucionSOP }
  | { type: "UPDATE_EJECUCION"; id: string; changes: Partial<Pick<EjecucionSOP, "entregableId" | "pasosLanzados" | "estado">> }
  | { type: "TOGGLE_PASO_EJECUCION"; ejecucionId: string; pasoId: string }
  | { type: "COMPLETE_EJECUCION"; id: string }
  | { type: "REOPEN_PASO"; id: string }
  | { type: "PAUSE_PASO"; id: string }
  | { type: "RESUME_PASO"; id: string }
  | { type: "SET_MIGRATION_VERSION"; version: number }
  | { type: "REORDER_PROYECTO"; id: string; direction: "up" | "down" }
  | { type: "REORDER_RESULTADO"; id: string; direction: "up" | "down" }
  | { type: "REORDER_ENTREGABLE"; id: string; direction: "up" | "down" }
  | { type: "REORDER_PLANTILLA"; id: string; direction: "up" | "down" }
  | { type: "UPDATE_PASO_PLANTILLA"; plantillaId: string; pasoId: string; changes: Partial<PlantillaProceso["pasos"][number]> }
  | { type: "DELETE_PASO_PLANTILLA"; plantillaId: string; pasoId: string }
  | { type: "ADD_PASO_PLANTILLA"; plantillaId: string; paso: PlantillaProceso["pasos"][number] }
  | { type: "REORDER_PASO"; id: string; direction: "up" | "down" }
  | { type: "ADD_NOTA"; nivel: "paso" | "entregable" | "resultado" | "proyecto" | "plantilla"; targetId: string; nota: Nota }
  | { type: "DELETE_NOTA"; nivel: "paso" | "entregable" | "resultado" | "proyecto" | "plantilla"; targetId: string; notaId: string }
  | { type: "UPDATE_NOTA"; nivel: "paso" | "entregable" | "resultado" | "proyecto" | "plantilla"; targetId: string; notaId: string; texto: string }
  | { type: "CONVERT_ENTREGABLE_TO_SOP"; entregableId: string }
  | { type: "SYNC_ENTREGABLE_TO_PLANTILLA"; entregableId: string }
  | { type: "LOG_ACTIVITY"; entry: ActivityEntry }
  | { type: "MATERIALIZE_SOP"; plantillaId: string; area: Area; responsable: string; currentUser: string; dateKey: string; ids: { resultado: string; entregable: string; paso: string; proyecto: string }; proyectoId?: string; resultadoId?: string; autoStart?: boolean; customName?: string }
  | { type: "ADD_OBJETIVO"; payload: Objetivo }
  | { type: "UPDATE_OBJETIVO"; id: string; changes: Partial<Pick<Objetivo, "texto" | "completado" | "area">> }
  | { type: "DELETE_OBJETIVO"; id: string }
  | { type: "SET_REVIEW"; nivel: "proyecto" | "resultado" | "entregable" | "plantilla"; targetId: string; review: ReviewMark }
  | { type: "SET_MTP"; mtp: string };

function swapSiblings<T extends { id: string }>(
  arr: T[],
  id: string,
  direction: "up" | "down",
  siblingIds: string[],
): T[] {
  const posInSiblings = siblingIds.indexOf(id);
  if (posInSiblings === -1) return arr;
  const targetPos = direction === "up" ? posInSiblings - 1 : posInSiblings + 1;
  if (targetPos < 0 || targetPos >= siblingIds.length) return arr;
  const targetId = siblingIds[targetPos];
  const idx1 = arr.findIndex((x) => x.id === id);
  const idx2 = arr.findIndex((x) => x.id === targetId);
  if (idx1 === -1 || idx2 === -1) return arr;
  const copy = [...arr];
  [copy[idx1], copy[idx2]] = [copy[idx2], copy[idx1]];
  return copy;
}

function entregableIdsDe(state: AppState, resultadoIds: Set<string>): Set<string> {
  return new Set(
    state.entregables.filter((e) => resultadoIds.has(e.resultadoId)).map((e) => e.id),
  );
}

function clearPasosActivos(state: AppState, entregableIds: Set<string>): string[] {
  return state.pasosActivos.filter((id) => {
    const paso = state.pasos.find((p) => p.id === id);
    return !paso || !entregableIds.has(paso.entregableId);
  });
}

const EMPTY_DELETED: DeletedTombstones = { proyectos: [], resultados: [], entregables: [], pasos: [], plantillas: [] };

function addTombstones(
  existing: DeletedTombstones | undefined,
  additions: Partial<Record<keyof DeletedTombstones, string[]>>,
): DeletedTombstones {
  const base = existing ?? EMPTY_DELETED;
  const result = { ...base };
  for (const key of Object.keys(additions) as (keyof DeletedTombstones)[]) {
    const ids = additions[key];
    if (ids?.length) result[key] = [...base[key], ...ids];
  }
  return result;
}

function autoTransitionToEnMarcha(s: AppState, entregableId: string): AppState {
  const ent = s.entregables.find((e) => e.id === entregableId);
  if (!ent) return s;
  const res = s.resultados.find((r) => r.id === ent.resultadoId);
  if (!res) return s;
  const proj = s.proyectos.find((p) => p.id === res.proyectoId);
  if (!proj || (proj.estado !== "plan" && proj.estado !== undefined)) return s;
  return { ...s, proyectos: s.proyectos.map((p) => p.id === proj.id ? { ...p, estado: "en_marcha" as const } : p) };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "INIT":
      return action.state;

    case "SET_AMBITO_LABELS":
      return { ...state, ambitoLabels: { ...state.ambitoLabels, ...action.labels } };

    // --- Crear ---
    case "ADD_PROYECTO":
      return { ...state, proyectos: [...state.proyectos, action.payload] };
    case "ADD_RESULTADO":
      return { ...state, resultados: [...state.resultados, action.payload] };
    case "ADD_ENTREGABLE":
      return { ...state, entregables: [...state.entregables, action.payload] };

    // --- Pasos ---
    case "START_PASO": {
      if (!state.entregables.some((e) => e.id === action.payload.entregableId)) return state;
      if (state.pasos.some((p) => p.id === action.payload.id)) return state;
      const today = toDateKey(new Date());
      let newState: AppState = {
        ...state,
        pasos: [...state.pasos, action.payload],
        entregables: state.entregables.map((e) =>
          e.id === action.payload.entregableId && (e.estado === "a_futuro" || e.estado === "planificado")
            ? { ...e, estado: "en_proceso" as const,
                fechaInicio: e.fechaInicio ?? today,
                planNivel: e.planNivel ?? "dia" }
            : e
        ),
        pasosActivos: state.pasosActivos.includes(action.payload.id)
          ? state.pasosActivos
          : [...state.pasosActivos, action.payload.id],
      };
      newState = autoTransitionToEnMarcha(newState, action.payload.entregableId);
      return newState;
    }

    case "ADD_PASO":
      return { ...state, pasos: [...state.pasos, action.payload] };

    case "ACTIVATE_PASO": {
      const paso = state.pasos.find((p) => p.id === action.id);
      if (!paso) return state;
      const todayAct = toDateKey(new Date());
      let newState: AppState = {
        ...state,
        pasos: state.pasos.map((p) => p.id === action.id ? { ...p, inicioTs: new Date().toISOString(), planInicioTs: null } : p),
        entregables: state.entregables.map((e) =>
          e.id === paso.entregableId && !e.fechaInicio
            ? { ...e, fechaInicio: todayAct, planNivel: e.planNivel ?? ("dia" as const),
                estado: (e.estado === "a_futuro" || e.estado === "planificado") ? "en_proceso" as const : e.estado }
            : e
        ),
        pasosActivos: state.pasosActivos.includes(action.id)
          ? state.pasosActivos
          : [...state.pasosActivos, action.id],
      };
      newState = autoTransitionToEnMarcha(newState, paso.entregableId);
      return newState;
    }

    case "REOPEN_PASO": {
      const reopenPaso = state.pasos.find((p) => p.id === action.id);
      if (!reopenPaso || !reopenPaso.finTs) return state;
      const now = new Date().toISOString();
      return {
        ...state,
        pasos: state.pasos.map((p) =>
          p.id === action.id
            ? {
                ...p,
                finTs: null,
                estado: "",
                siguientePaso: null,
                pausas: [...p.pausas, { pauseTs: p.finTs!, resumeTs: now }],
              }
            : p
        ),
        entregables: state.entregables.map((e) =>
          e.id === reopenPaso.entregableId
            ? { ...e, diasHechos: Math.max(0, e.diasHechos - 1) }
            : e
        ),
        pasosActivos: state.pasosActivos.includes(action.id)
          ? state.pasosActivos
          : [...state.pasosActivos, action.id],
      };
    }

    case "PAUSE_PASO":
      return {
        ...state,
        pasos: state.pasos.map((p) =>
          p.id === action.id
            ? { ...p, pausas: [...p.pausas, { pauseTs: new Date().toISOString(), resumeTs: null }] }
            : p
        ),
      };

    case "RESUME_PASO":
      return {
        ...state,
        pasos: state.pasos.map((p) =>
          p.id === action.id
            ? {
                ...p,
                pausas: p.pausas.map((pause, i) =>
                  i === p.pausas.length - 1 && !pause.resumeTs
                    ? { ...pause, resumeTs: new Date().toISOString() }
                    : pause
                ),
              }
            : p
        ),
      };

    case "UPDATE_PASO_CONTEXTO":
      return { ...state, pasos: state.pasos.map((p) => p.id === action.id ? { ...p, contexto: action.contexto } : p) };

    case "UPDATE_PASO_IMPLICADOS":
      return { ...state, pasos: state.pasos.map((p) => p.id === action.id ? { ...p, implicados: action.implicados } : p) };

    case "CLOSE_PASO": {
      const updated = action.payload;
      if (!state.pasos.some((p) => p.id === updated.id)) return state;
      const alreadyClosed = state.pasos.find((p) => p.id === updated.id)?.finTs;
      const terminado = updated.siguientePaso?.tipo === "fin";
      let newState = {
        ...state,
        pasos: state.pasos.map((p) => (p.id === updated.id ? updated : p)),
        pasosActivos: state.pasosActivos.filter((id) => id !== updated.id),
        entregables: state.entregables.map((e) => {
          if (e.id !== updated.entregableId) return e;
          const nuevoEstado: Entregable["estado"] = terminado ? "hecho" : (e.estado === "hecho" ? "hecho" : "en_proceso");
          return { ...e, diasHechos: alreadyClosed ? e.diasHechos : e.diasHechos + 1, estado: nuevoEstado };
        }),
      };
      newState = autoTransitionToEnMarcha(newState, updated.entregableId);
      return newState;
    }

    case "RENAME_PASO":
      return { ...state, pasos: state.pasos.map((p) => p.id === action.id ? { ...p, nombre: action.nombre } : p) };

    case "UPDATE_PASO_TIMES": {
      const { id, inicioTs, finTs } = action;
      if (finTs && finTs <= inicioTs) return state;
      let newState = { ...state, pasos: state.pasos.map((p) => p.id === id ? { ...p, inicioTs, finTs } : p) };
      if (inicioTs) {
        const paso = state.pasos.find((p) => p.id === id);
        if (paso) newState = autoTransitionToEnMarcha(newState, paso.entregableId);
      }
      return newState;
    }

    case "DELETE_PASO":
      return {
        ...state,
        pasos: state.pasos.filter((p) => p.id !== action.id),
        pasosActivos: state.pasosActivos.filter((id) => id !== action.id),
        ejecuciones: state.ejecuciones.map((ej) => {
          if (!ej.pasosLanzados) return ej;
          const entries = Object.entries(ej.pasosLanzados).filter(([, v]) => v !== action.id);
          if (entries.length === Object.keys(ej.pasosLanzados).length) return ej;
          return { ...ej, pasosLanzados: Object.fromEntries(entries) };
        }),
        deleted: addTombstones(state.deleted, { pasos: [action.id] }),
      };

    case "RESCHEDULE_NEXT_PASO": {
      const { pasoId, newDate } = action;
      return {
        ...state,
        pasos: state.pasos.map((p) => {
          if (p.id !== pasoId || !p.siguientePaso || p.siguientePaso.tipo !== "continuar") return p;
          if (!newDate) return { ...p, siguientePaso: { tipo: "fin" as const } };
          return { ...p, siguientePaso: { ...p.siguientePaso, fechaProgramada: newDate, cuando: "otro" } };
        }),
      };
    }

    case "DISCARD_PASO": {
      if (!state.pasos.find((p) => p.id === action.id)) return state;
      return {
        ...state,
        pasos: state.pasos.map((p) => p.id === action.id ? { ...p, finTs: new Date().toISOString(), estado: "descartado", siguientePaso: { tipo: "fin" as const } } : p),
        pasosActivos: state.pasosActivos.filter((id) => id !== action.id),
        ejecuciones: state.ejecuciones.map((ej) => {
          if (!ej.pasosLanzados) return ej;
          const entries = Object.entries(ej.pasosLanzados).filter(([, v]) => v !== action.id);
          if (entries.length === Object.keys(ej.pasosLanzados).length) return ej;
          return { ...ej, pasosLanzados: Object.fromEntries(entries) };
        }),
      };
    }

    // --- Entregables ---
    case "RENAME_ENTREGABLE":
      return { ...state, entregables: state.entregables.map((e) => e.id === action.id ? { ...e, nombre: action.nombre } : e) };

    case "UPDATE_ENTREGABLE": {
      const newState = { ...state, entregables: state.entregables.map((e) => e.id === action.id ? { ...e, ...action.changes } : e) };
      if (action.changes.estado === "hecho" || action.changes.estado === "cancelada") {
        newState.pasosActivos = clearPasosActivos(state, new Set([action.id]));
      }
      return newState;
    }

    case "OCULTAR_ENTREGABLE_HASTA": {
      return {
        ...state,
        entregables: state.entregables.map((e) => e.id === action.id ? { ...e, ocultoHasta: action.hasta } : e),
      };
    }

    // --- Sesiones del entregable ---
    case "START_ENTREGABLE": {
      const ts = action.ts ?? new Date().toISOString();
      return {
        ...state,
        entregables: state.entregables.map((e) => {
          if (e.id !== action.id) return e;
          const sesiones = Array.isArray(e.sesiones) ? e.sesiones : [];
          const abierta = sesiones.find((s) => s.finTs === null);
          if (abierta) {
            return { ...e, estado: "en_proceso", ocultoHasta: null };
          }
          return {
            ...e,
            estado: "en_proceso",
            ocultoHasta: null,
            sesiones: [...sesiones, { inicioTs: ts, finTs: null, pausas: [] }],
          };
        }),
      };
    }

    case "PAUSE_ENTREGABLE_SESION": {
      const ts = action.ts ?? new Date().toISOString();
      return {
        ...state,
        entregables: state.entregables.map((e) => {
          if (e.id !== action.id) return e;
          const sesiones = Array.isArray(e.sesiones) ? [...e.sesiones] : [];
          const idx = sesiones.map((s, i) => ({ s, i })).reverse().find(({ s }) => s.finTs === null)?.i;
          if (idx === undefined) return e;
          const ses = sesiones[idx];
          const pausas = Array.isArray(ses.pausas) ? [...ses.pausas] : [];
          if (!pausas.find((p) => p.resumeTs === null)) {
            pausas.push({ pauseTs: ts, resumeTs: null });
          }
          sesiones[idx] = { ...ses, pausas };
          return { ...e, sesiones };
        }),
      };
    }

    case "RESUME_ENTREGABLE_SESION": {
      const ts = action.ts ?? new Date().toISOString();
      return {
        ...state,
        entregables: state.entregables.map((e) => {
          if (e.id !== action.id) return e;
          const sesiones = Array.isArray(e.sesiones) ? [...e.sesiones] : [];
          const idx = sesiones.map((s, i) => ({ s, i })).reverse().find(({ s }) => s.finTs === null)?.i;
          if (idx === undefined) return e;
          const ses = sesiones[idx];
          const pausas = Array.isArray(ses.pausas) ? ses.pausas.map((p) => p.resumeTs === null ? { ...p, resumeTs: ts } : p) : [];
          sesiones[idx] = { ...ses, pausas };
          return { ...e, sesiones };
        }),
      };
    }

    case "END_ENTREGABLE_SESION": {
      const ts = action.ts ?? new Date().toISOString();
      return {
        ...state,
        entregables: state.entregables.map((e) => {
          if (e.id !== action.id) return e;
          const sesiones = Array.isArray(e.sesiones) ? [...e.sesiones] : [];
          const idx = sesiones.map((s, i) => ({ s, i })).reverse().find(({ s }) => s.finTs === null)?.i;
          if (idx === undefined) return e;
          const ses = sesiones[idx];
          const pausas = Array.isArray(ses.pausas) ? ses.pausas.map((p) => p.resumeTs === null ? { ...p, resumeTs: ts } : p) : [];
          sesiones[idx] = { ...ses, finTs: ts, pausas };
          return { ...e, sesiones };
        }),
      };
    }

    case "FINISH_ENTREGABLE": {
      const ts = action.ts ?? new Date().toISOString();
      return {
        ...state,
        entregables: state.entregables.map((e) => {
          if (e.id !== action.id) return e;
          const sesiones = Array.isArray(e.sesiones) ? [...e.sesiones] : [];
          const idx = sesiones.map((s, i) => ({ s, i })).reverse().find(({ s }) => s.finTs === null)?.i;
          if (idx !== undefined) {
            const ses = sesiones[idx];
            const pausas = Array.isArray(ses.pausas) ? ses.pausas.map((p) => p.resumeTs === null ? { ...p, resumeTs: ts } : p) : [];
            sesiones[idx] = { ...ses, finTs: ts, pausas };
          }
          return { ...e, estado: "hecho", sesiones, ocultoHasta: null };
        }),
      };
    }

    case "DISCARD_ENTREGABLE_SESION": {
      return {
        ...state,
        entregables: state.entregables.map((e) => {
          if (e.id !== action.id) return e;
          const sesiones = Array.isArray(e.sesiones) ? [...e.sesiones] : [];
          const idx = sesiones.map((s, i) => ({ s, i })).reverse().find(({ s }) => s.finTs === null)?.i;
          if (idx === undefined) return e;
          sesiones.splice(idx, 1);
          return { ...e, sesiones };
        }),
      };
    }

    case "APPEND_SESION_ENTREGABLE": {
      const { id, inicioTs, finTs } = action;
      if (!inicioTs || !finTs) return state;
      if (new Date(finTs).getTime() <= new Date(inicioTs).getTime()) return state;
      return {
        ...state,
        entregables: state.entregables.map((e) => {
          if (e.id !== id) return e;
          const sesiones = Array.isArray(e.sesiones) ? [...e.sesiones] : [];
          sesiones.push({ inicioTs, finTs, pausas: [] });
          // Ordenamos por inicioTs ascendente para mantener coherencia histórica.
          sesiones.sort((a, b) => a.inicioTs.localeCompare(b.inicioTs));
          return { ...e, sesiones };
        }),
      };
    }

    case "UPDATE_ENTREGABLE_CONTEXTO":
      return {
        ...state,
        entregables: state.entregables.map((e) => e.id === action.id ? { ...e, contexto: action.contexto } : e),
      };

    case "UPDATE_ENTREGABLE_IMPLICADOS":
      return {
        ...state,
        entregables: state.entregables.map((e) => e.id === action.id ? { ...e, implicados: action.implicados } : e),
      };

    case "SET_ENTREGABLE_PLAN_INICIO":
      return {
        ...state,
        entregables: state.entregables.map((e) => e.id === action.id ? { ...e, planInicioTs: action.ts } : e),
      };

    case "TOGGLE_ENTREGABLE_DIA": {
      return {
        ...state,
        entregables: state.entregables.map((e) => {
          if (e.id !== action.id) return e;
          const current = Array.isArray(e.diasPlanificados) ? e.diasPlanificados : [];
          const has = current.includes(action.dateKey);
          const nextDias = has
            ? current.filter((k) => k !== action.dateKey)
            : [...current, action.dateKey].sort();
          const newSemana = !e.semana && !has ? mondayKey(action.dateKey) : e.semana;
          return { ...e, diasPlanificados: nextDias, semana: newSemana };
        }),
      };
    }

    case "SET_ENTREGABLE_DIAS": {
      const sorted = [...new Set(action.dias)].sort();
      return {
        ...state,
        entregables: state.entregables.map((e) => {
          if (e.id !== action.id) return e;
          const newSemana = !e.semana && sorted.length > 0 ? mondayKey(sorted[0]) : e.semana;
          return { ...e, diasPlanificados: sorted, semana: newSemana };
        }),
      };
    }

    // --- Checklist de pasos ---
    case "CHECK_PASO": {
      const ts = action.ts ?? new Date().toISOString();
      const paso = state.pasos.find((p) => p.id === action.id);
      if (!paso) return state;

      // Calcular inicioTs "inteligente" si el paso no lo tiene:
      // candidato = max(últimos finTs de hermanos hechos, inicioTs sesión activa del entregable)
      // Nunca futuro respecto a ts.
      let inicioCalc: string | null = paso.inicioTs ?? null;
      if (!inicioCalc) {
        const hermanos = state.pasos.filter(
          (p) => p.entregableId === paso.entregableId && p.id !== paso.id && (p.estado === "hecho" || !!p.finTs) && !!p.finTs,
        );
        let candidato: string | null = null;
        for (const h of hermanos) {
          if (h.finTs && h.finTs <= ts && (!candidato || h.finTs > candidato)) candidato = h.finTs;
        }
        const entregable = state.entregables.find((e) => e.id === paso.entregableId);
        const sesionAbierta = entregable?.sesiones?.find((s) => s.finTs === null);
        if (sesionAbierta && sesionAbierta.inicioTs <= ts) {
          if (!candidato || sesionAbierta.inicioTs > candidato) candidato = sesionAbierta.inicioTs;
        }
        inicioCalc = candidato ?? ts;
      }

      return {
        ...state,
        pasos: state.pasos.map((p) => p.id === action.id
          ? { ...p, estado: "hecho" as const, finTs: ts, inicioTs: inicioCalc }
          : p),
      };
    }

    case "UNCHECK_PASO": {
      return {
        ...state,
        pasos: state.pasos.map((p) => p.id === action.id
          ? { ...p, estado: "pendiente" as const, finTs: null, inicioTs: null }
          : p),
      };
    }

    case "DELETE_ENTREGABLE": {
      const eIds = new Set([action.id]);
      const cascadedPasos = state.pasos.filter((p) => p.entregableId === action.id).map((p) => p.id);
      return {
        ...state,
        entregables: state.entregables.filter((e) => e.id !== action.id),
        pasos: state.pasos.filter((p) => p.entregableId !== action.id),
        pasosActivos: clearPasosActivos(state, eIds),
        ejecuciones: state.ejecuciones.filter((ej) => ej.entregableId !== action.id),
        deleted: addTombstones(state.deleted, { entregables: [action.id], pasos: cascadedPasos }),
      };
    }

    // --- Promociones ---
    case "PROMOTE_PASO_TO_ENTREGABLE": {
      const paso = state.pasos.find((p) => p.id === action.pasoId);
      if (!paso) return state;
      const old = state.entregables.find((e) => e.id === paso.entregableId);
      if (!old) return state;
      const nuevo: Entregable = {
        id: action.nuevoEntregableId, nombre: paso.nombre, resultadoId: old.resultadoId,
        tipo: "raw", plantillaId: null,
        diasEstimados: 3, diasHechos: 1, esDiaria: false, responsable: old.responsable,
        estado: "en_proceso", creado: new Date().toISOString(),
        semana: null, fechaLimite: null, fechaInicio: null,
      };
      return {
        ...state,
        entregables: [...state.entregables, nuevo],
        pasos: state.pasos.map((p) => p.id === action.pasoId ? { ...p, entregableId: action.nuevoEntregableId } : p),
      };
    }

    case "PROMOTE_ENTREGABLE_TO_RESULTADO": {
      const ent = state.entregables.find((e) => e.id === action.entregableId);
      if (!ent) return state;
      const oldRes = state.resultados.find((r) => r.id === ent.resultadoId);
      if (!oldRes) return state;
      const nuevo: Resultado = { id: action.nuevoResultadoId, nombre: ent.nombre, descripcion: null, proyectoId: oldRes.proyectoId, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null };
      const updatedEntregables = state.entregables.map((e) => e.id === action.entregableId ? { ...e, resultadoId: action.nuevoResultadoId } : e);
      const oldResStillHasChildren = updatedEntregables.some((e) => e.resultadoId === oldRes.id);
      return {
        ...state,
        resultados: oldResStillHasChildren
          ? [...state.resultados, nuevo]
          : [...state.resultados.filter((r) => r.id !== oldRes.id), nuevo],
        entregables: updatedEntregables,
      };
    }

    // --- Resultados ---
    case "MOVE_RESULTADO":
      if (!state.proyectos.some((p) => p.id === action.nuevoProyectoId)) return state;
      return { ...state, resultados: state.resultados.map((r) => r.id === action.resultadoId ? { ...r, proyectoId: action.nuevoProyectoId } : r) };

    case "MOVE_ENTREGABLE":
      if (!state.resultados.some((r) => r.id === action.nuevoResultadoId)) return state;
      return { ...state, entregables: state.entregables.map((e) => e.id === action.entregableId ? { ...e, resultadoId: action.nuevoResultadoId } : e) };

    case "MOVE_PASO": {
      if (!state.entregables.some((e) => e.id === action.nuevoEntregableId)) return state;
      const paso = state.pasos.find((p) => p.id === action.pasoId);
      if (!paso || paso.entregableId === action.nuevoEntregableId) return state;
      return { ...state, pasos: state.pasos.map((p) => p.id === action.pasoId ? { ...p, entregableId: action.nuevoEntregableId } : p) };
    }

    case "PROMOTE_RESULTADO": {
      const res = state.resultados.find((r) => r.id === action.resultadoId);
      if (!res) return state;
      const proj: Proyecto = { id: action.nuevoProyectoId, nombre: res.nombre, descripcion: null, area: action.area, creado: new Date().toISOString(), fechaInicio: null };
      return {
        ...state,
        proyectos: [...state.proyectos, proj],
        resultados: state.resultados.map((r) => r.id === action.resultadoId ? { ...r, proyectoId: action.nuevoProyectoId } : r),
      };
    }

    case "RENAME_RESULTADO":
      return { ...state, resultados: state.resultados.map((r) => r.id === action.id ? { ...r, nombre: action.nombre } : r) };

    case "UPDATE_RESULTADO":
      return { ...state, resultados: state.resultados.map((r) => r.id === action.id ? { ...r, ...action.changes } : r) };

    case "DELETE_RESULTADO": {
      const eIds = new Set(state.entregables.filter((e) => e.resultadoId === action.id).map((e) => e.id));
      const cascadedPasos = state.pasos.filter((p) => eIds.has(p.entregableId)).map((p) => p.id);
      return {
        ...state,
        resultados: state.resultados.filter((r) => r.id !== action.id),
        entregables: state.entregables.filter((e) => e.resultadoId !== action.id),
        pasos: state.pasos.filter((p) => !eIds.has(p.entregableId)),
        pasosActivos: clearPasosActivos(state, eIds),
        ejecuciones: state.ejecuciones.filter((ej) => !ej.entregableId || !eIds.has(ej.entregableId)),
        plantillas: state.plantillas.map((pl) => pl.resultadoId === action.id ? { ...pl, resultadoId: null } : pl),
        deleted: addTombstones(state.deleted, { resultados: [action.id], entregables: [...eIds], pasos: cascadedPasos }),
      };
    }

    // --- Proyectos ---
    case "RENAME_PROYECTO":
      return { ...state, proyectos: state.proyectos.map((p) => p.id === action.id ? { ...p, nombre: action.nombre } : p) };

    case "UPDATE_PROYECTO":
      return { ...state, proyectos: state.proyectos.map((p) => p.id === action.id ? { ...p, ...action.changes } : p) };

    case "DELETE_PROYECTO": {
      const rIds = new Set(state.resultados.filter((r) => r.proyectoId === action.id).map((r) => r.id));
      const eIds = entregableIdsDe(state, rIds);
      const cascadedPasos = state.pasos.filter((p) => eIds.has(p.entregableId)).map((p) => p.id);
      return {
        ...state,
        proyectos: state.proyectos.filter((p) => p.id !== action.id),
        resultados: state.resultados.filter((r) => r.proyectoId !== action.id),
        entregables: state.entregables.filter((e) => !rIds.has(e.resultadoId)),
        pasos: state.pasos.filter((p) => !eIds.has(p.entregableId)),
        pasosActivos: clearPasosActivos(state, eIds),
        ejecuciones: state.ejecuciones.filter((ej) => !ej.entregableId || !eIds.has(ej.entregableId)),
        plantillas: state.plantillas.map((pl) =>
          pl.proyectoId === action.id ? { ...pl, proyectoId: null, resultadoId: null } : pl
        ),
        deleted: addTombstones(state.deleted, { proyectos: [action.id], resultados: [...rIds], entregables: [...eIds], pasos: cascadedPasos }),
      };
    }

    // --- Importar / Inbox / Contactos ---
    case "IMPORT_DATA": {
      const existingProjIds = new Set(state.proyectos.map((p) => p.id));
      const existingResIds = new Set(state.resultados.map((r) => r.id));
      const existingEntIds = new Set(state.entregables.map((e) => e.id));
      return {
        ...state,
        proyectos: [...state.proyectos, ...action.proyectos.filter((p) => !existingProjIds.has(p.id))],
        resultados: [...state.resultados, ...action.resultados.filter((r) => !existingResIds.has(r.id))],
        entregables: [...state.entregables, ...action.entregables.filter((e) => !existingEntIds.has(e.id))],
      };
    }

    case "ADD_INBOX":
      return { ...state, inbox: [...state.inbox, action.payload] };

    case "PROCESS_INBOX":
      return { ...state, inbox: state.inbox.map((i) => i.id === action.id ? { ...i, procesado: true } : i) };

    case "ADD_CONTACTO":
      return { ...state, contactos: [...state.contactos, action.payload] };

    // --- Plantillas ---
    case "IMPORT_PLANTILLAS":
      return { ...state, plantillas: [...state.plantillas, ...action.plantillas] };

    case "ADD_PLANTILLA":
      return { ...state, plantillas: [...state.plantillas, action.payload] };

    case "DELETE_PLANTILLA":
      return {
        ...state,
        plantillas: state.plantillas.filter((p) => p.id !== action.id),
        entregables: state.entregables.map((e) =>
          e.plantillaId === action.id ? { ...e, plantillaId: null, tipo: e.tipo === "sop" ? "raw" as const : e.tipo } : e,
        ),
        ejecuciones: state.ejecuciones.filter((ej) => ej.plantillaId !== action.id),
        deleted: addTombstones(state.deleted, { plantillas: [action.id] }),
      };

    case "UPDATE_PLANTILLA":
      return { ...state, plantillas: state.plantillas.map((p) => p.id === action.id ? { ...p, ...action.changes } : p) };

    case "UPDATE_PASO_PLANTILLA":
      return { ...state, plantillas: state.plantillas.map((pl) =>
        pl.id === action.plantillaId
          ? { ...pl, pasos: pl.pasos.map((p) => p.id === action.pasoId ? { ...p, ...action.changes } : p) }
          : pl
      )};

    case "DELETE_PASO_PLANTILLA":
      return { ...state, plantillas: state.plantillas.map((pl) =>
        pl.id === action.plantillaId
          ? { ...pl, pasos: pl.pasos.filter((p) => p.id !== action.pasoId) }
          : pl
      )};

    case "ADD_PASO_PLANTILLA": {
      return { ...state, plantillas: state.plantillas.map((pl) =>
        pl.id === action.plantillaId
          ? { ...pl, pasos: [...pl.pasos, action.paso] }
          : pl
      )};
    }

    // --- Miembros ---
    case "ADD_MIEMBRO":
      return { ...state, miembros: [...state.miembros, action.payload] };

    case "UPDATE_MIEMBRO": {
      const oldMember = state.miembros.find((m) => m.id === action.id);
      const newName = action.changes.nombre;
      const nameChanged = oldMember && newName && newName !== oldMember.nombre;
      const oldName = oldMember?.nombre ?? "";

      let newState = { ...state, miembros: state.miembros.map((m) => m.id === action.id ? { ...m, ...action.changes } : m) };

      if (nameChanged) {
        newState = {
          ...newState,
          entregables: newState.entregables.map((e) =>
            e.responsable === oldName ? { ...e, responsable: newName } : e,
          ),
          pasos: newState.pasos.map((p) => ({
            ...p,
            implicados: p.implicados.map((imp) =>
              imp.tipo === "equipo" && imp.nombre === oldName ? { ...imp, nombre: newName } : imp,
            ),
          })),
          plantillas: newState.plantillas.map((pl) =>
            pl.responsableDefault === oldName ? { ...pl, responsableDefault: newName } : pl,
          ),
        };
      }
      return newState;
    }

    case "DELETE_MIEMBRO": {
      const member = state.miembros.find((m) => m.id === action.id);
      const memberName = member?.nombre ?? "";
      return {
        ...state,
        miembros: state.miembros.filter((m) => m.id !== action.id),
        entregables: state.entregables.map((e) =>
          e.responsable === memberName ? { ...e, responsable: "" } : e,
        ),
        plantillas: state.plantillas.map((pl) =>
          pl.responsableDefault === memberName ? { ...pl, responsableDefault: "" } : pl,
        ),
      };
    }

    // --- Ejecuciones SOP ---
    case "ADD_EJECUCION":
      return { ...state, ejecuciones: [...state.ejecuciones, action.payload] };

    case "UPDATE_EJECUCION":
      return { ...state, ejecuciones: state.ejecuciones.map((ej) => ej.id === action.id ? { ...ej, ...action.changes } : ej) };

    case "TOGGLE_PASO_EJECUCION":
      return {
        ...state,
        ejecuciones: state.ejecuciones.map((ej) => {
          if (ej.id !== action.ejecucionId) return ej;
          const done = ej.pasosCompletados.includes(action.pasoId);
          const pasosCompletados = done
            ? ej.pasosCompletados.filter((id) => id !== action.pasoId)
            : [...ej.pasosCompletados, action.pasoId];
          return { ...ej, pasosCompletados, estado: pasosCompletados.length > 0 ? "en_curso" : "pendiente" };
        }),
      };

    case "COMPLETE_EJECUCION":
      return { ...state, ejecuciones: state.ejecuciones.map((ej) => ej.id === action.id ? { ...ej, estado: "completado" as const } : ej) };

    case "SET_MIGRATION_VERSION":
      return { ...state, _migrationVersion: action.version };

    // --- Convertir entregable a SOP ---
    case "CONVERT_ENTREGABLE_TO_SOP": {
      const ent = state.entregables.find((e) => e.id === action.entregableId);
      if (!ent) return state;
      const completedPasos = state.pasos
        .filter((p) => p.entregableId === action.entregableId && p.finTs)
        .sort((a, b) => (a.inicioTs ?? "").localeCompare(b.inicioTs ?? ""));
      if (completedPasos.length < 1) return state;

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;

      const plantillaId = `sop-${Date.now()}`;
      const newPlantilla: PlantillaProceso = {
        id: plantillaId,
        nombre: ent.nombre,
        area: proj?.area ?? "operativa",
        objetivo: "",
        disparador: "",
        programacion: null,
        proyectoId: proj?.id ?? null,
        resultadoId: res?.id ?? null,
        responsableDefault: ent.responsable,
        pasos: completedPasos.map((p, i) => ({
          id: `${plantillaId}-paso-${i}`,
          orden: i + 1,
          nombre: p.nombre,
          descripcion: "",
          herramientas: [],
          tipo: "accion" as const,
          minutosEstimados: minutosEfectivos(p),
        })),
        herramientas: [],
        excepciones: "",
        dependeDeIds: [],
        creado: new Date().toISOString(),
      };

      return {
        ...state,
        plantillas: [...state.plantillas, newPlantilla],
        entregables: state.entregables.map((e) =>
          e.id === action.entregableId ? { ...e, tipo: "sop" as const, plantillaId } : e
        ),
      };
    }

    case "SYNC_ENTREGABLE_TO_PLANTILLA": {
      const syncEnt = state.entregables.find((e) => e.id === action.entregableId);
      if (!syncEnt?.plantillaId) return state;
      const syncPlantilla = state.plantillas.find((pl) => pl.id === syncEnt.plantillaId);
      if (!syncPlantilla) return state;

      const allPasos = state.pasos.filter((p) => p.entregableId === action.entregableId);
      if (allPasos.length === 0) return state;

      const matched = new Set<string>();
      const merged: PasoPlantilla[] = [];

      for (const p of allPasos) {
        const existingPP = syncPlantilla.pasos.find(
          (pp) => !matched.has(pp.id) && pp.nombre.toLowerCase() === p.nombre.toLowerCase()
        );
        if (existingPP) matched.add(existingPP.id);
        merged.push({
          id: existingPP?.id ?? `${syncPlantilla.id}-paso-${Date.now()}-${merged.length}`,
          orden: merged.length + 1,
          nombre: p.nombre,
          descripcion: existingPP?.descripcion ?? "",
          herramientas: existingPP?.herramientas ?? [],
          tipo: existingPP?.tipo ?? ("accion" as const),
          minutosEstimados: (p.finTs ? minutosEfectivos(p) : null) ?? existingPP?.minutosEstimados ?? null,
        });
      }

      const syncRes = state.resultados.find((r) => r.id === syncEnt.resultadoId);
      const syncProyectoId = syncRes?.proyectoId ?? syncPlantilla.proyectoId;

      return {
        ...state,
        plantillas: state.plantillas.map((pl) =>
          pl.id === syncEnt.plantillaId
            ? {
                ...pl,
                nombre: syncEnt.nombre,
                pasos: merged,
                proyectoId: syncProyectoId,
                responsableDefault: syncEnt.responsable || pl.responsableDefault,
              }
            : pl
        ),
      };
    }

    // --- Notas multi-nivel ---
    case "ADD_NOTA": {
      const { nivel, targetId, nota } = action;
      if (nivel === "paso") return { ...state, pasos: state.pasos.map((p) => p.id === targetId ? { ...p, notas: [...(p.notas ?? []), nota] } : p) };
      if (nivel === "entregable") return { ...state, entregables: state.entregables.map((e) => e.id === targetId ? { ...e, notas: [...(e.notas ?? []), nota] } : e) };
      if (nivel === "resultado") return { ...state, resultados: state.resultados.map((r) => r.id === targetId ? { ...r, notas: [...(r.notas ?? []), nota] } : r) };
      if (nivel === "proyecto") return { ...state, proyectos: state.proyectos.map((p) => p.id === targetId ? { ...p, notas: [...(p.notas ?? []), nota] } : p) };
      if (nivel === "plantilla") return { ...state, plantillas: state.plantillas.map((pl) => pl.id === targetId ? { ...pl, notas: [...(pl.notas ?? []), nota] } : pl) };
      return state;
    }
    case "DELETE_NOTA": {
      const { nivel, targetId, notaId } = action;
      if (nivel === "paso") return { ...state, pasos: state.pasos.map((p) => p.id === targetId ? { ...p, notas: (p.notas ?? []).filter((n) => n.id !== notaId) } : p) };
      if (nivel === "entregable") return { ...state, entregables: state.entregables.map((e) => e.id === targetId ? { ...e, notas: (e.notas ?? []).filter((n) => n.id !== notaId) } : e) };
      if (nivel === "resultado") return { ...state, resultados: state.resultados.map((r) => r.id === targetId ? { ...r, notas: (r.notas ?? []).filter((n) => n.id !== notaId) } : r) };
      if (nivel === "proyecto") return { ...state, proyectos: state.proyectos.map((p) => p.id === targetId ? { ...p, notas: (p.notas ?? []).filter((n) => n.id !== notaId) } : p) };
      if (nivel === "plantilla") return { ...state, plantillas: state.plantillas.map((pl) => pl.id === targetId ? { ...pl, notas: (pl.notas ?? []).filter((n) => n.id !== notaId) } : pl) };
      return state;
    }

    case "UPDATE_NOTA": {
      const { nivel: nv, targetId: tid, notaId: nid, texto } = action;
      const mapNota = (notas: Nota[]) => notas.map((n) => n.id === nid ? { ...n, texto } : n);
      if (nv === "paso") return { ...state, pasos: state.pasos.map((p) => p.id === tid ? { ...p, notas: mapNota(p.notas ?? []) } : p) };
      if (nv === "entregable") return { ...state, entregables: state.entregables.map((e) => e.id === tid ? { ...e, notas: mapNota(e.notas ?? []) } : e) };
      if (nv === "resultado") return { ...state, resultados: state.resultados.map((r) => r.id === tid ? { ...r, notas: mapNota(r.notas ?? []) } : r) };
      if (nv === "proyecto") return { ...state, proyectos: state.proyectos.map((p) => p.id === tid ? { ...p, notas: mapNota(p.notas ?? []) } : p) };
      if (nv === "plantilla") return { ...state, plantillas: state.plantillas.map((pl) => pl.id === tid ? { ...pl, notas: mapNota(pl.notas ?? []) } : pl) };
      return state;
    }

    // --- Activity log ---
    case "LOG_ACTIVITY":
      return { ...state, activityLog: [...state.activityLog, action.entry] };

    // --- Reordenar ---
    case "REORDER_PASO": {
      const p = state.pasos.find((x) => x.id === action.id);
      if (!p) return state;
      const siblings = state.pasos.filter((x) => x.entregableId === p.entregableId).map((x) => x.id);
      return { ...state, pasos: swapSiblings(state.pasos, action.id, action.direction, siblings) };
    }
    case "REORDER_PROYECTO": {
      const p = state.proyectos.find((x) => x.id === action.id);
      if (!p) return state;
      const siblings = state.proyectos.filter((x) => x.area === p.area).map((x) => x.id);
      return { ...state, proyectos: swapSiblings(state.proyectos, action.id, action.direction, siblings) };
    }
    case "REORDER_RESULTADO": {
      const r = state.resultados.find((x) => x.id === action.id);
      if (!r) return state;
      const siblings = state.resultados.filter((x) => x.proyectoId === r.proyectoId).map((x) => x.id);
      return { ...state, resultados: swapSiblings(state.resultados, action.id, action.direction, siblings) };
    }
    case "REORDER_ENTREGABLE": {
      const e = state.entregables.find((x) => x.id === action.id);
      if (!e) return state;
      const siblings = state.entregables.filter((x) => x.resultadoId === e.resultadoId).map((x) => x.id);
      return { ...state, entregables: swapSiblings(state.entregables, action.id, action.direction, siblings) };
    }
    case "REORDER_PLANTILLA": {
      const pl = state.plantillas.find((x) => x.id === action.id);
      if (!pl) return state;
      const siblings = state.plantillas.filter((x) => x.area === pl.area).map((x) => x.id);
      return { ...state, plantillas: swapSiblings(state.plantillas, action.id, action.direction, siblings) };
    }

    // --- Materializar SOP atómicamente ---
    case "MATERIALIZE_SOP": {
      const { plantillaId, responsable, currentUser, dateKey, ids, autoStart = true } = action;
      const plantilla = state.plantillas.find((pl) => pl.id === plantillaId);
      if (!plantilla || plantilla.pasos.length === 0) return state;

      let newState = { ...state };
      const resultadoId: string | null = action.resultadoId ?? null;

      if (!resultadoId) return state;

      const entregable: Entregable = {
        id: ids.entregable, nombre: action.customName ?? plantilla.nombre, resultadoId,
        tipo: "sop", plantillaId, diasEstimados: plantilla.pasos.length, diasHechos: 0,
        esDiaria: false, responsable, estado: autoStart ? "en_proceso" : "planificado",
        creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: dateKey,
      };
      newState = { ...newState, entregables: [...newState.entregables, entregable] };

      if (autoStart) {
        const firstStep = plantilla.pasos[0];
        const paso: Paso = {
          id: ids.paso, entregableId: ids.entregable, nombre: firstStep.nombre,
          inicioTs: new Date().toISOString(), finTs: null, estado: "",
          contexto: { urls: (firstStep.urls ?? []).map((u) => ({ ...u })), apps: [], notas: firstStep.descripcion || "" },
          implicados: [{ tipo: "equipo", nombre: currentUser }],
          pausas: [], siguientePaso: null,
        };
        newState = {
          ...newState,
          pasos: [...newState.pasos, paso],
          pasosActivos: [...newState.pasosActivos, paso.id],
        };
      } else {
        const batchPasos: Paso[] = plantilla.pasos.map((pp, idx) => ({
          id: idx === 0 ? ids.paso : `${ids.paso}-${idx}`,
          entregableId: ids.entregable,
          nombre: pp.nombre,
          inicioTs: null, finTs: null, estado: "pendiente",
          contexto: { urls: (pp.urls ?? []).map((u) => ({ ...u })), apps: [], notas: pp.descripcion || "" },
          implicados: [], pausas: [], siguientePaso: null,
        }));
        newState = { ...newState, pasos: [...newState.pasos, ...batchPasos] };
      }

      return newState;
    }

    case "ADD_OBJETIVO":
      return { ...state, objetivos: [...(state.objetivos ?? []), action.payload] };

    case "UPDATE_OBJETIVO":
      return { ...state, objetivos: (state.objetivos ?? []).map((o) => o.id === action.id ? { ...o, ...action.changes } : o) };

    case "DELETE_OBJETIVO":
      return { ...state, objetivos: (state.objetivos ?? []).filter((o) => o.id !== action.id) };

    case "SET_REVIEW": {
      const { nivel, targetId, review } = action;
      switch (nivel) {
        case "proyecto":
          return { ...state, proyectos: state.proyectos.map((p) => p.id === targetId ? { ...p, review } : p) };
        case "resultado":
          return { ...state, resultados: state.resultados.map((r) => r.id === targetId ? { ...r, review } : r) };
        case "entregable":
          return { ...state, entregables: state.entregables.map((e) => e.id === targetId ? { ...e, review } : e) };
        case "plantilla":
          return { ...state, plantillas: state.plantillas.map((t) => t.id === targetId ? { ...t, review } : t) };
        default:
          return state;
      }
    }

    // --- Planificación: trimestres y semanas explícitas ---
    case "SET_PROYECTO_TRIMESTRES": {
      const trimestres = [...new Set(action.trimestres)].sort();
      return {
        ...state,
        proyectos: state.proyectos.map((p) => {
          if (p.id !== action.id) return p;
          const mesesFromTrimestres = trimestres.flatMap((t) => mesesDeTrimestre(t));
          const mesesActivos = [...new Set([...(p.mesesActivos ?? []), ...mesesFromTrimestres])].sort();
          return { ...p, trimestresActivos: trimestres, mesesActivos };
        }),
      };
    }

    case "TOGGLE_PROYECTO_SEMANA": {
      return {
        ...state,
        proyectos: state.proyectos.map((p) => {
          if (p.id !== action.id) return p;
          const curr = p.semanasExplicitas ?? [];
          const next = curr.includes(action.semana)
            ? curr.filter((s) => s !== action.semana)
            : [...curr, action.semana];
          return { ...p, semanasExplicitas: next };
        }),
      };
    }

    case "TOGGLE_RESULTADO_SEMANA": {
      return {
        ...state,
        resultados: state.resultados.map((r) => {
          if (r.id !== action.id) return r;
          const curr = r.semanasExplicitas ?? [];
          const next = curr.includes(action.semana)
            ? curr.filter((s) => s !== action.semana)
            : [...curr, action.semana];
          return { ...r, semanasExplicitas: next };
        }),
      };
    }

    case "TOGGLE_PROYECTO_MES": {
      const proyecto = state.proyectos.find((p) => p.id === action.id);
      if (!proyecto) return state;
      const curr = proyecto.mesesActivos ?? [];
      const removing = curr.includes(action.mes);
      const nextMeses = removing
        ? curr.filter((m) => m !== action.mes)
        : [...curr, action.mes].sort();

      let nextState: AppState = {
        ...state,
        proyectos: state.proyectos.map((p) => p.id === action.id ? { ...p, mesesActivos: nextMeses } : p),
      };

      if (removing) {
        const resIds = new Set(state.resultados.filter((r) => r.proyectoId === action.id).map((r) => r.id));
        nextState = {
          ...nextState,
          entregables: nextState.entregables.map((e) => {
            if (!resIds.has(e.resultadoId)) return e;
            if (!e.semana) return e;
            return mesKey(e.semana) === action.mes ? { ...e, semana: null } : e;
          }),
          resultados: nextState.resultados.map((r) => {
            if (r.proyectoId !== action.id) return r;
            const semanasActivas = (r.semanasActivas ?? []).filter((sk) => mesKey(sk) !== action.mes);
            const mesesActivos = (r.mesesActivos ?? []).filter((m) => m !== action.mes);
            return { ...r, semanasActivas, mesesActivos };
          }),
        };
      }

      return nextState;
    }

    case "TOGGLE_RESULTADO_MES": {
      const resultado = state.resultados.find((r) => r.id === action.id);
      if (!resultado) return state;
      const curr = resultado.mesesActivos ?? [];
      const removing = curr.includes(action.mes);
      const nextMeses = removing
        ? curr.filter((m) => m !== action.mes)
        : [...curr, action.mes].sort();

      let nextState: AppState = {
        ...state,
        resultados: state.resultados.map((r) => {
          if (r.id !== action.id) return r;
          let semanasActivas = r.semanasActivas ?? [];
          if (removing) semanasActivas = semanasActivas.filter((sk) => mesKey(sk) !== action.mes);
          return { ...r, mesesActivos: nextMeses, semanasActivas };
        }),
      };

      if (removing) {
        nextState = {
          ...nextState,
          entregables: nextState.entregables.map((e) => {
            if (e.resultadoId !== action.id) return e;
            if (!e.semana) return e;
            return mesKey(e.semana) === action.mes ? { ...e, semana: null } : e;
          }),
        };
      }

      return nextState;
    }

    case "SET_ENTREGABLE_SEMANA": {
      const ent = state.entregables.find((e) => e.id === action.id);
      if (!ent) return state;
      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : null;
      const mesNuevo = action.semana ? mesKey(action.semana) : null;

      let newProyectos = state.proyectos;
      let newResultados = state.resultados;
      if (mesNuevo && res && proj) {
        if (!(proj.mesesActivos ?? []).includes(mesNuevo)) {
          newProyectos = state.proyectos.map((p) =>
            p.id === proj.id ? { ...p, mesesActivos: [...(p.mesesActivos ?? []), mesNuevo].sort() } : p
          );
        }
        if (!(res.mesesActivos ?? []).includes(mesNuevo)) {
          newResultados = state.resultados.map((r) =>
            r.id === res.id ? { ...r, mesesActivos: [...(r.mesesActivos ?? []), mesNuevo].sort() } : r
          );
        }
      }

      return {
        ...state,
        proyectos: newProyectos,
        resultados: newResultados,
        entregables: state.entregables.map((e) => {
          if (e.id !== action.id) return e;
          const newEstado = (e.estado === "hecho" || e.estado === "cancelada" || e.estado === "en_espera")
            ? e.estado
            : action.semana ? (e.estado === "a_futuro" ? "planificado" : e.estado) : e.estado;
          return { ...e, semana: action.semana, estado: newEstado };
        }),
      };
    }

    case "SET_RESULTADO_SEMANA": {
      return {
        ...state,
        resultados: state.resultados.map((r) => r.id === action.id ? { ...r, semana: action.semana } : r),
      };
    }

    case "TOGGLE_RESULTADO_SEMANA_ACTIVA": {
      const resultado = state.resultados.find((r) => r.id === action.id);
      if (!resultado) return state;
      const curr = resultado.semanasActivas ?? [];
      const removing = curr.includes(action.semana);
      const nextSemanas = removing
        ? curr.filter((s) => s !== action.semana)
        : [...curr, action.semana].sort();

      let newProyectos = state.proyectos;
      const newResultados = state.resultados.map((r) => {
        if (r.id !== action.id) return r;
        let mesesActivos = r.mesesActivos ?? [];
        if (!removing) {
          const m = mesKey(action.semana);
          if (m && !mesesActivos.includes(m)) mesesActivos = [...mesesActivos, m].sort();
        }
        return { ...r, semanasActivas: nextSemanas, mesesActivos };
      });

      if (!removing) {
        const m = mesKey(action.semana);
        if (m) {
          newProyectos = state.proyectos.map((p) => {
            if (p.id !== resultado.proyectoId) return p;
            if ((p.mesesActivos ?? []).includes(m)) return p;
            return { ...p, mesesActivos: [...(p.mesesActivos ?? []), m].sort() };
          });
        }
      }

      return { ...state, proyectos: newProyectos, resultados: newResultados };
    }

    case "SET_RESULTADO_SEMANAS": {
      const semanas = [...new Set(action.semanas)].sort();
      return {
        ...state,
        resultados: state.resultados.map((r) => r.id === action.id ? { ...r, semanasActivas: semanas } : r),
      };
    }

    case "SET_PLAN_INICIO":
      return {
        ...state,
        pasos: state.pasos.map((p) => p.id === action.pasoId ? { ...p, planInicioTs: action.ts } : p),
      };

    case "RESTORE_PASO": {
      const paso = state.pasos.find((p) => p.id === action.id);
      if (!paso || !paso.finTs) return state;
      const now = new Date().toISOString();
      return {
        ...state,
        pasos: state.pasos.map((p) =>
          p.id === action.id
            ? {
                ...p,
                finTs: null,
                estado: "",
                siguientePaso: null,
                pausas: [...p.pausas, { pauseTs: p.finTs!, resumeTs: now }],
              }
            : p
        ),
        entregables: state.entregables.map((e) =>
          e.id !== paso.entregableId
            ? e
            : {
                ...e,
                diasHechos: Math.max(0, e.diasHechos - 1),
                estado: e.estado === "hecho" ? ("en_proceso" as const) : e.estado,
              }
        ),
        pasosActivos: state.pasosActivos.includes(action.id)
          ? state.pasosActivos
          : [...state.pasosActivos, action.id],
      };
    }

    case "CANCEL_INICIO_PASO": {
      const paso = state.pasos.find((p) => p.id === action.id);
      if (!paso || !paso.inicioTs || paso.finTs) return state;
      return {
        ...state,
        pasos: state.pasos.map((p) =>
          p.id === action.id ? { ...p, inicioTs: null, pausas: [] } : p
        ),
        pasosActivos: state.pasosActivos.filter((id) => id !== action.id),
      };
    }

    case "SET_MTP":
      return { ...state, mtp: action.mtp };

    case "UPDATE_PLAN_CONFIG": {
      const current = state.planConfig ?? PLAN_CONFIG_DEFAULT;
      const merged: PlanConfig = { ...current, ...action.changes };
      const safe: PlanConfig = {
        entregablesPorSemana: Math.max(1, Math.round(merged.entregablesPorSemana || 1)),
        pasosPorSesion: Math.max(1, Math.round(merged.pasosPorSesion || 1)),
      };
      return { ...state, planConfig: safe };
    }

    default:
      return state;
  }
}
