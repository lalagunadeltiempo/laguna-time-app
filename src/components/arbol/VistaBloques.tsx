"use client";

import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { generateId } from "@/lib/store";
import {
  EMPTY_ARBOL,
  type NodoArbol,
  type PlanArbolConfigAnio,
  type RegistroNodo,
  type TrimestreKey,
} from "@/lib/types";
import {
  buildArbolIndices,
  cuotaAjustada,
  defaultSemanasNoActivas,
  ensureConfigAnio,
  estadoPeriodo,
  formatWeekRange,
  hijosSumaDirectos,
  hijosSumaDirectosIdx,
  isoWeekLabelFromMondayKey,
  mesKeyFromDate,
  mesKeysEnTrimestre,
  metaEfectivaNodoIdx,
  metaParaNodoEnPeriodo,
  metaParaPeriodo,
  metaSemanalPropuesta,
  planEsFijadoPorTrimestre,
  mondaysInCalendarYear,
  diasLaborablesEnAnio,
  parseLocalDateKey,
  planAgregadoEnPeriodoIdx,
  ramasDirectas,
  realAnioPasadoAgregadoIdx,
  realDelAnioHastaHoyLista,
  realEfectivoEnPeriodoIdx,
  trimestreKeyFromMesKey,
  type ArbolIndices,
  type VistaPeriodoArbol,
} from "@/lib/arbol-tiempo";

const MESES_CORTOS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Solo año actual y trimestre calendario actual abren «Ramas» por defecto (primera visita sin localStorage). */
function defaultTarjetaRamasAbierta(vista: VistaPeriodoArbol, periodoKey: string, year: number): boolean {
  if (vista === "anio" && periodoKey === String(year)) return true;
  if (vista === "trimestre") {
    const qNow = trimestreKeyFromMesKey(mesKeyFromDate(new Date()));
    return periodoKey === qNow;
  }
  return false;
}

function labelCuotaSegunVista(vista: VistaPeriodoArbol, modo: "actual" | "futuro"): string {
  const a = modo === "futuro" ? "Lo que tocará" : "Lo que te toca";
  switch (vista) {
    case "semana":
      return `${a} esta semana`;
    case "mes":
      return `${a} este mes`;
    case "trimestre":
      return `${a} este trimestre`;
    case "anio":
      return modo === "futuro" ? "Media semanal ajustada" : "Media semanal (ajustada)";
    default:
      return a;
  }
}

function fmtNum(n: number | undefined | null, { signed = false } = {}): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const opts: Intl.NumberFormatOptions = abs >= 100 ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 2 };
  const s = abs.toLocaleString("es-ES", opts);
  if (!signed) return n < 0 ? `−${s}` : s;
  if (n > 0) return `+${s}`;
  if (n < 0) return `−${s}`;
  return s;
}

function MetricLine({ label, value, accent }: { label: string; value: string; accent?: "good" | "bad" | "muted" }) {
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

/** Estado booleano persistido en localStorage. SSR-safe: lee solo tras montar para evitar hydration mismatch. */
function useLocalBoolean(storageKey: string, defaultOpen: boolean): [boolean, (next: boolean) => void] {
  const [open, setOpenState] = useState<boolean>(defaultOpen);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "1") setOpenState(true);
      else if (raw === "0") setOpenState(false);
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );
  return [open, setOpen];
}

/** Sección colapsable con título y persistencia de estado en localStorage. */
function SeccionColapsable({
  storageKey,
  defaultOpen,
  titulo,
  resumen,
  children,
}: {
  storageKey: string;
  defaultOpen: boolean;
  titulo: string;
  /** Texto pequeño a la derecha del título (resumen) cuando está cerrada o abierta. */
  resumen?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useLocalBoolean(storageKey, defaultOpen);
  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-surface/30">
      <button
        type="button"
        onClick={() => startTransition(() => setOpen(!open))}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-surface/60"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={`inline-block text-xs text-muted transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
        </span>
        {resumen && <span className="truncate text-[11px] text-muted">{resumen}</span>}
      </button>
      {open && <div className="space-y-3 border-t border-border/60 px-3 py-3">{children}</div>}
    </section>
  );
}

function isUnidadEuros(unidad?: string): boolean {
  if (!unidad) return false;
  const u = unidad.trim().toLowerCase();
  return u === "€" || u === "eur" || u === "euro" || u === "euros";
}

/** Parser tolerante: acepta "342342,99", "342.342,99", "342342.99", "342,342.99". */
function parseEsNumber(input: string): number | null {
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

/** Formato display: "342.342,99 €" o "342.342,99". Sin decimales si es entero. */
function formatDisplay(v: number | undefined, isEuro: boolean): string {
  if (v === undefined || !Number.isFinite(v)) return "";
  const s = v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return isEuro ? `${s} €` : s;
}

/** Formato editable: "342342,99" (coma decimal, sin miles, sin sufijo). */
function formatEditable(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return "";
  return String(v).replace(".", ",");
}

function NumberInput({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  unidad,
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  placeholder?: string;
  ariaLabel: string;
  /** Si la unidad es euros, se muestra "342.342,99 €" cuando el campo no está enfocado. */
  unidad?: string;
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
      value={text}
      onFocus={() => {
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
      className="w-full min-w-[5rem] rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
    />
  );
}

/** Input dedicado a porcentajes (formato es-ES, sufijo «%»). Permite vacío. */
function PercentInput({
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

function periodoTipoDeVista(v: VistaPeriodoArbol): RegistroNodo["periodoTipo"] {
  return v === "semana" ? "semana" : v === "mes" ? "mes" : v === "trimestre" ? "trimestre" : "anio";
}

/** Upsert genérico de un registro por (nodoId, año, periodoTipo, periodoKey). */
function useUpsertRegistro() {
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

interface ContextoBloque {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  idx: ArbolIndices;
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
}

/** Tarjeta horizontal con Plan / Real / Año pasado / Δ y, en futuros, ajustado. */
const TarjetaPeriodo = memo(function TarjetaPeriodo({
  ctx,
  vista,
  periodoKey,
  titulo,
  subtitulo,
}: {
  ctx: ContextoBloque;
  vista: VistaPeriodoArbol;
  periodoKey: string;
  titulo: string;
  subtitulo?: string;
}) {
  const { raiz, ramas, registros, config, year, unidad, idx } = ctx;
  const periodoTipo = periodoTipoDeVista(vista);

  const plan = useMemo(
    () => metaParaNodoEnPeriodo(raiz, vista, periodoKey, year, config),
    [raiz, vista, periodoKey, year, config],
  );
  const planFijado = useMemo(
    () => planEsFijadoPorTrimestre(raiz, vista, periodoKey),
    [raiz, vista, periodoKey],
  );
  /**
   * Total real de la tarjeta. Usa recursión por hojas si las hay (con fallback a los registros
   * directos de la raíz cuando las hojas están vacías), para que el usuario pueda apuntar
   * un total en la raíz como atajo sin perder el desglose detallado.
   */
  const real = useMemo(
    () => realEfectivoEnPeriodoIdx(idx, raiz.id, vista, periodoKey),
    [idx, raiz.id, vista, periodoKey],
  );
  /**
   * Año pasado de la tarjeta: recursa por hojas, con fallback a apuntes directos en la raíz y,
   * finalmente, al árbol del año anterior emparejado por nombre/path.
   */
  const anioPasado = useMemo(
    () => realAnioPasadoAgregadoIdx(idx, raiz.id, vista, periodoKey),
    [idx, raiz.id, vista, periodoKey],
  );

  const realHastaHoy = useMemo(
    () => realDelAnioHastaHoyLista(idx.regsPorNodo.get(raiz.id), year),
    [idx, raiz.id, year],
  );
  const ajuste = useMemo(
    () => cuotaAjustada({ metaAnual: raiz.metaValor ?? 0, realHastaHoy, anio: year, config }),
    [raiz.metaValor, realHastaHoy, year, config],
  );
  const estado = estadoPeriodo(vista, periodoKey, year);

  const ajustado: number | undefined = useMemo(() => {
    if (raiz.metaValor === undefined) return undefined;
    if (estado === "pasado") return undefined;
    if (vista === "semana") return ajuste.semanaRestante;
    if (vista === "mes") return ajuste.mesRestante(periodoKey);
    if (vista === "trimestre") return ajuste.trimRestante(periodoKey);
    if (vista === "anio") return ajuste.semanaRestante;
    return undefined;
  }, [estado, vista, periodoKey, ajuste, raiz.metaValor]);

  const metaAnual = raiz.metaValor ?? 0;
  const objetivoCumplido = metaAnual > 0 && realHastaHoy >= metaAnual;

  const deltaPlan = plan !== undefined ? real - plan : undefined;
  const deltaAnioPasado =
    anioPasado !== undefined && anioPasado > 0 ? real - anioPasado : undefined;

  const pct = plan && plan > 0 ? Math.min(100, Math.round((real / plan) * 100)) : real > 0 ? 100 : 0;
  const showProgressBar = estado === "pasado" || estado === "actual";
  const upsert = useUpsertRegistro();

  const ramasStorageKey = `arbol.vista-bloques.ramas.${vista}.${periodoKey}`;
  const [ramasOpen, setRamasOpen] = useLocalBoolean(
    ramasStorageKey,
    defaultTarjetaRamasAbierta(vista, periodoKey, year),
  );

  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{titulo}</h3>
          {subtitulo && <p className="text-[10px] text-muted">{subtitulo}</p>}
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
            estado === "pasado"
              ? "bg-surface text-muted"
              : estado === "actual"
                ? "bg-accent/15 text-accent"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-200"
          }`}
        >
          {estado}
        </span>
      </div>

      {/* Jerarquía: pasado = Real grande; actual/futuro = cuota ajustada grande (o «Hecho» si ya cumpliste el año) */}
      <div className="mt-3">
        {estado === "pasado" && (
          <>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Real</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {fmtNum(real)} <span className="text-base font-semibold text-muted">{unidad}</span>
            </p>
            <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
              <MetricLine
                label={planFijado ? "Plan (fijado en config)" : "Plan original (prorrateo)"}
                value={plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"}
                accent="muted"
              />
              {deltaPlan !== undefined && (
                <MetricLine
                  label="Δ vs plan"
                  value={`${fmtNum(deltaPlan, { signed: true })} ${unidad}`}
                  accent={deltaPlan >= 0 ? "good" : "bad"}
                />
              )}
              {anioPasado !== undefined && (
                <MetricLine
                  label="Año pasado (referencia)"
                  value={`${fmtNum(anioPasado)} ${unidad}`}
                  accent="muted"
                />
              )}
              {deltaAnioPasado !== undefined && (
                <MetricLine
                  label="Δ vs año pasado"
                  value={`${fmtNum(deltaAnioPasado, { signed: true })} ${unidad}`}
                  accent={deltaAnioPasado >= 0 ? "good" : "bad"}
                />
              )}
            </div>
          </>
        )}

        {estado === "actual" && (
          <>
            {objetivoCumplido ? (
              <>
                <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Estado
                </p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">Hecho</p>
                <p className="text-[11px] text-muted">Ya superaste el objetivo del año. Sigue apuntando si quieres llevar el registro.</p>
              </>
            ) : (
              <>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  {labelCuotaSegunVista(vista, "actual")}
                </p>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {ajustado !== undefined ? fmtNum(ajustado) : "—"}{" "}
                  <span className="text-base font-semibold text-muted">{unidad}</span>
                </p>
              </>
            )}
            <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
              <MetricLine
                label={planFijado ? "Plan (fijado en config)" : "Plan original (prorrateo)"}
                value={plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"}
                accent="muted"
              />
              <MetricLine label="Real acumulado (año)" value={`${fmtNum(realHastaHoy)} ${unidad}`} />
            </div>
          </>
        )}

        {estado === "futuro" && (
          <>
            {objetivoCumplido ? (
              <>
                <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Estado
                </p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">Hecho</p>
                <p className="text-[11px] text-muted">Objetivo del año ya cubierto. El plan original sigue como referencia.</p>
              </>
            ) : (
              <>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  {labelCuotaSegunVista(vista, "futuro")}
                </p>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {ajustado !== undefined ? fmtNum(ajustado) : "—"}{" "}
                  <span className="text-base font-semibold text-muted">{unidad}</span>
                </p>
              </>
            )}
            <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
              <MetricLine
                label={planFijado ? "Plan (fijado en config)" : "Plan original (prorrateo)"}
                value={plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"}
                accent="muted"
              />
            </div>
          </>
        )}
      </div>

      {showProgressBar && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {ramas.length > 0 && (
        <details
          open={ramasOpen}
          onToggle={(e) =>
            startTransition(() => setRamasOpen((e.currentTarget as HTMLDetailsElement).open))
          }
          className="mt-3 rounded-lg border border-border/60 bg-surface/30"
        >
          <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-muted marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className={`text-[10px] transition-transform ${ramasOpen ? "rotate-90" : ""}`}>▶</span>
              Ramas ({ramas.length})
            </span>
          </summary>
          {ramasOpen && (
            <div className="space-y-2 border-t border-border/60 px-2 py-2">
              {ramas.map((rama) => (
                <FilaRama
                  key={rama.id}
                  rama={rama}
                  raiz={raiz}
                  idx={idx}
                  nodos={ctx.nodos}
                  registros={registros}
                  vista={vista}
                  periodoKey={periodoKey}
                  year={year}
                  config={config}
                  unidad={unidad}
                  planRaizPeriodo={plan}
                />
              ))}
            </div>
          )}
        </details>
      )}

      {/* El apunte directo en la raíz solo tiene sentido cuando aún no hay hojas. Si ya hay estructura,
          todos los apuntes se hacen a nivel hoja y la raíz se calcula por suma. */}
      {vista === "mes" && ramas.length === 0 && (() => {
        const regActual = registros.find(
          (r) => r.nodoId === raiz.id && r.periodoTipo === periodoTipo && r.periodoKey === periodoKey,
        );
        return (
          <div className="mt-3">
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Apuntar real (total {titulo})
              <NumberInput
                value={regActual?.valor}
                onCommit={(v) =>
                  upsert({
                    nodoId: raiz.id,
                    periodoTipo,
                    periodoKey,
                    valor: v,
                    unidades: regActual?.unidades,
                  })
                }
                ariaLabel={`Real ${titulo}`}
                unidad={unidad}
              />
            </label>
            <p className="mt-1 text-[10px] text-muted">
              Cuando añadas ramas y hojas, el real de la raíz se calculará automáticamente como suma de las hojas.
            </p>
          </div>
        );
      })()}
    </div>
  );
});

function desplazarUnAnio(periodoTipo: RegistroNodo["periodoTipo"], periodoKey: string): string {
  if (periodoTipo === "anio") return String(parseInt(periodoKey, 10) - 1);
  if (periodoTipo === "trimestre") return `${parseInt(periodoKey.split("-Q")[0], 10) - 1}-Q${periodoKey.split("-Q")[1]}`;
  if (periodoTipo === "mes") {
    const [y, m] = periodoKey.split("-");
    return `${parseInt(y, 10) - 1}-${m}`;
  }
  // semana
  // delegamos al helper exportado
  return desplazarSemanaUnAnio(periodoKey);
}
function desplazarSemanaUnAnio(periodoKey: string): string {
  // mismo número ISO en el año anterior
  const isoLabel = isoWeekLabelFromMondayKey(periodoKey);
  const sPart = isoLabel.split(" · ")[0];
  const weekNum = parseInt(sPart.slice(1), 10);
  const yPrev = parseLocalDateKey(periodoKey).getFullYear() - 1;
  const candidates = mondaysInCalendarYear(yPrev);
  const match = candidates.find((mk) =>
    isoWeekLabelFromMondayKey(mk).startsWith(`S${String(weekNum).padStart(2, "0")} `),
  );
  return match ?? candidates[0] ?? periodoKey;
}

function FormNuevaHoja({
  rama,
  raiz,
  year,
  nodos,
  registros,
  onCancel,
  onCreated,
}: {
  rama: NodoArbol;
  raiz: NodoArbol;
  year: number;
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const dispatch = useAppDispatch();
  const regsEnRama = useMemo(() => registros.filter((r) => r.nodoId === rama.id), [registros, rama.id]);
  const tieneRegsPropios = regsEnRama.length > 0;
  const [nombre, setNombre] = useState(tieneRegsPropios ? "Sin asignar" : "");
  const [meta, setMeta] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tieneRegsPropios) {
      if (
        !window.confirm(
          "Esta rama ya tiene apuntes propios. Vamos a moverlos a una hoja «Sin asignar» para no perderlos. ¿Continuar?",
        )
      )
        return;
    }
    const hojaNombre = tieneRegsPropios ? "Sin asignar" : nombre.trim() || "Hoja";
    const hojaId = generateId();
    const siblings = hijosSumaDirectos(nodos, rama.id, year);
    const orden = siblings.length > 0 ? Math.max(...siblings.map((s) => s.orden), 0) + 1 : 0;
    const m = parseFloat(meta.replace(",", "."));
    const now = new Date().toISOString();
    dispatch({
      type: "ADD_NODO_ARBOL",
      payload: {
        id: hojaId,
        anio: year,
        parentId: rama.id,
        orden,
        nombre: hojaNombre,
        tipo: "palanca",
        cadencia: "anual",
        relacionConPadre: "suma",
        metaValor: Number.isFinite(m) ? m : undefined,
        metaUnidad: raiz.metaUnidad,
        contadorModo: "manual",
        creado: now,
      },
    });
    if (tieneRegsPropios) {
      dispatch({ type: "REASSIGN_REGISTROS_NODO", fromNodoId: rama.id, toNodoId: hojaId });
    }
    onCreated();
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded border border-accent/30 bg-accent/5 p-2">
      <p className="text-[10px] text-muted">Nueva hoja en «{rama.nombre}»</p>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Nombre
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          disabled={tieneRegsPropios}
          title={tieneRegsPropios ? "Se usará «Sin asignar» para conservar los apuntes existentes" : undefined}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Meta anual (opcional)
        <input
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          className="w-28 rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
        >
          Crear hoja
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Nodo hoja de detalle (rama sin sub-hojas o hoja bajo rama): métricas + apunte €/% + año pasado. */
const FilaHojaArbol = memo(function FilaHojaArbol({
  idx,
  nodo,
  registros,
  vista,
  periodoKey,
  year,
  config,
  unidad,
  planBasePct,
  modoStoragePrefix,
  compact,
  tituloExtra,
  puedeEliminar,
  onEliminar,
}: {
  idx: ArbolIndices;
  nodo: NodoArbol;
  registros: RegistroNodo[];
  vista: VistaPeriodoArbol;
  periodoKey: string;
  year: number;
  config: PlanArbolConfigAnio | undefined;
  unidad: string;
  /** Plan del periodo del «padre» para apuntar en % (rama → plan raíz; hoja → plan de la rama en el periodo). */
  planBasePct: number | undefined;
  modoStoragePrefix: "rama" | "hoja";
  compact?: boolean;
  tituloExtra?: string;
  puedeEliminar?: boolean;
  onEliminar?: () => void;
}) {
  const upsert = useUpsertRegistro();
  const periodoTipo = periodoTipoDeVista(vista);

  const plan = useMemo(
    () => planAgregadoEnPeriodoIdx(idx, nodo, vista, periodoKey, config),
    [idx, nodo, vista, periodoKey, config],
  );
  const planFijado = useMemo(
    () => planEsFijadoPorTrimestre(nodo, vista, periodoKey),
    [nodo, vista, periodoKey],
  );
  const real = useMemo(
    () => realEfectivoEnPeriodoIdx(idx, nodo.id, vista, periodoKey),
    [idx, nodo.id, vista, periodoKey],
  );
  const anioPasado = useMemo(
    () => realAnioPasadoAgregadoIdx(idx, nodo.id, vista, periodoKey),
    [idx, nodo.id, vista, periodoKey],
  );

  const registroActual = registros.find(
    (r) => r.nodoId === nodo.id && r.periodoTipo === periodoTipo && r.periodoKey === periodoKey,
  );
  const valorReal = registroActual?.valor;
  const unidadesReal = registroActual?.unidades;
  const ayKey = desplazarUnAnio(periodoTipo, periodoKey);
  const registroAy = registros.find(
    (r) => r.nodoId === nodo.id && r.periodoTipo === periodoTipo && r.periodoKey === ayKey,
  );
  const valorAnioPasado = registroAy?.valor;
  const unidadesAnioPasado = registroAy?.unidades;

  const deltaPlan = plan !== undefined ? real - plan : undefined;

  const modoStorageKey = `arbol.fila-${modoStoragePrefix}.modo.${nodo.id}.${periodoTipo}`;
  const [modoEs, setModoEs] = useState<"eur" | "pct">("eur");
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(modoStorageKey);
      if (raw === "eur" || raw === "pct") setModoEs(raw);
    } catch {
      /* ignore */
    }
  }, [modoStorageKey]);
  const cambiaModo = (next: "eur" | "pct") => {
    setModoEs(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(modoStorageKey, next);
    } catch {
      /* ignore */
    }
  };

  const realComoPct =
    planBasePct !== undefined && planBasePct > 0 && valorReal !== undefined ? (valorReal / planBasePct) * 100 : undefined;
  const pctDeshabilitado = !(planBasePct !== undefined && planBasePct > 0);

  const pad = compact ? "px-1.5 py-1.5" : "px-2 py-2";

  return (
    <div className={`rounded-md bg-background ring-1 ring-border/40 ${pad}`}>
      {(tituloExtra || puedeEliminar) && (
        <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
          {tituloExtra && <p className="truncate text-[11px] font-medium text-foreground">{tituloExtra}</p>}
          {puedeEliminar && onEliminar && (
            <button
              type="button"
              onClick={onEliminar}
              className="rounded px-1 py-0.5 text-[10px] text-muted hover:text-red-600"
              aria-label={`Eliminar ${tituloExtra ?? nodo.nombre}`}
            >
              ✕
            </button>
          )}
        </div>
      )}
      <div
        className={`grid gap-x-3 gap-y-1 text-[11px] ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}
      >
        <span className="text-muted">
          Plan <strong className="tabular-nums text-foreground">{plan !== undefined ? fmtNum(plan) : "—"}</strong>
          {planFijado && plan !== undefined && (
            <span
              className="ml-1 rounded bg-accent/15 px-1 text-[9px] font-medium uppercase tracking-wide text-accent"
              title="Plan fijado en «Plan trimestral de ramas y hojas»"
            >
              fijado
            </span>
          )}
        </span>
        <span className="text-muted">
          Real <strong className="tabular-nums text-foreground">{fmtNum(real)}</strong>
          {unidadesReal !== undefined && Number.isFinite(unidadesReal) && unidadesReal !== 0 && (
            <span className="ml-1 text-muted">· {fmtNum(unidadesReal)} uds</span>
          )}
        </span>
        <span className="text-muted">
          Año pasado{" "}
          <strong className="tabular-nums text-foreground">
            {anioPasado !== undefined ? fmtNum(anioPasado) : "—"}
          </strong>
          {unidadesAnioPasado !== undefined && Number.isFinite(unidadesAnioPasado) && unidadesAnioPasado !== 0 && (
            <span className="ml-1 text-muted">· {fmtNum(unidadesAnioPasado)} uds</span>
          )}
        </span>
        {deltaPlan !== undefined && (
          <span className={`tabular-nums ${deltaPlan >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
            Δ {fmtNum(deltaPlan, { signed: true })}
          </span>
        )}
      </div>
      {/* Solo las hojas se apuntan, y solo en mes o semana. La rama/raíz se calculan por suma.
          El año pasado se resuelve automáticamente por nombre/path; no hay input manual. */}
      {modoStoragePrefix === "hoja" && (vista === "mes" || vista === "semana") && (
        <div className="mt-2 flex flex-col gap-1 text-[10px] text-muted">
          <div className="flex items-center justify-between gap-2">
            <span>Apuntar real</span>
            <span className="inline-flex overflow-hidden rounded border border-border text-[9px]">
              <button
                type="button"
                onClick={() => cambiaModo("eur")}
                className={`px-1.5 py-0.5 ${modoEs === "eur" ? "bg-accent text-white" : "bg-background text-muted"}`}
                aria-label={`Apuntar en ${unidad || "número"}`}
              >
                {unidad || "n.º"}
              </button>
              <button
                type="button"
                onClick={() => cambiaModo("pct")}
                disabled={pctDeshabilitado}
                title={pctDeshabilitado ? "Define un plan base en este periodo para apuntar en %" : ""}
                className={`px-1.5 py-0.5 ${
                  modoEs === "pct"
                    ? "bg-accent text-white"
                    : pctDeshabilitado
                      ? "bg-background text-muted/60"
                      : "bg-background text-muted"
                }`}
              >
                %
              </button>
            </span>
          </div>
          {modoEs === "eur" || pctDeshabilitado ? (
            <NumberInput
              value={valorReal}
              onCommit={(v) =>
                upsert({
                  nodoId: nodo.id,
                  periodoTipo,
                  periodoKey,
                  valor: v,
                  unidades: unidadesReal,
                })
              }
              ariaLabel={`Real ${nodo.nombre}`}
              unidad={unidad}
            />
          ) : (
            <PercentInput
              value={realComoPct}
              onCommit={(p) => {
                if (planBasePct === undefined || planBasePct <= 0) return;
                if (p === undefined) {
                  upsert({
                    nodoId: nodo.id,
                    periodoTipo,
                    periodoKey,
                    valor: undefined,
                    unidades: unidadesReal,
                  });
                  return;
                }
                upsert({
                  nodoId: nodo.id,
                  periodoTipo,
                  periodoKey,
                  valor: (planBasePct * p) / 100,
                  unidades: unidadesReal,
                });
              }}
              ariaLabel={`Real ${nodo.nombre} en porcentaje`}
            />
          )}
          {modoEs === "pct" && !pctDeshabilitado && (
            <span className="text-[10px] text-muted">
              Sobre plan {fmtNum(planBasePct ?? 0)} {unidad}
            </span>
          )}
          <label className="mt-1 flex items-center gap-2 text-[10px] text-muted">
            <span className="shrink-0">Uds</span>
            <NumberInput
              value={unidadesReal}
              onCommit={(u) =>
                upsert({
                  nodoId: nodo.id,
                  periodoTipo,
                  periodoKey,
                  valor: valorReal,
                  unidades: u,
                  soloUnidades: true,
                })
              }
              ariaLabel={`Unidades ${nodo.nombre}`}
              unidad="uds"
            />
          </label>
        </div>
      )}
    </div>
  );
});

const FilaRama = memo(function FilaRama({
  rama,
  raiz,
  idx,
  nodos,
  registros,
  vista,
  periodoKey,
  year,
  config,
  unidad,
  planRaizPeriodo,
}: {
  rama: NodoArbol;
  raiz: NodoArbol;
  idx: ArbolIndices;
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  vista: VistaPeriodoArbol;
  periodoKey: string;
  year: number;
  config: PlanArbolConfigAnio | undefined;
  unidad: string;
  /** Plan original del periodo en la raíz: base % si la rama es hoja. */
  planRaizPeriodo: number | undefined;
}) {
  const dispatch = useAppDispatch();
  const [mostrarNuevaHoja, setMostrarNuevaHoja] = useState(false);
  const hojasStorageKey = `arbol.fila-rama.hojas.${rama.id}.${vista}.${periodoKey}`;
  const [hojasOpen, setHojasOpen] = useLocalBoolean(hojasStorageKey, false);

  const hojas = useMemo(() => hijosSumaDirectosIdx(idx, rama.id), [idx, rama.id]);
  const conHojas = hojas.length > 0;

  const planRamaEnPeriodo = useMemo(
    () => planAgregadoEnPeriodoIdx(idx, rama, vista, periodoKey, config),
    [idx, rama, vista, periodoKey, config],
  );
  const plan = planRamaEnPeriodo;
  const real = useMemo(
    () => realEfectivoEnPeriodoIdx(idx, rama.id, vista, periodoKey),
    [idx, rama.id, vista, periodoKey],
  );
  const anioPasado = useMemo(
    () => realAnioPasadoAgregadoIdx(idx, rama.id, vista, periodoKey),
    [idx, rama.id, vista, periodoKey],
  );

  const deltaPlan = plan !== undefined ? real - plan : undefined;

  const metaEfectivaHojas = useMemo(() => metaEfectivaNodoIdx(idx, rama), [idx, rama]);

  const metaLine = conHojas ? (
    <>
      Meta anual (suma hojas):{" "}
      <strong className="tabular-nums text-foreground">
        {metaEfectivaHojas !== undefined ? `${fmtNum(metaEfectivaHojas)} ${unidad}` : "—"}
      </strong>
    </>
  ) : (
    <>
      Meta anual:{" "}
      <strong className="tabular-nums text-foreground">
        {rama.metaValor !== undefined ? `${fmtNum(rama.metaValor)} ${unidad}` : "—"}
      </strong>
    </>
  );

  return (
    <div className="rounded-md bg-background px-2 py-2 ring-1 ring-border/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{rama.nombre}</p>
          <p className="text-[10px] text-muted">{metaLine}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setMostrarNuevaHoja((v) => !v)}
            className="rounded px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent/10"
            aria-label={`Añadir hoja en ${rama.nombre}`}
          >
            + hoja
          </button>
          <button
            type="button"
            onClick={() => {
              const ok = window.confirm(
                `¿Eliminar la rama «${rama.nombre}» y sus registros? El borrado se conserva al sincronizar.`,
              );
              if (ok) dispatch({ type: "DELETE_NODO_ARBOL", id: rama.id });
            }}
            className="rounded px-1.5 py-0.5 text-[11px] text-muted hover:text-red-600"
            aria-label={`Eliminar rama ${rama.nombre}`}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
        <span className="text-muted">
          Plan <strong className="tabular-nums text-foreground">{plan !== undefined ? fmtNum(plan) : "—"}</strong>
        </span>
        <span className="text-muted">
          Real <strong className="tabular-nums text-foreground">{fmtNum(real)}</strong>
        </span>
        <span className="text-muted">
          Año pasado{" "}
          <strong className="tabular-nums text-foreground">
            {anioPasado !== undefined ? fmtNum(anioPasado) : "—"}
          </strong>
        </span>
        {deltaPlan !== undefined && (
          <span className={`tabular-nums ${deltaPlan >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
            Δ {fmtNum(deltaPlan, { signed: true })}
          </span>
        )}
      </div>

      {mostrarNuevaHoja && (
        <FormNuevaHoja
          rama={rama}
          raiz={raiz}
          year={year}
          nodos={nodos}
          registros={registros}
          onCancel={() => setMostrarNuevaHoja(false)}
          onCreated={() => setMostrarNuevaHoja(false)}
        />
      )}

      {conHojas ? (
        <details
          open={hojasOpen}
          onToggle={(e) =>
            startTransition(() => setHojasOpen((e.currentTarget as HTMLDetailsElement).open))
          }
          className="mt-2 rounded border border-border/50 bg-surface/20"
        >
          <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium text-muted marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className={`text-[10px] transition-transform ${hojasOpen ? "rotate-90" : ""}`}>▶</span>
              Hojas ({hojas.length})
            </span>
          </summary>
          {hojasOpen && (
            <div className="space-y-2 border-t border-border/50 px-2 py-2">
              {hojas.map((hoja) => (
                <FilaHojaArbol
                  key={hoja.id}
                  idx={idx}
                  nodo={hoja}
                  registros={registros}
                  vista={vista}
                  periodoKey={periodoKey}
                  year={year}
                  config={config}
                  unidad={unidad}
                  planBasePct={planRamaEnPeriodo}
                  modoStoragePrefix="hoja"
                  tituloExtra={hoja.nombre}
                  puedeEliminar
                  onEliminar={() => {
                    const ok = window.confirm(`¿Eliminar la hoja «${hoja.nombre}» y sus registros?`);
                    if (ok) dispatch({ type: "DELETE_NODO_ARBOL", id: hoja.id });
                  }}
                />
              ))}
            </div>
          )}
        </details>
      ) : (
        <>
          <FilaHojaArbol
            idx={idx}
            nodo={rama}
            registros={registros}
            vista={vista}
            periodoKey={periodoKey}
            year={year}
            config={config}
            unidad={unidad}
            planBasePct={planRaizPeriodo}
            modoStoragePrefix="rama"
          />
        </>
      )}
    </div>
  );
});

function NuevaRamaForm({ raiz, onAdd }: { raiz: NodoArbol; onAdd: (n: Omit<NodoArbol, "id" | "creado">) => void }) {
  const [nombre, setNombre] = useState("");
  const [meta, setMeta] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (nombre.trim() === "") return;
        const m = parseFloat(meta.replace(",", "."));
        onAdd({
          anio: raiz.anio,
          parentId: raiz.id,
          orden: 0,
          nombre: nombre.trim(),
          tipo: "palanca",
          cadencia: "anual",
          relacionConPadre: "suma",
          metaValor: Number.isFinite(m) ? m : undefined,
          metaUnidad: raiz.metaUnidad,
          contadorModo: "manual",
        });
        setNombre("");
        setMeta("");
      }}
    >
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Nueva rama
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Aulas, Planes, Individual…"
          className="min-w-[12rem] rounded border border-border bg-background px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Meta anual
        <input
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          className="w-28 rounded border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
        />
      </label>
      <button
        type="submit"
        className="min-h-[36px] rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
      >
        + Añadir rama
      </button>
    </form>
  );
}

/** Bloque Año: una sola tarjeta + ramas. */
function BloqueAnio({ ctx }: { ctx: ContextoBloque }) {
  return (
    <SeccionColapsable
      storageKey={`arbol.bloque.anio.${ctx.year}`}
      defaultOpen={true}
      titulo={`Año ${ctx.year}`}
      resumen={ctx.raiz.metaValor !== undefined ? `Objetivo ${fmtNum(ctx.raiz.metaValor)} ${ctx.unidad}` : undefined}
    >
      <TarjetaPeriodo
        ctx={ctx}
        vista="anio"
        periodoKey={String(ctx.year)}
        titulo={ctx.raiz.nombre}
        subtitulo={`Objetivo total ${fmtNum(ctx.raiz.metaValor)} ${ctx.unidad}`}
      />
    </SeccionColapsable>
  );
}

/** Bloque Trimestres: 4 tarjetas. */
function BloqueTrimestres({ ctx }: { ctx: ContextoBloque }) {
  const trims = [`${ctx.year}-Q1`, `${ctx.year}-Q2`, `${ctx.year}-Q3`, `${ctx.year}-Q4`];
  return (
    <SeccionColapsable
      storageKey={`arbol.bloque.trimestres.${ctx.year}`}
      defaultOpen={false}
      titulo="Trimestres"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        {trims.map((q) => (
          <TarjetaPeriodo
            key={q}
            ctx={ctx}
            vista="trimestre"
            periodoKey={q}
            titulo={q}
          />
        ))}
      </div>
    </SeccionColapsable>
  );
}

/** Bloque Meses: pestañas Q1..Q4. */
function BloqueMeses({ ctx }: { ctx: ContextoBloque }) {
  const qActualKey = `${ctx.year}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;
  const [tab, setTab] = useState<string>(qActualKey);
  const tabs = [`${ctx.year}-Q1`, `${ctx.year}-Q2`, `${ctx.year}-Q3`, `${ctx.year}-Q4`];
  const meses = useMemo(() => mesKeysEnTrimestre(tab), [tab]);
  return (
    <SeccionColapsable
      storageKey={`arbol.bloque.meses.${ctx.year}`}
      defaultOpen={false}
      titulo="Meses"
      resumen={tab.slice(-2)}
    >
      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`min-h-[34px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t
                ? "bg-accent text-white"
                : "border border-border bg-surface text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {t.slice(-2)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {meses.map((m) => {
          const idx = parseInt(m.split("-")[1], 10) - 1;
          return (
            <TarjetaPeriodo
              key={m}
              ctx={ctx}
              vista="mes"
              periodoKey={m}
              titulo={`${MESES_CORTOS_ES[idx]} ${ctx.year}`}
              subtitulo={m}
            />
          );
        })}
      </div>
    </SeccionColapsable>
  );
}

/** Bloque Semanas: pestañas mes, lista vertical de semanas. */
function BloqueSemanas({ ctx }: { ctx: ContextoBloque }) {
  const dispatch = useAppDispatch();
  const noActivas = new Set(ctx.config?.semanasNoActivas ?? defaultSemanasNoActivas(ctx.year));
  const todos = useMemo(() => mondaysInCalendarYear(ctx.year), [ctx.year]);
  const mesActual = mesKeyFromDate(new Date());
  const mesInicial = mesActual.startsWith(`${ctx.year}-`) ? mesActual : `${ctx.year}-01`;
  const [mesTab, setMesTab] = useState<string>(mesInicial);
  const upsert = useUpsertRegistro();
  const ramasQueSuman = useMemo(() => ctx.ramas.filter((r) => r.relacionConPadre === "suma"), [ctx.ramas]);

  const metaAnualRaiz = ctx.raiz.metaValor ?? 0;
  const realHastaHoyAnio = useMemo(
    () => realDelAnioHastaHoyLista(ctx.idx.regsPorNodo.get(ctx.raiz.id), ctx.year),
    [ctx.idx, ctx.raiz.id, ctx.year],
  );
  const ajusteAnio = useMemo(
    () => cuotaAjustada({ metaAnual: metaAnualRaiz, realHastaHoy: realHastaHoyAnio, anio: ctx.year, config: ctx.config }),
    [metaAnualRaiz, realHastaHoyAnio, ctx.year, ctx.config],
  );
  const objetivoAnualCumplido = metaAnualRaiz > 0 && realHastaHoyAnio >= metaAnualRaiz;

  const meses12 = Array.from({ length: 12 }, (_, i) => `${ctx.year}-${String(i + 1).padStart(2, "0")}`);
  const semanasMes = todos.filter((mk) => mesKeyFromDate(parseLocalDateKey(mk)) === mesTab);
  const mesTabIdx = parseInt(mesTab.split("-")[1], 10) - 1;

  return (
    <SeccionColapsable
      storageKey={`arbol.bloque.semanas.${ctx.year}`}
      defaultOpen={false}
      titulo="Semanas"
      resumen={MESES_CORTOS_ES[mesTabIdx]}
    >
      <div className="-mx-3 max-w-full overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <div className="flex gap-1">
          {meses12.map((m) => {
            const idx = parseInt(m.split("-")[1], 10) - 1;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMesTab(m)}
                className={`min-h-[34px] shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  mesTab === m
                    ? "bg-accent text-white"
                    : "border border-border bg-surface text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {MESES_CORTOS_ES[idx]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        {semanasMes.length === 0 && (
          <p className="px-3 py-3 text-sm text-muted">No hay semanas en este mes.</p>
        )}
        {semanasMes.map((mk) => {
          const isVac = noActivas.has(mk);
          const plan = isVac ? 0 : metaParaNodoEnPeriodo(ctx.raiz, "semana", mk, ctx.year, ctx.config);
          const real = realEfectivoEnPeriodoIdx(ctx.idx, ctx.raiz.id, "semana", mk);
          const anioPasado = realAnioPasadoAgregadoIdx(ctx.idx, ctx.raiz.id, "semana", mk);
          const valor = ctx.registros.find(
            (r) => r.nodoId === ctx.raiz.id && r.periodoTipo === "semana" && r.periodoKey === mk,
          )?.valor;
          const delta = plan !== undefined ? real - plan : undefined;
          const pct = plan && plan > 0 ? Math.min(100, Math.round((real / plan) * 100)) : real > 0 ? 100 : 0;
          const estadoSem = estadoPeriodo("semana", mk, ctx.year);
          const showBarSem = !isVac && (estadoSem === "pasado" || estadoSem === "actual");
          const cuotaSem = ajusteAnio.semanaRestante;
          return (
            <div
              key={mk}
              className={`flex flex-col gap-2 border-b border-border/60 px-3 py-3 last:border-b-0 sm:flex-row sm:items-start ${
                isVac ? "bg-surface/40" : ""
              }`}
            >
              <div className="min-w-0 shrink-0 sm:w-44">
                <p className="text-sm font-medium text-foreground">{isoWeekLabelFromMondayKey(mk)}</p>
                <p className="text-[10px] text-muted">{formatWeekRange(mk)}</p>
              </div>
              {isVac ? (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-100">
                  Descanso
                </span>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {estadoSem === "pasado" && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Real</p>
                      <p className="text-xl font-bold tabular-nums text-foreground">
                        {fmtNum(real)} <span className="text-sm font-semibold text-muted">{ctx.unidad}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                        <span>
                          Plan orig.{" "}
                          <strong className="tabular-nums text-foreground">{plan !== undefined ? fmtNum(plan) : "—"}</strong>
                        </span>
                        {delta !== undefined && (
                          <span className={delta >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>
                            Δ plan {fmtNum(delta, { signed: true })}
                          </span>
                        )}
                        {anioPasado !== undefined && (
                          <span>
                            Año pasado <strong className="tabular-nums text-foreground">{fmtNum(anioPasado)}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {estadoSem === "actual" && (
                    <div>
                      {objetivoAnualCumplido ? (
                        <>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                            Estado
                          </p>
                          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">Hecho</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                            {labelCuotaSegunVista("semana", "actual")}
                          </p>
                          <p className="text-xl font-bold tabular-nums text-foreground">
                            {fmtNum(cuotaSem)} <span className="text-sm font-semibold text-muted">{ctx.unidad}</span>
                          </p>
                        </>
                      )}
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                        <span>
                          Plan orig.{" "}
                          <strong className="tabular-nums text-foreground">{plan !== undefined ? fmtNum(plan) : "—"}</strong>
                        </span>
                        <span>
                          Real acum. año{" "}
                          <strong className="tabular-nums text-foreground">{fmtNum(realHastaHoyAnio)}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                  {estadoSem === "futuro" && (
                    <div>
                      {objetivoAnualCumplido ? (
                        <>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                            Estado
                          </p>
                          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">Hecho</p>
                          <p className="text-[10px] text-muted">Plan original como referencia abajo.</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                            {labelCuotaSegunVista("semana", "futuro")}
                          </p>
                          <p className="text-xl font-bold tabular-nums text-foreground">
                            {fmtNum(cuotaSem)} <span className="text-sm font-semibold text-muted">{ctx.unidad}</span>
                          </p>
                        </>
                      )}
                      <div className="mt-1 text-[11px] text-muted">
                        Plan orig.{" "}
                        <strong className="tabular-nums text-foreground">{plan !== undefined ? fmtNum(plan) : "—"}</strong>
                      </div>
                    </div>
                  )}

                  {/* Solo se permite apuntar directamente en la semana cuando aún no hay ramas.
                      Con estructura, los apuntes viven en las hojas (bloque «Por rama» debajo). */}
                  {ramasQueSuman.length === 0 && (
                    <label className="flex flex-col gap-0.5 text-[10px] text-muted">
                      Apuntar real
                      <NumberInput
                        value={valor}
                        onCommit={(v) =>
                          upsert({ nodoId: ctx.raiz.id, periodoTipo: "semana", periodoKey: mk, valor: v })
                        }
                        ariaLabel={`Real ${mk}`}
                        unidad={ctx.unidad}
                      />
                    </label>
                  )}

                  {ramasQueSuman.length > 0 && (
                    <details className="mt-2 rounded-lg border border-border/60 bg-surface/25">
                      <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium text-muted marker:content-none [&::-webkit-details-marker]:hidden">
                        Por rama ({ramasQueSuman.length})
                      </summary>
                      <div className="space-y-2 border-t border-border/50 px-2 py-2">
                        {ramasQueSuman.map((rama) => {
                          const hojasSem = hijosSumaDirectosIdx(ctx.idx, rama.id);
                          const planRamaSem = planAgregadoEnPeriodoIdx(
                            ctx.idx,
                            rama,
                            "semana",
                            mk,
                            ctx.config,
                          );
                          const realRamaSem = realEfectivoEnPeriodoIdx(ctx.idx, rama.id, "semana", mk);
                          const conHojasSem = hojasSem.length > 0;
                          return (
                            <details key={rama.id} className="rounded-md border border-border/50 bg-background/80">
                              <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] marker:content-none [&::-webkit-details-marker]:hidden">
                                <span className="font-medium text-foreground">{rama.nombre}</span>
                                <span className="text-muted">
                                  {" "}
                                  · Plan {planRamaSem !== undefined ? fmtNum(planRamaSem) : "—"} · Real {fmtNum(realRamaSem)}
                                </span>
                              </summary>
                              <div className="space-y-2 border-t border-border/40 px-2 py-2">
                                {conHojasSem ? (
                                  hojasSem.map((hoja) => (
                                    <FilaHojaArbol
                                      key={hoja.id}
                                      idx={ctx.idx}
                                      nodo={hoja}
                                      registros={ctx.registros}
                                      vista="semana"
                                      periodoKey={mk}
                                      year={ctx.year}
                                      config={ctx.config}
                                      unidad={ctx.unidad}
                                      planBasePct={planRamaSem}
                                      modoStoragePrefix="hoja"
                                      compact
                                      tituloExtra={hoja.nombre}
                                      puedeEliminar
                                      onEliminar={() => {
                                        const ok = window.confirm(`¿Eliminar la hoja «${hoja.nombre}» y sus registros?`);
                                        if (ok) dispatch({ type: "DELETE_NODO_ARBOL", id: hoja.id });
                                      }}
                                    />
                                  ))
                                ) : (
                                  <FilaHojaArbol
                                    idx={ctx.idx}
                                    nodo={rama}
                                    registros={ctx.registros}
                                    vista="semana"
                                    periodoKey={mk}
                                    year={ctx.year}
                                    config={ctx.config}
                                    unidad={ctx.unidad}
                                    planBasePct={plan}
                                    modoStoragePrefix="rama"
                                    compact
                                  />
                                )}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </details>
                  )}

                  {showBarSem && (
                    <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-surface" aria-hidden>
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-accent"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SeccionColapsable>
  );
}

const TRIMESTRE_LABELS: { key: TrimestreKey; label: string }[] = [
  { key: "Q1", label: "Q1" },
  { key: "Q2", label: "Q2" },
  { key: "Q3", label: "Q3" },
  { key: "Q4", label: "Q4" },
];

function getAyTrimPorHoja(
  idx: ArbolIndices,
  hoja: NodoArbol,
  year: number,
): Record<TrimestreKey, number | undefined> {
  const out: Record<TrimestreKey, number | undefined> = { Q1: undefined, Q2: undefined, Q3: undefined, Q4: undefined };
  for (const { key } of TRIMESTRE_LABELS) {
    out[key] = realAnioPasadoAgregadoIdx(idx, hoja.id, "trimestre", `${year}-${key}`);
  }
  return out;
}

/** Tabla de configuración trimestral para las hojas de una rama (o la rama misma si no tiene hojas). */
const PlanTrimestralConfigRama = memo(function PlanTrimestralConfigRama({
  rama,
  idx,
  year,
  unidad,
}: {
  rama: NodoArbol;
  idx: ArbolIndices;
  year: number;
  unidad: string;
}) {
  const dispatch = useAppDispatch();
  const hojas = hijosSumaDirectosIdx(idx, rama.id);
  const nodosConfig = hojas.length > 0 ? hojas : [rama];
  const ayYear = year - 1;

  const setMetaTrim = useCallback(
    (nodo: NodoArbol, q: TrimestreKey, nuevoValor: number | undefined) => {
      const base = nodo.metaPorTrimestre ? { ...nodo.metaPorTrimestre } : {};
      if (nuevoValor === undefined || !Number.isFinite(nuevoValor)) {
        delete base[q];
      } else {
        base[q] = nuevoValor;
      }
      const algunoDefinido = TRIMESTRE_LABELS.some(
        ({ key }) => base[key] !== undefined && Number.isFinite(base[key]!),
      );
      dispatch({
        type: "UPDATE_NODO_ARBOL",
        id: nodo.id,
        changes: { metaPorTrimestre: algunoDefinido ? base : undefined },
      });
    },
    [dispatch],
  );

  const setMetaAnual = useCallback(
    (nodo: NodoArbol, nuevo: number | undefined) => {
      dispatch({ type: "UPDATE_NODO_ARBOL", id: nodo.id, changes: { metaValor: nuevo } });
    },
    [dispatch],
  );

  const aplicarEstacionalidadAY = useCallback(
    (nodo: NodoArbol) => {
      const metaAnual = nodo.metaValor;
      if (metaAnual === undefined || metaAnual <= 0) return;
      const ay = getAyTrimPorHoja(idx, nodo, year);
      const total = TRIMESTRE_LABELS.reduce((acc, { key }) => acc + (ay[key] ?? 0), 0);
      if (total <= 0) return;
      const nuevas: Partial<Record<TrimestreKey, number>> = {};
      for (const { key } of TRIMESTRE_LABELS) {
        const ayQ = ay[key];
        if (ayQ !== undefined && ayQ > 0) {
          nuevas[key] = Math.round(((metaAnual * ayQ) / total) * 100) / 100;
        }
      }
      dispatch({ type: "UPDATE_NODO_ARBOL", id: nodo.id, changes: { metaPorTrimestre: nuevas } });
    },
    [idx, year, dispatch],
  );

  const repartirEquitativo = useCallback(
    (nodo: NodoArbol) => {
      const metaAnual = nodo.metaValor;
      if (metaAnual === undefined || metaAnual <= 0) return;
      const v = Math.round((metaAnual / 4) * 100) / 100;
      const nuevas: Partial<Record<TrimestreKey, number>> = { Q1: v, Q2: v, Q3: v, Q4: v };
      dispatch({ type: "UPDATE_NODO_ARBOL", id: nodo.id, changes: { metaPorTrimestre: nuevas } });
    },
    [dispatch],
  );

  const limpiarTrimestres = useCallback(
    (nodo: NodoArbol) => {
      dispatch({ type: "UPDATE_NODO_ARBOL", id: nodo.id, changes: { metaPorTrimestre: undefined } });
    },
    [dispatch],
  );

  const aplicarATodasAY = useCallback(() => {
    for (const h of hojas) aplicarEstacionalidadAY(h);
  }, [hojas, aplicarEstacionalidadAY]);

  const ramaAy = realAnioPasadoAgregadoIdx(idx, rama.id, "anio", String(year));
  const totalAyHojas = hojas.reduce((acc, h) => {
    const v = realAnioPasadoAgregadoIdx(idx, h.id, "anio", String(year));
    return acc + (v ?? 0);
  }, 0);
  const algunaHojaTieneAY = totalAyHojas > 0;

  return (
    <div className="rounded border border-border bg-surface/40 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{rama.nombre}</p>
        <span className="text-[11px] text-muted">
          {ramaAy !== undefined && (
            <>
              AY {ayYear}:{" "}
              <strong className="tabular-nums text-foreground">
                {fmtNum(ramaAy)} {unidad}
              </strong>
            </>
          )}
        </span>
      </div>
      {hojas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!algunaHojaTieneAY}
            title={
              algunaHojaTieneAY
                ? `Para cada hoja con datos de ${ayYear}, reparte su meta anual en la misma proporción (€) que el año pasado.`
                : `No hay datos de ${ayYear} en las hojas de esta rama`
            }
            onClick={aplicarATodasAY}
            className="rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            Aplicar estacionalidad AY a todas las hojas
          </button>
        </div>
      )}
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full border-collapse text-[11px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 pr-2 font-medium">{hojas.length > 0 ? "Hoja" : "Rama"}</th>
              {TRIMESTRE_LABELS.map(({ key, label }) => (
                <th key={key} className="px-1 py-1 font-medium">
                  {label}
                </th>
              ))}
              <th className="px-1 py-1 text-right font-medium">Plan año</th>
              <th className="px-1 py-1 text-right font-medium">Meta anual</th>
              <th className="px-1 py-1 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {nodosConfig.map((nodo) => {
              const ay = getAyTrimPorHoja(idx, nodo, year);
              const ayTotalAnual = realAnioPasadoAgregadoIdx(idx, nodo.id, "anio", String(year));
              const mt = nodo.metaPorTrimestre ?? {};
              const sumPlan = TRIMESTRE_LABELS.reduce(
                (acc, { key }) => acc + (Number.isFinite(mt[key]!) ? (mt[key] as number) : 0),
                0,
              );
              const metaAnual = nodo.metaValor;
              const cuadre =
                metaAnual !== undefined && metaAnual > 0 && sumPlan > 0
                  ? Math.abs(sumPlan - metaAnual) < 0.5
                    ? "ok"
                    : "dif"
                  : "n/a";
              return (
                <tr key={nodo.id} className="align-top border-t border-border/50">
                  <td className="py-2 pr-2">
                    <div className="text-[12px] font-medium text-foreground">{nodo.nombre}</div>
                    {ayTotalAnual !== undefined && (
                      <div className="text-[10px] text-muted">
                        AY {ayYear}:{" "}
                        <strong className="tabular-nums text-foreground">
                          {fmtNum(ayTotalAnual)} {unidad}
                        </strong>
                      </div>
                    )}
                  </td>
                  {TRIMESTRE_LABELS.map(({ key }) => {
                    const valor = mt[key];
                    const ayQ = ay[key];
                    return (
                      <td key={key} className="px-1 py-1">
                        <div className="flex flex-col gap-0.5">
                          <NumberInput
                            value={valor}
                            onCommit={(v) => setMetaTrim(nodo, key, v)}
                            ariaLabel={`Plan ${key} de ${nodo.nombre}`}
                            unidad={unidad}
                          />
                          <div className="text-[10px] text-muted">
                            AY:{" "}
                            <strong className="tabular-nums text-foreground">
                              {ayQ !== undefined ? `${fmtNum(ayQ)} ${unidad}` : "—"}
                            </strong>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-1 py-2 text-right align-middle">
                    <strong className="tabular-nums text-foreground">
                      {sumPlan > 0 ? `${fmtNum(sumPlan)} ${unidad}` : "—"}
                    </strong>
                  </td>
                  <td className="px-1 py-1 align-middle">
                    <NumberInput
                      value={metaAnual}
                      onCommit={(v) => setMetaAnual(nodo, v)}
                      ariaLabel={`Meta anual de ${nodo.nombre}`}
                      unidad={unidad}
                    />
                    {cuadre === "dif" && metaAnual !== undefined && (
                      <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-200">
                        Diferencia: {fmtNum(metaAnual - sumPlan, { signed: true })} {unidad}
                      </div>
                    )}
                    {cuadre === "ok" && (
                      <div className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">Cuadra</div>
                    )}
                  </td>
                  <td className="px-1 py-1 align-middle">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={!(metaAnual && metaAnual > 0) || ayTotalAnual === undefined || ayTotalAnual <= 0}
                        onClick={() => aplicarEstacionalidadAY(nodo)}
                        title={`Reparte la meta anual usando las proporciones reales de ${ayYear}`}
                        className="whitespace-nowrap rounded border border-border px-2 py-1 text-[10px] text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Estacionalidad AY
                      </button>
                      <button
                        type="button"
                        disabled={!(metaAnual && metaAnual > 0)}
                        onClick={() => repartirEquitativo(nodo)}
                        className="whitespace-nowrap rounded border border-border px-2 py-1 text-[10px] text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Repartir 25/25/25/25
                      </button>
                      {nodo.metaPorTrimestre && (
                        <button
                          type="button"
                          onClick={() => limpiarTrimestres(nodo)}
                          className="whitespace-nowrap rounded px-2 py-1 text-[10px] text-muted hover:text-red-600"
                        >
                          Borrar plan trim.
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/** Panel con estacionalidad histórica del año pasado y alertas de cuadre del plan trimestral. */
const PanelEstacionalidadPlan = memo(function PanelEstacionalidadPlan({
  raiz,
  ramas,
  idx,
  year,
  unidad,
}: {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  idx: ArbolIndices;
  year: number;
  unidad: string;
}) {
  const ayYear = year - 1;
  const ayTrim: Record<TrimestreKey, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  for (const { key } of TRIMESTRE_LABELS) {
    const v = realAnioPasadoAgregadoIdx(idx, raiz.id, "trimestre", `${year}-${key}`);
    ayTrim[key] = v ?? 0;
  }
  const sumAy = TRIMESTRE_LABELS.reduce((acc, { key }) => acc + ayTrim[key], 0);

  // Plan total por trimestre = suma del plan por nodo para ramas.
  const planTrim: Record<TrimestreKey, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  let algunoPlanFijado = false;
  for (const rama of ramas) {
    if (rama.relacionConPadre !== "suma") continue;
    const hojas = hijosSumaDirectosIdx(idx, rama.id);
    const nodosConfig = hojas.length > 0 ? hojas : [rama];
    for (const nodo of nodosConfig) {
      if (!nodoTieneMetaPorTrimestreHelper(nodo)) continue;
      const mt = nodo.metaPorTrimestre!;
      for (const { key } of TRIMESTRE_LABELS) {
        const v = mt[key];
        if (v !== undefined && Number.isFinite(v)) {
          planTrim[key] += v;
          algunoPlanFijado = true;
        }
      }
    }
  }
  const sumPlan = TRIMESTRE_LABELS.reduce((acc, { key }) => acc + planTrim[key], 0);

  // Alertas de cuadre: hojas con metaPorTrimestre cuya suma difiera >15% de su metaValor anual.
  const alertas: { nombre: string; sum: number; meta: number }[] = [];
  for (const rama of ramas) {
    const hojas = hijosSumaDirectosIdx(idx, rama.id);
    const nodosConfig = hojas.length > 0 ? hojas : [rama];
    for (const nodo of nodosConfig) {
      if (!nodoTieneMetaPorTrimestreHelper(nodo)) continue;
      const mt = nodo.metaPorTrimestre!;
      const sum = TRIMESTRE_LABELS.reduce(
        (acc, { key }) => acc + (Number.isFinite(mt[key]!) ? (mt[key] as number) : 0),
        0,
      );
      const meta = nodo.metaValor;
      if (meta === undefined || meta <= 0) continue;
      const diff = Math.abs(sum - meta) / meta;
      if (diff > 0.15) alertas.push({ nombre: nodo.nombre, sum, meta });
    }
  }

  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      <div className="rounded border border-border bg-surface/40 p-2">
        <p className="text-[11px] font-medium text-foreground">Estacionalidad real {ayYear}</p>
        {sumAy > 0 ? (
          <>
            <div className="mt-1 grid grid-cols-4 gap-1 text-[11px]">
              {TRIMESTRE_LABELS.map(({ key, label }) => {
                const pct = (ayTrim[key] / sumAy) * 100;
                return (
                  <div key={key} className="rounded bg-background px-1 py-1 text-center">
                    <div className="text-muted">{label}</div>
                    <div className="tabular-nums font-medium text-foreground">
                      {pct.toFixed(1).replace(".", ",")} %
                    </div>
                    <div className="text-[9px] text-muted">
                      {fmtNum(ayTrim[key])} {unidad}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-muted">
              Total {ayYear}:{" "}
              <strong className="tabular-nums text-foreground">
                {fmtNum(sumAy)} {unidad}
              </strong>
            </p>
          </>
        ) : (
          <p className="mt-1 text-[11px] text-muted">
            Aún no hay datos del año pasado. Los cálculos se actualizarán en cuanto haya registros de {ayYear}.
          </p>
        )}
      </div>
      <div className="rounded border border-border bg-surface/40 p-2">
        <p className="text-[11px] font-medium text-foreground">Plan trimestral {year}</p>
        {algunoPlanFijado ? (
          <>
            <div className="mt-1 grid grid-cols-4 gap-1 text-[11px]">
              {TRIMESTRE_LABELS.map(({ key, label }) => {
                const pct = sumPlan > 0 ? (planTrim[key] / sumPlan) * 100 : 0;
                const ayPct = sumAy > 0 ? (ayTrim[key] / sumAy) * 100 : 0;
                const delta = sumAy > 0 ? pct - ayPct : undefined;
                return (
                  <div key={key} className="rounded bg-background px-1 py-1 text-center">
                    <div className="text-muted">{label}</div>
                    <div className="tabular-nums font-medium text-foreground">
                      {pct.toFixed(1).replace(".", ",")} %
                    </div>
                    <div className="text-[9px] text-muted">
                      {fmtNum(planTrim[key])} {unidad}
                    </div>
                    {delta !== undefined && Math.abs(delta) >= 0.5 && (
                      <div
                        className={`text-[9px] tabular-nums ${
                          delta >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-200"
                        }`}
                      >
                        {delta >= 0 ? "+" : ""}
                        {delta.toFixed(1).replace(".", ",")} pp AY
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-[10px]">
              <span className="text-muted">
                Plan total fijado:{" "}
                <strong className="tabular-nums text-foreground">
                  {fmtNum(sumPlan)} {unidad}
                </strong>
              </span>
              {raiz.metaValor !== undefined && (
                <span className={sumPlan > raiz.metaValor * 1.01 || sumPlan < raiz.metaValor * 0.99 ? "text-amber-700 dark:text-amber-200" : "text-muted"}>
                  Meta anual:{" "}
                  <strong className="tabular-nums text-foreground">
                    {fmtNum(raiz.metaValor)} {unidad}
                  </strong>
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="mt-1 text-[11px] text-muted">
            Aún no has fijado ningún trimestre. Usa la tabla de abajo o el botón «Aplicar estacionalidad AY» para arrancar.
          </p>
        )}
      </div>
      {alertas.length > 0 && (
        <div className="sm:col-span-2 rounded border border-amber-400/60 bg-amber-500/10 p-2 text-[11px] text-amber-900 dark:text-amber-100">
          <p className="font-medium">Hojas cuya suma trimestral no cuadra con su meta anual (&gt;15 %):</p>
          <ul className="mt-1 list-inside list-disc">
            {alertas.slice(0, 6).map((a) => (
              <li key={a.nombre}>
                {a.nombre}: suma trimestres {fmtNum(a.sum)} {unidad} vs meta anual {fmtNum(a.meta)} {unidad} (diferencia{" "}
                {fmtNum(a.meta - a.sum, { signed: true })} {unidad}).
              </li>
            ))}
            {alertas.length > 6 && <li>... y {alertas.length - 6} más</li>}
          </ul>
        </div>
      )}
    </div>
  );
});

function nodoTieneMetaPorTrimestreHelper(nodo: NodoArbol): boolean {
  const mt = nodo.metaPorTrimestre;
  if (!mt) return false;
  return TRIMESTRE_LABELS.some(({ key }) => mt[key] !== undefined && Number.isFinite(mt[key]!));
}

export interface VistaBloquesProps {
  raiz: NodoArbol;
  year: number;
}

export function VistaBloques({ raiz, year }: VistaBloquesProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const arbol = state.arbol ?? EMPTY_ARBOL;

  const configsEffective = useMemo(() => ensureConfigAnio(arbol.configs, year), [arbol.configs, year]);
  const config = configsEffective.find((c) => c.anio === year);

  const ramas = useMemo(() => ramasDirectas(arbol.nodos, raiz.id, year), [arbol.nodos, raiz.id, year]);
  const unidad = raiz.metaUnidad ?? "";

  const idx = useMemo(() => buildArbolIndices(arbol.registros, arbol.nodos, year), [arbol.registros, arbol.nodos, year]);

  const ctx = useMemo<ContextoBloque>(
    () => ({
      raiz,
      ramas,
      nodos: arbol.nodos,
      registros: arbol.registros,
      idx,
      config,
      year,
      unidad,
    }),
    [raiz, ramas, arbol.nodos, arbol.registros, idx, config, year, unidad],
  );

  const [ramaHojaFormConfigId, setRamaHojaFormConfigId] = useState<string | null>(null);

  // suma de metas efectivas de ramas y aviso si no cuadran con la meta total
  const planRamasAnual = useMemo(
    () =>
      ramas
        .filter((r) => r.relacionConPadre === "suma")
        .reduce((acc, r) => acc + (metaEfectivaNodoIdx(idx, r) ?? 0), 0),
    [ramas, idx],
  );
  const cuadre =
    raiz.metaValor !== undefined && planRamasAnual > 0 && Math.abs(planRamasAnual - raiz.metaValor) > 0.01
      ? `Las ramas suman ${fmtNum(planRamasAnual)} ${unidad} y el objetivo es ${fmtNum(raiz.metaValor)} ${unidad}.`
      : null;

  const diasLaborables = diasLaborablesEnAnio(year, config);
  const cuotaSemanal =
    raiz.metaValor !== undefined && diasLaborables > 0 ? metaSemanalPropuesta(raiz.metaValor, year, config) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-[12px] text-foreground">
        En {year} hay <strong>{diasLaborables}</strong> días laborables (lun–vie; excluyen tus semanas de descanso y los festivos
        {config?.comunidadAutonoma ? " nacionales y autonómicos que configuraste" : " nacionales"}).{" "}
        {raiz.metaValor !== undefined && (
          <>
            Para llegar a <strong>{fmtNum(raiz.metaValor)} {unidad}</strong> tendrías que hacer{" "}
            <strong className="tabular-nums">{fmtNum(cuotaSemanal)} {unidad}</strong> de media a la semana (equivalente lineal).
          </>
        )}
        {cuadre && <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-amber-900 dark:text-amber-100">{cuadre}</span>}
      </div>

      <BloqueAnio ctx={ctx} />
      <BloqueTrimestres ctx={ctx} />
      <BloqueMeses ctx={ctx} />
      <BloqueSemanas ctx={ctx} />

      <SeccionColapsable
        storageKey={`arbol.bloque.ramas-config.${year}`}
        defaultOpen={false}
        titulo="Configuración anual"
        resumen={`${ramas.length} ${ramas.length === 1 ? "rama" : "ramas"}`}
      >
        <p className="text-[11px] text-muted">
          Aquí defines los parámetros del año: el objetivo total (raíz) y las ramas que lo componen (por ejemplo aulas, planes, individual). Las ramas con <strong>hojas</strong> usan la suma de sus hojas como objetivo efectivo; las ramas sin hojas usan su propia meta. Los apuntes facturados se hacen en las hojas desde la vista de mes o semana, nunca aquí.
        </p>
        <div className="mb-3 rounded border border-accent/40 bg-accent/5 px-3 py-2">
          <p className="text-sm font-medium text-foreground">Raíz del año: {raiz.nombre}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Nombre
              <input
                defaultValue={raiz.nombre}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== raiz.nombre) {
                    dispatch({ type: "UPDATE_NODO_ARBOL", id: raiz.id, changes: { nombre: v } });
                  }
                }}
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Unidad (ej. €)
              <input
                defaultValue={raiz.metaUnidad ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (raiz.metaUnidad ?? "")) {
                    dispatch({ type: "UPDATE_NODO_ARBOL", id: raiz.id, changes: { metaUnidad: v || undefined } });
                  }
                }}
                className="rounded border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              Objetivo anual ({unidad || "número"})
              <NumberInput
                value={raiz.metaValor}
                onCommit={(v) =>
                  dispatch({ type: "UPDATE_NODO_ARBOL", id: raiz.id, changes: { metaValor: v } })
                }
                ariaLabel={`Objetivo anual de ${raiz.nombre} ${year}`}
                unidad={unidad}
              />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-muted">
              Cambia el objetivo anual cuando quieras; el plan se recalcula automáticamente. La suma de las metas de las ramas debería coincidir con este total.
            </p>
            <button
              type="button"
              onClick={() => {
                const ok = window.confirm(
                  `¿Borrar todo el año ${year} (${raiz.nombre})? Se eliminarán la raíz, las ramas, las hojas y todos los registros apuntados. No se puede deshacer.`,
                );
                if (ok) dispatch({ type: "DELETE_NODO_ARBOL", id: raiz.id });
              }}
              className="rounded border border-red-400/60 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-500/10 dark:text-red-300"
            >
              Borrar año {year}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {ramas.length === 0 ? (
            <p className="rounded border border-dashed border-border px-3 py-3 text-sm text-muted">
              Aún no has añadido ramas. Empieza por las que más facturan.
            </p>
          ) : (
            (() => {
              const totalAnual = raiz.metaValor ?? 0;
              const sumPct = ramas
                .filter((r) => r.relacionConPadre === "suma")
                .reduce(
                  (acc, r) =>
                    acc + (totalAnual > 0 ? ((metaEfectivaNodoIdx(idx, r) ?? 0) / totalAnual) * 100 : 0),
                  0,
                );
              const ayYear = year - 1;
              const ayRaiz = realAnioPasadoAgregadoIdx(idx, raiz.id, "anio", String(year));
              return (
                <>
                  {ramas.map((rama) => {
                    const hojasCfg = hijosSumaDirectosIdx(idx, rama.id);
                    const conHojasCfg = hojasCfg.length > 0;
                    const metaEffRama = metaEfectivaNodoIdx(idx, rama);
                    const metaPlaneada = rama.metaValor;
                    const pct =
                      totalAnual > 0 && metaEffRama !== undefined ? (metaEffRama / totalAnual) * 100 : undefined;
                    const cuentaParaTotal = rama.relacionConPadre === "suma";
                    const planeadaOk = metaPlaneada !== undefined && metaPlaneada > 0;
                    const sumPctHojasVsPlaneada = planeadaOk
                      ? hojasCfg.reduce((acc, f) => {
                          const mv = f.metaValor;
                          if (mv === undefined || !Number.isFinite(mv)) return acc;
                          return acc + (mv / metaPlaneada!) * 100;
                        }, 0)
                      : 0;
                    const ayRama = realAnioPasadoAgregadoIdx(idx, rama.id, "anio", String(year));
                    const pctAyRama =
                      ayRaiz !== undefined && ayRaiz > 0 && ayRama !== undefined
                        ? (ayRama / ayRaiz) * 100
                        : undefined;
                    // Datos por hoja (AY) para poder repartir según proporción histórica.
                    const ayHojas = hojasCfg.map((h) => ({
                      hoja: h,
                      ay: realAnioPasadoAgregadoIdx(idx, h.id, "anio", String(year)),
                    }));
                    const sumAyHojas = ayHojas.reduce(
                      (acc, x) => acc + (x.ay !== undefined ? x.ay : 0),
                      0,
                    );
                    const puedeAplicarAY =
                      planeadaOk && sumAyHojas > 0 && ayHojas.some((x) => x.ay !== undefined && x.ay > 0);
                    return (
                      <div key={rama.id} className="rounded border border-border bg-surface/40 px-3 py-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{rama.nombre}</p>
                          <span className="text-[11px] text-muted">
                            {conHojasCfg ? (
                              <>
                                Meta planeada:{" "}
                                <strong className="tabular-nums text-foreground">
                                  {metaPlaneada !== undefined ? `${fmtNum(metaPlaneada)} ${unidad}` : "—"}
                                </strong>
                                {" · "}
                                Suma hojas (€):{" "}
                                <strong className="tabular-nums text-foreground">
                                  {metaEffRama !== undefined ? `${fmtNum(metaEffRama)} ${unidad}` : "—"}
                                </strong>
                              </>
                            ) : (
                              <>
                                Meta anual:{" "}
                                <strong className="tabular-nums text-foreground">
                                  {rama.metaValor !== undefined ? `${fmtNum(rama.metaValor)} ${unidad}` : "—"}
                                </strong>
                              </>
                            )}
                            {cuentaParaTotal && pct !== undefined && (
                              <>
                                {" "}·{" "}
                                <strong className="tabular-nums text-foreground">{pct.toFixed(1).replace(".", ",")} %</strong>
                                <span className="text-muted"> del total (según suma hojas)</span>
                              </>
                            )}
                            {ayRama !== undefined && (
                              <>
                                <span className="mx-1 text-border">|</span>
                                AY {ayYear}:{" "}
                                <strong className="tabular-nums text-foreground">
                                  {fmtNum(ayRama)} {unidad}
                                </strong>
                                {pctAyRama !== undefined && (
                                  <>
                                    {" "}·{" "}
                                    <strong className="tabular-nums text-foreground">
                                      {pctAyRama.toFixed(1).replace(".", ",")} %
                                    </strong>
                                    <span className="text-muted"> del total AY</span>
                                  </>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setRamaHojaFormConfigId((id) => (id === rama.id ? null : rama.id))
                            }
                            className="rounded-lg border border-accent/40 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
                          >
                            + hoja
                          </button>
                          {conHojasCfg && (
                            <button
                              type="button"
                              disabled={!puedeAplicarAY}
                              title={
                                !puedeAplicarAY
                                  ? "Necesitas meta planeada > 0 y al menos una hoja con datos de año pasado"
                                  : `Reparte ${fmtNum(metaPlaneada)} ${unidad} entre las hojas usando las proporciones reales de ${ayYear}`
                              }
                              onClick={() => {
                                if (!puedeAplicarAY || metaPlaneada === undefined) return;
                                for (const { hoja, ay } of ayHojas) {
                                  if (ay === undefined || !Number.isFinite(ay) || ay <= 0) continue;
                                  const nuevaMeta = metaPlaneada * (ay / sumAyHojas);
                                  dispatch({
                                    type: "UPDATE_NODO_ARBOL",
                                    id: hoja.id,
                                    changes: { metaValor: Math.round(nuevaMeta * 100) / 100 },
                                  });
                                }
                              }}
                              className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Aplicar proporción del año pasado
                            </button>
                          )}
                        </div>
                        {ramaHojaFormConfigId === rama.id && (
                          <FormNuevaHoja
                            rama={rama}
                            raiz={raiz}
                            year={year}
                            nodos={arbol.nodos}
                            registros={arbol.registros}
                            onCancel={() => setRamaHojaFormConfigId(null)}
                            onCreated={() => setRamaHojaFormConfigId(null)}
                          />
                        )}
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                          <label className="flex flex-col gap-1 text-[11px] text-muted">
                            Nombre
                            <input
                              defaultValue={rama.nombre}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== rama.nombre) {
                                  dispatch({ type: "UPDATE_NODO_ARBOL", id: rama.id, changes: { nombre: v } });
                                }
                              }}
                              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-[11px] text-muted">
                            {conHojasCfg ? `Meta planeada de la rama (${unidad || "número"})` : `Meta anual (${unidad || "número"})`}
                            <NumberInput
                              value={rama.metaValor}
                              onCommit={(v) =>
                                dispatch({ type: "UPDATE_NODO_ARBOL", id: rama.id, changes: { metaValor: v } })
                              }
                              ariaLabel={conHojasCfg ? `Meta planeada de ${rama.nombre}` : `Meta anual de ${rama.nombre}`}
                              unidad={unidad}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-[11px] text-muted">
                            % del total año
                            <PercentInput
                              value={pct}
                              disabled={totalAnual <= 0}
                              onCommit={(p) => {
                                if (totalAnual <= 0 || p === undefined) return;
                                const nuevoMeta = (totalAnual * p) / 100;
                                dispatch({ type: "UPDATE_NODO_ARBOL", id: rama.id, changes: { metaValor: nuevoMeta } });
                              }}
                              ariaLabel={`Porcentaje del total anual de ${rama.nombre}`}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-[11px] text-muted">
                            Cuenta para el total
                            <select
                              value={rama.relacionConPadre}
                              onChange={(e) =>
                                dispatch({
                                  type: "UPDATE_NODO_ARBOL",
                                  id: rama.id,
                                  changes: { relacionConPadre: e.target.value as NodoArbol["relacionConPadre"] },
                                })
                              }
                              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                            >
                              <option value="suma">Sí, suma al total</option>
                              <option value="explica">No suma, solo informa</option>
                            </select>
                          </label>
                        </div>
                        {conHojasCfg && (
                          <details className="mt-3 rounded border border-border/60 bg-background/50">
                            <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium text-muted marker:content-none [&::-webkit-details-marker]:hidden">
                              Hojas ({hojasCfg.length})
                            </summary>
                            <div className="space-y-3 border-t border-border/50 px-2 py-2">
                              {hojasCfg.map((hoja) => {
                                const pctHojaPlaneada =
                                  planeadaOk && hoja.metaValor !== undefined && Number.isFinite(hoja.metaValor)
                                    ? (hoja.metaValor / metaPlaneada!) * 100
                                    : undefined;
                                const ayHoja = realAnioPasadoAgregadoIdx(idx, hoja.id, "anio", String(year));
                                const pctAyHoja =
                                  ayRama !== undefined && ayRama > 0 && ayHoja !== undefined
                                    ? (ayHoja / ayRama) * 100
                                    : undefined;
                                return (
                                  <div key={hoja.id} className="rounded border border-border/40 p-2">
                                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                                      <span className="text-[11px] font-medium text-foreground">{hoja.nombre}</span>
                                      <span className="flex flex-wrap items-baseline gap-x-2 text-[10px] text-muted">
                                        {pctHojaPlaneada !== undefined && (
                                          <span>
                                            <strong className="tabular-nums text-foreground">
                                              {pctHojaPlaneada.toFixed(1).replace(".", ",")} %
                                            </strong>{" "}
                                            de la meta planeada
                                          </span>
                                        )}
                                        {ayHoja !== undefined && (
                                          <span>
                                            <span className="text-border">|</span> AY {ayYear}:{" "}
                                            <strong className="tabular-nums text-foreground">
                                              {fmtNum(ayHoja)} {unidad}
                                            </strong>
                                            {pctAyHoja !== undefined && (
                                              <>
                                                {" "}·{" "}
                                                <strong className="tabular-nums text-foreground">
                                                  {pctAyHoja.toFixed(1).replace(".", ",")} %
                                                </strong>
                                                <span className="text-muted"> de la rama AY</span>
                                              </>
                                            )}
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                                        Nombre
                                        <input
                                          defaultValue={hoja.nombre}
                                          onBlur={(e) => {
                                            const v = e.target.value.trim();
                                            if (v && v !== hoja.nombre) {
                                              dispatch({ type: "UPDATE_NODO_ARBOL", id: hoja.id, changes: { nombre: v } });
                                            }
                                          }}
                                          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                                        />
                                      </label>
                                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                                        Meta anual ({unidad || "número"})
                                        <NumberInput
                                          value={hoja.metaValor}
                                          onCommit={(v) =>
                                            dispatch({ type: "UPDATE_NODO_ARBOL", id: hoja.id, changes: { metaValor: v } })
                                          }
                                          ariaLabel={`Meta anual de ${hoja.nombre}`}
                                          unidad={unidad}
                                        />
                                      </label>
                                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                                        % de la meta planeada de la rama
                                        <PercentInput
                                          value={pctHojaPlaneada}
                                          disabled={!planeadaOk}
                                          title={
                                            !planeadaOk
                                              ? "Define primero la meta planeada de la rama en € para repartir en %"
                                              : undefined
                                          }
                                          onCommit={(p) => {
                                            if (!planeadaOk || p === undefined || metaPlaneada === undefined) return;
                                            dispatch({
                                              type: "UPDATE_NODO_ARBOL",
                                              id: hoja.id,
                                              changes: { metaValor: (metaPlaneada * p) / 100 },
                                            });
                                          }}
                                          ariaLabel={`Porcentaje de ${hoja.nombre} sobre la meta planeada de la rama`}
                                        />
                                      </label>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const ok = window.confirm(`¿Eliminar la hoja «${hoja.nombre}» y sus registros?`);
                                        if (ok) dispatch({ type: "DELETE_NODO_ARBOL", id: hoja.id });
                                      }}
                                      className="mt-2 text-[11px] text-muted hover:text-red-600"
                                    >
                                      Eliminar hoja
                                    </button>
                                  </div>
                                );
                              })}
                              {planeadaOk && (
                                <div
                                  className={`rounded px-2 py-1.5 text-[11px] ${
                                    Math.abs(sumPctHojasVsPlaneada - 100) < 0.05
                                      ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                                      : "bg-amber-500/10 text-amber-900 dark:text-amber-100"
                                  }`}
                                >
                                  Las hojas suman{" "}
                                  <strong className="tabular-nums">{sumPctHojasVsPlaneada.toFixed(1).replace(".", ",")} %</strong>{" "}
                                  de la meta planeada de la rama (
                                  {fmtNum(metaPlaneada)} {unidad}
                                  ).
                                  {Math.abs(sumPctHojasVsPlaneada - 100) >= 0.05 &&
                                    (sumPctHojasVsPlaneada < 100
                                      ? ` Te falta ${(100 - sumPctHojasVsPlaneada).toFixed(1).replace(".", ",")} %.`
                                      : ` Te pasas ${(sumPctHojasVsPlaneada - 100).toFixed(1).replace(".", ",")} %.`)}
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })}
                  {totalAnual > 0 && (
                    <div
                      className={`flex flex-wrap items-baseline justify-between gap-2 rounded px-3 py-2 text-[12px] ${
                        Math.abs(sumPct - 100) < 0.05
                          ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                          : "bg-amber-500/10 text-amber-900 dark:text-amber-100"
                      }`}
                    >
                      <span>
                        Suma de las ramas que cuentan al total:{" "}
                        <strong className="tabular-nums">{sumPct.toFixed(1).replace(".", ",")} %</strong>
                      </span>
                      {Math.abs(sumPct - 100) >= 0.05 && (
                        <span>
                          {sumPct < 100
                            ? `Te falta ${(100 - sumPct).toFixed(1).replace(".", ",")} %`
                            : `Te pasas en ${(sumPct - 100).toFixed(1).replace(".", ",")} %`}
                        </span>
                      )}
                    </div>
                  )}
                </>
              );
            })()
          )}
        </div>
        <NuevaRamaForm
          raiz={raiz}
          onAdd={(payload) =>
            dispatch({
              type: "ADD_NODO_ARBOL",
              payload: {
                ...payload,
                id: generateId(),
                creado: new Date().toISOString(),
                orden: ramas.length,
              },
            })
          }
        />
      </SeccionColapsable>

      <SeccionColapsable
        storageKey={`arbol.bloque.plan-trimestral.${year}`}
        defaultOpen={false}
        titulo="Plan trimestral de ramas y hojas"
        resumen={`${ramas.length} ${ramas.length === 1 ? "rama" : "ramas"}`}
      >
        <p className="text-[11px] text-muted">
          Aquí decides la <strong>estacionalidad</strong>: cuánto vas a facturar en cada trimestre. El plan se introduce por{" "}
          <strong>hoja</strong> (producto). Al fijar un trimestre, la tarjeta de ese trimestre y los meses que contiene usan
          ese valor en lugar del prorrateo automático. Si dejas un trimestre vacío, el residuo de la meta anual se reparte
          entre los vacíos proporcional a sus días laborables. Usa «Estacionalidad AY» para copiar las proporciones reales del
          año pasado.
        </p>
        <PanelEstacionalidadPlan raiz={raiz} ramas={ramas} idx={idx} year={year} unidad={unidad} />
        <div className="space-y-3">
          {ramas.length === 0 ? (
            <p className="rounded border border-dashed border-border px-3 py-3 text-sm text-muted">
              Aún no has añadido ramas.
            </p>
          ) : (
            ramas.map((rama) => (
              <PlanTrimestralConfigRama
                key={rama.id}
                rama={rama}
                idx={idx}
                year={year}
                unidad={unidad}
              />
            ))
          )}
        </div>
      </SeccionColapsable>
    </div>
  );
}
