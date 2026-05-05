"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Normaliza un draft de hora a `"HH:MM"` o `null` si no es una hora válida.
 *
 * Acepta tres formatos:
 *  - 4 dígitos sin separador: `"0830"` → `"08:30"`
 *  - `H:MM` con un dígito de hora: `"8:30"` → `"08:30"`
 *  - `HH:MM` ya canónico: `"08:30"` → `"08:30"`
 *
 * Devuelve `null` para entradas incompletas (1, 2 o 3 dígitos sin completar
 * el formato), valores fuera de rango (HH > 23, MM > 59) o cadenas vacías.
 */
export function parseHora(draft: string): string | null {
  const trimmed = draft.trim();
  if (!trimmed) return null;
  if (!/^[0-9:]+$/.test(trimmed)) return null;

  let hh: string;
  let mm: string;

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length !== 2) return null;
    const [h, m] = parts;
    if (!h || !m) return null;
    if (h.length < 1 || h.length > 2) return null;
    if (m.length !== 2) return null;
    hh = h.padStart(2, "0");
    mm = m;
  } else {
    if (trimmed.length !== 4) return null;
    hh = trimmed.slice(0, 2);
    mm = trimmed.slice(2, 4);
  }

  const hNum = Number(hh);
  const mNum = Number(mm);
  if (!Number.isFinite(hNum) || !Number.isFinite(mNum)) return null;
  if (hNum < 0 || hNum > 23) return null;
  if (mNum < 0 || mNum > 59) return null;

  return `${hh}:${mm}`;
}

/**
 * Filtra y auto-formatea el input mientras se teclea: deja sólo dígitos y
 * `:`, y cuando hay 3+ dígitos seguidos sin separador inserta un `:` después
 * del segundo dígito. Limita a 5 caracteres (`HH:MM`).
 *
 * Esto NO valida ni commitea — sólo da feedback visual mientras se escribe.
 */
function autoFormat(input: string): string {
  let cleaned = "";
  for (const ch of input) {
    if (/[0-9:]/.test(ch)) cleaned += ch;
  }
  if (!cleaned.includes(":") && cleaned.length >= 3) {
    cleaned = cleaned.slice(0, 2) + ":" + cleaned.slice(2);
  }
  return cleaned.slice(0, 5);
}

type Props = {
  value: string | null;
  onCommit: (hhmm: string | null) => void;
  ariaLabel: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  allowEmpty?: boolean;
};

/**
 * Input de hora *de texto*, sin selector nativo.
 *
 * Se diferencia de `<input type="time">` en que:
 *  - permite escribir libremente sin abrir un picker;
 *  - NO commitea mientras se teclea (ni al pasar por estados parcialmente
 *    válidos), sólo al perder foco o pulsar Enter — esto evita el problema
 *    de Chrome donde un parser parcial dispara `onChange` antes de tiempo.
 *
 * Reglas de commit:
 *  - `Enter` o `blur` con draft que normaliza a hora válida → `onCommit("HH:MM")`.
 *  - `Enter` o `blur` con draft vacío y `allowEmpty` → `onCommit(null)`.
 *  - `Enter` o `blur` con draft inválido → revierte al `value` previo y NO commitea.
 *  - `Escape` → revierte y suelta el foco sin commitear.
 *  - Si `value` cambia desde fuera y el input no está enfocado, sincroniza el draft.
 */
export function HoraTextInput({
  value,
  onCommit,
  ariaLabel,
  title,
  className,
  style,
  placeholder = "HH:MM",
  allowEmpty = true,
}: Props) {
  const [draft, setDraft] = useState<string>(value ?? "");
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value ?? "");
  }, [value]);

  function commit(input: HTMLInputElement) {
    const normalized = parseHora(draft);
    if (normalized) {
      setDraft(normalized);
      input.value = normalized;
      if (normalized !== (value ?? null)) onCommit(normalized);
      return;
    }
    if (!draft.trim()) {
      if (allowEmpty) {
        if (value !== null) onCommit(null);
      } else {
        setDraft(value ?? "");
      }
      return;
    }
    setDraft(value ?? "");
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9:]*"
      maxLength={5}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      title={title}
      className={className}
      style={style}
      onChange={(e) => setDraft(autoFormat(e.target.value))}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={(e) => {
        focusedRef.current = false;
        commit(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(e.currentTarget);
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(value ?? "");
          e.currentTarget.blur();
        }
      }}
    />
  );
}
