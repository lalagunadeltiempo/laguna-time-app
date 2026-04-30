"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { generateId } from "@/lib/store";
import { EMPTY_ARBOL, type NodoArbol, type PlanArbolConfigAnio, type RegistroNodo } from "@/lib/types";
import {
  cuotaAjustada,
  defaultSemanasNoActivas,
  ensureConfigAnio,
  estadoPeriodo,
  formatWeekRange,
  hijosSumaDirectos,
  isoWeekLabelFromMondayKey,
  mesKeyFromDate,
  mesKeysEnTrimestre,
  metaEfectivaNodo,
  metaParaPeriodo,
  metaSemanalPropuesta,
  mondaysInCalendarYear,
  diasLaborablesEnAnio,
  parseLocalDateKey,
  planAgregadoEnPeriodo,
  ramasDirectas,
  realAnioPasadoAgregado,
  realEfectivoEnPeriodo,
  sumarRegistrosNodoAnioAnterior,
  sumarRegistrosNodoSimple,
  trimestreKeyFromMesKey,
  type VistaPeriodoArbol,
} from "@/lib/arbol-tiempo";

const MESES_CORTOS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

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
        onClick={() => setOpen(!open)}
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
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  ariaLabel: string;
  disabled?: boolean;
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

/** Suma del real del nodo en el periodo seleccionado, usando registros existentes. */
function realDeNodo(
  registros: RegistroNodo[],
  nodoId: string,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  year: number,
): number {
  return sumarRegistrosNodoSimple(registros, nodoId, vista, periodoKey, year);
}

function realAnioPasadoDeNodo(
  registros: RegistroNodo[],
  nodoId: string,
  vista: VistaPeriodoArbol,
  periodoKey: string,
  year: number,
): number {
  return sumarRegistrosNodoAnioAnterior(registros, nodoId, vista, periodoKey, year);
}

/** Real total del nodo desde el inicio del año hasta hoy (incluido). */
function realDelAnioHastaHoy(
  registros: RegistroNodo[],
  nodoId: string,
  year: number,
): number {
  let sum = 0;
  const hoy = new Date();
  const hoyKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  for (const r of registros) {
    if (r.nodoId !== nodoId) continue;
    if (r.periodoTipo === "semana") {
      if (r.periodoKey.startsWith(`${year}-`) && r.periodoKey <= hoyKey) sum += r.valor;
    } else if (r.periodoTipo === "mes") {
      if (r.periodoKey.startsWith(`${year}-`)) {
        const [, m] = r.periodoKey.split("-").map((s) => parseInt(s, 10));
        const mesActual = hoy.getMonth() + 1;
        if (year < hoy.getFullYear() || (year === hoy.getFullYear() && m <= mesActual)) sum += r.valor;
      }
    } else if (r.periodoTipo === "trimestre") {
      if (r.periodoKey.startsWith(`${year}-Q`)) {
        const q = parseInt(r.periodoKey.slice(-1), 10);
        const qActual = Math.floor(hoy.getMonth() / 3) + 1;
        if (year < hoy.getFullYear() || (year === hoy.getFullYear() && q <= qActual)) sum += r.valor;
      }
    } else if (r.periodoTipo === "anio") {
      if (r.periodoKey === String(year) && year < hoy.getFullYear()) sum += r.valor;
    }
  }
  return sum;
}

function periodoTipoDeVista(v: VistaPeriodoArbol): RegistroNodo["periodoTipo"] {
  return v === "semana" ? "semana" : v === "mes" ? "mes" : v === "trimestre" ? "trimestre" : "anio";
}

/** Upsert genérico de un registro por (nodoId, año, periodoTipo, periodoKey). */
function useUpsertRegistro() {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const arbol = state.arbol ?? EMPTY_ARBOL;
  return useCallback(
    (opts: { nodoId: string; periodoTipo: RegistroNodo["periodoTipo"]; periodoKey: string; valor: number | undefined }) => {
      const existing = arbol.registros.find(
        (r) =>
          r.nodoId === opts.nodoId &&
          r.periodoTipo === opts.periodoTipo &&
          r.periodoKey === opts.periodoKey,
      );
      if (opts.valor === undefined) {
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
          valor: opts.valor,
          nota: existing?.nota,
          estadoRealidad: existing?.estadoRealidad,
          realidadPorQue: existing?.realidadPorQue,
          creado: existing?.creado ?? now,
          actualizado: now,
        },
      });
    },
    [dispatch, arbol.registros],
  );
}

interface ContextoBloque {
  raiz: NodoArbol;
  ramas: NodoArbol[];
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  config: PlanArbolConfigAnio | undefined;
  year: number;
  unidad: string;
}

/** Tarjeta horizontal con Plan / Real / Año pasado / Δ y, en futuros, ajustado. */
function TarjetaPeriodo({
  ctx,
  vista,
  periodoKey,
  titulo,
  subtitulo,
  ramasAbiertasIds,
  toggleRamasAbiertas,
}: {
  ctx: ContextoBloque;
  vista: VistaPeriodoArbol;
  periodoKey: string;
  titulo: string;
  subtitulo?: string;
  ramasAbiertasIds: Set<string>;
  toggleRamasAbiertas: (id: string) => void;
}) {
  const { raiz, ramas, registros, config, year, unidad } = ctx;
  const periodoTipo = periodoTipoDeVista(vista);

  const plan = metaParaPeriodo(raiz.cadencia, raiz.metaValor, vista, periodoKey, year, config);
  const real = realDeNodo(registros, raiz.id, vista, periodoKey, year);
  const anioPasado = realAnioPasadoDeNodo(registros, raiz.id, vista, periodoKey, year);

  const realHastaHoy = realDelAnioHastaHoy(registros, raiz.id, year);
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
  const deltaAnioPasado = anioPasado > 0 ? real - anioPasado : undefined;

  const pct = plan && plan > 0 ? Math.min(100, Math.round((real / plan) * 100)) : real > 0 ? 100 : 0;
  const showProgressBar = estado === "pasado" || estado === "actual";
  const upsert = useUpsertRegistro();

  const ramasOpen = ramasAbiertasIds.has(`${vista}:${periodoKey}`);

  return (
    <div className="rounded-xl border border-border bg-background p-3 shadow-sm">
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
                label="Plan original"
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
              {anioPasado > 0 && (
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
                label="Plan original"
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
                label="Plan original"
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
          onToggle={(e) => {
            const open = (e.currentTarget as HTMLDetailsElement).open;
            const k = `${vista}:${periodoKey}`;
            if (open !== ramasOpen) toggleRamasAbiertas(k);
          }}
          className="mt-3 rounded-lg border border-border/60 bg-surface/30"
        >
          <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-muted marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className={`text-[10px] transition-transform ${ramasOpen ? "rotate-90" : ""}`}>▶</span>
              Ramas ({ramas.length})
            </span>
          </summary>
          <div className="space-y-2 border-t border-border/60 px-2 py-2">
            {ramas.map((rama) => (
              <FilaRama
                key={rama.id}
                rama={rama}
                raiz={raiz}
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
        </details>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Apuntar real (total {titulo})
          <NumberInput
            value={
              registros.find((r) => r.nodoId === raiz.id && r.periodoTipo === periodoTipo && r.periodoKey === periodoKey)?.valor
            }
            onCommit={(v) => upsert({ nodoId: raiz.id, periodoTipo, periodoKey, valor: v })}
            ariaLabel={`Real ${titulo}`}
            unidad={unidad}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Año pasado (cargar)
          <NumberInput
            value={
              registros.find(
                (r) =>
                  r.nodoId === raiz.id &&
                  r.periodoTipo === periodoTipo &&
                  r.periodoKey === desplazarUnAnio(periodoTipo, periodoKey),
              )?.valor
            }
            onCommit={(v) =>
              upsert({
                nodoId: raiz.id,
                periodoTipo,
                periodoKey: desplazarUnAnio(periodoTipo, periodoKey),
                valor: v,
              })
            }
            ariaLabel={`Año pasado ${titulo}`}
            unidad={unidad}
          />
        </label>
      </div>
    </div>
  );
}

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

function FormNuevaFlor({
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
          "Esta rama ya tiene apuntes propios. Vamos a moverlos a una flor «Sin asignar» para no perderlos. ¿Continuar?",
        )
      )
        return;
    }
    const florNombre = tieneRegsPropios ? "Sin asignar" : nombre.trim() || "Flor";
    const florId = generateId();
    const siblings = hijosSumaDirectos(nodos, rama.id, year);
    const orden = siblings.length > 0 ? Math.max(...siblings.map((s) => s.orden), 0) + 1 : 0;
    const m = parseFloat(meta.replace(",", "."));
    const now = new Date().toISOString();
    dispatch({
      type: "ADD_NODO_ARBOL",
      payload: {
        id: florId,
        anio: year,
        parentId: rama.id,
        orden,
        nombre: florNombre,
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
      dispatch({ type: "REASSIGN_REGISTROS_NODO", fromNodoId: rama.id, toNodoId: florId });
    }
    onCreated();
  };

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded border border-accent/30 bg-accent/5 p-2">
      <p className="text-[10px] text-muted">Nueva flor en «{rama.nombre}»</p>
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
          Crear flor
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Nodo hoja (rama sin flores o flor): métricas + apunte €/% + año pasado. */
function FilaHojaArbol({
  nodo,
  nodos,
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
  nodo: NodoArbol;
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  vista: VistaPeriodoArbol;
  periodoKey: string;
  year: number;
  config: PlanArbolConfigAnio | undefined;
  unidad: string;
  /** Plan del periodo del «padre» para apuntar en % (rama → plan raíz; flor → plan de la rama en el periodo). */
  planBasePct: number | undefined;
  modoStoragePrefix: "rama" | "flor";
  compact?: boolean;
  tituloExtra?: string;
  puedeEliminar?: boolean;
  onEliminar?: () => void;
}) {
  const upsert = useUpsertRegistro();
  const periodoTipo = periodoTipoDeVista(vista);

  const plan = planAgregadoEnPeriodo(nodo, nodos, vista, periodoKey, year, config);
  const real = realEfectivoEnPeriodo(registros, nodos, nodo.id, vista, periodoKey, year);
  const anioPasado = realAnioPasadoAgregado(registros, nodos, nodo.id, vista, periodoKey, year);

  const valorReal = registros.find(
    (r) => r.nodoId === nodo.id && r.periodoTipo === periodoTipo && r.periodoKey === periodoKey,
  )?.valor;
  const valorAnioPasado = registros.find(
    (r) =>
      r.nodoId === nodo.id &&
      r.periodoTipo === periodoTipo &&
      r.periodoKey === desplazarUnAnio(periodoTipo, periodoKey),
  )?.valor;

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
        </span>
        <span className="text-muted">
          Real <strong className="tabular-nums text-foreground">{fmtNum(real)}</strong>
        </span>
        <span className="text-muted">
          Año pasado <strong className="tabular-nums text-foreground">{anioPasado > 0 ? fmtNum(anioPasado) : "—"}</strong>
        </span>
        {deltaPlan !== undefined && (
          <span className={`tabular-nums ${deltaPlan >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
            Δ {fmtNum(deltaPlan, { signed: true })}
          </span>
        )}
      </div>
      <div className={`mt-2 grid grid-cols-1 gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
        <div className="flex flex-col gap-1 text-[10px] text-muted">
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
              onCommit={(v) => upsert({ nodoId: nodo.id, periodoTipo, periodoKey, valor: v })}
              ariaLabel={`Real ${nodo.nombre}`}
              unidad={unidad}
            />
          ) : (
            <PercentInput
              value={realComoPct}
              onCommit={(p) => {
                if (planBasePct === undefined || planBasePct <= 0) return;
                if (p === undefined) {
                  upsert({ nodoId: nodo.id, periodoTipo, periodoKey, valor: undefined });
                  return;
                }
                upsert({ nodoId: nodo.id, periodoTipo, periodoKey, valor: (planBasePct * p) / 100 });
              }}
              ariaLabel={`Real ${nodo.nombre} en porcentaje`}
            />
          )}
          {modoEs === "pct" && !pctDeshabilitado && (
            <span className="text-[10px] text-muted">
              Sobre plan {fmtNum(planBasePct ?? 0)} {unidad}
            </span>
          )}
        </div>
        <label className="flex flex-col gap-1 text-[10px] text-muted">
          Año pasado
          <NumberInput
            value={valorAnioPasado}
            onCommit={(v) =>
              upsert({
                nodoId: nodo.id,
                periodoTipo,
                periodoKey: desplazarUnAnio(periodoTipo, periodoKey),
                valor: v,
              })
            }
            ariaLabel={`Año pasado ${nodo.nombre}`}
            unidad={unidad}
          />
        </label>
      </div>
    </div>
  );
}

function FilaRama({
  rama,
  raiz,
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
  const [mostrarNuevaFlor, setMostrarNuevaFlor] = useState(false);

  const flores = useMemo(() => hijosSumaDirectos(nodos, rama.id, year), [nodos, rama.id, year]);
  const conFlores = flores.length > 0;

  const planRamaEnPeriodo = planAgregadoEnPeriodo(rama, nodos, vista, periodoKey, year, config);
  const plan = planRamaEnPeriodo;
  const real = realEfectivoEnPeriodo(registros, nodos, rama.id, vista, periodoKey, year);
  const anioPasado = realAnioPasadoAgregado(registros, nodos, rama.id, vista, periodoKey, year);

  const deltaPlan = plan !== undefined ? real - plan : undefined;

  const metaLine = conFlores ? (
    <>
      Meta anual (suma flores):{" "}
      <strong className="tabular-nums text-foreground">
        {metaEfectivaNodo(rama, nodos, year) !== undefined
          ? `${fmtNum(metaEfectivaNodo(rama, nodos, year))} ${unidad}`
          : "—"}
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
            onClick={() => setMostrarNuevaFlor((v) => !v)}
            className="rounded px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent/10"
            aria-label={`Añadir flor en ${rama.nombre}`}
          >
            + flor
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
          Año pasado <strong className="tabular-nums text-foreground">{anioPasado > 0 ? fmtNum(anioPasado) : "—"}</strong>
        </span>
        {deltaPlan !== undefined && (
          <span className={`tabular-nums ${deltaPlan >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
            Δ {fmtNum(deltaPlan, { signed: true })}
          </span>
        )}
      </div>

      {mostrarNuevaFlor && (
        <FormNuevaFlor
          rama={rama}
          raiz={raiz}
          year={year}
          nodos={nodos}
          registros={registros}
          onCancel={() => setMostrarNuevaFlor(false)}
          onCreated={() => setMostrarNuevaFlor(false)}
        />
      )}

      {conFlores ? (
        <details className="mt-2 rounded border border-border/50 bg-surface/20">
          <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium text-muted marker:content-none [&::-webkit-details-marker]:hidden">
            Flores ({flores.length})
          </summary>
          <div className="space-y-2 border-t border-border/50 px-2 py-2">
            {flores.map((flor) => (
              <FilaHojaArbol
                key={flor.id}
                nodo={flor}
                nodos={nodos}
                registros={registros}
                vista={vista}
                periodoKey={periodoKey}
                year={year}
                config={config}
                unidad={unidad}
                planBasePct={planRamaEnPeriodo}
                modoStoragePrefix="flor"
                tituloExtra={flor.nombre}
                puedeEliminar
                onEliminar={() => {
                  const ok = window.confirm(`¿Eliminar la flor «${flor.nombre}» y sus registros?`);
                  if (ok) dispatch({ type: "DELETE_NODO_ARBOL", id: flor.id });
                }}
              />
            ))}
          </div>
        </details>
      ) : (
        <>
          <FilaHojaArbol
            nodo={rama}
            nodos={nodos}
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
}

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
function BloqueAnio({ ctx, ramasAbiertasIds, toggleRamasAbiertas }: {
  ctx: ContextoBloque;
  ramasAbiertasIds: Set<string>;
  toggleRamasAbiertas: (k: string) => void;
}) {
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
        ramasAbiertasIds={ramasAbiertasIds}
        toggleRamasAbiertas={toggleRamasAbiertas}
      />
    </SeccionColapsable>
  );
}

/** Bloque Trimestres: 4 tarjetas. */
function BloqueTrimestres({ ctx, ramasAbiertasIds, toggleRamasAbiertas }: {
  ctx: ContextoBloque;
  ramasAbiertasIds: Set<string>;
  toggleRamasAbiertas: (k: string) => void;
}) {
  const trims = [`${ctx.year}-Q1`, `${ctx.year}-Q2`, `${ctx.year}-Q3`, `${ctx.year}-Q4`];
  return (
    <SeccionColapsable
      storageKey={`arbol.bloque.trimestres.${ctx.year}`}
      defaultOpen={true}
      titulo="Trimestres"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {trims.map((q) => (
          <TarjetaPeriodo
            key={q}
            ctx={ctx}
            vista="trimestre"
            periodoKey={q}
            titulo={q}
            ramasAbiertasIds={ramasAbiertasIds}
            toggleRamasAbiertas={toggleRamasAbiertas}
          />
        ))}
      </div>
    </SeccionColapsable>
  );
}

/** Bloque Meses: pestañas Q1..Q4. */
function BloqueMeses({ ctx, ramasAbiertasIds, toggleRamasAbiertas }: {
  ctx: ContextoBloque;
  ramasAbiertasIds: Set<string>;
  toggleRamasAbiertas: (k: string) => void;
}) {
  const qActualKey = `${ctx.year}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;
  const [tab, setTab] = useState<string>(qActualKey);
  const tabs = [`${ctx.year}-Q1`, `${ctx.year}-Q2`, `${ctx.year}-Q3`, `${ctx.year}-Q4`];
  const meses = useMemo(() => mesKeysEnTrimestre(tab), [tab]);
  return (
    <SeccionColapsable
      storageKey={`arbol.bloque.meses.${ctx.year}`}
      defaultOpen={true}
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
              ramasAbiertasIds={ramasAbiertasIds}
              toggleRamasAbiertas={toggleRamasAbiertas}
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
    () => realDelAnioHastaHoy(ctx.registros, ctx.raiz.id, ctx.year),
    [ctx.registros, ctx.raiz.id, ctx.year],
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
      defaultOpen={true}
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
          const plan = isVac
            ? 0
            : metaParaPeriodo(ctx.raiz.cadencia, ctx.raiz.metaValor, "semana", mk, ctx.year, ctx.config);
          const real = realDeNodo(ctx.registros, ctx.raiz.id, "semana", mk, ctx.year);
          const anioPasado = realAnioPasadoDeNodo(ctx.registros, ctx.raiz.id, "semana", mk, ctx.year);
          const valor = ctx.registros.find(
            (r) => r.nodoId === ctx.raiz.id && r.periodoTipo === "semana" && r.periodoKey === mk,
          )?.valor;
          const ayKey = desplazarUnAnio("semana", mk);
          const valorAy = ctx.registros.find(
            (r) => r.nodoId === ctx.raiz.id && r.periodoTipo === "semana" && r.periodoKey === ayKey,
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
                        {anioPasado > 0 && (
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

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                    <label className="flex flex-col gap-0.5 text-[10px] text-muted">
                      Año pasado
                      <NumberInput
                        value={valorAy}
                        onCommit={(v) =>
                          upsert({ nodoId: ctx.raiz.id, periodoTipo: "semana", periodoKey: ayKey, valor: v })
                        }
                        ariaLabel={`Año pasado ${mk}`}
                        unidad={ctx.unidad}
                      />
                    </label>
                  </div>

                  {ramasQueSuman.length > 0 && (
                    <details className="mt-2 rounded-lg border border-border/60 bg-surface/25">
                      <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium text-muted marker:content-none [&::-webkit-details-marker]:hidden">
                        Por rama ({ramasQueSuman.length})
                      </summary>
                      <div className="space-y-2 border-t border-border/50 px-2 py-2">
                        {ramasQueSuman.map((rama) => {
                          const flores = hijosSumaDirectos(ctx.nodos, rama.id, ctx.year);
                          const planRamaSem = planAgregadoEnPeriodo(
                            rama,
                            ctx.nodos,
                            "semana",
                            mk,
                            ctx.year,
                            ctx.config,
                          );
                          const realRamaSem = realEfectivoEnPeriodo(
                            ctx.registros,
                            ctx.nodos,
                            rama.id,
                            "semana",
                            mk,
                            ctx.year,
                          );
                          const conFlores = flores.length > 0;
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
                                {conFlores ? (
                                  flores.map((flor) => (
                                    <FilaHojaArbol
                                      key={flor.id}
                                      nodo={flor}
                                      nodos={ctx.nodos}
                                      registros={ctx.registros}
                                      vista="semana"
                                      periodoKey={mk}
                                      year={ctx.year}
                                      config={ctx.config}
                                      unidad={ctx.unidad}
                                      planBasePct={planRamaSem}
                                      modoStoragePrefix="flor"
                                      compact
                                      tituloExtra={flor.nombre}
                                      puedeEliminar
                                      onEliminar={() => {
                                        const ok = window.confirm(`¿Eliminar la flor «${flor.nombre}» y sus registros?`);
                                        if (ok) dispatch({ type: "DELETE_NODO_ARBOL", id: flor.id });
                                      }}
                                    />
                                  ))
                                ) : (
                                  <FilaHojaArbol
                                    nodo={rama}
                                    nodos={ctx.nodos}
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

  const ctx: ContextoBloque = {
    raiz,
    ramas,
    nodos: arbol.nodos,
    registros: arbol.registros,
    config,
    year,
    unidad,
  };

  // estado para abrir/cerrar las "Ramas" por tarjeta
  const [ramasAbiertas, setRamasAbiertas] = useState<Set<string>>(new Set([`anio:${year}`, `trimestre:${trimestreKeyFromMesKey(mesKeyFromDate(new Date()))}`]));
  const toggleRamas = useCallback((k: string) => {
    setRamasAbiertas((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }, []);

  const [ramaFlorFormConfigId, setRamaFlorFormConfigId] = useState<string | null>(null);

  // suma de metas efectivas de ramas y aviso si no cuadran con la meta total
  const planRamasAnual = useMemo(
    () =>
      ramas
        .filter((r) => r.relacionConPadre === "suma")
        .reduce((acc, r) => acc + (metaEfectivaNodo(r, arbol.nodos, year) ?? 0), 0),
    [ramas, arbol.nodos, year],
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

      <BloqueAnio ctx={ctx} ramasAbiertasIds={ramasAbiertas} toggleRamasAbiertas={toggleRamas} />
      <BloqueTrimestres ctx={ctx} ramasAbiertasIds={ramasAbiertas} toggleRamasAbiertas={toggleRamas} />
      <BloqueMeses ctx={ctx} ramasAbiertasIds={ramasAbiertas} toggleRamasAbiertas={toggleRamas} />
      <BloqueSemanas ctx={ctx} />

      <SeccionColapsable
        storageKey={`arbol.bloque.ramas-config.${year}`}
        defaultOpen={false}
        titulo="Ramas (configuración anual)"
        resumen={`${ramas.length} ${ramas.length === 1 ? "rama" : "ramas"}`}
      >
        <p className="text-[11px] text-muted">
          Las ramas son las cosas que sumas para llegar al objetivo del año (ej. aulas, planes, individual). Aquí defines su <strong>meta anual</strong> (en {unidad || "número"} o como % del total) y si cuentan o no para el total. Para apuntar lo facturado de cada rama, hazlo dentro de cada mes/trimestre arriba.
        </p>
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
                    acc + (totalAnual > 0 ? ((metaEfectivaNodo(r, arbol.nodos, year) ?? 0) / totalAnual) * 100 : 0),
                  0,
                );
              return (
                <>
                  {ramas.map((rama) => {
                    const floresCfg = hijosSumaDirectos(arbol.nodos, rama.id, year);
                    const conFloresCfg = floresCfg.length > 0;
                    const metaEffRama = metaEfectivaNodo(rama, arbol.nodos, year);
                    const pct =
                      totalAnual > 0 && metaEffRama !== undefined ? (metaEffRama / totalAnual) * 100 : undefined;
                    const cuentaParaTotal = rama.relacionConPadre === "suma";
                    const sumMetaFlores = floresCfg.reduce((acc, f) => acc + (f.metaValor ?? 0), 0);
                    return (
                      <div key={rama.id} className="rounded border border-border bg-surface/40 px-3 py-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{rama.nombre}</p>
                          <span className="text-[11px] text-muted">
                            Meta anual:{" "}
                            <strong className="tabular-nums text-foreground">
                              {conFloresCfg ? (
                                <>
                                  = suma flores · {metaEffRama !== undefined ? `${fmtNum(metaEffRama)} ${unidad}` : "—"}
                                </>
                              ) : rama.metaValor !== undefined ? (
                                `${fmtNum(rama.metaValor)} ${unidad}`
                              ) : (
                                "—"
                              )}
                            </strong>
                            {cuentaParaTotal && pct !== undefined && (
                              <>
                                {" "}·{" "}
                                <strong className="tabular-nums text-foreground">{pct.toFixed(1).replace(".", ",")} %</strong>
                                <span className="text-muted"> del total</span>
                              </>
                            )}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setRamaFlorFormConfigId((id) => (id === rama.id ? null : rama.id))
                            }
                            className="rounded-lg border border-accent/40 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10"
                          >
                            + flor
                          </button>
                        </div>
                        {ramaFlorFormConfigId === rama.id && (
                          <FormNuevaFlor
                            rama={rama}
                            raiz={raiz}
                            year={year}
                            nodos={arbol.nodos}
                            registros={arbol.registros}
                            onCancel={() => setRamaFlorFormConfigId(null)}
                            onCreated={() => setRamaFlorFormConfigId(null)}
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
                            Meta anual ({unidad || "número"})
                            {conFloresCfg ? (
                              <span className="rounded border border-border/60 bg-background/80 px-2 py-1.5 text-sm tabular-nums text-muted">
                                Solo lectura · suma de flores
                              </span>
                            ) : (
                              <NumberInput
                                value={rama.metaValor}
                                onCommit={(v) =>
                                  dispatch({ type: "UPDATE_NODO_ARBOL", id: rama.id, changes: { metaValor: v } })
                                }
                                ariaLabel={`Meta anual de ${rama.nombre}`}
                                unidad={unidad}
                              />
                            )}
                          </label>
                          <label className="flex flex-col gap-1 text-[11px] text-muted">
                            % del total
                            <PercentInput
                              value={pct}
                              disabled={totalAnual <= 0 || conFloresCfg}
                              onCommit={(p) => {
                                if (totalAnual <= 0 || p === undefined || conFloresCfg) return;
                                const nuevoMeta = (totalAnual * p) / 100;
                                dispatch({ type: "UPDATE_NODO_ARBOL", id: rama.id, changes: { metaValor: nuevoMeta } });
                              }}
                              ariaLabel={`Porcentaje del total de ${rama.nombre}`}
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
                        {conFloresCfg && (
                          <details className="mt-3 rounded border border-border/60 bg-background/50">
                            <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium text-muted marker:content-none [&::-webkit-details-marker]:hidden">
                              Flores ({floresCfg.length})
                            </summary>
                            <div className="space-y-3 border-t border-border/50 px-2 py-2">
                              {floresCfg.map((flor) => {
                                const pctFlor =
                                  sumMetaFlores > 0 && flor.metaValor !== undefined
                                    ? (flor.metaValor / sumMetaFlores) * 100
                                    : undefined;
                                return (
                                  <div key={flor.id} className="rounded border border-border/40 p-2">
                                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                                      <span className="text-[11px] font-medium text-foreground">{flor.nombre}</span>
                                      {pctFlor !== undefined && (
                                        <span className="text-[10px] text-muted">
                                          <strong className="tabular-nums text-foreground">
                                            {pctFlor.toFixed(1).replace(".", ",")} %
                                          </strong>{" "}
                                          de la rama
                                        </span>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                                        Nombre
                                        <input
                                          defaultValue={flor.nombre}
                                          onBlur={(e) => {
                                            const v = e.target.value.trim();
                                            if (v && v !== flor.nombre) {
                                              dispatch({ type: "UPDATE_NODO_ARBOL", id: flor.id, changes: { nombre: v } });
                                            }
                                          }}
                                          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
                                        />
                                      </label>
                                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                                        Meta anual ({unidad || "número"})
                                        <NumberInput
                                          value={flor.metaValor}
                                          onCommit={(v) =>
                                            dispatch({ type: "UPDATE_NODO_ARBOL", id: flor.id, changes: { metaValor: v } })
                                          }
                                          ariaLabel={`Meta anual de ${flor.nombre}`}
                                          unidad={unidad}
                                        />
                                      </label>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const ok = window.confirm(`¿Eliminar la flor «${flor.nombre}» y sus registros?`);
                                        if (ok) dispatch({ type: "DELETE_NODO_ARBOL", id: flor.id });
                                      }}
                                      className="mt-2 text-[11px] text-muted hover:text-red-600"
                                    >
                                      Eliminar flor
                                    </button>
                                  </div>
                                );
                              })}
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
    </div>
  );
}
