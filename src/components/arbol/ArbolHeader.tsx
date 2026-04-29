"use client";

import type { VistaPeriodoArbol } from "@/lib/arbol-tiempo";
import {
  isoWeekLabelFromMondayKey,
  formatWeekRange,
  mesKeyFromDate,
  trimestreKeyFromMesKey,
  mondaysInCalendarYear,
  toMondayDateKeyLocal,
} from "@/lib/arbol-tiempo";
import { PeriodoLabel } from "./NodoRow";

const VISTAS: { id: VistaPeriodoArbol; label: string }[] = [
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "trimestre", label: "Trimestre" },
  { id: "anio", label: "Año" },
];

export function ArbolHeader({
  year,
  onYearChange,
  vista,
  onVista,
  weekMonday,
  onWeekMondayChange,
  mesKey,
  onMesKeyChange,
  trimestreKey,
  onTrimestreKeyChange,
  semanasNoActivas,
  onOpenVacaciones,
}: {
  year: number;
  onYearChange: (y: number) => void;
  vista: VistaPeriodoArbol;
  onVista: (v: VistaPeriodoArbol) => void;
  weekMonday: string;
  onWeekMondayChange: (mk: string) => void;
  mesKey: string;
  onMesKeyChange: (mk: string) => void;
  trimestreKey: string;
  onTrimestreKeyChange: (qk: string) => void;
  semanasNoActivas: Set<string>;
  onOpenVacaciones: () => void;
}) {
  const mondays = mondaysInCalendarYear(year);
  const ix = mondays.indexOf(weekMonday);

  function prevWeek() {
    if (ix <= 0) return;
    onWeekMondayChange(mondays[ix - 1]);
  }
  function nextWeek() {
    if (ix < 0 || ix >= mondays.length - 1) return;
    onWeekMondayChange(mondays[ix + 1]);
  }

  const meses = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const trimestres = [`${year}-Q1`, `${year}-Q2`, `${year}-Q3`, `${year}-Q4`];

  const vac = semanasNoActivas.has(weekMonday);

  return (
    <div className="mb-6 space-y-4 border-b border-border pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Tus metas</h1>
          <p className="mt-1 text-sm text-muted">
            Apunta qué quieres y cuánto; la app suma por semanas y meses. Descansos en agosto y Navidad ya vienen marcados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onYearChange(year - 1)} className="rounded-lg border border-border px-2 py-1.5 text-sm text-muted hover:bg-surface">
            ◀
          </button>
          <span className="min-w-[4rem] text-center text-lg font-semibold">{year}</span>
          <button type="button" onClick={() => onYearChange(year + 1)} className="rounded-lg border border-border px-2 py-1.5 text-sm text-muted hover:bg-surface">
            ▶
          </button>
          <button type="button" onClick={onOpenVacaciones} className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-500/20">
            Semanas de descanso
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onVista(v.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              vista === v.id ? "bg-accent text-white" : "border border-border bg-surface text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {vista === "semana" && (
          <>
            <button type="button" onClick={prevWeek} disabled={ix <= 0} className="rounded border border-border px-2 py-1 text-xs disabled:opacity-40">
              ← Semana
            </button>
            <div className="flex flex-col gap-0.5">
              <PeriodoLabel vista="semana" weekMonday={weekMonday} year={year} />
              {vac && (
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-100">
                  Vacaciones — sin objetivo de registro
                </span>
              )}
            </div>
            <button type="button" onClick={nextWeek} disabled={ix < 0 || ix >= mondays.length - 1} className="rounded border border-border px-2 py-1 text-xs disabled:opacity-40">
              Semana →
            </button>
          </>
        )}
        {vista === "mes" && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Mes:</span>
            <select value={mesKey} onChange={(e) => onMesKeyChange(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs">
              {meses.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
        {vista === "trimestre" && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Trimestre:</span>
            <select value={trimestreKey} onChange={(e) => onTrimestreKeyChange(e.target.value)} className="rounded border border-border bg-background px-2 py-1 text-xs">
              {trimestres.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
        {vista === "anio" && <PeriodoLabel vista="anio" year={year} />}
      </div>

      <p className="text-[10px] text-muted">
        Estás mirando:{" "}
        <strong className="text-foreground">{VISTAS.find((v) => v.id === vista)?.label ?? vista}</strong>
        {vista === "semana" && weekMonday && (
          <>
            {" "}
            · {isoWeekLabelFromMondayKey(weekMonday)} · {formatWeekRange(weekMonday)}
          </>
        )}
      </p>
    </div>
  );
}

/** Sync mes/trimestre / semana desde la fecha actual o inicio de año. */
export function initMesTrimFromDate(y: number): { mesKey: string; trimestreKey: string; weekMonday: string } {
  const now = new Date();
  if (y === now.getFullYear()) {
    const mesKey = mesKeyFromDate(now);
    return {
      mesKey,
      trimestreKey: trimestreKeyFromMesKey(mesKey),
      weekMonday: toMondayDateKeyLocal(now),
    };
  }
  const mesKey = `${y}-01`;
  const firstMonday = mondaysInCalendarYear(y)[0] ?? `${y}-01-01`;
  return { mesKey, trimestreKey: `${y}-Q1`, weekMonday: firstMonday };
}
