"use client";

import { useState } from "react";
import { useAppDispatch } from "@/lib/context";
import { useUsuario } from "@/lib/usuario";
import type { Entregable } from "@/lib/types";
import { toDateKey } from "@/lib/date-utils";
import { mesKey, etiquetaMesCorta } from "@/lib/semana-utils";
import { DIAS_SEMANA_RUTINA_DEFAULT, dateKeysDeMesPorDiaSemana } from "@/lib/rutina-utils";

const DIAS = [
  { n: 1, label: "L" },
  { n: 2, label: "M" },
  { n: 3, label: "X" },
  { n: 4, label: "J" },
  { n: 5, label: "V" },
  { n: 6, label: "S" },
  { n: 7, label: "D" },
];

function etiquetaMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return mes;
  return `${etiquetaMesCorta(mes, false)} ${m[1]}`;
}

/**
 * "Planificar mes": deja a la usuaria rellenar un entregable normal "a lo
 * rutina pero acotado": marca los días de la semana (L-V por defecto) y un mes,
 * y rellena de golpe los días concretos en `diasPlanificadosByUser` del usuario
 * actual. NO convierte el entregable en rutina ni toca su `tipo`.
 *
 * Se oculta para rutinas (que tienen su propio mecanismo) y en modo lectura/mentor.
 */
export function PlanificarMesPanel({ entregable, readOnly }: { entregable: Entregable; readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const [mes, setMes] = useState<string>(() => mesKey(toDateKey(new Date())) ?? "");
  const [dias, setDias] = useState<number[]>(DIAS_SEMANA_RUTINA_DEFAULT);

  if (entregable.tipo === "rutina" || readOnly) return null;

  const mesValido = /^\d{4}-\d{2}$/.test(mes);
  const diasUsuario = entregable.diasPlanificadosByUser?.[currentUser] ?? [];
  const yaEnMes = diasUsuario.filter((d) => mesKey(d) === mes).length;
  const previsualizacion = mesValido ? dateKeysDeMesPorDiaSemana(mes, dias).length : 0;

  function toggleDia(n: number) {
    setDias((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort()));
  }

  function rellenar() {
    if (!mesValido || dias.length === 0) return;
    dispatch({ type: "PLANIFICAR_MES_ENTREGABLE", id: entregable.id, usuario: currentUser, mes, diasSemana: dias, modo: "rellenar" });
  }

  function limpiar() {
    if (!mesValido) return;
    dispatch({ type: "PLANIFICAR_MES_ENTREGABLE", id: entregable.id, usuario: currentUser, mes, diasSemana: dias, modo: "limpiar" });
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Planificar mes
        </span>
        <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
          Rellena tus días {mesValido && <strong>de {etiquetaMes(mes)}</strong>} sin convertirlo en rutina
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Chips de días de la semana (L M X J V S D = 1..7) */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400">Días</span>
          <div className="flex gap-1">
            {DIAS.map((d) => {
              const activo = dias.includes(d.n);
              return (
                <button
                  key={d.n}
                  type="button"
                  onClick={() => toggleDia(d.n)}
                  className={`h-6 w-6 rounded-md text-[10px] font-bold transition-colors ${activo ? "bg-emerald-600 text-white" : "bg-white text-zinc-400 dark:bg-zinc-800"}`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Picker de mes */}
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400">Mes</span>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px]"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={rellenar}
          disabled={!mesValido || dias.length === 0}
          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          title="Añadir a tus días planificados todos los días del mes que caen en el patrón seleccionado"
        >
          Rellenar mes {previsualizacion > 0 ? `(${previsualizacion})` : ""}
        </button>
        <button
          type="button"
          onClick={limpiar}
          disabled={!mesValido || yaEnMes === 0}
          className="rounded-md border border-emerald-300 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
          title="Quitar de tus días planificados los días que caen en este mes"
        >
          Quitar mes {yaEnMes > 0 ? `(${yaEnMes})` : ""}
        </button>
        {yaEnMes > 0 && (
          <span className="text-[10px] text-zinc-400">
            Ya tienes {yaEnMes} {yaEnMes === 1 ? "día" : "días"} en {etiquetaMes(mes)}
          </span>
        )}
      </div>
    </div>
  );
}
