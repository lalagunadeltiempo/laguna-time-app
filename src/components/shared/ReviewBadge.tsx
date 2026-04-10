"use client";

import { useState, useRef, useEffect } from "react";
import { useAppDispatch } from "@/lib/context";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import type { ReviewMark, ReviewStatus } from "@/lib/types";

const STATUS_CONFIG: Record<ReviewStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  pendiente: {
    label: "Pendiente",
    bg: "bg-gray-100 dark:bg-gray-700/30",
    text: "text-gray-500 dark:text-gray-400",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  revisado: {
    label: "Revisado",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  sugerencia: {
    label: "Sugerencia",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M9 18h6" /><path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
      </svg>
    ),
  },
  aprobado: {
    label: "Aprobado",
    bg: "bg-green-50 dark:bg-green-500/10",
    text: "text-green-600 dark:text-green-400",
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
};

const ALL_STATUSES: ReviewStatus[] = ["pendiente", "revisado", "sugerencia", "aprobado"];

interface Props {
  review?: ReviewMark;
  nivel: "proyecto" | "resultado" | "entregable" | "plantilla";
  targetId: string;
}

export function ReviewBadge({ review, nivel, targetId }: Props) {
  const dispatch = useAppDispatch();
  const { nombre } = useUsuario();
  const isMentor = useIsMentor();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function setStatus(status: ReviewStatus) {
    dispatch({
      type: "SET_REVIEW",
      nivel,
      targetId,
      review: { status, autor: nombre, fecha: new Date().toISOString() },
    });
    setOpen(false);
  }

  if (!review && !isMentor) return null;

  const current = review?.status;
  const config = current ? STATUS_CONFIG[current] : null;

  if (!isMentor) {
    if (!config) return null;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.bg} ${config.text}`}
        title={`${config.label} por ${review!.autor} el ${new Date(review!.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`}>
        {config.icon}
        {config.label}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((s) => !s)}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors hover:brightness-95 ${
          config ? `${config.bg} ${config.text}` : "bg-gray-100 text-gray-400 dark:bg-gray-700/30 dark:text-gray-500"
        }`}
        title={review ? `${config!.label} por ${review.autor}` : "Sin revisar"}>
        {config ? config.icon : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
        {config ? config.label : "Revisar"}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-xl border border-border bg-background p-1 shadow-lg min-w-[140px]">
          {ALL_STATUSES.map((s) => {
            const c = STATUS_CONFIG[s];
            const isActive = current === s;
            return (
              <button key={s} type="button" onClick={() => setStatus(s)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-surface ${
                  isActive ? "font-bold" : ""
                } ${c.text}`}>
                {c.icon}
                <span>{c.label}</span>
                {isActive && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="ml-auto">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
