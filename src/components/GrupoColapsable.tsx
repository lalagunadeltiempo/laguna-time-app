"use client";

import { useState, type ReactNode } from "react";
import { MenuAcciones } from "./MenuAcciones";

interface Props {
  titulo: string;
  count: number;
  children: ReactNode;
  editingId: string | null;
  itemId: string;
  editingValue: string;
  onEditingChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  acciones: { label: string; destructive?: boolean; onClick: () => void }[];
}

export function GrupoColapsable({
  titulo,
  count,
  children,
  editingId,
  itemId,
  editingValue,
  onEditingChange,
  onSaveEdit,
  onCancelEdit,
  acciones,
}: Props) {
  const [open, setOpen] = useState(count <= 1);
  const isEditing = editingId === itemId;

  const header = isEditing ? (
    <div className="flex items-center gap-2 px-3.5 py-2">
      <input
        type="text"
        value={editingValue}
        onChange={(e) => onEditingChange(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") onSaveEdit();
          if (e.key === "Escape") onCancelEdit();
        }}
        className="flex-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm text-zinc-900 focus:outline-none"
      />
      <button onClick={onSaveEdit} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white">OK</button>
      <button onClick={onCancelEdit} className="text-xs text-zinc-400 hover:text-zinc-600">Cancelar</button>
    </div>
  ) : null;

  if (count <= 1) {
    return (
      <div>
        {header ?? (
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-500">{titulo}</p>
            <MenuAcciones acciones={acciones} />
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-100 bg-white shadow-sm">
      {header ?? (
        <div className="flex items-center">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex flex-1 items-center justify-between px-3.5 py-3 text-left"
          >
            <span className="text-sm font-medium text-zinc-700">{titulo}</span>
            <span className="flex items-center gap-1.5">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                {count}
              </span>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                className={`text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </button>
          <div className="pr-2">
            <MenuAcciones acciones={acciones} />
          </div>
        </div>
      )}
      {open && <div className="border-t border-zinc-50 px-3 pb-3 pt-2">{children}</div>}
    </div>
  );
}
