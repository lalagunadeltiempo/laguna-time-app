"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listHistory,
  restoreFromHistory,
  type HistoryEntryMeta,
} from "@/lib/cloud-history";
import { getSupabase } from "@/lib/supabase";
import { WORKSPACE_ID } from "@/lib/store";

type Variant = "sidebar" | "icon";

interface HistorialMenuProps {
  variant?: Variant;
  className?: string;
}

function fmtFecha(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Acceso al historial cloud de versiones del AppState. Permite listar
 * las últimas 20 entradas y restaurar una de ellas tras confirmación.
 *
 * La restauración es destructiva sobre cloud:
 *  1. Pide confirmación a la usuaria.
 *  2. Carga el AppState de la entrada seleccionada.
 *  3. Lo upsertea en `user_data` para `WORKSPACE_ID`, sustituyendo el
 *     estado actual.
 *  4. Recarga la página para que el cliente vuelva a cargar desde la
 *     nube sin riesgo de pisada local.
 *
 * Si la tabla `user_data_history` no existe (migración SQL aún no
 * aplicada), `listHistory` devuelve [] y se muestra una nota
 * informativa. Es deliberadamente no intrusivo.
 */
export function HistorialMenu({ variant = "sidebar", className = "" }: HistorialMenuProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntryMeta[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listHistory(20);
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && entries === null) {
      void loadEntries();
    }
  }, [open, entries, loadEntries]);

  async function handleRestore(entry: HistoryEntryMeta) {
    const ok = window.confirm(
      `¿Restaurar la versión del ${fmtFecha(entry.saved_at)}?\n\n` +
      `Esto sustituirá tus datos actuales en la nube por esa versión.\n` +
      `La página se recargará tras restaurar.\n\n` +
      `Recomendación: descarga primero un Backup del estado actual.`
    );
    if (!ok) return;
    setRestoring(entry.id);
    try {
      const state = await restoreFromHistory(entry.id);
      if (!state) {
        window.alert("No se pudo recuperar esa versión.");
        return;
      }
      const supabase = getSupabase();
      if (!supabase) {
        window.alert("Sin conexión a Supabase. No se puede restaurar.");
        return;
      }
      const { error } = await supabase.from("user_data").upsert(
        { user_id: WORKSPACE_ID, state, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      if (error) {
        console.error("[HistorialMenu] error al restaurar:", error.message);
        window.alert(`Error al restaurar: ${error.message}`);
        return;
      }
      // Forzamos recarga: el cliente cargará desde cloud el estado restaurado
      // sin riesgo de pisada por el state en memoria.
      window.location.reload();
    } finally {
      setRestoring(null);
    }
  }

  const trigger = variant === "icon" ? (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-label="Historial de versiones"
      title="Historial de versiones"
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-label="Historial de versiones"
      title="Listar y restaurar versiones anteriores del estado"
      className={`flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span className="truncate">Historial</span>
    </button>
  );

  return (
    <>
      {trigger}
      {open && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Historial de versiones">
          <div className="w-full max-w-lg rounded-2xl bg-background p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Historial de versiones</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <p className="mb-3 text-xs text-muted">
              Últimas 20 versiones guardadas en la nube. Restaurar
              sustituye tus datos actuales por la versión elegida.
            </p>

            {loading && (
              <div className="py-8 text-center text-sm text-muted">Cargando…</div>
            )}

            {!loading && entries !== null && entries.length === 0 && (
              <div className="rounded-lg border border-border bg-surface/50 p-4 text-xs text-muted">
                No hay versiones disponibles. Si acabas de añadir esta función,
                puede que la tabla <code>user_data_history</code> aún no esté
                creada en Supabase. Mira{" "}
                <code>supabase/migrations/2026_05_06_state_history.sql</code>.
              </div>
            )}

            {!loading && entries !== null && entries.length > 0 && (
              <ul className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface/40 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{fmtFecha(e.saved_at)}</p>
                      <p className="text-[11px] text-muted">
                        {e.nodos_count ?? 0} nodos · {e.relaciones_count ?? 0} relaciones MAPA→Árbol
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestore(e)}
                      disabled={restoring !== null}
                      className="shrink-0 rounded-md border border-accent/40 bg-accent-soft px-3 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
                    >
                      {restoring === e.id ? "Restaurando…" : "Restaurar"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
