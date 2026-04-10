"use client";

import { AppState, EQUIPO_DEFAULT } from "./types";
import { buildSeedSOPs } from "./seed-sops";
import { getSupabase } from "./supabase";

const OLD_STORAGE_KEY = "laguna-del-tiempo";
const STORAGE_KEY = "laguna-time-app";
const BACKUP_KEY = "laguna-time-app-backup";
const SAVED_AT_KEY = "laguna-time-app-saved-at";

let _loadedSuccessfully = false;
let _cloudLoadedOk = false;

export const INITIAL_STATE: AppState = {
  ambitoLabels: { personal: "Ganesha 🐘", empresa: "La Laguna del Tiempo ⛰️☀️" },
  proyectos: [],
  resultados: [],
  entregables: [],
  pasos: [],
  contactos: [],
  inbox: [],
  plantillas: buildSeedSOPs(),
  ejecuciones: [],
  pasosActivos: [],
  miembros: EQUIPO_DEFAULT,
  activityLog: [],
  objetivos: [],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function migrateV1(raw: any): AppState {
  const plantillas: any[] = (raw.plantillas ?? []).map((pl: any) => ({
    ...pl,
    area: pl.area ?? "operativa",
    objetivo: pl.objetivo ?? pl.descripcion ?? "",
    disparador: pl.disparador ?? "",
    programacion: pl.programacion ?? null,
    excepciones: pl.excepciones ?? "",
    pasos: (pl.pasos ?? []).map((ps: any) => ({
      ...ps,
      minutosEstimados: ps.minutosEstimados ?? null,
      programacion: ps.programacion ?? null,
    })),
  }));

  const AREA_ID_MAP: Record<string, string> = {
    cuerpo: "fisico", emociones: "emocional", mente: "mental", espiritu: "espiritual",
  };

  const metas: any[] = raw.metas ?? raw.objetivos ?? [];
  const metaIdToArea: Record<string, string> = {};
  for (const m of metas) {
    const rawArea = m.area ?? "administrativa";
    metaIdToArea[m.id] = AREA_ID_MAP[rawArea] ?? rawArea;
  }

  return {
    _migrationVersion: raw._migrationVersion ?? 0,
    ambitoLabels: raw.ambitoLabels ?? { personal: "Ganesha 🐘", empresa: "La Laguna del Tiempo ⛰️☀️" },
    proyectos: (raw.proyectos ?? []).map((p: any) => {
      const { mesInicio: legacyMesInicio, metaId: _metaId, ...rest } = p;
      const resolvedArea = p.area ?? metaIdToArea[p.metaId] ?? "administrativa";
      return {
        ...rest,
        area: AREA_ID_MAP[resolvedArea] ?? resolvedArea,
        fechaInicio: legacyMesInicio ?? p.fechaInicio ?? null,
        descripcion: p.descripcion ?? null,
      };
    }),
    resultados: (raw.resultados ?? raw.tareasMadre ?? []).map((r: any) => {
      let diasEst = r.diasEstimados ?? null;
      if (diasEst === null && r.duracionEstimada != null) {
        const u = r.duracionUnidad ?? "semanas";
        if (u === "dias") diasEst = r.duracionEstimada;
        else if (u === "semanas") diasEst = r.duracionEstimada * 5;
        else if (u === "meses") diasEst = r.duracionEstimada * 22;
        else diasEst = r.duracionEstimada * 5;
      }
      return {
        ...r,
        semana: r.semana ?? null,
        fechaLimite: r.fechaLimite ?? null,
        fechaInicio: r.fechaInicio ?? null,
        diasEstimados: diasEst,
        descripcion: r.descripcion ?? null,
      };
    }),
    entregables: (raw.entregables ?? raw.tareasHija ?? []).map((e: any) => ({
      ...e,
      resultadoId: e.resultadoId ?? e.tareaMadreId,
      tipo: e.tipo ?? "raw",
      plantillaId: e.plantillaId ?? null,
      diasEstimados: e.diasEstimados ?? e.bloquesEstimados ?? 5,
      diasHechos: e.diasHechos ?? e.bloquesDone ?? 0,
      semana: e.semana ?? null,
      fechaLimite: e.fechaLimite ?? null,
      fechaInicio: e.fechaInicio ?? null,
    })),
    pasos: (raw.pasos ?? []).map((p: any) => ({
      ...p,
      entregableId: p.entregableId ?? p.tareaHijaId,
      contexto: p.contexto ? {
        ...p.contexto,
        urls: (p.contexto.urls ?? []).map((u: any) =>
          typeof u === "string" ? { nombre: "", descripcion: "", url: u } : u,
        ),
      } : { urls: [], apps: [], notas: "" },
      pausas: p.pausas ?? [],
      siguientePaso: p.siguientePaso ? {
        ...p.siguientePaso,
        fechaProgramada: p.siguientePaso.fechaProgramada ?? undefined,
        dependeDe: p.siguientePaso.dependeDe
          ? (Array.isArray(p.siguientePaso.dependeDe) ? p.siguientePaso.dependeDe : [p.siguientePaso.dependeDe])
          : [],
      } : null,
    })),
    contactos: raw.contactos ?? [],
    inbox: raw.inbox ?? [],
    plantillas,
    ejecuciones: raw.ejecuciones ?? [],
    pasosActivos: raw.pasosActivos ?? (raw.pasoActivo ? [raw.pasoActivo] : []),
    miembros: raw.miembros?.length
      ? raw.miembros.map((m: any) => ({ ...m, capacidadDiaria: m.capacidadDiaria ?? 1, diasLaborables: m.diasLaborables ?? [1, 2, 3, 4, 5] }))
      : EQUIPO_DEFAULT,
    activityLog: raw.activityLog ?? [],
    objetivos: raw.objetivos ?? [],
  } as AppState;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ---- localStorage (cache local + fallback) ---- */

export function loadStateLocal(): AppState {
  if (typeof window === "undefined") return INITIAL_STATE;
  try {
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const state = migrateV1(JSON.parse(oldRaw));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        localStorage.removeItem(OLD_STORAGE_KEY);
      } catch { /* keep old key */ }
      _loadedSuccessfully = true;
      return state;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      _loadedSuccessfully = true;
      return INITIAL_STATE;
    }
    const state = migrateV1(JSON.parse(raw));
    _loadedSuccessfully = true;
    return state;
  } catch (err) {
    console.error("[loadStateLocal] migration error:", err);
    _loadedSuccessfully = false;
    return INITIAL_STATE;
  }
}

export function saveStateLocal(state: AppState): void {
  if (typeof window === "undefined") return;
  if (!_loadedSuccessfully) return;
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      try { localStorage.setItem(BACKUP_KEY, existing); } catch { /* best-effort */ }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(SAVED_AT_KEY, new Date().toISOString());
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      console.warn("[saveStateLocal] localStorage lleno — los datos se guardan en la nube si está disponible");
    }
  }
}

export function getLocalSavedAt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SAVED_AT_KEY);
}

/* ---- Supabase (cloud persistence) ---- */

const WORKSPACE_ID = "workspace-laguna";

export interface CloudLoadResult {
  data: AppState | null;
  error: boolean;
  updatedAt: string | null;
}

export async function loadStateCloud(userId: string): Promise<CloudLoadResult> {
  const supabase = getSupabase();
  if (!supabase || userId === "local") return { data: null, error: false, updatedAt: null };

  try {
    const { data, error } = await supabase
      .from("user_data")
      .select("state, updated_at")
      .eq("user_id", WORKSPACE_ID)
      .single();

    if (error || !data?.state) {
      const { data: userData, error: userError } = await supabase
        .from("user_data")
        .select("state, updated_at")
        .eq("user_id", userId)
        .single();
      if (userError && userError.code !== "PGRST116") {
        return { data: null, error: true, updatedAt: null };
      }
      if (userData?.state) {
        const migrated = migrateV1(userData.state);
        await supabase.from("user_data").upsert(
          { user_id: WORKSPACE_ID, state: migrated, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
        _cloudLoadedOk = true;
        return { data: migrated, error: false, updatedAt: userData.updated_at ?? null };
      }
      if (error && error.code !== "PGRST116") {
        return { data: null, error: true, updatedAt: null };
      }
      return { data: null, error: false, updatedAt: null };
    }
    _cloudLoadedOk = true;
    return { data: migrateV1(data.state), error: false, updatedAt: data.updated_at ?? null };
  } catch {
    return { data: null, error: true, updatedAt: null };
  }
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingSave: { userId: string; state: AppState } | null = null;

export function markCloudLoadOk(): void {
  _cloudLoadedOk = true;
}

export function saveStateCloud(userId: string, state: AppState): void {
  if (userId === "local") return;
  if (!_cloudLoadedOk) return;
  const supabase = getSupabase();
  if (!supabase) return;

  if (state.proyectos.length === 0 && state.entregables.length === 0 && state.pasos.length === 0) {
    console.warn("[saveStateCloud] blocked: refusing to save empty state over cloud");
    return;
  }

  _pendingSave = { userId: WORKSPACE_ID, state };

  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {  // 300ms debounce — fast enough to not lose data on accidental close
    const pending = _pendingSave;
    _pendingSave = null;
    _saveTimer = null;
    if (!pending) return;

    try {
      const { error } = await supabase.from("user_data").upsert(
        { user_id: WORKSPACE_ID, state: pending.state, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      if (error) {
        console.error("[saveStateCloud] Supabase error:", error.message);
      }
    } catch (err) {
      console.error("[saveStateCloud] network error:", err);
    }
  }, 300);
}

export function flushPendingCloudSave(): void {
  if (!_pendingSave) return;
  const { userId, state } = _pendingSave;
  _pendingSave = null;
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }

  const supabase = getSupabase();
  if (!supabase || userId === "local") return;

  // sendBeacon for reliability on page close — falls back to fire-and-forget fetch
  const payload = JSON.stringify({
    user_id: userId,
    state,
    updated_at: new Date().toISOString(),
  });

  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id`;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: payload,
      keepalive: true,
    });
  } catch {
    // Best-effort on page close
  }
}

/* ---- Legacy exports (backwards compat for other files) ---- */

export const loadState = loadStateLocal;
export const saveState = saveStateLocal;

export function didLoadSuccessfully(): boolean {
  return _loadedSuccessfully;
}

export function setLoadedSuccessfully(val: boolean): void {
  _loadedSuccessfully = val;
}

export function exportData(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function importData(json: string): AppState {
  const raw = JSON.parse(json);
  const state = migrateV1(raw);
  _loadedSuccessfully = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      console.warn("[importData] localStorage lleno");
    }
  }
  return state;
}

export function restoreBackup(): AppState | null {
  if (typeof window === "undefined") return null;
  const backup = localStorage.getItem(BACKUP_KEY);
  if (!backup) return null;
  try {
    const state = migrateV1(JSON.parse(backup));
    _loadedSuccessfully = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  } catch {
    return null;
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
