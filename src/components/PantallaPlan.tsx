"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useIsMentor } from "@/lib/usuario";
import { PlanHoy } from "./plan/PlanHoy";
import { PlanSemana } from "./plan/PlanSemana";
import { PlanMes } from "./plan/PlanMes";
import { PlanTrimestre } from "./plan/PlanTrimestre";
import { PlanAnio } from "./plan/PlanAnio";

type Tab = "hoy" | "semana" | "mes" | "trimestre" | "anio";

const TABS: { id: Tab; label: string; sublabel: string }[] = [
  { id: "hoy", label: "Hoy", sublabel: "Operativo" },
  { id: "semana", label: "Semana", sublabel: "Táctico" },
  { id: "mes", label: "Mes", sublabel: "Táctico-Estratégico" },
  { id: "trimestre", label: "Trimestre", sublabel: "Estratégico" },
  { id: "anio", label: "Año", sublabel: "Visionario" },
];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonday(d: Date): Date {
  const day = d.getDay() || 7;
  const m = new Date(d);
  m.setDate(d.getDate() - day + 1);
  m.setHours(0, 0, 0, 0);
  return m;
}

function shiftDate(d: Date, tab: Tab, direction: 1 | -1): Date {
  const next = new Date(d);
  switch (tab) {
    case "hoy": next.setDate(d.getDate() + direction); break;
    case "semana": next.setDate(d.getDate() + 7 * direction); break;
    case "mes": next.setDate(1); next.setMonth(d.getMonth() + direction); break;
    case "trimestre": next.setDate(1); next.setMonth(d.getMonth() + 3 * direction); break;
    case "anio": next.setFullYear(d.getFullYear() + direction); break;
  }
  return next;
}

const MONTH_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DAY_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function navLabel(d: Date, tab: Tab): string {
  switch (tab) {
    case "hoy": {
      const today = toDateKey(new Date());
      const sel = toDateKey(d);
      const prefix = sel === today ? "Hoy" : DAY_ES[d.getDay()].charAt(0).toUpperCase() + DAY_ES[d.getDay()].slice(1);
      return `${prefix}, ${d.getDate()} de ${MONTH_ES[d.getMonth()]}`;
    }
    case "semana": {
      const mon = getMonday(d);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return `${mon.getDate()} ${MONTH_ES[mon.getMonth()].slice(0, 3)} – ${sun.getDate()} ${MONTH_ES[sun.getMonth()].slice(0, 3)} ${sun.getFullYear()}`;
    }
    case "mes":
      return `${MONTH_ES[d.getMonth()].charAt(0).toUpperCase() + MONTH_ES[d.getMonth()].slice(1)} ${d.getFullYear()}`;
    case "trimestre": {
      const q = Math.ceil((d.getMonth() + 1) / 3);
      return `Q${q} ${d.getFullYear()}`;
    }
    case "anio":
      return `${d.getFullYear()}`;
  }
}

function isCurrentPeriod(d: Date, tab: Tab): boolean {
  const now = new Date();
  switch (tab) {
    case "hoy": return toDateKey(d) === toDateKey(now);
    case "semana": return toDateKey(getMonday(d)) === toDateKey(getMonday(now));
    case "mes": return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    case "trimestre": return d.getFullYear() === now.getFullYear() && Math.ceil((d.getMonth() + 1) / 3) === Math.ceil((now.getMonth() + 1) / 3);
    case "anio": return d.getFullYear() === now.getFullYear();
  }
}

export function PantallaPlan() {
  const isMentor = useIsMentor();
  const [tab, setTab] = useState<Tab>("hoy");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const dateRef = useRef<HTMLInputElement>(null);

  if (isMentor) return <div className="p-8 text-center text-muted">Vista no disponible para mentor.</div>;

  const isCurrent = useMemo(() => isCurrentPeriod(selectedDate, tab), [selectedDate, tab]);
  const label = useMemo(() => navLabel(selectedDate, tab), [selectedDate, tab]);

  const goBack = useCallback(() => setSelectedDate((d) => shiftDate(d, tab, -1)), [tab]);
  const goForward = useCallback(() => setSelectedDate((d) => shiftDate(d, tab, 1)), [tab]);
  const goToday = useCallback(() => setSelectedDate(new Date()), []);

  function handleTabChange(newTab: Tab) {
    setTab(newTab);
    setSelectedDate(new Date());
  }

  function handleDatePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value) setSelectedDate(new Date(e.target.value + "T12:00:00"));
  }

  return (
    <div className="flex flex-1 flex-col px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Plan</h1>
        <p className="mt-1 text-sm text-muted">
          {TABS.find((t) => t.id === tab)?.sublabel}
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-4 flex gap-1 rounded-xl bg-surface p-1" role="tablist" aria-label="Horizontes de planificación">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => handleTabChange(t.id)}
            className={`flex-1 rounded-lg py-2.5 text-xs font-semibold transition-colors ${
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Navigation bar */}
      <div className="mb-6 flex items-center gap-2">
        <button onClick={goBack} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-surface hover:text-foreground" aria-label="Anterior">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 6 9 12 15 18" /></svg>
        </button>
        <button onClick={goForward} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-surface hover:text-foreground" aria-label="Siguiente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 6 15 12 9 18" /></svg>
        </button>

        <span className="flex-1 text-center text-sm font-semibold text-foreground">{label}</span>

        {!isCurrent && (
          <button onClick={goToday} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent/80">
            Hoy
          </button>
        )}

        <button
          onClick={() => dateRef.current?.showPicker()}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-surface hover:text-foreground"
          aria-label="Elegir fecha"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
        <input ref={dateRef} type="date" value={toDateKey(selectedDate)} onChange={handleDatePick}
          className="sr-only" tabIndex={-1} aria-hidden="true" />
      </div>

      {/* Tab content */}
      {tab === "hoy" && <PlanHoy selectedDate={selectedDate} />}
      {tab === "semana" && <PlanSemana selectedDate={selectedDate} />}
      {tab === "mes" && <PlanMes selectedDate={selectedDate} />}
      {tab === "trimestre" && <PlanTrimestre selectedDate={selectedDate} />}
      {tab === "anio" && <PlanAnio selectedDate={selectedDate} />}
    </div>
  );
}
