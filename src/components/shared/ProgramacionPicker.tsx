"use client";

import type { Programacion } from "@/lib/types";

const TIPOS_PROG: { id: Programacion["tipo"]; label: string }[] = [
  { id: "diario", label: "Diario" },
  { id: "semanal", label: "Semanal" },
  { id: "mensual", label: "Mensual" },
  { id: "trimestral", label: "Trimestral" },
  { id: "anual", label: "Anual" },
  { id: "demanda", label: "Bajo demanda" },
];

const DIAS_SEMANA = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function ProgramacionPicker({ value, onChange }: { value: Programacion | null; onChange: (p: Programacion | null) => void }) {
  const tipo = value?.tipo ?? null;

  function setTipo(t: Programacion["tipo"] | "") {
    if (!t) { onChange(null); return; }
    const base: Programacion = { tipo: t };
    if (t === "semanal") base.diaSemana = 1;
    if (t === "mensual") base.diaMes = 1;
    if (t === "trimestral") { base.mesesTrimestre = [1, 4, 7, 10]; base.semanaMes = "primera"; }
    if (t === "anual") base.mesAnual = 0;
    onChange(base);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {TIPOS_PROG.map((t) => (
          <button key={t.id} onClick={() => setTipo(tipo === t.id ? "" : t.id)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
              tipo === t.id ? "border-purple-400 bg-purple-100 text-purple-700" : "border-zinc-200 bg-white text-zinc-500 hover:border-purple-200"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tipo === "semanal" && value && (
        <select value={value.diaSemana ?? 1} onChange={(e) => onChange({ ...value, diaSemana: parseInt(e.target.value) })}
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs focus:border-purple-400 focus:outline-none">
          {DIAS_SEMANA.slice(1).map((d, i) => <option key={i + 1} value={i + 1}>{d}</option>)}
        </select>
      )}

      {tipo === "mensual" && value && (
        <div className="flex gap-2">
          <select value={value.semanaMes ?? ""} onChange={(e) => {
            const v = e.target.value as "primera" | "ultima" | "";
            onChange({ ...value, semanaMes: v || null, diaMes: v ? undefined : (value.diaMes ?? 1) });
          }} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs focus:border-purple-400 focus:outline-none">
            <option value="">Día concreto</option>
            <option value="primera">Primera semana</option>
            <option value="ultima">Última semana</option>
          </select>
          {!value.semanaMes && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500">Día:</span>
              <input type="number" min={-1} max={28} value={value.diaMes ?? 1}
                onChange={(e) => onChange({ ...value, diaMes: parseInt(e.target.value) || 1 })}
                className="w-14 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-center text-xs focus:outline-none" />
              <span className="text-[9px] text-zinc-400">(-1 = último)</span>
            </div>
          )}
        </div>
      )}

      {tipo === "trimestral" && value && (
        <div className="flex items-center gap-2">
          <select value={value.semanaMes ?? "primera"} onChange={(e) => onChange({ ...value, semanaMes: e.target.value as "primera" | "ultima" })}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs focus:border-purple-400 focus:outline-none">
            <option value="primera">Primera semana</option>
            <option value="ultima">Última semana</option>
          </select>
          <span className="text-[10px] text-zinc-400">de Ene, Abr, Jul, Oct</span>
        </div>
      )}

      {tipo === "anual" && value && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500">Mes:</span>
          <select value={value.mesAnual ?? 0} onChange={(e) => onChange({ ...value, mesAnual: parseInt(e.target.value) })}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs focus:border-purple-400 focus:outline-none">
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
