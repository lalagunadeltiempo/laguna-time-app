"use client";

import { useArbol } from "@/lib/hooks";

interface Props {
  entregableId: string | undefined;
  className?: string;
}

export function Breadcrumb({ entregableId, className = "" }: Props) {
  const { proyecto, resultado, entregable, areaLabel } = useArbol(entregableId);

  if (!proyecto) return null;

  const crumbs = [areaLabel, proyecto.nombre, resultado?.nombre, entregable?.nombre].filter(Boolean);

  return (
    <div className={`flex flex-wrap items-center gap-1 text-xs text-muted ${className}`}>
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-muted/50">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          )}
          <span className={i === crumbs.length - 1 ? "font-medium text-foreground" : ""}>{c}</span>
        </span>
      ))}
    </div>
  );
}
