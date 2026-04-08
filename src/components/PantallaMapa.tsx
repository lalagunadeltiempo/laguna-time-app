"use client";

import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import {
  AREAS_PERSONAL,
  AREAS_EMPRESA,
  AREA_COLORS,
  ambitoDeArea,
  type Area,
  type AreaPersonal,
  type AreaEmpresa,
  type Proyecto,
  type Resultado,
  type Entregable,
  type Paso,
  type Nota,
  type PlantillaProceso,
  type TipoEntregable,
} from "@/lib/types";

function formatFechaInicio(f: string): string {
  const d = new Date(f + "T12:00:00");
  if (isNaN(d.getTime())) return f;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

interface VisibleFilter {
  proyectos: Set<string>;
  resultados: Set<string>;
  entregables: Set<string>;
  pasos: Set<string>;
}
const MapaFilterCtx = createContext<VisibleFilter | null>(null);
function useMapaFilter() { return useContext(MapaFilterCtx); }

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  onOpenDetalle?: (resultadoId: string) => void;
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
  const isMentor = useIsMentor();

  const [dateFilterOn, setDateFilterOn] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => toDateKey(new Date()));
  const [dateTo, setDateTo] = useState(() => toDateKey(new Date()));

  const visibleFilter = useMemo<VisibleFilter | null>(() => {
    if (!dateFilterOn) return null;
    const pasoSet = new Set<string>();
    const entSet = new Set<string>();
    const resSet = new Set<string>();
    const projSet = new Set<string>();

    for (const p of state.pasos) {
      const day = p.inicioTs?.slice(0, 10) ?? p.finTs?.slice(0, 10);
      if (!day) continue;
      if (day >= dateFrom && day <= dateTo) pasoSet.add(p.id);
    }
    for (const p of state.pasos) {
      if (!pasoSet.has(p.id)) continue;
      entSet.add(p.entregableId);
    }
    for (const e of state.entregables) {
      if (!entSet.has(e.id)) continue;
      resSet.add(e.resultadoId);
    }
    for (const r of state.resultados) {
      if (!resSet.has(r.id)) continue;
      projSet.add(r.proyectoId);
    }
    return { proyectos: projSet, resultados: resSet, entregables: entSet, pasos: pasoSet };
  }, [dateFilterOn, dateFrom, dateTo, state.pasos, state.entregables, state.resultados]);

  const setToday = () => { const t = toDateKey(new Date()); setDateFrom(t); setDateTo(t); };
  const setThisWeek = () => {
    const now = new Date();
    const dow = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - dow + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    setDateFrom(toDateKey(mon)); setDateTo(toDateKey(sun));
  };

  return (
    <MapaFilterCtx.Provider value={visibleFilter}>
      <div className="w-full px-6 py-8 sm:px-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setDateFilterOn(!dateFilterOn)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${dateFilterOn ? "bg-accent text-white" : "border border-border bg-background text-muted hover:bg-surface"}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            {dateFilterOn ? "Filtro activo" : "Filtrar por fechas"}
          </button>
          {dateFilterOn && (
            <>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground" />
              <span className="text-xs text-muted">—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground" />
              <button onClick={setToday} className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted hover:bg-surface">Hoy</button>
              <button onClick={setThisWeek} className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted hover:bg-surface">Esta semana</button>
              <button onClick={() => setDateFilterOn(false)} className="text-[10px] text-accent hover:underline">Quitar filtro</button>
            </>
          )}
        </div>

        {dateFilterOn && visibleFilter && visibleFilter.proyectos.size === 0 && (
          <div className="mb-6 rounded-lg border border-border bg-surface/50 px-4 py-6 text-center">
            <p className="text-sm text-muted">No hay actividad registrada en este rango de fechas</p>
          </div>
        )}

        <AmbitoHeader
          value={state.ambitoLabels.empresa}
          onChange={isMentor ? () => {} : (v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { empresa: v } })}
        />
        {EMPRESA_ORDER.map((id) => <AreaSection key={id} areaId={id} />)}

        {!isMentor && (
          <>
            <div className="my-12 border-t border-border" />
            <AmbitoHeader
              value={state.ambitoLabels.personal}
              onChange={(v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { personal: v } })}
            />
            {PERSONAL_ORDER.map((id) => <AreaSection key={id} areaId={id} />)}
          </>
        )}
      </div>
    </MapaFilterCtx.Provider>
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
          onClick={(e) => e.stopPropagation()}
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
        onClick={(e) => e.stopPropagation()}
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
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
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
    <span className="inline-flex flex-col gap-0.5 opacity-40 transition-opacity group-hover/row:opacity-100 sm:opacity-0">
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
      className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted opacity-40 transition-all hover:bg-red-50 hover:text-red-500 sm:opacity-0 group-hover/row:opacity-100 dark:hover:bg-red-500/10"
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

function AreaSection({ areaId }: { areaId: Area }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const filter = useMapaFilter();
  const hasFilter = !!filter;
  const [open, setOpen] = useState(hasFilter);
  const [openProj, setOpenProj] = useState(hasFilter);
  const [openSOP, setOpenSOP] = useState(false);
  const c = AREA_COLORS[areaId];
  const label = areaLabel(areaId);

  const allProyectos = state.proyectos.filter((p) => p.area === areaId);
  const proyectos = filter ? allProyectos.filter((p) => filter.proyectos.has(p.id)) : allProyectos;
  const sops = state.plantillas.filter((pl) => pl.area === areaId);

  if (filter && proyectos.length === 0) return null;

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
        <div className="ml-6 border-l-[3px] pl-6 sm:ml-8 sm:pl-8" style={{ borderColor: AREA_COLORS[areaId]?.hex ?? "#888" }}>

          {/* PROYECTOS */}
          <div className="mb-8">
            <button onClick={() => setOpenProj(!openProj)} className="mb-3 flex w-full items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted hover:text-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
              Proyectos
              <span className="text-xs font-normal">({proyectos.length})</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                className={`ml-auto transition-transform ${openProj ? "rotate-90" : ""}`}>
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
            {openProj && (
              <>
                {proyectos.length > 0 ? (
                  <div className="space-y-2">
                    {proyectos.map((proj, i) => (
                      <ProyectoBlock key={proj.id} proyecto={proj} index={i} total={proyectos.length} />
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-base italic text-muted">Sin proyectos</p>
                )}
                {!isMentor && (
                  <AddButton label="Proyecto" onAdd={(nombre) =>
                    dispatch({ type: "ADD_PROYECTO", payload: { id: generateId(), nombre, descripcion: null, area: areaId, creado: new Date().toISOString(), fechaInicio: null } })
                  } />
                )}
              </>
            )}
          </div>

          {/* PROCESOS — hidden when date filter active */}
          {!hasFilter && <div className="mb-4">
            <button onClick={() => setOpenSOP(!openSOP)} className="mb-3 flex w-full items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted hover:text-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted">
                <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" />
              </svg>
              Procesos
              <span className="text-xs font-normal">({sops.length})</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                className={`ml-auto transition-transform ${openSOP ? "rotate-90" : ""}`}>
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
            {openSOP && (
              <>
                {sops.length > 0 ? (
                  <div className="space-y-2">
                    {sops.map((sop, i) => (
                      <SOPBlock key={sop.id} sop={sop} index={i} total={sops.length} />
                    ))}
                  </div>
                ) : (
                  <p className="py-3 text-base italic text-muted">Sin procesos</p>
                )}
              </>
            )}
          </div>}
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
  const isMentor = useIsMentor();
  const filter = useMapaFilter();
  const [open, setOpen] = useState(!!filter);
  const [confirm, setConfirm] = useState(false);
  const [showNotas, setShowNotas] = useState(false);
  const isEmpresa = ambitoDeArea(proyecto.area) === "empresa";

  const allResultados = state.resultados.filter((r) => r.proyectoId === proyecto.id);
  const resultados = filter ? allResultados.filter((r) => filter.resultados.has(r.id)) : allResultados;
  const notasCount = (proyecto.notas ?? []).length;

  return (
    <div className="rounded-xl border border-border bg-background">
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        {!isMentor && <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_PROYECTO", id: proyecto.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_PROYECTO", id: proyecto.id, direction: "down" })} />}
        {isMentor
          ? <span className="text-lg font-semibold text-foreground">{proyecto.nombre}</span>
          : <EditableText value={proyecto.nombre} onChange={(v) => dispatch({ type: "RENAME_PROYECTO", id: proyecto.id, nombre: v })} className="text-lg font-semibold text-foreground" />
        }
        {isEmpresa && <ResponsableBadge nombre={proyecto.responsable} />}
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted">{resultados.length} result.</span>
        <NotasIcon count={notasCount} onClick={() => setShowNotas(!showNotas)} />
        {!isMentor && <DeleteBtn onDelete={() => setConfirm(true)} />}
      </ToggleRow>

      {confirm && <ConfirmDelete label={proyecto.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_PROYECTO", id: proyecto.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {showNotas && (
        <div className="mx-5 mb-3 ml-14">
          <NotasSection notas={proyecto.notas ?? []} nivel="proyecto" targetId={proyecto.id} />
        </div>
      )}

      {open && (
        <div className="px-5 pb-5 pl-14">
          {!isMentor ? (
            <EditableText value={proyecto.descripcion ?? ""} onChange={(v) => dispatch({ type: "UPDATE_PROYECTO", id: proyecto.id, changes: { descripcion: v || null } })}
              className="mb-4 text-sm italic text-muted" placeholder="Descripción del proyecto..." multiline />
          ) : proyecto.descripcion ? (
            <p className="mb-4 text-sm italic text-muted">{proyecto.descripcion}</p>
          ) : null}

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

          {!isMentor && (
            <AddButton label="Resultado" onAdd={(nombre) =>
              dispatch({ type: "ADD_RESULTADO", payload: { id: generateId(), nombre, descripcion: null, proyectoId: proyecto.id, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null } })
            } />
          )}
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
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();
  const filter = useMapaFilter();
  const [open, setOpen] = useState(!!filter);
  const [confirm, setConfirm] = useState(false);
  const [showNotas, setShowNotas] = useState(false);

  const allEntregables = state.entregables.filter((e) => e.resultadoId === resultado.id);
  const entregables = filter ? allEntregables.filter((e) => filter.entregables.has(e.id)) : allEntregables;
  const parentProj = state.proyectos.find((p) => p.id === resultado.proyectoId);
  const isEmpresa = parentProj ? ambitoDeArea(parentProj.area) === "empresa" : false;
  const notasCount = (resultado.notas ?? []).length;

  return (
    <div className="rounded-xl border border-border/50 bg-surface/30">
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        {!isMentor && <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_RESULTADO", id: resultado.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_RESULTADO", id: resultado.id, direction: "down" })} />}
        {isMentor
          ? <span className="text-base font-medium text-foreground">{resultado.nombre}</span>
          : <EditableText value={resultado.nombre} onChange={(v) => dispatch({ type: "RENAME_RESULTADO", id: resultado.id, nombre: v })} className="text-base font-medium text-foreground" />
        }
        {isEmpresa && <ResponsableBadge nombre={resultado.responsable ?? parentProj?.responsable} />}
        <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-muted">{entregables.length} entreg.</span>
        <NotasIcon count={notasCount} onClick={() => setShowNotas(!showNotas)} />
        {!isMentor && <DeleteBtn onDelete={() => setConfirm(true)} />}
      </ToggleRow>

      {confirm && <ConfirmDelete label={resultado.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_RESULTADO", id: resultado.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {showNotas && (
        <div className="mx-5 mb-3 ml-14">
          <NotasSection notas={resultado.notas ?? []} nivel="resultado" targetId={resultado.id} />
        </div>
      )}

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
          {!isMentor && (
            <AddButton label="Entregable" onAdd={(nombre) =>
              dispatch({ type: "ADD_ENTREGABLE", payload: { id: generateId(), nombre, resultadoId: resultado.id, tipo: "raw" as TipoEntregable, plantillaId: null, diasEstimados: 3, diasHechos: 0, esDiaria: false, responsable: currentUser, estado: "a_futuro", creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null } })
            } />
          )}
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
  const isMentor = useIsMentor();
  const filter = useMapaFilter();
  const [open, setOpen] = useState(!!filter);
  const [confirm, setConfirm] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [justAssigned, setJustAssigned] = useState(false);
  const justAssignedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const customDateRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => clearTimeout(justAssignedTimer.current), []);

  const allPasos = state.pasos
    .filter((p) => p.entregableId === entregable.id)
    .sort((a, b) => { if (!a.inicioTs) return 1; if (!b.inicioTs) return -1; return a.inicioTs.localeCompare(b.inicioTs); });
  const pasos = filter ? allPasos.filter((p) => filter.pasos.has(p.id)) : allPasos;

  const [showNotas, setShowNotas] = useState(false);

  const tipoTag = entregable.tipo !== "raw" ? entregable.tipo.toUpperCase() : null;
  const dotColor = entregable.estado === "hecho" ? "bg-green-500" : entregable.estado === "en_proceso" ? "bg-amber-500" : "bg-border";
  const parentRes = state.resultados.find((r) => r.id === entregable.resultadoId);
  const parentProj = parentRes ? state.proyectos.find((p) => p.id === parentRes.proyectoId) : undefined;
  const entAreaHex = parentProj ? (AREA_COLORS[parentProj.area]?.hex ?? "#888") : "#888";
  const isEmpresa = parentProj ? ambitoDeArea(parentProj.area) === "empresa" : false;
  const notasCount = (entregable.notas ?? []).length;

  const isProgrammed = !!entregable.fechaInicio;
  const programLabel = isProgrammed ? formatFechaInicio(entregable.fechaInicio!) : null;

  function assignDate(period: string) {
    const now = new Date();
    let target: Date;
    if (period === "hoy") {
      target = now;
    } else if (period === "semana") {
      const day = now.getDay() || 7;
      target = new Date(now);
      target.setDate(now.getDate() - day + 1);
    } else if (period === "mes") {
      target = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "trimestre") {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      target = new Date(now.getFullYear(), qMonth, 1);
    } else {
      target = new Date(now.getFullYear(), 0, 1);
    }
    const dateStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
    dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes: { fechaInicio: dateStr, estado: entregable.estado === "a_futuro" ? "en_proceso" : entregable.estado } });
    setShowDatePicker(false);
    setJustAssigned(true);
    clearTimeout(justAssignedTimer.current);
    justAssignedTimer.current = setTimeout(() => setJustAssigned(false), 2500);
  }

  function assignCustomDate(dateStr: string) {
    if (!dateStr) return;
    dispatch({ type: "UPDATE_ENTREGABLE", id: entregable.id, changes: { fechaInicio: dateStr, estado: entregable.estado === "a_futuro" ? "en_proceso" : entregable.estado } });
    setShowDatePicker(false);
    setJustAssigned(true);
    clearTimeout(justAssignedTimer.current);
    justAssignedTimer.current = setTimeout(() => setJustAssigned(false), 2500);
  }

  return (
    <div>
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        {!isMentor && <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_ENTREGABLE", id: entregable.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_ENTREGABLE", id: entregable.id, direction: "down" })} />}
        <span className={`h-3 w-3 shrink-0 rounded-full ${dotColor}`} />
        {isMentor
          ? <span className="text-sm text-foreground">{entregable.nombre}</span>
          : <EditableText value={entregable.nombre} onChange={(v) => dispatch({ type: "RENAME_ENTREGABLE", id: entregable.id, nombre: v })} className="text-sm text-foreground" />
        }
        {tipoTag && <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: entAreaHex + "15", color: entAreaHex }}>{tipoTag}</span>}
        {isEmpresa && <ResponsableBadge nombre={entregable.responsable} />}
        {programLabel && (
          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{programLabel}</span>
        )}
        {justAssigned && (
          <span className="animate-pulse rounded-md bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">Planificado</span>
        )}
        {pasos.length > 0 && <span className="text-xs text-muted">{pasos.length}p</span>}
        <NotasIcon count={notasCount} onClick={() => setShowNotas(!showNotas)} />

        {!isMentor && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDatePicker(!showDatePicker); }}
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-all hover:bg-accent-soft hover:text-accent ${isProgrammed ? "text-accent" : "text-muted opacity-60 hover:opacity-100"}`}
            title="Asignar a un periodo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
        )}

        {!isMentor && <DeleteBtn onDelete={() => setConfirm(true)} />}
      </ToggleRow>

      {showDatePicker && (
        <div className="ml-12 mb-2 flex flex-wrap items-center gap-2 px-3">
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
          <button onClick={() => customDateRef.current?.showPicker()}
            className="rounded-lg border border-accent/50 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20">
            Elegir fecha...
          </button>
          <input ref={customDateRef} type="date" onChange={(e) => assignCustomDate(e.target.value)}
            className="sr-only" tabIndex={-1} aria-hidden="true" />
          <button onClick={() => setShowDatePicker(false)}
            className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground">
            Cancelar
          </button>
        </div>
      )}

      {confirm && <ConfirmDelete label={entregable.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_ENTREGABLE", id: entregable.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {showNotas && (
        <div className="mx-5 mb-3 ml-16">
          <NotasSection notas={entregable.notas ?? []} nivel="entregable" targetId={entregable.id} />
        </div>
      )}

      {open && pasos.length > 0 && (
        <div className="pb-2 pl-16">
          {pasos.map((paso, i) => <PasoLine key={paso.id} paso={paso} index={i} total={pasos.length} isEmpresa={isEmpresa} entResponsable={entregable.responsable} />)}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PASO
   ============================================================ */

function PasoLine({ paso, index, total, isEmpresa, entResponsable }: { paso: Paso; index: number; total: number; isEmpresa: boolean; entResponsable?: string }) {
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const [showDetail, setShowDetail] = useState(false);
  const [showNotas, setShowNotas] = useState(false);
  const done = !!paso.finTs;
  const notasCount = (paso.notas ?? []).length;

  return (
    <div className="mb-1">
      <div className="group/row flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface">
        {!isMentor && <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_PASO", id: paso.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_PASO", id: paso.id, direction: "down" })} />}
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${done ? "bg-green-500" : "bg-border"}`} />
        {isMentor
          ? <span className={`text-sm ${done ? "text-muted line-through" : "text-foreground"}`}>{paso.nombre}</span>
          : <EditableText value={paso.nombre} onChange={(v) => dispatch({ type: "RENAME_PASO", id: paso.id, nombre: v })} className={`text-sm ${done ? "text-muted line-through" : "text-foreground"}`} />
        }
        {isEmpresa && <ResponsableBadge nombre={entResponsable} />}
        {paso.inicioTs && (
          <span className="text-xs text-muted">
            {new Date(paso.inicioTs).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          </span>
        )}
        <NotasIcon count={notasCount} onClick={() => setShowNotas(!showNotas)} />
        <button onClick={() => setShowDetail(!showDetail)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted opacity-40 hover:bg-surface-hover hover:text-foreground sm:opacity-0 group-hover/row:opacity-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /><circle cx="5" cy="12" r="1.5" />
          </svg>
        </button>
        {!isMentor && <DeleteBtn onDelete={() => dispatch({ type: "DELETE_PASO", id: paso.id })} />}
      </div>

      {showNotas && (
        <div className="ml-12 mt-1 mb-2">
          <NotasSection notas={paso.notas ?? []} nivel="paso" targetId={paso.id} />
        </div>
      )}

      {showDetail && (
        <div className="ml-12 mt-1 rounded-xl bg-surface p-4 text-sm text-muted">
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

function SOPPasoRow({ sop, paso, index }: { sop: PlantillaProceso; paso: PlantillaProceso["pasos"][number]; index: number }) {
  const dispatch = useAppDispatch();
  const [confirmDel, setConfirmDel] = useState(false);

  function updatePaso(changes: Partial<PlantillaProceso["pasos"][number]>) {
    dispatch({ type: "UPDATE_PASO_PLANTILLA", plantillaId: sop.id, pasoId: paso.id, changes });
  }

  function removePaso() {
    dispatch({ type: "DELETE_PASO_PLANTILLA", plantillaId: sop.id, pasoId: paso.id });
  }

  return (
    <div>
      <div className="group/row flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-surface">
        <span className="w-6 shrink-0 text-right text-xs font-medium text-muted">{index + 1}.</span>
        <EditableText value={paso.nombre} onChange={(v) => updatePaso({ nombre: v })} className="flex-1 text-sm text-foreground" />
        <DurationInput value={paso.minutosEstimados} onChange={(v) => updatePaso({ minutosEstimados: v })} />
        <DeleteBtn onDelete={() => setConfirmDel(true)} />
      </div>
      {confirmDel && (
        <ConfirmDelete label={paso.nombre} onConfirm={() => { removePaso(); setConfirmDel(false); }} onCancel={() => setConfirmDel(false)} />
      )}
    </div>
  );
}

function DurationInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = useCallback(() => {
    const n = parseInt(draft, 10);
    onChange(isNaN(n) || n <= 0 ? null : n);
    setEditing(false);
  }, [draft, onChange]);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input ref={ref} type="number" min="1" value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-14 rounded-md border-2 border-accent bg-background px-2 py-1 text-xs text-foreground outline-none" />
        <span className="text-xs text-muted">min</span>
      </div>
    );
  }

  return (
    <button onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
      className="flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-xs text-muted opacity-40 transition-all hover:bg-surface-hover hover:text-foreground sm:opacity-0 group-hover/row:opacity-100"
      title="Editar duración">
      {value ? <>{value}min</> : <>+min</>}
    </button>
  );
}

function SOPBlock({ sop, index, total }: { sop: PlantillaProceso; index: number; total: number }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [justCreated, setJustCreated] = useState(false);
  const justCreatedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const customDateRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => clearTimeout(justCreatedTimer.current), []);

  function scheduleSOPDate(period: string) {
    const now = new Date();
    let target: Date;
    if (period === "hoy") {
      target = now;
    } else if (period === "semana") {
      const day = now.getDay() || 7;
      target = new Date(now);
      target.setDate(now.getDate() - day + 1);
    } else if (period === "mes") {
      target = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "trimestre") {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      target = new Date(now.getFullYear(), qMonth, 1);
    } else if (period === "anio") {
      target = new Date(now.getFullYear(), 0, 1);
    } else {
      createSOPEntregable(period);
      return;
    }
    const dateStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
    createSOPEntregable(dateStr);
  }

  function createSOPEntregable(fechaInicio: string) {
    let resultadoId: string | null = null;
    if (sop.proyectoId) {
      const existingRes = state.resultados.find((r) => r.proyectoId === sop.proyectoId);
      if (existingRes) {
        resultadoId = existingRes.id;
      } else {
        const newResId = generateId();
        dispatch({ type: "ADD_RESULTADO", payload: { id: newResId, nombre: "Procesos", descripcion: null, proyectoId: sop.proyectoId!, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null } });
        resultadoId = newResId;
      }
    } else {
      const firstProj = state.proyectos.find((p) => p.area === sop.area);
      if (firstProj) {
        const existingRes = state.resultados.find((r) => r.proyectoId === firstProj.id);
        if (existingRes) {
          resultadoId = existingRes.id;
        } else {
          const newResId = generateId();
          dispatch({ type: "ADD_RESULTADO", payload: { id: newResId, nombre: "Procesos", descripcion: null, proyectoId: firstProj.id, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null } });
          resultadoId = newResId;
        }
      }
    }
    if (!resultadoId) return;

    dispatch({ type: "ADD_ENTREGABLE", payload: {
      id: generateId(),
      nombre: sop.nombre,
      resultadoId,
      tipo: "sop" as const,
      plantillaId: sop.id,
      diasEstimados: sop.pasos.length,
      diasHechos: 0,
      esDiaria: false,
      responsable: sop.responsableDefault,
      estado: "en_proceso" as const,
      creado: new Date().toISOString(),
      semana: null,
      fechaLimite: null,
      fechaInicio: fechaInicio,
    }});
    setShowDatePicker(false);
    setJustCreated(true);
    clearTimeout(justCreatedTimer.current);
    justCreatedTimer.current = setTimeout(() => setJustCreated(false), 2500);
  }

  return (
    <div className="rounded-xl border bg-background" style={{ borderColor: (AREA_COLORS[sop.area]?.hex ?? "#888") + "40" }}>
      <ToggleRow open={open} onToggle={() => setOpen(!open)}>
        <MoveArrows canUp={index > 0} canDown={index < total - 1}
          onUp={() => dispatch({ type: "REORDER_PLANTILLA", id: sop.id, direction: "up" })}
          onDown={() => dispatch({ type: "REORDER_PLANTILLA", id: sop.id, direction: "down" })} />
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: AREA_COLORS[sop.area]?.hex ?? "#888" }} />
        <EditableText value={sop.nombre} onChange={(v) => dispatch({ type: "UPDATE_PLANTILLA", id: sop.id, changes: { nombre: v } })}
          className="text-base font-medium text-foreground" />
        <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: (AREA_COLORS[sop.area]?.hex ?? "#888") + "15", color: AREA_COLORS[sop.area]?.hex ?? "#888" }}>SOP · {sop.pasos.length}p</span>
        {justCreated && (
          <span className="animate-pulse rounded-md bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">Entregable creado</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setShowDatePicker(!showDatePicker); }}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted opacity-60 transition-all hover:bg-accent-soft hover:text-accent hover:opacity-100"
          title="Programar SOP"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
        <DeleteBtn onDelete={() => setConfirm(true)} />
      </ToggleRow>

      {confirm && <ConfirmDelete label={sop.nombre}
        onConfirm={() => { dispatch({ type: "DELETE_PLANTILLA", id: sop.id }); setConfirm(false); }}
        onCancel={() => setConfirm(false)} />}

      {showDatePicker && (
        <div className="ml-12 mb-2 flex flex-wrap items-center gap-2 px-3">
          {[
            { id: "hoy", label: "Hoy" },
            { id: "semana", label: "Esta semana" },
            { id: "mes", label: "Este mes" },
            { id: "trimestre", label: "Este trimestre" },
            { id: "anio", label: "Este año" },
          ].map((p) => (
            <button key={p.id} onClick={() => scheduleSOPDate(p.id)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:bg-accent-soft">
              {p.label}
            </button>
          ))}
          <button onClick={() => customDateRef.current?.showPicker()}
            className="rounded-lg border border-accent/50 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20">
            Elegir fecha...
          </button>
          <input ref={customDateRef} type="date" onChange={(e) => e.target.value && scheduleSOPDate(e.target.value)}
            className="sr-only" tabIndex={-1} aria-hidden="true" />
          <button onClick={() => setShowDatePicker(false)}
            className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground">
            Cancelar
          </button>
        </div>
      )}

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
          <div className="space-y-1">
            {sop.pasos.map((p, i) => (
              <SOPPasoRow key={p.id} sop={sop} paso={p} index={i} />
            ))}
          </div>
          <AddButton label="Paso" onAdd={(nombre) => {
            dispatch({ type: "ADD_PASO_PLANTILLA", plantillaId: sop.id, paso: { id: generateId(), orden: sop.pasos.length + 1, nombre, descripcion: "", herramientas: [], tipo: "accion" as const, minutosEstimados: null } });
          }} />
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

function ResponsableBadge({ nombre }: { nombre?: string }) {
  if (!nombre) return null;
  return (
    <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-muted" title="Responsable">
      {nombre}
    </span>
  );
}

export function NotasSection({ notas, nivel, targetId }: { notas: Nota[]; nivel: "paso" | "entregable" | "resultado" | "proyecto"; targetId: string }) {
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const [draft, setDraft] = useState("");
  const [showForm, setShowForm] = useState(false);

  function addNota() {
    const t = draft.trim();
    if (!t) return;
    dispatch({ type: "ADD_NOTA", nivel, targetId, nota: { id: generateId(), texto: t, autor: currentUser, creadoTs: new Date().toISOString() } });
    setDraft("");
    setShowForm(false);
  }

  return (
    <div className="mt-2 space-y-1.5">
      {notas.map((n) => (
        <div key={n.id} className="flex items-start gap-2 rounded-lg bg-surface/50 px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground whitespace-pre-wrap">{n.texto}</p>
            <p className="mt-0.5 text-[10px] text-muted">
              {n.autor} · {new Date(n.creadoTs).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <button onClick={() => dispatch({ type: "DELETE_NOTA", nivel, targetId, notaId: n.id })}
            className="shrink-0 text-muted opacity-40 hover:text-red-500 hover:opacity-100" title="Borrar nota">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      ))}
      {showForm ? (
        <div className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escribe una nota..."
            onKeyDown={(e) => { if (e.key === "Enter") addNota(); if (e.key === "Escape") setShowForm(false); }}
            autoFocus className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-accent" />
          <button onClick={addNota} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90">Añadir</button>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-[11px] text-muted hover:text-accent">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Añadir nota
        </button>
      )}
    </div>
  );
}

function NotasIcon({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs transition-all hover:bg-accent-soft ${count > 0 ? "text-accent" : "text-muted opacity-50 hover:opacity-100"}`}
      title={`${count} nota(s)`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      {count > 0 && <span className="font-medium">{count}</span>}
    </button>
  );
}
