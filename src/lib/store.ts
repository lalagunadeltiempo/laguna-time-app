"use client";

import { AppState, EQUIPO_DEFAULT } from "./types";
import { buildSeedSOPs } from "./seed-sops";

const OLD_STORAGE_KEY = "laguna-del-tiempo";
const STORAGE_KEY = "laguna-time-app";
const BACKUP_KEY = "laguna-time-app-backup";

let _loadedSuccessfully = false;

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
  } as AppState;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function loadState(): AppState {
  if (typeof window === "undefined") return INITIAL_STATE;
  try {
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const state = migrateV1(JSON.parse(oldRaw));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        localStorage.removeItem(OLD_STORAGE_KEY);
      } catch {
        // Keep old key to retry later
      }
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
    console.error("[loadState] CRITICAL: migration error, NOT overwriting stored data:", err);
    _loadedSuccessfully = false;
    return INITIAL_STATE;
  }
}

export function didLoadSuccessfully(): boolean {
  return _loadedSuccessfully;
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  if (!_loadedSuccessfully) {
    console.warn("[saveState] Skipping save: load failed, protecting stored data.");
    return;
  }
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      try {
        localStorage.setItem(BACKUP_KEY, existing);
      } catch { /* backup is best-effort */ }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable
  }
}

export function exportData(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function importData(json: string): AppState {
  const raw = JSON.parse(json);
  const state = migrateV1(raw);
  _loadedSuccessfully = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function restoreBackup(): AppState | null {
  if (typeof window === "undefined") return null;
  const backup = localStorage.getItem(BACKUP_KEY);
  if (!backup) return null;
  try {
    const state = migrateV1(JSON.parse(backup));
    _loadedSuccessfully = true;
    localStorage.setItem(STORAGE_KEY, backup);
    return state;
  } catch {
    return null;
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
