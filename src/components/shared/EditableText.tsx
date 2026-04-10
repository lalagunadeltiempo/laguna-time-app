"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  tag?: "span" | "h1" | "h2" | "h3" | "p";
}

export function EditableText({
  value,
  onChange,
  className = "",
  placeholder = "Sin nombre",
  multiline = false,
  tag = "span",
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = useCallback(() => {
    const t = draft.trim();
    if (t && t !== value) onChange(t);
    setEditing(false);
  }, [draft, value, onChange]);

  if (editing) {
    const shared = `w-full rounded-lg border-2 border-accent bg-background px-3 py-2 outline-none ${className}`;
    if (multiline) {
      return (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
          rows={3}
          className={shared}
        />
      );
    }
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        value={draft}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={shared}
      />
    );
  }

  const Tag = tag;
  return (
    <Tag
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
      className={`cursor-text rounded-lg px-3 py-1 transition-colors hover:bg-accent-soft ${className}`}
    >
      {value || <span className="italic text-muted">{placeholder}</span>}
    </Tag>
  );
}
