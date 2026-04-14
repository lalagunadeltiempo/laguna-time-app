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
} from "./types";
import { minutosEfectivos } from "./duration";
import { toDateKey } from "./date-utils";

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
  | { type: "DELETE_PASO"; id: string }
  | { type: "RENAME_ENTREGABLE"; id: string; nombre: string }
  | { type: "UPDATE_ENTREGABLE"; id: string; changes: Partial<Pick<Entregable, "nombre" | "responsable" | "tipo" | "plantillaId" | "diasEstimados" | "estado" | "fechaLimite" | "fechaInicio" | "planNivel">> }
  | { type: "DELETE_ENTREGABLE"; id: string }
  | { type: "PROMOTE_PASO_TO_ENTREGABLE"; pasoId: string; nuevoEntregableId: string }
  | { type: "PROMOTE_ENTREGABLE_TO_RESULTADO"; entregableId: string; nuevoResultadoId: string }
  | { type: "MOVE_RESULTADO"; resultadoId: string; nuevoProyectoId: string }
  | { type: "MOVE_ENTREGABLE"; entregableId: string; nuevoResultadoId: string }
  | { type: "PROMOTE_RESULTADO"; resultadoId: string; area: Proyecto["area"]; nuevoProyectoId: string }
  | { type: "DELETE_RESULTADO"; id: string }
  | { type: "RENAME_RESULTADO"; id: string; nombre: string }
  | { type: "UPDATE_RESULTADO"; id: string; changes: Partial<Pick<Resultado, "nombre" | "descripcion" | "semana" | "fechaLimite" | "fechaInicio" | "diasEstimados" | "planNivel">> }
  | { type: "DELETE_PROYECTO"; id: string }
  | { type: "RENAME_PROYECTO"; id: string; nombre: string }
  | { type: "UPDATE_PROYECTO"; id: string; changes: Partial<Pick<Proyecto, "nombre" | "descripcion" | "area" | "fechaInicio" | "fechaLimite" | "planNivel" | "tipo" | "responsable">> }
  | { type: "IMPORT_DATA"; proyectos: Proyecto[]; resultados: Resultado[]; entregables: Entregable[] }
  | { type: "ADD_INBOX"; payload: InboxItem }
  | { type: "PROCESS_INBOX"; id: string }
  | { type: "ADD_CONTACTO"; payload: ContactoExterno }
  | { type: "IMPORT_PLANTILLAS"; plantillas: PlantillaProceso[] }
  | { type: "ADD_PLANTILLA"; payload: PlantillaProceso }
  | { type: "DELETE_PLANTILLA"; id: string }
  | { type: "UPDATE_PLANTILLA"; id: string; changes: Partial<Pick<PlantillaProceso, "nombre" | "area" | "objetivo" | "disparador" | "programacion" | "excepciones" | "responsableDefault" | "pasos" | "herramientas" | "dependeDeIds" | "proyectoId">> }
  | { type: "ADD_MIEMBRO"; payload: MiembroInfo }
  | { type: "UPDATE_MIEMBRO"; id: string; changes: Partial<Pick<MiembroInfo, "nombre" | "rol" | "color" | "capacidadDiaria" | "diasLaborables">> }
  | { type: "DELETE_MIEMBRO"; id: string }
  | { type: "ADD_EJECUCION"; payload: EjecucionSOP }
  | { type: "UPDATE_EJECUCION"; id: string; changes: Partial<Pick<EjecucionSOP, "entregableId" | "pasosLanzados" | "estado">> }
  | { type: "TOGGLE_PASO_EJECUCION"; ejecucionId: string; pasoId: string }
  | { type: "COMPLETE_EJECUCION"; id: string }
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
  | { type: "MATERIALIZE_SOP"; plantillaId: string; area: Area; responsable: string; currentUser: string; dateKey: string; ids: { resultado: string; entregable: string; paso: string; proyecto: string }; proyectoId?: string; resultadoId?: string; autoStart?: boolean }
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
      return {
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
    }

    case "ADD_PASO":
      return { ...state, pasos: [...state.pasos, action.payload] };

    case "ACTIVATE_PASO": {
      const paso = state.pasos.find((p) => p.id === action.id);
      if (!paso) return state;
      const todayAct = toDateKey(new Date());
      return {
        ...state,
        pasos: state.pasos.map((p) => p.id === action.id ? { ...p, inicioTs: new Date().toISOString() } : p),
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
      return {
        ...state,
        pasos: state.pasos.map((p) => (p.id === updated.id ? updated : p)),
        pasosActivos: state.pasosActivos.filter((id) => id !== updated.id),
        entregables: state.entregables.map((e) => {
          if (e.id !== updated.entregableId) return e;
          const nuevoEstado = terminado ? "hecho" : (e.estado === "hecho" ? "hecho" : "en_proceso");
          return { ...e, diasHechos: alreadyClosed ? e.diasHechos : e.diasHechos + 1, estado: nuevoEstado };
        }),
      };
    }

    case "RENAME_PASO":
      return { ...state, pasos: state.pasos.map((p) => p.id === action.id ? { ...p, nombre: action.nombre } : p) };

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

    case "DELETE_ENTREGABLE": {
      const eIds = new Set([action.id]);
      return {
        ...state,
        entregables: state.entregables.filter((e) => e.id !== action.id),
        pasos: state.pasos.filter((p) => p.entregableId !== action.id),
        pasosActivos: clearPasosActivos(state, eIds),
        ejecuciones: state.ejecuciones.filter((ej) => ej.entregableId !== action.id),
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
      return {
        ...state,
        resultados: state.resultados.filter((r) => r.id !== action.id),
        entregables: state.entregables.filter((e) => e.resultadoId !== action.id),
        pasos: state.pasos.filter((p) => !eIds.has(p.entregableId)),
        pasosActivos: clearPasosActivos(state, eIds),
        ejecuciones: state.ejecuciones.filter((ej) => !ej.entregableId || !eIds.has(ej.entregableId)),
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
      return {
        ...state,
        proyectos: state.proyectos.filter((p) => p.id !== action.id),
        resultados: state.resultados.filter((r) => r.proyectoId !== action.id),
        entregables: state.entregables.filter((e) => !rIds.has(e.resultadoId)),
        pasos: state.pasos.filter((p) => !eIds.has(p.entregableId)),
        pasosActivos: clearPasosActivos(state, eIds),
        ejecuciones: state.ejecuciones.filter((ej) => !ej.entregableId || !eIds.has(ej.entregableId)),
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
        id: ids.entregable, nombre: plantilla.nombre, resultadoId,
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
          contexto: { urls: [], apps: [], notas: "" },
          implicados: [{ tipo: "equipo", nombre: currentUser }],
          pausas: [], siguientePaso: null,
        };
        newState = {
          ...newState,
          pasos: [...newState.pasos, paso],
          pasosActivos: [...newState.pasosActivos, paso.id],
        };
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

    case "SET_MTP":
      return { ...state, mtp: action.mtp };

    default:
      return state;
  }
}
