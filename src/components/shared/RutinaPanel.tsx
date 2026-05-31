"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import type { Entregable } from "@/lib/types";
import { toDateKey } from "@/lib/date-utils";
import { mesKey, etiquetaMesCorta } from "@/lib/semana-utils";
import { diasSemanaDeRutina } from "@/lib/rutina-utils";

const DIAS = [
  { n: 1, label: "L" },
  { n: 2, label: "M" },
  { n: 3, label: "X" },
  { n: 4, label: "J" },
  { n: 5, label: "V" },
  { n: 6, label: "S" },
  { n: 7, label: "D" },
];

/** "2026-05" → "2026-06" (mes siguiente). */
function mesSiguiente(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return mes;
  let year = Number(m[1]);
  let mon = Number(m[2]) + 1;
  if (mon > 12) { mon = 1; year += 1; }
  return `${year}-${String(mon).padStart(2, "0")}`;
}

function etiquetaMes(mes: string | undefined): string {
  if (!mes) return "—";
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return mes;
  return `${etiquetaMesCorta(mes, false)} ${m[1]}`;
}

export function RutinaPanel({ entregable, readOnly }: { entregable: Entregable; readOnly?: boolean }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [showHistorico, setShowHistorico] = useState(false);
  const [rolando, setRolando] = useState(false);

  const esRutina = entregable.tipo === "rutina";
  const pasosEnt = useMemo(
    () => state.pasos.filter((p) => p.entregableId === entregable.id),
    [state.pasos, entregable.id],
  );

  // Estado del diálogo de rolado: qué llevar al mes nuevo (por defecto todo).
  const [nuevoMes, setNuevoMes] = useState("");
  const [keepNotas, setKeepNotas] = useState<Set<string>>(new Set());
  const [keepUrls, setKeepUrls] = useState<Set<string>>(new Set());
  const [keepPasos, setKeepPasos] = useState<Set<string>>(new Set());

  function abrirRolado() {
    const base = entregable.mesActivoRutina ?? mesKey(toDateKey(new Date())) ?? "";
    setNuevoMes(mesSiguiente(base));
    setKeepNotas(new Set((entregable.notas ?? []).map((n) => n.id)));
    setKeepUrls(new Set((entregable.contexto?.urls ?? []).map((u) => u.url)));
    setKeepPasos(new Set(pasosEnt.map((p) => p.id)));
    setRolando(true);
  }

  function toggle(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  function confirmarRolado() {
    if (!/^\d{4}-\d{2}$/.test(nuevoMes)) return;
    dispatch({
      type: "ROLAR_RUTINA_MES",
      id: entregable.id,
      nuevoMes,
      mantener: {
        notas: [...keepNotas],
        urls: [...keepUrls],
        pasos: [...keepPasos],
      },
    });
    setRolando(false);
  }

  if (!esRutina) {
    if (readOnly) return null;
    return (
      <button
        type="button"
        onClick={() => dispatch({ type: "CONVERT_ENTREGABLE_TO_RUTINA", entregableId: entregable.id })}
        className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300"
        title="Convertir este entregable en una rutina mensual (aparece sola cada día laborable)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v6M12 22v-6M2 12h6M22 12h-6" /><circle cx="12" cy="12" r="3" />
        </svg>
        Subir a Rutina
      </button>
    );
  }

  const diasActivos = diasSemanaDeRutina(entregable);
  const historico = entregable.historicoRutina ?? [];

  return (
    <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-500/30 dark:bg-violet-500/5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Rutina
        </span>
        <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
          Mes activo: <strong>{etiquetaMes(entregable.mesActivoRutina)}</strong>
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={abrirRolado}
            className="ml-auto rounded-md border border-violet-300 px-2 py-1 text-[10px] font-semibold text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-500/40 dark:text-violet-300"
            title="Cerrar el mes actual (se archiva) y abrir uno nuevo"
          >
            Rolar al mes nuevo
          </button>
        )}
      </div>

      {/* Días de la semana en los que aparece */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">Aparece</span>
        <div className="flex gap-1">
          {DIAS.map((d) => {
            const activo = diasActivos.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                disabled={readOnly}
                onClick={() => {
                  const next = activo ? diasActivos.filter((x) => x !== d.n) : [...diasActivos, d.n].sort();
                  dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes: { diasSemanaRutina: next } });
                }}
                className={`h-6 w-6 rounded-md text-[10px] font-bold transition-colors ${activo ? "bg-violet-600 text-white" : "bg-white text-zinc-400 dark:bg-zinc-800"}`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Histórico plegable */}
      {historico.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistorico((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
          >
            Histórico ({historico.length})
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${showHistorico ? "rotate-180" : ""}`}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {showHistorico && (
            <div className="mt-1.5 space-y-1.5">
              {[...historico].reverse().map((h) => (
                <div key={h.mes} className="rounded-md border border-border bg-white p-2 text-[11px] dark:bg-zinc-900">
                  <p className="font-semibold text-zinc-700 dark:text-zinc-200">{etiquetaMes(h.mes)}</p>
                  <p className="text-[10px] text-zinc-400">
                    {h.notas.length} notas · {h.urls.length} URLs · {h.pasos.length} pasos
                  </p>
                  {h.pasos.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-[10px] text-zinc-500">
                      {h.pasos.map((p, i) => <li key={i}>{p.nombre}</li>)}
                    </ul>
                  )}
                  {h.urls.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[10px]">
                      {h.urls.map((u, i) => (
                        <li key={i}>
                          <a href={u.url} target="_blank" rel="noreferrer" className="text-violet-600 underline">
                            {u.nombre || u.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Diálogo de rolado: seleccionar qué llevar al mes nuevo */}
      {rolando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setRolando(false); }}
        >
          <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-background p-5 shadow-2xl">
            <h2 className="mb-1 text-base font-semibold text-foreground">Rolar la rutina a un mes nuevo</h2>
            <p className="mb-3 text-[12px] text-muted">
              Se archivará {etiquetaMes(entregable.mesActivoRutina)} en el histórico. Marca lo que quieras conservar para el mes nuevo.
            </p>

            <label className="mb-3 flex items-center gap-2 text-sm">
              <span className="text-muted">Mes nuevo</span>
              <input
                type="month"
                value={nuevoMes}
                onChange={(e) => setNuevoMes(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
            </label>

            {(entregable.notas ?? []).length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Notas</p>
                {(entregable.notas ?? []).map((n) => (
                  <label key={n.id} className="flex items-start gap-2 py-0.5 text-[12px]">
                    <input type="checkbox" checked={keepNotas.has(n.id)} onChange={() => toggle(keepNotas, n.id, setKeepNotas)} className="mt-0.5" />
                    <span className="line-clamp-2 text-foreground">{n.titulo || n.texto}</span>
                  </label>
                ))}
              </div>
            )}

            {(entregable.contexto?.urls ?? []).length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">URLs</p>
                {(entregable.contexto?.urls ?? []).map((u) => (
                  <label key={u.url} className="flex items-center gap-2 py-0.5 text-[12px]">
                    <input type="checkbox" checked={keepUrls.has(u.url)} onChange={() => toggle(keepUrls, u.url, setKeepUrls)} />
                    <span className="truncate text-foreground">{u.nombre || u.url}</span>
                  </label>
                ))}
              </div>
            )}

            {pasosEnt.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Pasos</p>
                {pasosEnt.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 py-0.5 text-[12px]">
                    <input type="checkbox" checked={keepPasos.has(p.id)} onChange={() => toggle(keepPasos, p.id, setKeepPasos)} />
                    <span className="truncate text-foreground">{p.nombre}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setRolando(false)} className="flex-1 rounded-lg border border-border py-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground">
                Cancelar
              </button>
              <button onClick={confirmarRolado} className="flex-1 rounded-lg bg-violet-600 py-2.5 text-xs font-semibold text-white hover:bg-violet-700">
                Rolar al mes nuevo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
