"use client";

import { useState, useRef, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import {
  AREAS_PERSONAL,
  AREAS_EMPRESA,
  AREA_COLORS,
  type Area,
  type Entregable,
  type Proyecto,
  type Resultado,
} from "@/lib/types";

export type PickerDepth = "area" | "proyecto" | "resultado" | "entregable";

export interface HierarchySelection {
  areaId?: Area;
  proyectoId?: string;
  resultadoId?: string;
  entregableId?: string;
}

interface Props {
  depth: PickerDepth;
  /** Pre-select a starting area (skip ambito step) */
  initialArea?: Area;
  onSelect: (sel: HierarchySelection) => void;
  onCancel: () => void;
  /** Filter projects (e.g., exclude current project) */
  filterProyecto?: (p: Proyecto) => boolean;
  /** Filter results */
  filterResultado?: (r: Resultado) => boolean;
  /** Filter deliverables */
  filterEntregable?: (e: Entregable) => boolean;
  title?: string;
  /** Whether to render inside a modal overlay */
  modal?: boolean;
}

type Step = "ambito" | "area" | "proyecto" | "resultado" | "entregable";
type Ambito = "empresa" | "personal";

export default function HierarchyPicker({
  depth,
  initialArea,
  onSelect,
  onCancel,
  filterProyecto,
  filterResultado,
  filterEntregable,
  title,
  modal = true,
}: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const startStep: Step = initialArea ? (depth === "area" ? "area" : "proyecto") : "ambito";
  const [step, setStep] = useState<Step>(startStep);
  const [selectedAmbito, setSelectedAmbito] = useState<Ambito | null>(
    initialArea ? (AREAS_EMPRESA.some((a) => a.id === initialArea) ? "empresa" : "personal") : null
  );
  const [selectedArea, setSelectedArea] = useState<Area | null>(initialArea ?? null);
  const [selectedProyectoId, setSelectedProyectoId] = useState<string | null>(null);
  const [selectedResultadoId, setSelectedResultadoId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");

  const areas = selectedAmbito === "personal" ? AREAS_PERSONAL : AREAS_EMPRESA;
  const proyectos = state.proyectos
    .filter((p) => p.area === selectedArea)
    .filter((p) => !filterProyecto || filterProyecto(p));
  const resultados = state.resultados
    .filter((r) => r.proyectoId === selectedProyectoId)
    .filter((r) => !filterResultado || filterResultado(r));
  const entregables = state.entregables
    .filter((e) => e.resultadoId === selectedResultadoId)
    .filter((e) => !filterEntregable || filterEntregable(e));

  function resetCreate() { setShowCreate(false); setCreateName(""); }

  function selectAmbito(a: Ambito) { setSelectedAmbito(a); setStep("area"); resetCreate(); }
  function selectArea(a: Area) {
    setSelectedArea(a);
    if (depth === "area") { onSelect({ areaId: a }); return; }
    setStep("proyecto");
    resetCreate();
  }
  function selectProyecto(id: string) {
    setSelectedProyectoId(id);
    if (depth === "proyecto") { onSelect({ areaId: selectedArea!, proyectoId: id }); return; }
    setStep("resultado");
    resetCreate();
  }
  function selectResultado(id: string) {
    if (depth === "resultado") {
      onSelect({ areaId: selectedArea!, proyectoId: selectedProyectoId!, resultadoId: id });
      return;
    }
    setSelectedResultadoId(id);
    setStep("entregable");
    resetCreate();
  }
  function selectEntregable(id: string) {
    onSelect({
      areaId: selectedArea!,
      proyectoId: selectedProyectoId!,
      resultadoId: selectedResultadoId!,
      entregableId: id,
    });
  }

  function goBack() {
    resetCreate();
    if (step === "area") { setStep("ambito"); setSelectedAmbito(null); }
    else if (step === "proyecto") { if (initialArea) { onCancel(); } else { setStep("area"); setSelectedArea(null); } }
    else if (step === "resultado") { setStep("proyecto"); setSelectedProyectoId(null); }
    else if (step === "entregable") { setStep("resultado"); setSelectedResultadoId(null); }
  }

  function createInline() {
    const name = createName.trim();
    if (!name) return;
    if (step === "proyecto" && selectedArea) {
      const id = generateId();
      dispatch({ type: "ADD_PROYECTO", payload: { id, nombre: name, descripcion: null, area: selectedArea, creado: new Date().toISOString(), fechaInicio: null } });
      if (depth === "proyecto") { onSelect({ areaId: selectedArea, proyectoId: id }); return; }
      setSelectedProyectoId(id);
      setStep("resultado");
      resetCreate();
    } else if (step === "resultado" && selectedProyectoId) {
      const id = generateId();
      dispatch({ type: "ADD_RESULTADO", payload: { id, nombre: name, descripcion: null, proyectoId: selectedProyectoId, creado: new Date().toISOString(), semana: null, fechaLimite: null, fechaInicio: null, diasEstimados: null } });
      if (depth === "resultado") { onSelect({ areaId: selectedArea!, proyectoId: selectedProyectoId, resultadoId: id }); return; }
      setSelectedResultadoId(id);
      setStep("entregable");
      resetCreate();
    }
  }

  const canCreate = step === "proyecto" || step === "resultado";
  const createPlaceholder = step === "proyecto" ? "Nombre del nuevo proyecto..." : "Nombre del nuevo resultado...";

  const stepLabels: Record<Step, string> = {
    ambito: "Elige ámbito",
    area: "Elige área",
    proyecto: "Elige proyecto",
    resultado: "Elige resultado",
    entregable: "Elige entregable",
  };

  const backdropRef = useRef<HTMLDivElement>(null);
  useEffect(() => { backdropRef.current?.focus(); }, []);

  const content = (
    <div className={modal ? "w-full max-w-md rounded-2xl bg-background p-5 shadow-xl" : ""}>
      <div className="mb-3 flex items-center gap-3">
        {step !== startStep && (
          <button onClick={goBack} className="rounded-lg p-1 text-muted hover:bg-surface hover:text-foreground">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
        )}
        <h3 className="text-sm font-semibold text-foreground">{title ?? stepLabels[step]}</h3>
      </div>

      <div className="max-h-60 overflow-y-auto">
        {step === "ambito" && (
          <div className="space-y-2">
            <button onClick={() => selectAmbito("empresa")} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
              <span className="text-lg">🏢</span>
              <span className="text-sm font-medium text-foreground">{state.ambitoLabels.empresa}</span>
            </button>
            <button onClick={() => selectAmbito("personal")} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
              <span className="text-lg">👤</span>
              <span className="text-sm font-medium text-foreground">{state.ambitoLabels.personal}</span>
            </button>
          </div>
        )}

        {step === "area" && (
          <div className="space-y-1">
            {areas.map((a) => {
              const c = AREA_COLORS[a.id];
              return (
                <button key={a.id} onClick={() => selectArea(a.id)} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white ${c?.dot ?? ""}`}>{c?.initial}</span>
                  <span className="text-sm font-medium text-foreground">{a.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === "proyecto" && (
          <div className="space-y-1">
            {proyectos.length === 0 && !showCreate && <p className="px-4 py-3 text-xs text-muted">No hay proyectos en esta área</p>}
            {proyectos.map((p) => (
              <button key={p.id} onClick={() => selectProyecto(p.id)} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                <span className="text-sm font-medium text-foreground">{p.nombre}</span>
              </button>
            ))}
          </div>
        )}

        {step === "resultado" && (
          <div className="space-y-1">
            {resultados.length === 0 && !showCreate && <p className="px-4 py-3 text-xs text-muted">No hay resultados en este proyecto</p>}
            {resultados.map((r) => (
              <button key={r.id} onClick={() => selectResultado(r.id)} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                <span className="text-sm font-medium text-foreground">{r.nombre}</span>
              </button>
            ))}
          </div>
        )}

        {step === "entregable" && (
          <div className="space-y-1">
            {entregables.length === 0 && <p className="px-4 py-3 text-xs text-muted">No hay entregables en este resultado</p>}
            {entregables.map((e) => (
              <button key={e.id} onClick={() => selectEntregable(e.id)} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface">
                <span className="flex-1 text-sm font-medium text-foreground">{e.nombre}</span>
                {e.estado && <span className="shrink-0 text-[10px] text-muted">{e.estado}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {canCreate && (
        <div className="mt-3 border-t border-border pt-3">
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)}
              className="flex w-full items-center gap-2 rounded-lg px-4 py-2.5 text-left text-sm text-accent transition-colors hover:bg-accent/5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Crear nuevo
            </button>
          ) : (
            <div className="flex gap-2">
              <input value={createName} onChange={(e) => setCreateName(e.target.value)}
                placeholder={createPlaceholder}
                onKeyDown={(e) => { if (e.key === "Enter") createInline(); if (e.key === "Escape") resetCreate(); }}
                autoFocus className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent" />
              <button onClick={createInline} disabled={!createName.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent/90">
                Crear
              </button>
            </div>
          )}
        </div>
      )}

      <button onClick={onCancel} className="mt-3 w-full rounded-lg border border-border py-2 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
    </div>
  );

  if (!modal) return content;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
      role="dialog" aria-modal="true" tabIndex={-1} ref={backdropRef}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      {content}
    </div>
  );
}
