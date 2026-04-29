"use client";

import { useMemo, useState } from "react";
import { useAppDispatch } from "@/lib/context";
import { AREA_COLORS, AREAS_EMPRESA, AREAS_PERSONAL, type Objetivo } from "@/lib/types";
import { ObjetivoRealidadBlock } from "@/components/plan/ObjetivoRealidad";

const AREA_LABELS: Record<string, string> = {
  ...Object.fromEntries(AREAS_EMPRESA.map((a) => [a.id, a.label])),
  ...Object.fromEntries(AREAS_PERSONAL.map((a) => [a.id, a.label])),
};

export function ObjetivoRow({ obj, todosObjetivos, isMentor, depth = 0 }: {
  obj: Objetivo;
  todosObjetivos: Objetivo[];
  isMentor: boolean;
  depth?: number;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(true);
  const hex = obj.area ? (AREA_COLORS[obj.area]?.hex ?? "#888") : "#888";

  const children = useMemo(
    () => todosObjetivos.filter((o) => o.parentId === obj.id),
    [todosObjetivos, obj.id],
  );
  const hasChildren = children.length > 0;
  const areaLabel = obj.area ? AREA_LABELS[obj.area] : null;

  return (
    <div className="space-y-1">
      <div className="space-y-1" style={{ marginLeft: `${depth * 14}px` }}>
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-1.5">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="shrink-0 text-muted hover:text-foreground"
              title={open ? "Contraer árbol" : "Expandir árbol"}
              aria-label={open ? "Contraer árbol" : "Expandir árbol"}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className={`transition-transform ${open ? "rotate-90" : ""}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : (
            <span className="w-[10px] shrink-0" />
          )}

          {!isMentor && (
            <input
              type="checkbox"
              checked={obj.completado}
              onChange={() => dispatch({ type: "UPDATE_OBJETIVO", id: obj.id, changes: { completado: !obj.completado } })}
              className="h-4 w-4 shrink-0 rounded accent-accent"
            />
          )}

          {obj.area && (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
          )}

          {areaLabel && (
            <span
              className="shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{ borderColor: hex + "55", backgroundColor: hex + "12", color: hex }}
            >
              {areaLabel}
            </span>
          )}

          <span className={`min-w-0 flex-1 truncate text-sm ${obj.completado ? "text-muted line-through" : "text-foreground"}`}>
            {obj.texto}
          </span>

          {!isMentor && (
            <button
              onClick={() => dispatch({ type: "DELETE_OBJETIVO", id: obj.id })}
              className="text-xs text-muted hover:text-red-500"
              title="Eliminar objetivo"
            >
              ✕
            </button>
          )}
        </div>

        <ObjetivoRealidadBlock
          obj={obj}
          isMentor={isMentor}
          compact
          onChanges={(changes) => dispatch({ type: "UPDATE_OBJETIVO", id: obj.id, changes })}
        />
      </div>

      {hasChildren && open && (
        <div className="space-y-1">
          {children.map((child) => (
            <ObjetivoRow
              key={child.id}
              obj={child}
              todosObjetivos={todosObjetivos}
              isMentor={isMentor}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
