"use client";

import { useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { useUsuario } from "@/lib/usuario";
import type { Entregable } from "@/lib/types";
import { toDateKey } from "@/lib/date-utils";
import { mesKey, etiquetaMesCorta, trimestreDeMes, mesesDeTrimestre } from "@/lib/semana-utils";
import {
  DIAS_SEMANA_RUTINA_DEFAULT,
  dateKeysDeMesPorDiaSemana,
  mesesDesde,
  trimestresDesde,
  rangoDeMes,
  rangoDeTrimestre,
} from "@/lib/rutina-utils";

const DIAS = [
  { n: 1, label: "L" },
  { n: 2, label: "M" },
  { n: 3, label: "X" },
  { n: 4, label: "J" },
  { n: 5, label: "V" },
  { n: 6, label: "S" },
  { n: 7, label: "D" },
];

type Frecuencia = "semanal" | "mensual" | "trimestral";

const FRECUENCIAS: { id: Frecuencia; label: string }[] = [
  { id: "semanal", label: "Semana" },
  { id: "mensual", label: "Mes" },
  { id: "trimestral", label: "Trimestre" },
];

const OPCIONES_N = [1, 3, 6, 12];

interface Periodo {
  key: string;
  label: string;
  rango: { min: string; max: string };
}

function etiquetaMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return mes;
  return `${etiquetaMesCorta(mes, false)} ${m[1]}`;
}

function etiquetaTrimestre(trimestre: string): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(trimestre);
  if (!m) return trimestre;
  const meses = mesesDeTrimestre(trimestre);
  const ini = etiquetaMesCorta(meses[0], false);
  const fin = etiquetaMesCorta(meses[2], false);
  return `Q${m[2]} ${m[1]} · ${ini}–${fin}`;
}

/**
 * "Planificar mes/periodo": deja a la usuaria rellenar un entregable normal "a
 * lo rutina pero acotado", soportando TRES frecuencias sin convertirlo en rutina
 * ni tocar su `tipo`:
 *
 *  - "Semana": patrón de días de la semana (L-V por defecto) dentro de UN mes.
 *    Comportamiento histórico vía `PLANIFICAR_MES_ENTREGABLE`.
 *  - "Mes": durante N meses, la usuaria marca A MANO un día por mes.
 *  - "Trimestre": durante N trimestres, marca A MANO un día por trimestre.
 *
 * Para "Mes"/"Trimestre" se usa `PLANIFICAR_PERIODO_ENTREGABLE` con días
 * explícitos. El alcance puede ser personal (sólo el usuario actual) o de
 * EQUIPO (todos los miembros), porque el responsable planifica para el equipo.
 *
 * Se oculta para rutinas (que tienen su propio mecanismo) y en modo lectura/mentor.
 */
export function PlanificarMesPanel({ entregable, readOnly }: { entregable: Entregable; readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const { miembros } = useAppState();
  const { nombre: currentUser } = useUsuario();

  const mesActual = useMemo(() => mesKey(toDateKey(new Date())) ?? "", []);

  const [frecuencia, setFrecuencia] = useState<Frecuencia>("semanal");

  // --- Estado frecuencia "Semana" (patrón de días dentro de un mes) ---
  const [mes, setMes] = useState<string>(() => mesActual);
  const [dias, setDias] = useState<number[]>(DIAS_SEMANA_RUTINA_DEFAULT);
  const [equipoSemanal, setEquipoSemanal] = useState(false);

  // --- Estado frecuencias "Mes"/"Trimestre" (una aparición por periodo) ---
  const [nPeriodos, setNPeriodos] = useState<number>(3);
  const [inicioMes, setInicioMes] = useState<string>(() => mesActual);
  const [equipo, setEquipo] = useState(true);
  // Día tecleado en el `<input type="date">` de cada periodo (clave del periodo → dateKey).
  const [borradorDia, setBorradorDia] = useState<Record<string, string>>({});

  const periodos: Periodo[] = useMemo<Periodo[]>(() => {
    if (frecuencia === "mensual") {
      return mesesDesde(inicioMes, nPeriodos)
        .map((m) => {
          const rango = rangoDeMes(m);
          return rango ? { key: m, label: etiquetaMes(m), rango } : null;
        })
        .filter((p): p is Periodo => p !== null);
    }
    if (frecuencia === "trimestral") {
      const trimInicial = trimestreDeMes(inicioMes);
      if (!trimInicial) return [];
      return trimestresDesde(trimInicial, nPeriodos)
        .map((t) => {
          const rango = rangoDeTrimestre(t);
          return rango ? { key: t, label: etiquetaTrimestre(t), rango } : null;
        })
        .filter((p): p is Periodo => p !== null);
    }
    return [];
  }, [frecuencia, inicioMes, nPeriodos]);

  if (entregable.tipo === "rutina" || readOnly) return null;

  const nombresEquipo = miembros.map((m) => m.nombre);
  const tieneEquipo = nombresEquipo.length > 0;
  const diasUsuario = entregable.diasPlanificadosByUser?.[currentUser] ?? [];

  function toggleDia(n: number) {
    setDias((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort()));
  }

  // ---------- Frecuencia "Semana" ----------
  const mesValido = /^\d{4}-\d{2}$/.test(mes);
  const yaEnMes = diasUsuario.filter((d) => mesKey(d) === mes).length;
  const previsualizacion = mesValido ? dateKeysDeMesPorDiaSemana(mes, dias).length : 0;

  function usuariosSemanal(): string[] {
    return equipoSemanal && tieneEquipo ? nombresEquipo : [currentUser];
  }

  function rellenarSemana() {
    if (!mesValido || dias.length === 0) return;
    for (const u of usuariosSemanal()) {
      dispatch({ type: "PLANIFICAR_MES_ENTREGABLE", id: entregable.id, usuario: u, mes, diasSemana: dias, modo: "rellenar" });
    }
  }

  function limpiarSemana() {
    if (!mesValido) return;
    for (const u of usuariosSemanal()) {
      dispatch({ type: "PLANIFICAR_MES_ENTREGABLE", id: entregable.id, usuario: u, mes, diasSemana: dias, modo: "limpiar" });
    }
  }

  function diaPlanificadoEn(rango: { min: string; max: string }): string | null {
    return diasUsuario.find((d) => d >= rango.min && d <= rango.max) ?? null;
  }

  function alcancePeriodo(): "usuario" | "equipo" {
    return equipo && tieneEquipo ? "equipo" : "usuario";
  }

  function marcarDia(dia: string) {
    dispatch({ type: "PLANIFICAR_PERIODO_ENTREGABLE", id: entregable.id, dias: [dia], alcance: alcancePeriodo(), usuario: currentUser, modo: "rellenar" });
  }

  function quitarDia(dia: string) {
    dispatch({ type: "PLANIFICAR_PERIODO_ENTREGABLE", id: entregable.id, dias: [dia], alcance: alcancePeriodo(), usuario: currentUser, modo: "limpiar" });
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Planificar
        </span>
        {/* Selector de frecuencia */}
        <div className="flex gap-1 rounded-md bg-white p-0.5 dark:bg-zinc-800">
          {FRECUENCIAS.map((f) => {
            const activo = frecuencia === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFrecuencia(f.id)}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${activo ? "bg-emerald-600 text-white" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"}`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {frecuencia === "semanal" && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
            Rellena los días {mesValido && <strong>de {etiquetaMes(mes)}</strong>} según un patrón de días de la semana.
          </p>
          <div className="flex flex-wrap items-center gap-2">
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

            <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">Mes</span>
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px]"
              />
            </label>

            {tieneEquipo && (
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                <input type="checkbox" checked={equipoSemanal} onChange={(e) => setEquipoSemanal(e.target.checked)} />
                Para todo el equipo
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={rellenarSemana}
              disabled={!mesValido || dias.length === 0}
              className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="Añadir los días del mes que caen en el patrón seleccionado"
            >
              Rellenar mes {previsualizacion > 0 ? `(${previsualizacion})` : ""}
            </button>
            <button
              type="button"
              onClick={limpiarSemana}
              disabled={!mesValido || yaEnMes === 0}
              className="rounded-md border border-emerald-300 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
              title="Quitar los días que caen en este mes"
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
      )}

      {(frecuencia === "mensual" || frecuencia === "trimestral") && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
            Una aparición por {frecuencia === "mensual" ? "mes" : "trimestre"}: marca a mano el día concreto en cada periodo.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">Durante</span>
              <div className="flex gap-1">
                {OPCIONES_N.map((n) => {
                  const activo = nPeriodos === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNPeriodos(n)}
                      className={`h-6 min-w-6 rounded-md px-1.5 text-[10px] font-bold transition-colors ${activo ? "bg-emerald-600 text-white" : "bg-white text-zinc-400 dark:bg-zinc-800"}`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <span className="text-[10px] text-zinc-400">{frecuencia === "mensual" ? "meses" : "trimestres"}</span>
            </div>

            <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">Desde</span>
              <input
                type="month"
                value={inicioMes}
                onChange={(e) => setInicioMes(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px]"
              />
            </label>

            {tieneEquipo && (
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                <input type="checkbox" checked={equipo} onChange={(e) => setEquipo(e.target.checked)} />
                Para todo el equipo
              </label>
            )}
          </div>

          <ul className="space-y-1">
            {periodos.map((p) => {
              const planificado = diaPlanificadoEn(p.rango);
              const borrador = borradorDia[p.key] ?? "";
              return (
                <li
                  key={p.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200/70 bg-white px-2 py-1.5 dark:border-emerald-500/20 dark:bg-zinc-800/40"
                >
                  <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">{p.label}</span>
                  {planificado ? (
                    <span className="flex items-center gap-2">
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                        {planificado}
                      </span>
                      <button
                        type="button"
                        onClick={() => quitarDia(planificado)}
                        className="rounded-md border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                      >
                        Quitar
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <input
                        type="date"
                        min={p.rango.min}
                        max={p.rango.max}
                        value={borrador}
                        onChange={(e) => setBorradorDia((prev) => ({ ...prev, [p.key]: e.target.value }))}
                        className="rounded-md border border-border bg-background px-2 py-1 text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (borrador >= p.rango.min && borrador <= p.rango.max) marcarDia(borrador);
                        }}
                        disabled={!(borrador >= p.rango.min && borrador <= p.rango.max)}
                        className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Añadir
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="text-[10px] text-zinc-400">
            {alcancePeriodo() === "equipo"
              ? "Se aplicará a todo el equipo."
              : "Se aplicará sólo a tu planificación."}
          </p>
        </div>
      )}
    </div>
  );
}
