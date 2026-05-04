"use client";

/**
 * Helpers compartidos por los cuatro bloques temporales del árbol
 * (Anual, Trimestral, Mensual, Semanal). Aquí vive sólo lo reutilizable:
 * inputs numéricos, formateo en es-ES, hook de upsert de registros y una
 * utilidad de "línea de métrica". El resto de lógica visual la pone cada
 * bloque en su archivo propio para que puedas leerlos de un vistazo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { generateId } from "@/lib/store";
import { EMPTY_ARBOL, type RegistroNodo } from "@/lib/types";

export function isUnidadEuros(unidad?: string): boolean {
  if (!unidad) return false;
  const u = unidad.trim().toLowerCase();
  return u === "€" || u === "eur" || u === "euro" || u === "euros";
}

/** Parser tolerante: acepta "342342,99", "342.342,99", "342342.99", "342,342.99". */
export function parseEsNumber(input: string): number | null {
  const cleaned = input.replace(/\s|€|euros?|eur/gi, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let normalized = cleaned;
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) normalized = cleaned.replace(/\./g, "").replace(",", ".");
    else normalized = cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0) {
    if ((cleaned.match(/\./g) ?? []).length > 1) normalized = cleaned.replace(/\./g, "");
  }
  const v = parseFloat(normalized);
  return Number.isFinite(v) ? v : null;
}

export function fmtNum(n: number | undefined | null, { signed = false } = {}): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const opts: Intl.NumberFormatOptions = abs >= 100 ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 2 };
  const s = abs.toLocaleString("es-ES", opts);
  if (!signed) return n < 0 ? `−${s}` : s;
  if (n > 0) return `+${s}`;
  if (n < 0) return `−${s}`;
  return s;
}

export function formatDisplay(v: number | undefined, isEuro: boolean): string {
  if (v === undefined || !Number.isFinite(v)) return "";
  const s = v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return isEuro ? `${s} €` : s;
}

export function formatEditable(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return "";
  return String(v).replace(".", ",");
}

export function NumberInput({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  unidad,
  compact,
  disabled,
  title,
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  placeholder?: string;
  ariaLabel: string;
  unidad?: string;
  compact?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const isEuro = isUnidadEuros(unidad);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatDisplay(value, isEuro));

  useEffect(() => {
    if (!focused) setText(formatDisplay(value, isEuro));
  }, [value, isEuro, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      value={text}
      onFocus={() => {
        if (disabled) return;
        setFocused(true);
        setText(formatEditable(value));
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const t = text.trim();
        if (t === "") {
          setText("");
          onCommit(undefined);
          return;
        }
        const v = parseEsNumber(t);
        if (v === null) {
          setText(formatDisplay(value, isEuro));
          return;
        }
        setText(formatDisplay(v, isEuro));
        onCommit(v);
      }}
      placeholder={placeholder ?? (isEuro ? "0 €" : "0")}
      className={`w-full rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums disabled:opacity-50 ${
        compact ? "min-w-[4.5rem]" : "min-w-[5rem]"
      }`}
    />
  );
}

export function PercentInput({
  value,
  onCommit,
  ariaLabel,
  disabled,
  title,
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  ariaLabel: string;
  disabled?: boolean;
  title?: string;
}) {
  const formatPctDisplay = (v: number | undefined): string => {
    if (v === undefined || !Number.isFinite(v)) return "";
    return `${v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} %`;
  };
  const formatPctEditable = (v: number | undefined): string => {
    if (v === undefined || !Number.isFinite(v)) return "";
    return String(v).replace(".", ",");
  };
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatPctDisplay(value));

  useEffect(() => {
    if (!focused) setText(formatPctDisplay(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      disabled={disabled}
      title={title}
      placeholder={disabled ? "Sin total" : "0 %"}
      onFocus={() => {
        if (disabled) return;
        setFocused(true);
        setText(formatPctEditable(value));
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const t = text.trim();
        if (t === "") {
          setText("");
          onCommit(undefined);
          return;
        }
        const v = parseEsNumber(t.replace(/%/g, ""));
        if (v === null) {
          setText(formatPctDisplay(value));
          return;
        }
        const clamped = Math.max(0, v);
        setText(formatPctDisplay(clamped));
        onCommit(clamped);
      }}
      className="w-full min-w-[5rem] rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums disabled:opacity-50"
    />
  );
}

/** Upsert genérico de un registro por (nodoId, periodoTipo, periodoKey).
 *  Si el valor resultante es `undefined` y no había unidades, borra el registro. */
export function useUpsertRegistro() {
  const dispatch = useAppDispatch();
  const registrosRef = useRef<RegistroNodo[]>([]);
  const state = useAppState();
  const arbol = state.arbol ?? EMPTY_ARBOL;
  registrosRef.current = arbol.registros;
  return useCallback(
    (opts: {
      nodoId: string;
      periodoTipo: RegistroNodo["periodoTipo"];
      periodoKey: string;
      valor?: number | undefined;
      unidades?: number | undefined;
      /** Si true y `valor` viene sin especificar, conserva el valor existente. */
      soloUnidades?: boolean;
    }) => {
      const existing = registrosRef.current.find(
        (r) =>
          r.nodoId === opts.nodoId &&
          r.periodoTipo === opts.periodoTipo &&
          r.periodoKey === opts.periodoKey,
      );
      const nextValor = opts.soloUnidades ? existing?.valor : opts.valor;
      const nextUnidades = opts.unidades;
      if (nextValor === undefined && (nextUnidades === undefined || !Number.isFinite(nextUnidades))) {
        if (existing) dispatch({ type: "DELETE_REGISTRO_NODO", id: existing.id });
        return;
      }
      const now = new Date().toISOString();
      dispatch({
        type: "UPSERT_REGISTRO_NODO",
        payload: {
          id: existing?.id ?? generateId(),
          nodoId: opts.nodoId,
          periodoTipo: opts.periodoTipo,
          periodoKey: opts.periodoKey,
          valor: nextValor ?? 0,
          unidades: nextUnidades,
          nota: existing?.nota,
          estadoRealidad: existing?.estadoRealidad,
          realidadPorQue: existing?.realidadPorQue,
          creado: existing?.creado ?? now,
          actualizado: now,
        },
      });
    },
    [dispatch],
  );
}

export function MetricLine({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "good" | "bad" | "muted";
}) {
  const tone =
    accent === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : accent === "bad"
        ? "text-red-700 dark:text-red-300"
        : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}
