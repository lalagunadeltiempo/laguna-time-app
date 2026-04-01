"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import {
  AREAS_PERSONAL,
  AREAS_EMPRESA,
  AREA_COLORS,
  type Area,
  type AreaPersonal,
  type AreaEmpresa,
  type Proyecto,
  type Resultado,
  type Entregable,
  type Paso,
  type PlantillaProceso,
  type TipoEntregable,
} from "@/lib/types";

interface Props {
  onOpenDetalle: (resultadoId: string) => void;
}

const EMPRESA_ORDER: AreaEmpresa[] = ["financiera", "operativa", "comercial", "administrativa"];
const PERSONAL_ORDER: AreaPersonal[] = ["fisico", "emocional", "mental", "espiritual"];

function areaLabel(id: Area): string {
  return [...AREAS_EMPRESA, ...AREAS_PERSONAL].find((a) => a.id === id)?.label ?? id;
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

export function PantallaMapa({ onOpenDetalle }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-8">

      {/* ---- EMPRESA ---- */}
      <AmbitoHeader
        value={state.ambitoLabels.empresa}
        onChange={(v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { empresa: v } })}
      />

      {EMPRESA_ORDER.map((areaId) => (
        <AreaSection key={areaId} areaId={areaId} />
      ))}

      <div className="my-10 border-t border-zinc-200" />

      {/* ---- PERSONAL ---- */}
      <AmbitoHeader
        value={state.ambitoLabels.personal}
        onChange={(v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { personal: v } })}
      />

      {PERSONAL_ORDER.map((areaId) => (
        <AreaSection key={areaId} areaId={areaId} />
      ))}
    </div>
  );
}

/* ============================================================
   EDITABLE TEXT (inline editing, MD-like)
   ============================================================ */

function EditableText({
  value,
  onChange,
  className = "",
  placeholder = "Sin nombre",
  tag: Tag = "span",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  tag?: "span" | "h1" | "h2" | "h3" | "p";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const save = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onChange(trimmed);
    setEditing(false);
  }, [draft, value, onChange]);

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`w-full border-b-2 border-blue-400 bg-transparent outline-none ${className}`}
      />
    );
  }

  return (
    <Tag
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`cursor-text rounded px-0.5 transition-colors hover:bg-blue-50/60 ${className}`}
    >
      {value || <span className="italic text-zinc-300">{placeholder}</span>}
    </Tag>
  );
}

/* ============================================================
   MOVE ARROWS
   ============================================================ */

function MoveArrows({
  canUp,
  canDown,
  onUp,
  onDown,
}: {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <span className="inline-flex flex-col opacity-0 transition-opacity group-hover/row:opacity-100">
      <button
        onClick={(e) => { e.stopPropagation(); onUp(); }}
        disabled={!canUp}
        className="text-zinc-300 hover:text-zinc-600 disabled:invisible"
        aria-label="Mover arriba"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDown(); }}
        disabled={!canDown}
        className="text-zinc-300 hover:text-zinc-600 disabled:invisible"
        aria-label="Mover abajo"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </span>
  );
}

/* ============================================================
   ADD BUTTON (inline "+" at the end of each list)
   ============================================================ */

function AddButton({ label, onAdd }: { label: string; onAdd: (name: string) => void }) {
  const [active, setActive] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (active) ref.current?.focus(); }, [active]);

  const submit = () => {
    if (text.trim()) { onAdd(text.trim()); setText(""); }
    setActive(false);
  };

  if (active) {
    return (
      <div className="mt-1.5 flex items-center gap-1">
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setActive(false); }}
          placeholder={label}
          className="flex-1 border-b border-dashed border-zinc-300 bg-transparent py-1 text-sm text-zinc-600 outline-none placeholder:text-zinc-300"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setActive(true)}
      className="mt-1.5 flex items-center gap-1.5 rounded px-1 py-1 text-xs text-zinc-300 transition-colors hover:text-zinc-500"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {label}
    </button>
  );
}

/* ============================================================
   DELETE BUTTON (small x on hover)
   ============================================================ */

function DeleteBtn({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      className="ml-auto shrink-0 rounded p-0.5 text-zinc-200 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover/row:opacity-100"
      aria-label="Eliminar"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

/* ============================================================
   CHEVRON
   ============================================================ */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      className={`shrink-0 text-zinc-300 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

/* ============================================================
   ÁMBITO HEADER (H1 editable)
   ============================================================ */

function AmbitoHeader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-5">
      <EditableText
        value={value}
        onChange={onChange}
        className="text-2xl font-bold tracking-tight text-zinc-900"
        tag="h1"
      />
    </div>
  );
}

/* ============================================================
   AREA SECTION (always visible, even if empty)
   ============================================================ */

function AreaSection({ areaId }: { areaId: Area }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(true);
  const c = AREA_COLORS[areaId];
  const label = areaLabel(areaId);

  const proyectos = state.proyectos.filter((p) => p.area === areaId);
  const sops = state.plantillas.filter((pl) => pl.area === areaId);

  return (
    <section className="mb-6">
      {/* Area heading */}
      <button
        onClick={() => setOpen(!open)}
        className="mb-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-50"
      >
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white ${c.dot}`}>
          {c.initial}
        </span>
        <h2 className={`text-base font-bold uppercase tracking-wide ${c.text}`}>{label}</h2>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="ml-5 border-l-2 pl-5" style={{ borderColor: `var(--area-border, #e4e4e7)` }}>

          {/* ---- PROYECTOS ---- */}
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-zinc-300">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
              Proyectos
            </p>
            {proyectos.length > 0 ? (
              proyectos.map((proj, i) => (
                <ProyectoBlock key={proj.id} proyecto={proj} index={i} total={proyectos.length} />
              ))
            ) : (
              <p className="py-1 text-sm italic text-zinc-300">Sin proyectos</p>
            )}
            <AddButton
              label="Proyecto"
              onAdd={(nombre) =>
                dispatch({
                  type: "ADD_PROYECTO",
                  payload: {
                    id: generateId(),
                    nombre,
                    descripcion: null,
                    area: areaId,
                    creado: new Date().toISOString(),
                    fechaInicio: null,
                  },
                })
              }
            />
          </div>

          {/* ---- PROCESOS ---- */}
          <div className="mb-2">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-purple-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-purple-300">
                <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
              </svg>
              Procesos
            </p>
            {sops.length > 0 ? (
              sops.map((sop, i) => (
                <SOPBlock key={sop.id} sop={sop} index={i} total={sops.length} />
              ))
            ) : (
              <p className="py-1 text-sm italic text-zinc-300">Sin procesos</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================================================
   PROYECTO BLOCK
   ============================================================ */

function ProyectoBlock({ proyecto, index, total }: { proyecto: Proyecto; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const resultados = state.resultados.filter((r) => r.proyectoId === proyecto.id);

  return (
    <div className="mb-1.5">
      <div className="group/row flex items-center gap-1.5">
        <button onClick={() => setOpen(!open)} className="shrink-0"><Chevron open={open} /></button>

        <MoveArrows
          canUp={index > 0}
          canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_PROYECTO", id: proyecto.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_PROYECTO", id: proyecto.id, direction: "down" })}
        />

        <EditableText
          value={proyecto.nombre}
          onChange={(v) => dispatch({ type: "RENAME_PROYECTO", id: proyecto.id, nombre: v })}
          className="text-sm font-semibold text-zinc-800"
        />

        <span className="text-[10px] text-zinc-300">{resultados.length}r</span>
        <DeleteBtn onDelete={() => setConfirm(true)} />
      </div>

      {confirm && (
        <ConfirmDelete
          label={proyecto.nombre}
          onConfirm={() => { dispatch({ type: "DELETE_PROYECTO", id: proyecto.id }); setConfirm(false); }}
          onCancel={() => setConfirm(false)}
        />
      )}

      {open && (
        <div className="ml-7 border-l border-zinc-100 pl-4">
          <EditableText
            value={proyecto.descripcion ?? ""}
            onChange={(v) => dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { descripcion: v || null } })}
            className="mb-1 text-xs italic text-zinc-400"
            placeholder="Descripción del proyecto..."
            tag="p"
          />

          {resultados.map((res, i) => (
            <ResultadoBlock key={res.id} resultado={res} index={i} total={resultados.length} />
          ))}

          <AddButton
            label="Resultado"
            onAdd={(nombre) =>
              dispatch({
                type: "ADD_RESULTADO",
                payload: {
                  id: generateId(),
                  nombre,
                  descripcion: null,
                  proyectoId: proyecto.id,
                  creado: new Date().toISOString(),
                  semana: null,
                  fechaLimite: null,
                  fechaInicio: null,
                  diasEstimados: null,
                },
              })
            }
          />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   RESULTADO BLOCK
   ============================================================ */

function ResultadoBlock({ resultado, index, total }: { resultado: Resultado; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const entregables = state.entregables.filter((e) => e.resultadoId === resultado.id);

  return (
    <div className="mb-1">
      <div className="group/row flex items-center gap-1.5">
        <button onClick={() => setOpen(!open)} className="shrink-0"><Chevron open={open} /></button>

        <MoveArrows
          canUp={index > 0}
          canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_RESULTADO", id: resultado.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_RESULTADO", id: resultado.id, direction: "down" })}
        />

        <EditableText
          value={resultado.nombre}
          onChange={(v) => dispatch({ type: "RENAME_RESULTADO", id: resultado.id, nombre: v })}
          className="text-sm text-zinc-700"
        />

        <span className="text-[10px] text-zinc-300">{entregables.length}e</span>
        <DeleteBtn onDelete={() => setConfirm(true)} />
      </div>

      {confirm && (
        <ConfirmDelete
          label={resultado.nombre}
          onConfirm={() => { dispatch({ type: "DELETE_RESULTADO", id: resultado.id }); setConfirm(false); }}
          onCancel={() => setConfirm(false)}
        />
      )}

      {open && (
        <div className="ml-7 border-l border-zinc-50 pl-4">
          {entregables.map((ent, i) => (
            <EntregableBlock key={ent.id} entregable={ent} index={i} total={entregables.length} />
          ))}

          <AddButton
            label="Entregable"
            onAdd={(nombre) =>
              dispatch({
                type: "ADD_ENTREGABLE",
                payload: {
                  id: generateId(),
                  nombre,
                  resultadoId: resultado.id,
                  tipo: "raw" as TipoEntregable,
                  plantillaId: null,
                  diasEstimados: 3,
                  diasHechos: 0,
                  esDiaria: false,
                  responsable: "gabi",
                  estado: "a_futuro",
                  creado: new Date().toISOString(),
                  semana: null,
                  fechaLimite: null,
                  fechaInicio: null,
                },
              })
            }
          />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ENTREGABLE BLOCK
   ============================================================ */

function EntregableBlock({ entregable, index, total }: { entregable: Entregable; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const pasos = state.pasos
    .filter((p) => p.entregableId === entregable.id)
    .sort((a, b) => {
      if (!a.inicioTs) return 1;
      if (!b.inicioTs) return -1;
      return a.inicioTs.localeCompare(b.inicioTs);
    });

  const tipoTag = entregable.tipo !== "raw" ? entregable.tipo.toUpperCase() : null;
  const dotColor =
    entregable.estado === "hecho" ? "bg-green-400"
    : entregable.estado === "en_proceso" ? "bg-amber-400"
    : "bg-zinc-300";

  return (
    <div className="mb-0.5">
      <div className="group/row flex items-center gap-1.5">
        <button onClick={() => setOpen(!open)} className="shrink-0"><Chevron open={open} /></button>

        <MoveArrows
          canUp={index > 0}
          canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_ENTREGABLE", id: entregable.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_ENTREGABLE", id: entregable.id, direction: "down" })}
        />

        <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />

        <EditableText
          value={entregable.nombre}
          onChange={(v) => dispatch({ type: "RENAME_ENTREGABLE", id: entregable.id, nombre: v })}
          className="text-xs text-zinc-600"
        />

        {tipoTag && (
          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[8px] font-bold text-purple-600">{tipoTag}</span>
        )}

        {pasos.length > 0 && <span className="text-[10px] text-zinc-300">{pasos.length}p</span>}
        <DeleteBtn onDelete={() => setConfirm(true)} />
      </div>

      {confirm && (
        <ConfirmDelete
          label={entregable.nombre}
          onConfirm={() => { dispatch({ type: "DELETE_ENTREGABLE", id: entregable.id }); setConfirm(false); }}
          onCancel={() => setConfirm(false)}
        />
      )}

      {open && pasos.length > 0 && (
        <div className="ml-7 pl-4">
          {pasos.map((paso) => (
            <PasoLine key={paso.id} paso={paso} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PASO LINE
   ============================================================ */

function PasoLine({ paso }: { paso: Paso }) {
  const dispatch = useAppDispatch();
  const [showDetail, setShowDetail] = useState(false);
  const done = !!paso.finTs;

  return (
    <div className="mb-0.5">
      <div className="group/row flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? "bg-green-400" : "bg-zinc-300"}`} />

        <EditableText
          value={paso.nombre}
          onChange={(v) => dispatch({ type: "RENAME_PASO", id: paso.id, nombre: v })}
          className={`text-xs ${done ? "text-zinc-400 line-through" : "text-zinc-600"}`}
        />

        {paso.inicioTs && (
          <span className="text-[10px] text-zinc-300">
            {new Date(paso.inicioTs).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          </span>
        )}

        <button
          onClick={() => setShowDetail(!showDetail)}
          className="rounded p-0.5 text-zinc-200 opacity-0 transition-all hover:text-zinc-500 group-hover/row:opacity-100"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
          </svg>
        </button>

        <DeleteBtn onDelete={() => dispatch({ type: "DELETE_PASO", id: paso.id })} />
      </div>

      {showDetail && (
        <div className="ml-5 mt-1 rounded bg-zinc-50 p-3 text-xs text-zinc-500">
          {paso.contexto.notas && <p className="mb-1">{paso.contexto.notas}</p>}
          {paso.contexto.urls.length > 0 && (
            <div className="space-y-0.5">
              {paso.contexto.urls.map((u, i) => (
                <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" className="block truncate text-blue-500 hover:underline">
                  {u.nombre || u.url}
                </a>
              ))}
            </div>
          )}
          {!paso.contexto.notas && paso.contexto.urls.length === 0 && <p className="italic">Sin notas ni enlaces</p>}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SOP BLOCK
   ============================================================ */

function SOPBlock({ sop, index, total }: { sop: PlantillaProceso; index: number; total: number }) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="mb-1">
      <div className="group/row flex items-center gap-1.5">
        <button onClick={() => setOpen(!open)} className="shrink-0"><Chevron open={open} /></button>

        <MoveArrows
          canUp={index > 0}
          canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_PLANTILLA", id: sop.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_PLANTILLA", id: sop.id, direction: "down" })}
        />

        <span className="h-2 w-2 shrink-0 rounded-full bg-purple-400" />

        <EditableText
          value={sop.nombre}
          onChange={(v) => dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { nombre: v } })}
          className="text-xs text-zinc-600"
        />

        <span className="text-[10px] text-zinc-300">{sop.pasos.length}p</span>
        <DeleteBtn onDelete={() => setConfirm(true)} />
      </div>

      {confirm && (
        <ConfirmDelete
          label={sop.nombre}
          onConfirm={() => { dispatch({ type: "DELETE_PLANTILLA", id: sop.id }); setConfirm(false); }}
          onCancel={() => setConfirm(false)}
        />
      )}

      {open && (
        <div className="ml-7 rounded bg-zinc-50/60 p-3 text-xs text-zinc-500">
          {sop.objetivo && (
            <EditableText
              value={sop.objetivo}
              onChange={(v) => dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { objetivo: v } })}
              className="mb-1.5 block text-xs italic text-zinc-400"
              placeholder="Objetivo..."
              tag="p"
            />
          )}
          {sop.responsableDefault && (
            <p className="mb-1.5">
              Responsable: <strong>{sop.responsableDefault}</strong>
            </p>
          )}
          {sop.disparador && (
            <EditableText
              value={sop.disparador}
              onChange={(v) => dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { disparador: v } })}
              className="mb-1.5 block text-xs text-zinc-400"
              placeholder="Disparador..."
              tag="p"
            />
          )}
          <ol className="ml-4 list-decimal space-y-1">
            {sop.pasos.map((p) => (
              <li key={p.id}>
                {p.nombre}
                {p.minutosEstimados ? ` [${p.minutosEstimados}min]` : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CONFIRM DELETE (inline)
   ============================================================ */

function ConfirmDelete({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="my-1 ml-7 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm">
      <span className="text-red-600">Eliminar &ldquo;{label}&rdquo;?</span>
      <button onClick={onConfirm} className="rounded bg-red-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600">
        Sí
      </button>
      <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-700">
        No
      </button>
    </div>
  );
}
