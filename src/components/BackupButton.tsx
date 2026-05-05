"use client";

import { useState, useCallback } from "react";
import { useAppState } from "@/lib/context";
import { flushPendingSaveStateLocal } from "@/lib/store";

type Variant = "sidebar" | "compact" | "icon";

interface BackupButtonProps {
  variant?: Variant;
  className?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function buildBackupFilename(now: Date): string {
  const yyyy = now.getFullYear();
  const mm = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  return `laguna-backup-${yyyy}-${mm}-${dd}T${hh}-${mi}-${ss}.json`;
}

/**
 * Botón "Descargar copia de seguridad" siempre accesible.
 * Un solo click descarga un JSON con TODO el AppState actual del cliente.
 * Pensado como red de seguridad anti-pérdida de datos: la usuaria
 * siempre puede materializar su estado actual a un fichero local.
 */
export function BackupButton({ variant = "sidebar", className = "" }: BackupButtonProps) {
  const state = useAppState();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(() => {
    if (busy) return;
    setBusy(true);
    try {
      flushPendingSaveStateLocal();
      const json = JSON.stringify(state, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildBackupFilename(new Date());
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast("Backup descargado");
    } catch (err) {
      console.error("[BackupButton] error generando backup:", err);
      setToast("Error generando backup");
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 2500);
    }
  }, [state, busy]);

  const icon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );

  if (variant === "icon") {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          aria-label="Descargar copia de seguridad"
          title="Descargar copia de seguridad"
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50 ${className}`}
        >
          {icon}
        </button>
        {toast && (
          <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg">
            {toast}
          </div>
        )}
      </>
    );
  }

  if (variant === "compact") {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          aria-label="Descargar copia de seguridad"
          title="Descargar copia de seguridad"
          className={`flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50 ${className}`}
        >
          {icon}
          <span>Backup</span>
        </button>
        {toast && (
          <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg">
            {toast}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label="Descargar copia de seguridad"
        title="Descargar copia de seguridad de tus datos en JSON"
        className={`flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-50 ${className}`}
      >
        {icon}
        <span className="truncate">Backup</span>
      </button>
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
