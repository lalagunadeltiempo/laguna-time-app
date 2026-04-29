"use client";

import { useState } from "react";
import type { NodoArbol, NodoCadencia, NodoRelacion, NodoTipo } from "@/lib/types";

const TIPOS: { id: NodoTipo; label: string }[] = [
  { id: "resultado", label: "Resultado" },
  { id: "palanca", label: "Palanca" },
  { id: "accion", label: "Acción" },
];

const CADENCIAS: { id: NodoCadencia; label: string }[] = [
  { id: "anual", label: "Anual" },
  { id: "trimestral", label: "Trimestral" },
  { id: "mensual", label: "Mensual" },
  { id: "semanal", label: "Semanal" },
  { id: "puntual", label: "Puntual" },
];

const REL: { id: NodoRelacion; label: string }[] = [
  { id: "suma", label: "Suma al padre (cuadre)" },
  { id: "explica", label: "Explica / acción (sin suma)" },
];

export function NodoEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Partial<NodoArbol> & { nombre: string; anio: number };
  onSave: (changes: Partial<Omit<NodoArbol, "id" | "creado">>) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initial.nombre);
  const [descripcion, setDescripcion] = useState(initial.descripcion ?? "");
  const [tipo, setTipo] = useState<NodoTipo>(initial.tipo ?? "resultado");
  const [cadencia, setCadencia] = useState<NodoCadencia>(initial.cadencia ?? "semanal");
  const [relacion, setRelacion] = useState<NodoRelacion>(initial.relacionConPadre ?? "explica");
  const [metaValor, setMetaValor] = useState(initial.metaValor != null ? String(initial.metaValor) : "");
  const [metaUnidad, setMetaUnidad] = useState(initial.metaUnidad ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-4 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{initial.id ? "Editar nodo" : "Nuevo nodo"}</h2>
        <div className="space-y-2">
          <label className="block text-[10px] font-semibold uppercase text-muted">Nombre</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
          <label className="block text-[10px] font-semibold uppercase text-muted">Descripción</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase text-muted">Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as NodoTipo)} className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs">
                {TIPOS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-muted">Cadencia</label>
              <select value={cadencia} onChange={(e) => setCadencia(e.target.value as NodoCadencia)} className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs">
                {CADENCIAS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-muted">Relación con el padre</label>
            <select value={relacion} onChange={(e) => setRelacion(e.target.value as NodoRelacion)} className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs">
              {REL.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold uppercase text-muted">Meta (número)</label>
              <input
                value={metaValor}
                onChange={(e) => setMetaValor(e.target.value)}
                inputMode="decimal"
                className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase text-muted">Unidad</label>
              <input
                value={metaUnidad}
                onChange={(e) => setMetaUnidad(e.target.value)}
                placeholder="€, uds…"
                className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              const mv = metaValor.trim() === "" ? undefined : parseFloat(metaValor.replace(",", "."));
              onSave({
                nombre: nombre.trim() || "(sin nombre)",
                descripcion: descripcion.trim() || undefined,
                tipo,
                cadencia,
                relacionConPadre: relacion,
                metaValor: mv !== undefined && Number.isFinite(mv) ? mv : undefined,
                metaUnidad: metaUnidad.trim() || undefined,
                contadorModo: "manual",
              });
            }}
            className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
