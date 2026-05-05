"use client";

import type { AppState } from "./types";
import { getSupabase } from "./supabase";
import { WORKSPACE_ID } from "./store";
import { detectarCambioSignificativo } from "./store-safeguard";

/**
 * Backup versionado del AppState en cloud (`user_data_history`).
 *
 * Idea: cada vez que `saveStateCloud` hace un upsert exitoso, se
 * dispara `appendHistoryEntry` (fire-and-forget) para que tras el save
 * quede materializada una "foto" del estado. Esa foto se puede listar
 * y restaurar desde la UI en `BackupHistorialMenu`.
 *
 * Throttle (heurística barata; cliente):
 *  - Si han pasado >LAST_SAVED_THROTTLE_MS desde el último append → ok.
 *  - Si hay un cambio significativo respecto al último append (ver
 *    `detectarCambioSignificativo`) → ok aunque no haya pasado el
 *    cooldown (no quieres perder el momento clave en el que cambia
 *    una meta).
 *  - En caso contrario, se omite el append.
 *
 * Hardcap: si tras un append hay más de `MAX_ENTRIES` para un mismo
 * `user_id`, borra las más antiguas hasta dejar `MAX_ENTRIES`.
 *
 * El módulo es resistente a fallos: si la tabla no existe, si no hay
 * Supabase configurado o si la red falla, no aborta nada y no emite
 * errores ruidosos. Solo deja un `console.warn` para diagnóstico.
 */

const HISTORY_TABLE = "user_data_history";
const LAST_HISTORY_KEY = "laguna-time-app-history-last-saved";
const LAST_HISTORY_STATE_KEY = "laguna-time-app-history-last-state";
const LAST_SAVED_THROTTLE_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 50;

export interface HistoryEntryMeta {
  id: number;
  saved_at: string;
  nodos_count: number | null;
  relaciones_count: number | null;
}

interface ThrottleData {
  lastSavedTs?: number;
  lastState?: AppState;
}

let _memoCache: ThrottleData = {};

function readThrottleData(): ThrottleData {
  if (typeof window === "undefined") return _memoCache;
  if (_memoCache.lastSavedTs && _memoCache.lastState) return _memoCache;
  try {
    const tsRaw = localStorage.getItem(LAST_HISTORY_KEY);
    const stateRaw = localStorage.getItem(LAST_HISTORY_STATE_KEY);
    _memoCache = {
      lastSavedTs: tsRaw ? Number.parseInt(tsRaw, 10) : undefined,
      lastState: stateRaw ? (JSON.parse(stateRaw) as AppState) : undefined,
    };
  } catch {
    _memoCache = {};
  }
  return _memoCache;
}

function writeThrottleData(data: ThrottleData): void {
  _memoCache = data;
  if (typeof window === "undefined") return;
  try {
    if (data.lastSavedTs) localStorage.setItem(LAST_HISTORY_KEY, String(data.lastSavedTs));
    if (data.lastState) localStorage.setItem(LAST_HISTORY_STATE_KEY, JSON.stringify(data.lastState));
  } catch {
    // localStorage lleno: no hacemos nada.
  }
}

/**
 * Decide si conviene materializar una entrada de historia.
 *
 * Se exporta para test directo (sin tener que pasar por
 * `appendHistoryEntry`). Acepta `now` para poder mockear el tiempo.
 */
export function debeAppendHistoryEntry(
  prev: ThrottleData,
  next: AppState,
  now: number,
): boolean {
  const lastTs = prev.lastSavedTs ?? 0;
  const elapsed = now - lastTs;
  if (lastTs === 0) return true;
  if (elapsed >= LAST_SAVED_THROTTLE_MS) return true;
  if (detectarCambioSignificativo(prev.lastState ?? null, next)) return true;
  return false;
}

function contarRelacionesEntregableHoja(state: AppState): number {
  let total = 0;
  for (const n of state.arbol?.nodos ?? []) {
    total += n.entregableIds?.length ?? 0;
  }
  return total;
}

/**
 * Materializa (si toca) una entrada en `user_data_history`. Throttled
 * y silente en errores. Devuelve `true` si insertó, `false` si se
 * omitió por throttle o por error.
 */
export async function appendHistoryEntry(state: AppState): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const supabase = getSupabase();
  if (!supabase) return false;

  const throttle = readThrottleData();
  const now = Date.now();
  if (!debeAppendHistoryEntry(throttle, state, now)) return false;

  const nodosCount = state.arbol?.nodos?.length ?? 0;
  const relacionesCount = contarRelacionesEntregableHoja(state);

  try {
    const { error } = await supabase.from(HISTORY_TABLE).insert({
      user_id: WORKSPACE_ID,
      state,
      nodos_count: nodosCount,
      relaciones_count: relacionesCount,
    });
    if (error) {
      // Tabla todavía sin crear o RLS denegando → silente.
      console.warn("[cloud-history] insert falló:", error.message);
      return false;
    }
    writeThrottleData({ lastSavedTs: now, lastState: state });
    void capHistoryEntries();
    return true;
  } catch (err) {
    console.warn("[cloud-history] excepción al insertar:", err);
    return false;
  }
}

/**
 * Lista las últimas N entradas (por defecto 20) sin descargar el blob
 * completo: solo metadatos para previsualizar y elegir cuál restaurar.
 */
export async function listHistory(limit = 20): Promise<HistoryEntryMeta[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(HISTORY_TABLE)
      .select("id, saved_at, nodos_count, relaciones_count")
      .eq("user_id", WORKSPACE_ID)
      .order("saved_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[cloud-history] list falló:", error.message);
      return [];
    }
    return (data ?? []) as HistoryEntryMeta[];
  } catch (err) {
    console.warn("[cloud-history] excepción al listar:", err);
    return [];
  }
}

/**
 * Recupera el AppState completo de una entrada concreta. Devuelve
 * `null` si no existe o si Supabase no está disponible.
 */
export async function restoreFromHistory(id: number): Promise<AppState | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(HISTORY_TABLE)
      .select("state")
      .eq("user_id", WORKSPACE_ID)
      .eq("id", id)
      .single();
    if (error || !data?.state) {
      console.warn("[cloud-history] restore falló:", error?.message);
      return null;
    }
    return data.state as AppState;
  } catch (err) {
    console.warn("[cloud-history] excepción al restaurar:", err);
    return null;
  }
}

/**
 * Hardcap: si para `WORKSPACE_ID` hay más de MAX_ENTRIES, borra las
 * más antiguas. Best-effort (no bloquea, no propaga errores).
 */
async function capHistoryEntries(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from(HISTORY_TABLE)
      .select("id, saved_at")
      .eq("user_id", WORKSPACE_ID)
      .order("saved_at", { ascending: false })
      .range(MAX_ENTRIES, MAX_ENTRIES + 200);
    if (error || !data || data.length === 0) return;
    const idsAEliminar = data.map((r: { id: number }) => r.id);
    if (idsAEliminar.length === 0) return;
    await supabase.from(HISTORY_TABLE).delete().in("id", idsAEliminar);
  } catch {
    // best-effort
  }
}

/** Útil para tests: resetea el cache en memoria del throttle. */
export function _resetCloudHistoryThrottleForTests(): void {
  _memoCache = {};
}
