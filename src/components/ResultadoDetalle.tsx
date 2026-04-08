"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useIsMentor } from "@/lib/usuario";
import { formatMin, minutosPaso } from "@/lib/utils";
import { ModalConfirm } from "./ModalConfirm";
import type { Paso } from "@/lib/types";

interface Props {
  resultadoId: string;
  onBack: () => void;
}

const ESTADO_LABEL: Record<string, string> = {
  a_futuro: "A futuro", en_proceso: "En proceso", en_espera: "En espera", hecho: "Hecho", cancelada: "Cancelada",
};
const ESTADO_DOT: Record<string, string> = {
  en_proceso: "bg-amber-400", a_futuro: "bg-blue-300", en_espera: "bg-zinc-300", hecho: "bg-green-400", cancelada: "bg-red-300",
};

export function ResultadoDetalle({ resultadoId, onBack }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nombre: string } | null>(null);

  const data = useMemo(() => {
    const resultado = state.resultados.find((r) => r.id === resultadoId);
    if (!resultado) return null;
    const proyecto = state.proyectos.find((p) => p.id === resultado.proyectoId);
    const entregables = state.entregables
      .filter((e) => e.resultadoId === resultadoId)
      .map((e) => {
        const pasos = state.pasos
          .filter((p) => p.entregableId === e.id && p.finTs)
          .sort((a, b) => new Date(b.finTs!).getTime() - new Date(a.finTs!).getTime());
        const minutos = pasos.reduce((s, p) => s + minutosPaso(p), 0);
        return { ...e, pasos, minutos };
      });
    const totalMin = entregables.reduce((s, e) => s + e.minutos, 0);
    const totalDias = entregables.reduce((s, e) => s + e.diasEstimados, 0);
    const doneDias = entregables.reduce((s, e) => s + e.diasHechos, 0);

    const primerPaso = state.pasos
      .filter((p) => p.inicioTs && entregables.some((e) => e.id === p.entregableId) && p.finTs)
      .sort((a, b) => new Date(a.inicioTs!).getTime() - new Date(b.inicioTs!).getTime())[0];

    return { resultado, proyecto, entregables, totalMin, totalDias, doneDias, primerPaso };
  }, [state, resultadoId]);

  if (isMentor) return <div className="p-8 text-center text-muted">Vista no disponible para mentor.</div>;
  if (!data) return <div className="p-6"><button onClick={onBack} className="text-sm text-zinc-500">← Volver</button><p className="mt-4 text-zinc-400">Resultado no encontrado</p></div>;

  const { resultado, proyecto, entregables, totalMin, totalDias, doneDias, primerPaso } = data;
  const pct = totalDias > 0 ? Math.round((doneDias / totalDias) * 100) : null;
  const inicioReal = primerPaso?.inicioTs ? new Date(primerPaso.inicioTs).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : null;

  function confirmDeletePaso() {
    if (!deleteTarget) return;
    dispatch({ type: "DELETE_PASO", id: deleteTarget.id });
    setDeleteTarget(null);
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      {/* Header */}
      <div className="mb-5">
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          Volver
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{proyecto?.nombre}</p>
        <InlineEdit
          value={resultado.nombre}
          onSave={(v) => dispatch({ type: "RENAME_RESULTADO", id: resultado.id, nombre: v })}
          className="text-xl font-bold text-zinc-900"
        />
        {/* Stats */}
        <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
          {pct !== null && (
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-20 rounded-full bg-zinc-100">
                <div className={`h-1.5 rounded-full ${pct >= 100 ? "bg-green-400" : "bg-amber-400"}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <span className="tabular-nums text-zinc-500">{pct}%</span>
            </div>
          )}
          <span className="text-zinc-400">{doneDias}/{totalDias} días</span>
          {totalMin > 0 && <span className="text-zinc-400">{formatMin(totalMin)}</span>}
          <span className="text-zinc-400">{entregables.length} entregable{entregables.length !== 1 && "s"}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
          {inicioReal && <span className="text-zinc-400">Inicio real: {inicioReal}</span>}
          {resultado.fechaLimite && <span className="text-red-400">Deadline: {resultado.fechaLimite}</span>}
          {resultado.diasEstimados !== null && resultado.diasEstimados > 0 && (
            <span className="text-zinc-400">Estimado: {resultado.diasEstimados} días</span>
          )}
        </div>
      </div>

      {/* Entregables + pasos */}
      <div className="flex-1 space-y-6 overflow-y-auto">
        {entregables.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin entregables</p>
        ) : (
          entregables.map((e) => (
            <div key={e.id}>
              {/* Entregable header */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ESTADO_DOT[e.estado] ?? "bg-zinc-300"}`} />
                <InlineEdit
                  value={e.nombre}
                  onSave={(v) => dispatch({ type: "RENAME_ENTREGABLE", id: e.id, nombre: v })}
                  className="flex-1 text-sm font-semibold text-zinc-700"
                />
                <span className="text-[10px] text-zinc-400">{ESTADO_LABEL[e.estado]}</span>
                <span className="text-[10px] tabular-nums text-zinc-400">{e.diasHechos}/{e.diasEstimados}</span>
                {e.minutos > 0 && <span className="text-[10px] tabular-nums text-zinc-400">{formatMin(e.minutos)}</span>}
                <span className="text-[10px] text-zinc-300">{e.responsable}</span>
              </div>

              {/* Pasos — all expanded */}
              {e.pasos.length > 0 ? (
                <div className="ml-4 space-y-2 border-l-2 border-zinc-100 pl-3">
                  {e.pasos.map((p) => (
                    <PasoDetalle key={p.id} paso={p} onDelete={() => setDeleteTarget({ id: p.id, nombre: p.nombre })} />
                  ))}
                </div>
              ) : (
                <p className="ml-5 text-[10px] text-zinc-300 italic">Sin pasos registrados</p>
              )}
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <ModalConfirm titulo="Eliminar paso" mensaje={`¿Eliminar "${deleteTarget.nombre}"?`}
          onConfirm={confirmDeletePaso} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

/* ---- Full paso detail (always expanded) ---- */

function PasoDetalle({ paso, onDelete }: { paso: Paso; onDelete: () => void }) {
  const dispatch = useAppDispatch();
  const dur = minutosPaso(paso);
  const fecha = paso.inicioTs ? new Date(paso.inicioTs).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "pendiente";
  const hora = paso.inicioTs ? new Date(paso.inicioTs).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="rounded-lg border border-zinc-100 bg-white p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] tabular-nums text-zinc-300">{fecha} {hora}</span>
        <InlineEdit
          value={paso.nombre}
          onSave={(v) => dispatch({ type: "RENAME_PASO", id: paso.id, nombre: v })}
          className="flex-1 text-xs font-medium text-zinc-700"
        />
        <span className="text-[10px] tabular-nums text-zinc-400">{formatMin(dur)}</span>
        <button onClick={onDelete}
          className="shrink-0 rounded p-0.5 text-zinc-200 hover:text-red-400 hover:bg-red-50 transition-colors"
          title="Eliminar paso">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Implicados */}
      {paso.implicados.length > 0 && (
        <div className="mb-2">
          <div className="flex flex-wrap gap-1">
            {paso.implicados.map((i, idx) => (
              <span key={idx} className="rounded-full bg-zinc-50 border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600">
                {i.nombre}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* URLs */}
      {paso.contexto.urls.length > 0 && (
        <div className="mb-2 space-y-1">
          {paso.contexto.urls.map((u, idx) => (
            <div key={idx}>
              <a href={u.url} target="_blank" rel="noopener noreferrer"
                className="text-[11px] font-medium text-amber-600 hover:underline break-all">{u.nombre || u.url}</a>
              {u.descripcion && <p className="text-[10px] text-zinc-400">{u.descripcion}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Notas */}
      {paso.contexto.notas && (
        <div className="mb-2">
          <p className="whitespace-pre-wrap text-[11px] text-zinc-600 leading-relaxed">{paso.contexto.notas}</p>
        </div>
      )}

      {/* Siguiente */}
      {paso.siguientePaso && (
        <div className="border-t border-zinc-50 pt-1.5">
          {paso.siguientePaso.tipo === "fin" ? (
            <p className="text-[10px] text-green-600 font-medium">Tarea finalizada</p>
          ) : (
            <p className="text-[10px] text-zinc-500">
              Siguiente: <span className="font-medium text-zinc-600">{paso.siguientePaso.nombre}</span>
              {paso.siguientePaso.cuando === "depende" && paso.siguientePaso.dependeDe?.length
                ? <span className="text-purple-500"> — depende de <strong>{paso.siguientePaso.dependeDe.map((d) => d.nombre).join(", ")}</strong></span>
                : paso.siguientePaso.cuando && <span className="text-zinc-400"> — {paso.siguientePaso.cuando}</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Inline edit ---- */

function InlineEdit({ value, onSave, className }: {
  value: string; onSave: (v: string) => void; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(value); }, [value]);

  function save() {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
    setEditing(false);
  }

  if (editing) {
    return (
      <input ref={inputRef} type="text" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className={`rounded border border-amber-300 bg-amber-50 px-1 focus:outline-none ${className}`}
        onClick={(e) => e.stopPropagation()} />
    );
  }

  return (
    <span className={`cursor-text ${className}`}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title="Doble clic para editar">
      {value}
    </span>
  );
}
