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
   MAIN
   ============================================================ */

export function PantallaMapa({ onOpenDetalle }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  return (
    <div className="w-full px-6 py-8 sm:px-10">

      <AmbitoHeader
        value={state.ambitoLabels.empresa}
        onChange={(v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { empresa: v } })}
      />
      {EMPRESA_ORDER.map((id) => <AreaSection key={id} areaId={id} />)}

      <div className="my-12 border-t border-border" />

      <AmbitoHeader
        value={state.ambitoLabels.personal}
        onChange={(v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { personal: v } })}
      />
      {PERSONAL_ORDER.map((id) => <AreaSection key={id} areaId={id} />)}
    </div>
  );
}

/* ============================================================
   EDITABLE TEXT
   ============================================================ */

function EditableText({
  value,
  onChange,
  className = "",
  placeholder = "Sin nombre",
  multiline = false,
  tag = "span",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  tag?: "span" | "h1" | "h2" | "h3" | "p";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = useCallback(() => {
    const t = draft.trim();
    if (t && t !== value) onChange(t);
    setEditing(false);
  }, [draft, value, onChange]);

  if (editing) {
    const shared = `w-full rounded-lg border-2 border-accent bg-background px-3 py-2 outline-none ${className}`;
    if (multiline) {
      return (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
          rows={3}
          className={shared}
        />
      );
    }
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={shared}
      />
    );
  }

  const Tag = tag;
  return (
    <Tag
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`cursor-text rounded-lg px-3 py-1 transition-colors hover:bg-accent-soft ${className}`}
    >
      {value || <span className="italic text-muted">{placeholder}</span>}
    </Tag>
  );
}

/* ============================================================
   REORDER ARROWS
   ============================================================ */

function MoveArrows({ canUp, canDown, onUp, onDown }: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void }) {
  return (
    <span className="inline-flex flex-col gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
      <button onClick={(e) => { e.stopPropagation(); onUp(); }} disabled={!canUp}
        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-hover disabled:invisible" aria-label="Subir">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="18 15 12 9 6 15" /></svg>
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDown(); }} disabled={!canDown}
        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-hover disabled:invisible" aria-label="Bajar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
    </span>
  );
}

/* ============================================================
   ADD BUTTON
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
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setActive(false); }}
        placeholder={`Nombre del ${label.toLowerCase()}...`}
        className="mt-3 w-full rounded-xl border-2 border-dashed border-border bg-background px-4 py-3 text-base text-foreground outline-none placeholder:text-muted focus:border-accent"
      />
    );
  }

  return (
    <button onClick={() => setActive(true)}
      className="mt-3 flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      Añadir {label.toLowerCase()}
    </button>
  );
}

/* ============================================================
   DELETE BUTTON
   ============================================================ */

function DeleteBtn({ onDelete }: { onDelete: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
      className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover/row:opacity-100 dark:hover:bg-red-500/10"
      aria-label="Eliminar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

/* ============================================================
   TOGGLE ROW
   ============================================================ */

function ToggleRow({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onToggle}
      className="group/row flex min-h-[48px] cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}>
        <polyline points="9 6 15 12 9 18" />
      </svg>
      {children}
    </div>
  );
}

/* ============================================================
   ÁMBITO HEADER
   ============================================================ */

function AmbitoHeader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-8">
      <EditableText value={value} onChange={onChange} tag="h1" className="text-3xl font-bold tracking-tight text-foreground" />
    </div>
  );
}

/* ============================================================
   AREA SECTION
   ============================================================ */

const BORDER_COLORS: Record<string, string> = {
  fisico: "#f43f5e", emocional: "#ec4899", mental: "#6366f1", espiritual: "#8b5cf6",
  financiera: "#10b981", operativa: "#3b82f6", comercial: "#f59e0b", administrativa: "#a855f6",
};

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
      <button onClick={() => setOpen(!open)}
        className="mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-surface">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white ${c.dot}`}>{c.initial}</span>
        <h2 className={`text-xl font-bold uppercase tracking-wide ${c.text}`}>{label}</h2>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`ml-auto text-muted transition-transform ${open ? "rotate-90" : ""}`}>
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>

      {open && (
        <div className="ml-6 border-l-[3px] pl-6 sm:ml-8 sm:pl-8" style={{ borderColor: BORDER_COLORS[areaId] }}>

          {/* PROYECTOS */}
          <div className="mb-8">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
              Proyectos
            </h3>
            {proyectos.length > 0 ? (
              <div className="space-y-2">
                {proyectos.map((proj, i) => (
                  <ProyectoBlock key={proj.id} proyecto={proj} index={i} total={proyectos.length} />
                ))}
              </div>
            ) : (
              <p className="py-3 text-base italic text-muted">Sin proyectos</p>
            )}
            <AddButton label="Proyecto" onAdd={(nombre) =>
              dispatch({ type: "ADD_PROYECTO", payload: { id: generateId(), nombre, descripcion: null, area: areaId, creado: new Date().toISOString(), fechaInicio: null } })
            } />
          </div>

          {/* PROCESOS */}
          <div className="mb-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-purple-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-purple-400">
                <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
              </svg>
              Procesos
            </h3>
            {sops.length > 0 ? (
              <div className="space-y-2">
                {sops.map((sop, i) => (
                  <SOPBlock key={sop.id} sop={sop} index={i} total={sops.length} />
                ))}
              </div>
            ) : (
              <p className="py-3 text-base italic text-muted">Sin procesos</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================================================
   PROYECTO
   ============================================================ */

function ProyectoBlock({ proyecto, index, total }: { proyecto: Proyecto; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const resultados = state.resultados.filter((r) => r.proyectoId === proyecto.id);

  return (
    <div className="rounded-xl border border-border bg-background">
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_PROYECTO", id: proyecto.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_PROYECTO", id: proyecto.id, direction: "down" })} />
        <EditableText value={proyecto.nombre} onChange={(v) => dispatch({ type: "RENAME_PROYECTO", id: proyecto.id, nombre: v })}
          className="text-lg font-semibold text-foreground" />
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted">{resultados.length} result.</span>
        <DeleteBtn onDelete={() => setConfirm(true)} />
      </ToggleRow>

      {confirm && <ConfirmDelete label={proyecto.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_PROYECTO", id: proyecto.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {open && (
        <div className="px-5 pb-5 pl-14">
          <EditableText value={proyecto.descripcion ?? ""} onChange={(v) => dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { descripcion: v || null } })}
            className="mb-4 text-sm italic text-muted" placeholder="Descripción del proyecto..." multiline />

          {proyecto.fechaInicio && (
            <p className="mb-3 text-xs text-muted">
              Inicio: {new Date(proyecto.fechaInicio).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}

          <div className="space-y-2">
            {resultados.map((res, i) => (
              <ResultadoBlock key={res.id} resultado={res} index={i} total={resultados.length} />
            ))}
          </div>

          <AddButton label="Resultado" onAdd={(nombre) =>
            dispatch({ type: "ADD_RESULTADO", payload: { id: generateId(), nombre, descripcion: null, proyectoId: proyecto.id, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null } })
          } />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   RESULTADO
   ============================================================ */

function ResultadoBlock({ resultado, index, total }: { resultado: Resultado; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const entregables = state.entregables.filter((e) => e.resultadoId === resultado.id);

  return (
    <div className="rounded-xl border border-border/50 bg-surface/30">
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_RESULTADO", id: resultado.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_RESULTADO", id: resultado.id, direction: "down" })} />
        <EditableText value={resultado.nombre} onChange={(v) => dispatch({ type: "RENAME_RESULTADO", id: resultado.id, nombre: v })}
          className="text-base font-medium text-foreground" />
        <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-muted">{entregables.length} entreg.</span>
        <DeleteBtn onDelete={() => setConfirm(true)} />
      </ToggleRow>

      {confirm && <ConfirmDelete label={resultado.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_RESULTADO", id: resultado.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {open && (
        <div className="px-5 pb-5 pl-14">
          {resultado.descripcion && (
            <p className="mb-3 text-sm italic text-muted">{resultado.descripcion}</p>
          )}
          <div className="space-y-1">
            {entregables.map((ent, i) => (
              <EntregableBlock key={ent.id} entregable={ent} index={i} total={entregables.length} />
            ))}
          </div>
          <AddButton label="Entregable" onAdd={(nombre) =>
            dispatch({ type: "ADD_ENTREGABLE", payload: { id: generateId(), nombre, resultadoId: resultado.id, tipo: "raw" as TipoEntregable, plantillaId: null, diasEstimados: 3, diasHechos: 0, esDiaria: false, responsable: "gabi", estado: "a_futuro", creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null } })
          } />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ENTREGABLE with date assignment
   ============================================================ */

function EntregableBlock({ entregable, index, total }: { entregable: Entregable; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const pasos = state.pasos
    .filter((p) => p.entregableId === entregable.id)
    .sort((a, b) => { if (!a.inicioTs) return 1; if (!b.inicioTs) return -1; return a.inicioTs.localeCompare(b.inicioTs); });

  const tipoTag = entregable.tipo !== "raw" ? entregable.tipo.toUpperCase() : null;
  const dotColor = entregable.estado === "hecho" ? "bg-green-500" : entregable.estado === "en_proceso" ? "bg-amber-500" : "bg-border";

  function assignDate(period: string) {
    const now = new Date();
    let target: string;
    if (period === "hoy") {
      target = now.toISOString().slice(0, 10);
    } else if (period === "semana") {
      const day = now.getDay() || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - day + 1);
      target = `W${monday.toISOString().slice(0, 10)}`;
    } else if (period === "mes") {
      target = `M${now.toISOString().slice(0, 7)}`;
    } else if (period === "trimestre") {
      const q = Math.ceil((now.getMonth() + 1) / 3);
      target = `Q${now.getFullYear()}-Q${q}`;
    } else {
      target = `Y${now.getFullYear()}`;
    }
    dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes: { fechaInicio: target, estado: "en_proceso" } });
    setShowDatePicker(false);
  }

  return (
    <div>
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_ENTREGABLE", id: entregable.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_ENTREGABLE", id: entregable.id, direction: "down" })} />
        <span className={`h-3 w-3 shrink-0 rounded-full ${dotColor}`} />
        <EditableText value={entregable.nombre} onChange={(v) => dispatch({ type: "RENAME_ENTREGABLE", id: entregable.id, nombre: v })}
          className="text-sm text-foreground" />
        {tipoTag && <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-600">{tipoTag}</span>}
        {pasos.length > 0 && <span className="text-xs text-muted">{pasos.length}p</span>}

        {/* Date assign button */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowDatePicker(!showDatePicker); }}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted opacity-0 transition-all hover:bg-accent-soft hover:text-accent group-hover/row:opacity-100"
          title="Asignar a un periodo"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>

        <DeleteBtn onDelete={() => setConfirm(true)} />
      </ToggleRow>

      {showDatePicker && (
        <div className="ml-12 mb-2 flex flex-wrap gap-2 px-3">
          {[
            { id: "hoy", label: "Hoy" },
            { id: "semana", label: "Esta semana" },
            { id: "mes", label: "Este mes" },
            { id: "trimestre", label: "Este trimestre" },
            { id: "anio", label: "Este año" },
          ].map((p) => (
            <button key={p.id} onClick={() => assignDate(p.id)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:bg-accent-soft">
              {p.label}
            </button>
          ))}
          <button onClick={() => setShowDatePicker(false)}
            className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground">
            Cancelar
          </button>
        </div>
      )}

      {confirm && <ConfirmDelete label={entregable.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_ENTREGABLE", id: entregable.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {open && pasos.length > 0 && (
        <div className="pb-2 pl-16">
          {pasos.map((paso) => <PasoLine key={paso.id} paso={paso} />)}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PASO
   ============================================================ */

function PasoLine({ paso }: { paso: Paso }) {
  const dispatch = useAppDispatch();
  const [showDetail, setShowDetail] = useState(false);
  const done = !!paso.finTs;

  return (
    <div className="mb-1">
      <div className="group/row flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${done ? "bg-green-500" : "bg-border"}`} />
        <EditableText value={paso.nombre} onChange={(v) => dispatch({ type: "RENAME_PASO", id: paso.id, nombre: v })}
          className={`text-sm ${done ? "text-muted line-through" : "text-foreground"}`} />
        {paso.inicioTs && (
          <span className="text-xs text-muted">
            {new Date(paso.inicioTs).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          </span>
        )}
        <button onClick={() => setShowDetail(!showDetail)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted opacity-0 hover:bg-surface-hover hover:text-foreground group-hover/row:opacity-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /><circle cx="5" cy="12" r="1.5" />
          </svg>
        </button>
        <DeleteBtn onDelete={() => dispatch({ type: "DELETE_PASO", id: paso.id })} />
      </div>

      {showDetail && (
        <div className="ml-8 mt-1 rounded-xl bg-surface p-4 text-sm text-muted">
          {paso.contexto.notas && <p className="mb-2">{paso.contexto.notas}</p>}
          {paso.contexto.urls.length > 0 && (
            <div className="space-y-1">
              {paso.contexto.urls.map((u, i) => (
                <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" className="block truncate text-accent underline hover:text-accent/80">
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
   SOP
   ============================================================ */

function SOPBlock({ sop, index, total }: { sop: PlantillaProceso; index: number; total: number }) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="rounded-xl border border-purple-200 bg-background dark:border-purple-800/30">
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_PLANTILLA", id: sop.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_PLANTILLA", id: sop.id, direction: "down" })} />
        <span className="h-3 w-3 shrink-0 rounded-full bg-purple-400" />
        <EditableText value={sop.nombre} onChange={(v) => dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { nombre: v } })}
          className="text-base font-medium text-foreground" />
        <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">{sop.pasos.length} pasos</span>
        <DeleteBtn onDelete={() => setConfirm(true)} />
      </ToggleRow>

      {confirm && <ConfirmDelete label={sop.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_PLANTILLA", id: sop.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {open && (
        <div className="px-6 pb-6 pl-16">
          {sop.objetivo && (
            <EditableText value={sop.objetivo} onChange={(v) => dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { objetivo: v } })}
              className="mb-2 block text-sm italic text-muted" placeholder="Objetivo..." />
          )}
          {sop.responsableDefault && (
            <p className="mb-2 text-sm text-muted">Responsable: <strong className="text-foreground">{sop.responsableDefault}</strong></p>
          )}
          {sop.disparador && (
            <EditableText value={sop.disparador} onChange={(v) => dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { disparador: v } })}
              className="mb-3 block text-sm text-muted" placeholder="Disparador..." />
          )}
          <ol className="ml-5 list-decimal space-y-2 text-sm text-foreground">
            {sop.pasos.map((p) => (
              <li key={p.id} className="leading-relaxed">
                {p.nombre}
                {p.minutosEstimados ? <span className="ml-1 text-xs text-muted">[{p.minutosEstimados}min]</span> : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CONFIRM DELETE
   ============================================================ */

function ConfirmDelete({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mx-4 my-2 flex items-center gap-3 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-800/30 dark:bg-red-500/10">
      <span className="text-red-700 dark:text-red-400">Eliminar &ldquo;{label}&rdquo;?</span>
      <button onClick={onConfirm} className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-600">Sí</button>
      <button onClick={onCancel} className="text-sm text-muted hover:text-foreground">No</button>
    </div>
  );
}
