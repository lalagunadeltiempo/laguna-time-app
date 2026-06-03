"use client";

/**
 * Helpers compartidos por los cuatro bloques temporales del árbol
 * (Anual, Trimestral, Mensual, Semanal). Aquí vive sólo lo reutilizable:
 * inputs numéricos, formateo en es-ES, hook de upsert de registros y una
 * utilidad de "línea de métrica". El resto de lógica visual la pone cada
 * bloque en su archivo propio para que puedas leerlos de un vistazo.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAppDispatch } from "@/lib/context";
import { crecimientoVsAY, porcentajeDeTotal, type CrecimientoVsAY } from "@/lib/arbol-tiempo";
import type { RentabilidadHoja } from "@/lib/rentabilidad";
import { generateId } from "@/lib/store";
import type { PrioridadEstrategica, RegistroNodo } from "@/lib/types";

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

/** Insignia de prioridad estratégica (hoja del árbol). Ausente = sin clasificar. */
export function etiquetaPrioridad(
  p: PrioridadEstrategica | undefined,
): { label: string; className: string } | null {
  if (p === "fruto") {
    return {
      label: "Fruto",
      className:
        "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
    };
  }
  if (p === "flor") {
    return {
      label: "Flor",
      className:
        "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-900 dark:text-amber-100",
    };
  }
  return null;
}

/** Sufijo « · X% »: peso de `valor` sobre el total anual de su propia serie. */
export function sufijoPctAnual(valor: number, totalAnual: number): string {
  const pct = porcentajeDeTotal(valor, totalAnual);
  if (pct === undefined) return "";
  return ` · ${fmtNum(pct)}%`;
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

/** Índice rápido de registros por clave (nodoId|periodoTipo|periodoKey). */
export type RegistrosIndex = ReadonlyMap<string, RegistroNodo>;

export function claveRegistro(
  nodoId: string,
  periodoTipo: RegistroNodo["periodoTipo"],
  periodoKey: string,
): string {
  return `${nodoId}|${periodoTipo}|${periodoKey}`;
}

export function buildRegistrosIndex(registros: RegistroNodo[]): RegistrosIndex {
  const m = new Map<string, RegistroNodo>();
  for (const r of registros) m.set(claveRegistro(r.nodoId, r.periodoTipo, r.periodoKey), r);
  return m;
}

/** Upsert genérico de un registro.
 *
 *  IMPORTANTE: este hook NO se suscribe al estado global (no llama a
 *  `useAppState`). El registro existente se pasa por argumento desde el
 *  caller, que típicamente ya lo tiene en un índice. De esta forma las
 *  cientos de filas del bloque Semanal/Mensual no re-renderizan cada
 *  vez que cambia cualquier cosa del estado. */
export function useUpsertRegistro() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: {
      nodoId: string;
      periodoTipo: RegistroNodo["periodoTipo"];
      periodoKey: string;
      existing?: RegistroNodo;
      valor?: number | undefined;
      unidades?: number | undefined;
      /** Si true y `valor` viene sin especificar, conserva el valor existente. */
      soloUnidades?: boolean;
    }) => {
      const existing = opts.existing;
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

/**
 * Versión perezosa de `<details>`: no monta los children hasta que el
 * usuario abre el desplegable por primera vez. Una vez abierto, los
 * children permanecen montados aunque se cierre (mantiene scroll y
 * estado local de inputs, y evita parpadeos en re-aperturas).
 *
 * Es CLAVE para el Árbol de objetivos: sin esto, 40+ semanas × varias
 * ramas/hojas = cientos de componentes con inputs montados de golpe
 * bloquean la pestaña al entrar en la pantalla.
 */
export function LazyDetails({
  summary,
  children,
  defaultOpen = false,
  className,
  open,
  onToggle,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const effectiveOpen = isControlled ? open! : internalOpen;
  const [everOpened, setEverOpened] = useState(defaultOpen || !!open);
  const handleToggle = useCallback(
    (e: React.SyntheticEvent<HTMLDetailsElement>) => {
      const next = (e.currentTarget as HTMLDetailsElement).open;
      if (next) setEverOpened(true);
      if (!isControlled) setInternalOpen(next);
      onToggle?.(next);
    },
    [isControlled, onToggle],
  );
  return (
    <details open={effectiveOpen} onToggle={handleToggle} className={className}>
      {summary}
      {everOpened ? children : null}
    </details>
  );
}

/**
 * Estado abierto/cerrado para `<details>` persistido en `localStorage`. La
 * clave es estable (incluye año, contexto, ID) y sólo guardamos el cambio
 * cuando el usuario abre o cierra explícitamente. Útil para mantener el
 * desplegado de ramas dentro de cada mes entre sesiones.
 */
export function usePersistedOpen(storageKey: string, defaultOpen = false): {
  open: boolean;
  onToggle: (next: boolean) => void;
} {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    try {
      const v = window.localStorage.getItem(storageKey);
      if (v === null) return defaultOpen;
      return v === "1";
    } catch {
      return defaultOpen;
    }
  });
  const onToggle = useCallback(
    (next: boolean) => {
      setOpen(next);
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* noop: navegador sin localStorage o cuota llena */
      }
    },
    [storageKey],
  );
  return { open, onToggle };
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

/** Tono verde/rojo según si el real actual supera al año anterior. */
export function accentVsAY(real: number, ay: number | undefined): "good" | "bad" | undefined {
  const ayEff = ay ?? 0;
  if (ayEff === 0 && real === 0) return undefined;
  return real >= ayEff ? "good" : "bad";
}

export function fmtDeltaVsAnioAnterior(c: CrecimientoVsAY, unidad: string): string {
  if (c.esNuevo) return `nuevo · +${fmtNum(c.deltaEur)} ${unidad}`;
  const pct =
    c.deltaPct !== undefined ? ` · ${fmtNum(c.deltaPct, { signed: true })}%` : "";
  return `${fmtNum(c.deltaEur, { signed: true })} ${unidad}${pct}`;
}

/** Valor del año anterior (línea de contexto, sin variación). */
export function MetricLineAnoAnteriorValor({
  ay,
  unidad,
  pctAnual,
}: {
  ay: number | undefined;
  unidad: string;
  /** Total anual del año anterior (denominador del %). */
  pctAnual?: number;
}) {
  if (ay === undefined || ay <= 0) return null;
  return (
    <MetricLine
      label="Año anterior"
      value={`${fmtNum(ay)} ${unidad}${pctAnual !== undefined ? sufijoPctAnual(ay, pctAnual) : ""}`}
      accent="muted"
    />
  );
}

/** Comparación interanual: euros y % (única comparación con %). */
export function MetricLineVsAnioAnterior({
  real,
  ay,
  unidad,
}: {
  real: number;
  ay: number | undefined;
  unidad: string;
}) {
  const c = crecimientoVsAY(real, ay);
  if (!c) return null;
  const tone = accentVsAY(real, ay);
  return (
    <MetricLine
      label="vs año anterior"
      value={fmtDeltaVsAnioAnterior(c, unidad)}
      accent={tone}
    />
  );
}

/** @deprecated Usar MetricLineAnoAnteriorValor + MetricLineVsAnioAnterior */
export function MetricLinesVsAY(props: {
  labelAy: string;
  real: number;
  ay: number | undefined;
  unidad: string;
}) {
  return (
    <>
      <MetricLineAnoAnteriorValor ay={props.ay} unidad={props.unidad} />
      <MetricLineVsAnioAnterior real={props.real} ay={props.ay} unidad={props.unidad} />
    </>
  );
}

/**
 * Aviso inline (no bloqueante) de doble conteo: el nodo tiene real
 * apuntado en semanas y también en el mes, y la agregación al mes SUMA
 * ambos niveles. Estética coherente con los avisos en ámbar del resto de
 * la pantalla (dark mode incluido).
 */
export function AvisoDobleConteo() {
  return (
    <p className="mt-1 rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-800 dark:text-amber-200">
      <strong>Aviso:</strong> hay real apuntado en semanas y también en el mes para este objetivo; se están{" "}
      <strong>sumando ambos</strong>. Apunta el real en un solo nivel para evitar doble conteo.
    </p>
  );
}

/**
 * Línea de "Rentabilidad = ventas ÷ tiempo" (€/hora) de una hoja en el mes.
 * Muestra también las horas registradas para que se vea la fiabilidad del
 * dato. Casos:
 *  - Sin horas → "sin horas registradas" (no se divide por cero).
 *  - Hoja "flor" → "inversión, aún no rinde" en vez de alarmar por €/h bajo.
 *  - Con horas de mantenimiento → se indica discretamente "incl. Y h
 *    mantenimiento" (esas horas cuentan y bajan el €/h).
 * Estética coherente con la pista de entregables (dark mode incluido).
 */
export function LineaRentabilidad({ r }: { r: RentabilidadHoja }) {
  if (r.horas === 0) {
    return (
      <p className="mt-1 text-[10px] text-muted">
        Rentabilidad: <span className="italic">sin horas registradas</span>
      </p>
    );
  }
  const horasTxt = `${fmtNum(r.horas)} h registradas`;
  const mantenimiento =
    r.horasMantenimiento > 0
      ? ` · incl. ${fmtNum(r.horasMantenimiento)} h mantenimiento`
      : "";
  return (
    <p className="mt-1 text-[10px] text-muted">
      Rentabilidad:{" "}
      {r.esFlor ? (
        <span className="text-amber-700 dark:text-amber-300">inversión, aún no rinde</span>
      ) : (
        <strong className="tabular-nums text-foreground">{fmtNum(r.eurosPorHora)} €/h</strong>
      )}
      {" · "}
      <span className="tabular-nums">{horasTxt}</span>
      {mantenimiento}
    </p>
  );
}

/** Fragmento inline para filas compactas: Año anterior + vs año anterior. */
export function InlineVsAY({
  real,
  ay,
  unidad,
}: {
  real: number;
  ay: number | undefined;
  unidad: string;
}) {
  const c = crecimientoVsAY(real, ay);
  if (!c) return null;
  const tone = accentVsAY(real, ay);
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "bad"
        ? "text-red-700 dark:text-red-300"
        : "text-foreground";
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1">
      {ay !== undefined && ay > 0 && (
        <span>
          Año anterior:{" "}
          <strong className="text-foreground">
            {fmtNum(ay)} {unidad}
          </strong>
        </span>
      )}
      <span className={toneClass}>
        <strong>{fmtDeltaVsAnioAnterior(c, unidad)}</strong>
      </span>
    </span>
  );
}
