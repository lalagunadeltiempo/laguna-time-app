"use client";

import { useState } from "react";
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

export function PantallaPlan() {
  const [tab, setTab] = useState<Tab>("hoy");

  return (
    <div className="flex flex-1 flex-col px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Plan</h1>
        <p className="mt-1 text-sm text-muted">
          {TABS.find((t) => t.id === tab)?.sublabel}
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-xl bg-surface p-1" role="tablist" aria-label="Horizontes de planificación">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
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

      {/* Tab content */}
      {tab === "hoy" && <PlanHoy />}
      {tab === "semana" && <PlanSemana />}
      {tab === "mes" && <PlanMes />}
      {tab === "trimestre" && <PlanTrimestre />}
      {tab === "anio" && <PlanAnio />}
    </div>
  );
}
