"use client";

import { useState } from "react";
import type { MiembroInfo } from "@/lib/types";

/**
 * Edición inline de un nombre. Click en el texto → input. Enter / blur → guarda.
 * Escape → cancela.
 */
export function InlineNombre({
  value,
  onSave,
  className = "",
  inputClassName = "",
  placeholder,
  disabled = false,
}: {
  value: string;
  onSave: (next: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (disabled) {
    return <span className={className}>{value}</span>;
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
        className={`block w-full truncate rounded text-left hover:bg-surface/60 ${className}`}
        title="Editar nombre"
      >
        {value || <span className="text-muted italic">{placeholder ?? "Sin nombre"}</span>}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); save(); }
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      placeholder={placeholder}
      className={`w-full rounded border border-accent/40 bg-background px-1.5 py-0.5 outline-none focus:border-accent ${inputClassName}`}
    />
  );
}

/** Select compacto de responsable. */
export function ResponsableSelect({
  value,
  miembros,
  onChange,
  disabled = false,
  className = "",
}: {
  value: string | undefined;
  miembros: MiembroInfo[];
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (disabled) {
    return value ? (
      <span className={`shrink-0 rounded bg-surface px-1.5 py-0.5 text-[9px] text-muted ${className}`}>{value}</span>
    ) : (
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] italic text-muted/70 ${className}`}>(sin asignar)</span>
    );
  }

  const isEmpty = !value;

  return (
    <select
      value={value ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      className={`shrink-0 rounded bg-surface px-1 py-0.5 text-[10px] outline-none hover:text-foreground ${isEmpty ? "italic text-muted/70" : "text-muted"} ${className}`}
      title="Responsable"
    >
      <option value="">(sin asignar)</option>
      {miembros.map((m) => (
        <option key={m.id} value={m.nombre}>{m.nombre}</option>
      ))}
    </select>
  );
}

/** Input inline de número entero (p. ej. diasEstimados). */
export function InlineInteger({
  value,
  onSave,
  disabled = false,
  suffix = "",
  title,
  className = "",
}: {
  value: number;
  onSave: (next: number) => void;
  disabled?: boolean;
  suffix?: string;
  title?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (disabled) {
    return <span className={`shrink-0 text-[10px] text-muted ${className}`}>{value}{suffix}</span>;
  }

  function save() {
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n) && n >= 0 && n !== value) onSave(n);
    else setDraft(String(value));
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setDraft(String(value)); setEditing(true); }}
        className={`shrink-0 rounded px-1 text-[10px] text-muted hover:bg-surface/60 hover:text-foreground ${className}`}
        title={title ?? "Editar"}
      >
        {value}{suffix}
      </button>
    );
  }
  return (
    <input
      type="number"
      min={0}
      autoFocus
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); save(); }
        if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
      }}
      className={`w-14 rounded border border-accent/40 bg-background px-1 py-0.5 text-[10px] text-foreground outline-none focus:border-accent ${className}`}
    />
  );
}
