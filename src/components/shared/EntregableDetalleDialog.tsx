"use client";

import { useEffect } from "react";
import type { Entregable } from "@/lib/types";
import { EntregableActivoCard } from "../EntregableActivo";

/**
 * Modal con la vista rica del entregable (notas, URLs, pasos, implicados,
 * pizarra, historial de sesiones). Reutiliza `EntregableActivoCard` en modo
 * "detalle". Compartido entre HOY (PlanHoy) y MAPA (EntregableBlock).
 */
export function EntregableDetalleDialog({
  entregable,
  onClose,
}: {
  entregable: Entregable;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-end">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-background text-muted shadow-md transition-colors hover:bg-surface hover:text-foreground"
            aria-label="Cerrar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <EntregableActivoCard entregable={entregable} mode="detalle" />
      </div>
    </div>
  );
}
