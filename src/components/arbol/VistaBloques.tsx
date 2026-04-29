"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { generateId } from "@/lib/store";
import { EMPTY_ARBOL, type NodoArbol, type PlanArbolConfigAnio, type RegistroNodo } from "@/lib/types";
import {
  cuotaAjustada,
  defaultSemanasNoActivas,
  ensureConfigAnio,
  estadoPeriodo,
  formatWeekRange,
  isoWeekLabelFromMondayKey,
  mesKeyFromDate,
  mesKeysEnTrimestre,
  metaParaPeriodo,
  mondaysInCalendarYear,
  parseLocalDateKey,
  ramasDirectas,
  semanasActivasCount,
  sumarRegistrosNodoAnioAnterior,
  sumarRegistrosNodoSimple,
  trimestreKeyFromMesKey,
  type VistaPeriodoArbol,
} from "@/lib/arbol-tiempo";

const MESES_CORTOS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

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
    if (vista === "anio") return raiz.metaValor;
    return undefined;
  }, [estado, vista, periodoKey, ajuste, raiz.metaValor]);

  const deltaPlan = plan !== undefined ? real - plan : undefined;
  const deltaAnioPasado = anioPasado > 0 ? real - anioPasado : undefined;

  const pct = plan && plan > 0 ? Math.min(100, Math.round((real / plan) * 100)) : real > 0 ? 100 : 0;
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
      <div className="mt-2 space-y-1">
        <MetricLine
          label="Plan"
          value={plan !== undefined ? `${fmtNum(plan)} ${unidad}` : "—"}
          accent="muted"
        />
        <MetricLine label="Real" value={`${fmtNum(real)} ${unidad}`} />
        <MetricLine
          label="Año pasado"
          value={anioPasado > 0 ? `${fmtNum(anioPasado)} ${unidad}` : "—"}
          accent="muted"
        />
        {deltaPlan !== undefined && (
          <MetricLine
            label="Δ vs plan"
            value={`${fmtNum(deltaPlan, { signed: true })} ${unidad}`}
            accent={deltaPlan >= 0 ? "good" : "bad"}
          />
        )}
        {deltaAnioPasado !== undefined && (
          <MetricLine
            label="Δ vs año pasado"
            value={`${fmtNum(deltaAnioPasado, { signed: true })} ${unidad}`}
            accent={deltaAnioPasado >= 0 ? "good" : "bad"}
          />
        )}
        {ajustado !== undefined && estado !== "pasado" && plan !== undefined && (
          <MetricLine
            label="Para llegar al año"
            value={`${fmtNum(ajustado)} ${unidad}`}
            accent={ajustado > plan ? "bad" : "good"}
          />
        )}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Apuntar real
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
            Ramas ({ramas.length})
          </summary>
          <div className="space-y-2 border-t border-border/60 px-3 py-2">
            {ramas.map((rama) => (
              <FilaRama
                key={rama.id}
                rama={rama}
                registros={registros}
                vista={vista}
                periodoKey={periodoKey}
                year={year}
                config={config}
                unidad={unidad}
              />
            ))}
          </div>
        </details>
      )}
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

function FilaRama({
  rama,
  registros,
  vista,
  periodoKey,
  year,
  config,
  unidad,
}: {
  rama: NodoArbol;
  registros: RegistroNodo[];
  vista: VistaPeriodoArbol;
  periodoKey: string;
  year: number;
  config: PlanArbolConfigAnio | undefined;
  unidad: string;
}) {
  const dispatch = useAppDispatch();
  const upsert = useUpsertRegistro();
  const periodoTipo = periodoTipoDeVista(vista);

  const plan = metaParaPeriodo(rama.cadencia, rama.metaValor, vista, periodoKey, year, config);
  const real = realDeNodo(registros, rama.id, vista, periodoKey, year);
  const anioPasado = realAnioPasadoDeNodo(registros, rama.id, vista, periodoKey, year);

  const valorReal = registros.find(
    (r) => r.nodoId === rama.id && r.periodoTipo === periodoTipo && r.periodoKey === periodoKey,
  )?.valor;
  const valorAnioPasado = registros.find(
    (r) =>
      r.nodoId === rama.id &&
      r.periodoTipo === periodoTipo &&
      r.periodoKey === desplazarUnAnio(periodoTipo, periodoKey),
  )?.valor;

  const deltaPlan = plan !== undefined ? real - plan : undefined;

  return (
    <div className="rounded-md bg-background px-2 py-2 ring-1 ring-border/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{rama.nombre}</p>
          <p className="text-[10px] text-muted">
            Meta anual: {rama.metaValor !== undefined ? `${fmtNum(rama.metaValor)} ${unidad}` : "—"}
          </p>
        </div>
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
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[10px] text-muted">
          Apuntar real
          <NumberInput
            value={valorReal}
            onCommit={(v) => upsert({ nodoId: rama.id, periodoTipo, periodoKey, valor: v })}
            ariaLabel={`Real ${rama.nombre}`}
            unidad={unidad}
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-muted">
          Año pasado
          <NumberInput
            value={valorAnioPasado}
            onCommit={(v) =>
              upsert({
                nodoId: rama.id,
                periodoTipo,
                periodoKey: desplazarUnAnio(periodoTipo, periodoKey),
                valor: v,
              })
            }
            ariaLabel={`Año pasado ${rama.nombre}`}
            unidad={unidad}
          />
        </label>
      </div>
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
    <section className="space-y-3">
      <header className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold text-foreground">Año {ctx.year}</h2>
      </header>
      <TarjetaPeriodo
        ctx={ctx}
        vista="anio"
        periodoKey={String(ctx.year)}
        titulo={ctx.raiz.nombre}
        subtitulo={`Objetivo total ${fmtNum(ctx.raiz.metaValor)} ${ctx.unidad}`}
        ramasAbiertasIds={ramasAbiertasIds}
        toggleRamasAbiertas={toggleRamasAbiertas}
      />
    </section>
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
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">Trimestres</h2>
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
    </section>
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Meses</h2>
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
    </section>
  );
}

/** Bloque Semanas: pestañas mes, lista vertical de semanas. */
function BloqueSemanas({ ctx }: { ctx: ContextoBloque }) {
  const noActivas = new Set(ctx.config?.semanasNoActivas ?? defaultSemanasNoActivas(ctx.year));
  const todos = useMemo(() => mondaysInCalendarYear(ctx.year), [ctx.year]);
  const mesActual = mesKeyFromDate(new Date());
  const mesInicial = mesActual.startsWith(`${ctx.year}-`) ? mesActual : `${ctx.year}-01`;
  const [mesTab, setMesTab] = useState<string>(mesInicial);
  const upsert = useUpsertRegistro();

  const meses12 = Array.from({ length: 12 }, (_, i) => `${ctx.year}-${String(i + 1).padStart(2, "0")}`);
  const semanasMes = todos.filter((mk) => mesKeyFromDate(parseLocalDateKey(mk)) === mesTab);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Semanas</h2>
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
          return (
            <div
              key={mk}
              className={`flex flex-col gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 sm:flex-row sm:items-center ${
                isVac ? "bg-surface/40" : ""
              }`}
            >
              <div className="min-w-0 sm:w-44">
                <p className="text-sm font-medium text-foreground">{isoWeekLabelFromMondayKey(mk)}</p>
                <p className="text-[10px] text-muted">{formatWeekRange(mk)}</p>
              </div>
              {isVac ? (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-100">
                  Descanso
                </span>
              ) : (
                <div className="grid flex-1 grid-cols-2 items-end gap-2 text-[11px] sm:grid-cols-5">
                  <span className="text-muted">
                    Plan <strong className="tabular-nums text-foreground">{plan !== undefined ? fmtNum(plan) : "—"}</strong>
                  </span>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-muted">Real</span>
                    <NumberInput
                      value={valor}
                      onCommit={(v) =>
                        upsert({ nodoId: ctx.raiz.id, periodoTipo: "semana", periodoKey: mk, valor: v })
                      }
                      ariaLabel={`Real ${mk}`}
                      unidad={ctx.unidad}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-muted">Año pasado</span>
                    <NumberInput
                      value={valorAy}
                      onCommit={(v) =>
                        upsert({ nodoId: ctx.raiz.id, periodoTipo: "semana", periodoKey: ayKey, valor: v })
                      }
                      ariaLabel={`Año pasado ${mk}`}
                      unidad={ctx.unidad}
                    />
                  </label>
                  {delta !== undefined ? (
                    <span
                      className={`tabular-nums ${
                        delta >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
                      }`}
                    >
                      Δ {fmtNum(delta, { signed: true })}
                    </span>
                  ) : (
                    <span />
                  )}
                  <div className="hidden h-2 overflow-hidden rounded-full bg-surface sm:block" aria-hidden>
                    <div
                      className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-accent"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-muted sm:hidden">
                    Año pasado:{" "}
                    <strong className="tabular-nums text-foreground">{anioPasado > 0 ? fmtNum(anioPasado) : "—"}</strong>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
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

  const ctx: ContextoBloque = { raiz, ramas, registros: arbol.registros, config, year, unidad };

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

  // suma de planes de ramas y aviso si no cuadran con la meta total
  const planRamasAnual = useMemo(
    () => ramas.filter((r) => r.relacionConPadre === "suma").reduce((acc, r) => acc + (r.metaValor ?? 0), 0),
    [ramas],
  );
  const cuadre =
    raiz.metaValor !== undefined && planRamasAnual > 0 && Math.abs(planRamasAnual - raiz.metaValor) > 0.01
      ? `Las ramas suman ${fmtNum(planRamasAnual)} ${unidad} y el objetivo es ${fmtNum(raiz.metaValor)} ${unidad}.`
      : null;

  const semanasActivas = semanasActivasCount(year, config);
  const cuotaSemanal = raiz.metaValor && semanasActivas > 0 ? raiz.metaValor / semanasActivas : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-[12px] text-foreground">
        En {year} hay <strong>{semanasActivas}</strong> semanas laborables.{" "}
        {raiz.metaValor !== undefined && (
          <>
            Para llegar a <strong>{fmtNum(raiz.metaValor)} {unidad}</strong> tendrías que hacer{" "}
            <strong className="tabular-nums">{fmtNum(cuotaSemanal)} {unidad}</strong> de media a la semana.
          </>
        )}
        {cuadre && <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-amber-900 dark:text-amber-100">{cuadre}</span>}
      </div>

      <BloqueAnio ctx={ctx} ramasAbiertasIds={ramasAbiertas} toggleRamasAbiertas={toggleRamas} />
      <BloqueTrimestres ctx={ctx} ramasAbiertasIds={ramasAbiertas} toggleRamasAbiertas={toggleRamas} />
      <BloqueMeses ctx={ctx} ramasAbiertasIds={ramasAbiertas} toggleRamasAbiertas={toggleRamas} />
      <BloqueSemanas ctx={ctx} />

      <section className="space-y-3 rounded-xl border border-border bg-background p-3">
        <h2 className="text-base font-semibold text-foreground">Ramas</h2>
        <p className="text-[11px] text-muted">
          Las ramas son las cosas que sumas para llegar al objetivo del año (ej. aulas, planes, individual). Cada una tiene su meta anual.
        </p>
        <div className="space-y-2">
          {ramas.length === 0 ? (
            <p className="rounded border border-dashed border-border px-3 py-3 text-sm text-muted">
              Aún no has añadido ramas. Empieza por las que más facturan.
            </p>
          ) : (
            ramas.map((rama) => (
              <div key={rama.id} className="rounded border border-border bg-surface/40 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{rama.nombre}</p>
                  <span className="text-[11px] text-muted">
                    Meta anual:{" "}
                    <strong className="tabular-nums text-foreground">
                      {rama.metaValor !== undefined ? `${fmtNum(rama.metaValor)} ${unidad}` : "—"}
                    </strong>
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                    <NumberInput
                      value={rama.metaValor}
                      onCommit={(v) =>
                        dispatch({ type: "UPDATE_NODO_ARBOL", id: rama.id, changes: { metaValor: v } })
                      }
                      ariaLabel={`Meta anual de ${rama.nombre}`}
                      unidad={unidad}
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
              </div>
            ))
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
      </section>
    </div>
  );
}
