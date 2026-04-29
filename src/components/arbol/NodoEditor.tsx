"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useAppState } from "@/lib/context";
import type { NodoArbol, NodoCadencia, NodoRelacion, NodoTipo } from "@/lib/types";
import { CADENCIA_UI, RELACION_UI, TIPO_UI } from "./arbol-copy";

const TIPOS: { id: NodoTipo }[] = [{ id: "resultado" }, { id: "palanca" }, { id: "accion" }];

const CADENCIAS: { id: NodoCadencia }[] = [
  { id: "anual" },
  { id: "trimestral" },
  { id: "mensual" },
  { id: "semanal" },
  { id: "puntual" },
];

const REL: { id: NodoRelacion }[] = [{ id: "suma" }, { id: "explica" }];

/** Formulario en flujo de página (sin overlay): no tapa ni oscurece lo de detrás; en móvil ocupa el ancho del contenido. */
export function NodoEditor({
  initial,
  isRoot,
  onSave,
  onCancel,
}: {
  initial: Partial<NodoArbol> & { nombre: string; anio: number };
  /** Sin padre: no mostramos «respecto a la meta de arriba» (no aplica). */
  isRoot: boolean;
  onSave: (changes: Partial<Omit<NodoArbol, "id" | "creado">>) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const state = useAppState();
  const [nombre, setNombre] = useState(initial.nombre);
  const [descripcion, setDescripcion] = useState(initial.descripcion ?? "");
  const [tipo, setTipo] = useState<NodoTipo>(initial.tipo ?? "resultado");
  const [cadencia, setCadencia] = useState<NodoCadencia>(initial.cadencia ?? "semanal");
  const [relacion, setRelacion] = useState<NodoRelacion>(initial.relacionConPadre ?? "explica");
  const [metaValor, setMetaValor] = useState(initial.metaValor != null ? String(initial.metaValor) : "");
  const [metaUnidad, setMetaUnidad] = useState(initial.metaUnidad ?? "");
  const [notaAnioAnterior, setNotaAnioAnterior] = useState(initial.notaAnioAnterior ?? "");
  const [proyectoIds, setProyectoIds] = useState<string[]>(initial.proyectoIds ?? []);
  const proyectosOrdenados = useMemo(
    () => [...state.proyectos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [state.proyectos],
  );

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const isNew = !initial.id;

  return (
    <section
      ref={rootRef}
      className="mb-6 rounded-xl border-2 border-accent/35 bg-background shadow-sm"
      role="region"
      aria-labelledby={titleId}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          {isNew ? "Añadir objetivo" : "Cambiar este objetivo"}
        </h2>
        <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface" aria-label="Cerrar">
          ✕
        </button>
      </div>

      <div className="px-4 py-4">
        <p className="mb-4 text-xs text-muted">
          {isRoot
            ? "Es tu primera meta del año: solo nombre y, si quieres, cifra y €. No hay nada «encima» en el árbol."
            : "Escribe qué quieres y, si quieres, un número. Lo demás es opcional y va abajo."}
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">¿Qué quieres conseguir?</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              placeholder="Ej.: facturación del año, captar clientes…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">¿Cuánto? (opcional)</label>
              <input
                value={metaValor}
                onChange={(e) => setMetaValor(e.target.value)}
                inputMode="decimal"
                placeholder="Ej.: 530000"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">¿En qué mides? (opcional)</label>
              <input
                value={metaUnidad}
                onChange={(e) => setMetaUnidad(e.target.value)}
                placeholder="€, horas, veces…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">El año pasado… (opcional)</label>
            <textarea
              value={notaAnioAnterior}
              onChange={(e) => setNotaAnioAnterior(e.target.value)}
              rows={2}
              placeholder="Qué pasó con esto en el año anterior, qué aprendiste, qué probarías cambiar."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-muted">Sirve de contexto para no repetir errores del año anterior.</p>
          </div>

          {proyectosOrdenados.length > 0 && (
            <details className="group rounded-lg border border-border bg-surface/40">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                Vincular proyectos del Mapa{" "}
                <span className="text-xs font-normal text-muted">
                  ({proyectoIds.length > 0 ? `${proyectoIds.length} seleccionado${proyectoIds.length !== 1 ? "s" : ""}` : "ninguno"})
                </span>
              </summary>
              <div className="max-h-56 space-y-1 overflow-auto border-t border-border/60 px-3 py-2 text-sm">
                {proyectosOrdenados.map((p) => {
                  const checked = proyectoIds.includes(p.id);
                  return (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-surface">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setProyectoIds((prev) => (checked ? prev.filter((x) => x !== p.id) : [...prev, p.id]));
                        }}
                      />
                      <span className="truncate">{p.nombre}</span>
                    </label>
                  );
                })}
              </div>
            </details>
          )}

          <details className="group rounded-lg border border-border bg-surface/40">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
              {isRoot
                ? "Más opciones (tipo y cada cuánto lo miras)"
                : "Más opciones (tipo, frecuencia y cómo encaja con la meta de arriba)"}
              <span className="ml-1 text-xs font-normal text-muted"> — solo si lo necesitas</span>
            </summary>
            <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted">Qué tipo de cosa es</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as NodoTipo)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
                >
                  {TIPOS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {TIPO_UI[t.id]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted">¿Cada cuánto lo apuntas?</label>
                <select
                  value={cadencia}
                  onChange={(e) => setCadencia(e.target.value as NodoCadencia)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
                >
                  {CADENCIAS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {CADENCIA_UI[c.id]}
                    </option>
                  ))}
                </select>
              </div>
              {!isRoot && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted">Respecto a la meta de justo arriba</label>
                  <select
                    value={relacion}
                    onChange={(e) => setRelacion(e.target.value as NodoRelacion)}
                    className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
                  >
                    {REL.map((r) => (
                      <option key={r.id} value={r.id} title={RELACION_UI[r.id].hint}>
                        {RELACION_UI[r.id].label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-muted">{RELACION_UI[relacion].hint}</p>
                </div>
              )}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted">Nota para ti (opcional)</label>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                  placeholder="Cualquier detalle que quieras recordar"
                  className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
                />
              </div>
            </div>
          </details>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:bg-surface">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => {
            const mv = metaValor.trim() === "" ? undefined : parseFloat(metaValor.replace(",", "."));
            onSave({
              nombre: nombre.trim() || "(sin nombre)",
              descripcion: descripcion.trim() || undefined,
              notaAnioAnterior: notaAnioAnterior.trim() || undefined,
              tipo,
              cadencia,
              relacionConPadre: isRoot ? "explica" : relacion,
              metaValor: mv !== undefined && Number.isFinite(mv) ? mv : undefined,
              metaUnidad: metaUnidad.trim() || undefined,
              proyectoIds: proyectoIds.length > 0 ? proyectoIds : undefined,
              contadorModo: "manual",
            });
          }}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          Guardar
        </button>
      </div>
    </section>
  );
}
