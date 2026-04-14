"use client";

import { useState, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import type { PlantillaProceso, PasoPlantilla, Programacion, Resultado, Entregable, AreaEmpresa } from "@/lib/types";
import { AREAS_EMPRESA, AREA_COLORS } from "@/lib/types";
import { parseMarkdownProcesos } from "@/lib/parse-procesos";
import { generateId } from "@/lib/store";
import { useUsuario } from "@/lib/usuario";
import { getISOWeek } from "@/lib/utils";
import { minutosEfectivos } from "@/lib/duration";
import { progLabel } from "@/lib/sop-scheduler";
import { downloadPDF } from "@/lib/export-sop";
import { ModalConfirm } from "./ModalConfirm";
import ProgramacionPicker from "./shared/ProgramacionPicker";

/* ---- Constantes visuales ---- */

const TIPO_ICON: Record<PasoPlantilla["tipo"], { bg: string; icon: string }> = {
  accion: { bg: "bg-zinc-100 text-zinc-500", icon: "→" },
  condicional: { bg: "bg-blue-50 text-blue-500", icon: "?" },
  advertencia: { bg: "bg-red-50 text-red-500", icon: "!" },
  nota: { bg: "bg-amber-50 text-amber-500", icon: "i" },
};

const TOOL_COLORS: Record<string, string> = {
  Pipe: "bg-emerald-100 text-emerald-700", TOTÓ: "bg-purple-100 text-purple-700",
  ChatGPT: "bg-purple-100 text-purple-700", TFK: "bg-sky-100 text-sky-700",
  Notion: "bg-zinc-800 text-white", Jotform: "bg-orange-100 text-orange-700",
  Excel: "bg-green-100 text-green-700", "Super.so": "bg-pink-100 text-pink-700",
  Slack: "bg-fuchsia-100 text-fuchsia-700", WhatsApp: "bg-lime-100 text-lime-700",
  Motor: "bg-cyan-100 text-cyan-700", Flaticon: "bg-teal-100 text-teal-700",
  PDF: "bg-red-100 text-red-700",
};

type SubVista = "lista" | "nuevo" | "importar" | "convertir" | "detalle" | "editar";

/* ---- Helpers ---- */

function tiempoTotal(pasos: PasoPlantilla[]): number | null {
  const tiempos = pasos.map((p) => p.minutosEstimados).filter((t): t is number => t !== null);
  return tiempos.length > 0 ? tiempos.reduce((a, b) => a + b, 0) : null;
}

function formatTiempo(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/* ============================================================
   Vista principal: lista de procesos
   ============================================================ */

interface Props { onBack: () => void }

export function VistaProcesos({ onBack }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const [sub, setSub] = useState<SubVista>("lista");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PlantillaProceso | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search.trim()) return state.plantillas;
    const q = search.toLowerCase();
    return state.plantillas.filter(
      (p) => p.nombre.toLowerCase().includes(q) ||
        p.responsableDefault.toLowerCase().includes(q) ||
        (p.area && p.area.toLowerCase().includes(q)) ||
        p.herramientas.some((h) => h.toLowerCase().includes(q)) ||
        p.pasos.some((s) => s.nombre.toLowerCase().includes(q)),
    );
  }, [state.plantillas, search]);

  const [menuOpen, setMenuOpen] = useState(false);

  // Group by responsible, each SOP gets area badge
  const grouped = useMemo(() => {
    const respMap = new Map<string, PlantillaProceso[]>();
    for (const s of filtered) {
      if (!respMap.has(s.responsableDefault)) respMap.set(s.responsableDefault, []);
      respMap.get(s.responsableDefault)!.push(s);
    }
    return Array.from(respMap.entries()).map(([resp, sops]) => ({ resp, sops }));
  }, [filtered]);

  const selected = useMemo(
    () => state.plantillas.find((p) => p.id === selectedId) ?? null,
    [state.plantillas, selectedId],
  );

  function openDetalle(id: string) { setSelectedId(id); setSub("detalle"); }
  function openEditar(id: string) { setSelectedId(id); setSub("editar"); }
  function backToList() { setSub("lista"); setSelectedId(null); }

  function confirmDelete() {
    if (!deleteTarget) return;
    dispatch({ type: "DELETE_PLANTILLA", id: deleteTarget.id });
    setDeleteTarget(null);
    setChecked((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
    if (selectedId === deleteTarget.id) backToList();
  }

  function toggleCheck(id: string) {
    setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleCheckAll() {
    if (checked.size === filtered.length) setChecked(new Set());
    else setChecked(new Set(filtered.map((p) => p.id)));
  }

  function downloadSelected() {
    const sops = state.plantillas.filter((p) => checked.has(p.id));
    if (sops.length === 0) return;
    downloadPDF(sops, `SOPs-seleccion-${sops.length}.pdf`);
  }

  if (sub === "nuevo") return <CrearSOP onBack={backToList} />;
  if (sub === "importar") return <ImportarMarkdown onBack={backToList} />;
  if (sub === "convertir") return <ConvertirEntregable onBack={backToList} />;
  if (sub === "detalle" && selected) {
    return <SOPDetalle plantilla={selected} allPlantillas={state.plantillas}
      onBack={backToList} onEdit={() => openEditar(selected.id)}
      onDelete={() => setDeleteTarget(selected)} />;
  }
  if (sub === "editar" && selected) {
    return <EditarSOP plantilla={selected} onBack={() => openDetalle(selected.id)} />;
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      {/* Header + toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-zinc-900">Procesos</h1>
          <p className="text-xs text-zinc-400">{state.plantillas.length} SOPs</p>
        </div>

        {/* Toolbar icons */}
        <button onClick={toggleCheckAll} title={checked.size === filtered.length ? "Deseleccionar" : "Seleccionar todos"}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="M14 7h7"/><rect x="3" y="13" width="6" height="6" rx="1"/><path d="M14 15h7"/></svg>
        </button>
        <button onClick={() => downloadPDF(state.plantillas)} title="PDF de todos"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>

        {/* Menu dropdown */}
        <div className="relative">
          <button onClick={() => setMenuOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="5.01"/><line x1="12" y1="12" x2="12" y2="12.01"/><line x1="12" y1="19" x2="12" y2="19.01"/></svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                <button onClick={() => { setSub("nuevo"); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-zinc-700 hover:bg-zinc-50">
                  <span className="text-base">+</span> Crear SOP
                </button>
                <button onClick={() => { setSub("importar"); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-zinc-700 hover:bg-zinc-50">
                  <span className="text-base">↓</span> Importar markdown
                </button>
                <button onClick={() => { setSub("convertir"); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-zinc-700 hover:bg-zinc-50">
                  <span className="text-base">↻</span> Desde entregable
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {state.plantillas.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="max-w-sm text-center">
            <p className="text-lg font-semibold text-zinc-700 mb-1">Lo que no está documentado, no existe</p>
            <p className="text-sm text-zinc-400 mb-6">Crea tu primer procedimiento operativo estándar</p>
            <button onClick={() => setSub("nuevo")} className="w-full rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800">Crear SOP</button>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar proceso, responsable, herramienta, área..."
            className="mb-4 w-full rounded-lg border border-zinc-200 px-4 py-2.5 text-sm placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none" />

          {/* Selection bar */}
          {checked.size > 0 && (
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-zinc-200 px-4 py-2">
              <span className="text-xs font-medium text-zinc-600">{checked.size} seleccionados</span>
              <div className="flex-1" />
              <button onClick={downloadSelected}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-zinc-800">
                Descargar PDF
              </button>
              <button onClick={() => setChecked(new Set())}
                className="rounded-md px-2 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-600">
                Limpiar
              </button>
            </div>
          )}

          {/* Grouped by responsible */}
          <div className="flex-1 space-y-5 overflow-y-auto">
            {grouped.map(({ resp, sops }) => (
              <section key={resp}>
                <p className="mb-2 text-xs font-semibold text-zinc-500">{resp}</p>
                <div className="space-y-px">
                  {sops.map((p) => {
                    const t = tiempoTotal(p.pasos);
                    const isChecked = checked.has(p.id);
                    const ac = AREA_COLORS[p.area] ?? AREA_COLORS.operativa;
                    return (
                      <div key={p.id} className="group flex items-center gap-0">
                        <label className="flex h-9 w-9 shrink-0 items-center justify-center cursor-pointer"
                          onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(p.id)}
                            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-700 focus:ring-0" />
                        </label>
                        <button onClick={() => openDetalle(p.id)}
                          className="flex flex-1 min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-zinc-50">
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${ac.bg} ${ac.text}`}>
                            {p.area.charAt(0).toUpperCase()}
                          </span>
                          <p className="flex-1 min-w-0 text-[13px] font-medium text-zinc-800 truncate">{p.nombre}</p>
                          <span className="shrink-0 text-[10px] text-zinc-300">{p.pasos.length}p</span>
                          {t !== null && <span className="shrink-0 text-[10px] text-zinc-300">{formatTiempo(t)}</span>}
                          {p.programacion && (
                            <span className={`shrink-0 text-[10px] ${ac.text}`}>{progLabel(p.programacion)}</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {deleteTarget && (
            <ModalConfirm titulo={`Eliminar "${deleteTarget.nombre}"`} mensaje="Se eliminará este SOP."
              onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   Crear SOP desde cero — Formulario con los 7 campos
   ============================================================ */

function CrearSOP({ onBack }: { onBack: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();

  const [nombre, setNombre] = useState("");
  const [area, setArea] = useState<AreaEmpresa>("operativa");
  const [objetivo, setObjetivo] = useState("");
  const [responsable, setResponsable] = useState(currentUser);
  const [disparador, setDisparador] = useState("");
  const [programacion, setProgramacion] = useState<Programacion | null>(null);
  const [proyectoId, setProyectoId] = useState("");
  const [excepciones, setExcepciones] = useState("");
  const [herramientas, setHerramientas] = useState("");
  const [pasos, setPasos] = useState<{ nombre: string; tipo: PasoPlantilla["tipo"]; min: string }[]>([]);
  const [newPaso, setNewPaso] = useState("");

  function addPaso() {
    const t = newPaso.trim();
    if (!t) return;
    setPasos((prev) => [...prev, { nombre: t, tipo: "accion", min: "" }]);
    setNewPaso("");
  }

  function removePaso(idx: number) { setPasos((prev) => prev.filter((_, i) => i !== idx)); }

  function movePaso(idx: number, dir: -1 | 1) {
    setPasos((prev) => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  }

  function updatePaso(idx: number, changes: Partial<(typeof pasos)[0]>) {
    setPasos((prev) => prev.map((p, i) => i === idx ? { ...p, ...changes } : p));
  }

  function guardar() {
    if (!nombre.trim() || pasos.length === 0) return;
    const herr = herramientas.split(",").map((h) => h.trim()).filter(Boolean);
    const plantilla: PlantillaProceso = {
      id: generateId(),
      nombre: nombre.trim(),
      area,
      objetivo: objetivo.trim(),
      disparador: disparador.trim(),
      programacion,
      proyectoId: proyectoId || null,
      responsableDefault: responsable,
      pasos: pasos.map((p, i) => ({
        id: generateId(), orden: i + 1, nombre: p.nombre, descripcion: "",
        herramientas: [], tipo: p.tipo,
        minutosEstimados: p.min ? parseInt(p.min) || null : null,
      })),
      herramientas: herr,
      excepciones: excepciones.trim(),
      dependeDeIds: [],
      creado: new Date().toISOString(),
    };
    dispatch({ type: "ADD_PLANTILLA", payload: plantilla });
    onBack();
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        Procesos
      </button>
      <h2 className="mb-5 text-xl font-bold text-zinc-900">Nuevo SOP</h2>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {/* 1. Nombre */}
        <Field label="1. Nombre del proceso" required>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
            placeholder="Ej: Cierre de Facturación Mensual" className={INPUT_CLASS} />
        </Field>

        {/* 2. Área */}
        <Field label="2. Área">
          <select value={area} onChange={(e) => setArea(e.target.value as AreaEmpresa)} className={INPUT_CLASS}>
            {AREAS_EMPRESA.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </Field>

        {/* 3. Objetivo */}
        <Field label="3. Objetivo" hint="¿Para qué se hace esto?">
          <textarea value={objetivo} onChange={(e) => setObjetivo(e.target.value)} rows={2}
            placeholder="Ej: Asegurar que todos los tratamientos del mes han sido cobrados y registrados"
            className={INPUT_CLASS + " resize-none"} />
        </Field>

        {/* 4. Responsable */}
        <div className="flex gap-3">
          <Field label="4. Responsable" className="flex-1">
            <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={INPUT_CLASS}>
              {state.miembros.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
            </select>
          </Field>
          <Field label="Proyecto" hint="Opcional" className="flex-1">
            <select value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className={INPUT_CLASS}>
              <option value="">Sin proyecto</option>
              {state.proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Field>
        </div>

        {/* 4. Disparador / Frecuencia */}
        <Field label="4. Disparador / Frecuencia" hint="¿Cuándo se hace?">
          <ProgramacionPicker value={programacion} onChange={setProgramacion} />
          <input type="text" value={disparador} onChange={(e) => setDisparador(e.target.value)}
            placeholder="Detalle adicional: Todos los viernes a las 12:00h" className={INPUT_CLASS + " mt-2"} />
        </Field>

        {/* 5. Herramientas */}
        <Field label="5. Herramientas necesarias" hint="Separadas por coma">
          <input type="text" value={herramientas} onChange={(e) => setHerramientas(e.target.value)}
            placeholder="Ej: Excel, CRM, Portal del Banco" className={INPUT_CLASS} />
        </Field>

        {/* 6. Checklist paso a paso */}
        <Field label={`6. Checklist paso a paso (${pasos.length})`} hint="Verbos en infinitivo">
          <div className="space-y-1">
            {pasos.map((p, idx) => (
              <div key={idx} className="flex items-center gap-1 rounded-lg border border-zinc-100 bg-white px-2 py-1.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-100 text-[10px] font-bold text-zinc-500">{idx + 1}</span>
                <p className="flex-1 text-xs text-zinc-700 truncate">{p.nombre}</p>
                <input type="number" value={p.min} onChange={(e) => updatePaso(idx, { min: e.target.value })}
                  placeholder="min" title="Minutos estimados"
                  className="w-12 rounded border border-zinc-100 bg-zinc-50 px-1 py-0.5 text-center text-[9px] text-zinc-500 focus:outline-none" />
                <select value={p.tipo} onChange={(e) => updatePaso(idx, { tipo: e.target.value as PasoPlantilla["tipo"] })}
                  className="rounded border border-zinc-100 bg-zinc-50 px-1 py-0.5 text-[9px] text-zinc-500 focus:outline-none">
                  <option value="accion">Acción</option>
                  <option value="condicional">Si...</option>
                  <option value="advertencia">¡Atención!</option>
                  <option value="nota">Nota</option>
                </select>
                <button onClick={() => movePaso(idx, -1)} disabled={idx === 0} className="p-0.5 text-zinc-300 hover:text-zinc-500 disabled:opacity-30">↑</button>
                <button onClick={() => movePaso(idx, 1)} disabled={idx === pasos.length - 1} className="p-0.5 text-zinc-300 hover:text-zinc-500 disabled:opacity-30">↓</button>
                <button onClick={() => removePaso(idx)} className="p-0.5 text-zinc-300 hover:text-red-500">✕</button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input type="text" value={newPaso} onChange={(e) => setNewPaso(e.target.value)} placeholder="Ej: Descargar extracto bancario"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPaso(); } }}
              className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs focus:border-amber-400 focus:outline-none" />
            <button onClick={addPaso} disabled={!newPaso.trim()}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-30">+</button>
          </div>
        </Field>

        {/* 7. Manejo de excepciones */}
        <Field label="7. Manejo de excepciones" hint="¿Qué pasa si algo sale mal?">
          <textarea value={excepciones} onChange={(e) => setExcepciones(e.target.value)} rows={2}
            placeholder="Ej: Si un paciente debe más de 30 días, pasar al proceso de Recobros"
            className={INPUT_CLASS + " resize-none"} />
        </Field>
      </div>

      <button onClick={guardar} disabled={!nombre.trim() || pasos.length === 0}
        className="mt-5 w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40">
        Crear SOP
      </button>
    </div>
  );
}

/* ============================================================
   Vista detalle SOP — Ficha completa
   ============================================================ */

function SOPDetalle({ plantilla, allPlantillas, onBack, onEdit, onDelete }: {
  plantilla: PlantillaProceso; allPlantillas: PlantillaProceso[];
  onBack: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [showCrear, setShowCrear] = useState(false);
  const [crearProyectoId, setCrearProyectoId] = useState("");
  const [crearResultadoId, setCrearResultadoId] = useState("");
  const [crearMode, setCrearMode] = useState<"entregable" | "resultado">("entregable");

  const dependencias = useMemo(
    () => plantilla.dependeDeIds.map((id) => allPlantillas.find((p) => p.id === id)).filter(Boolean) as PlantillaProceso[],
    [plantilla, allPlantillas],
  );
  const dependientes = useMemo(
    () => allPlantillas.filter((p) => p.dependeDeIds.includes(plantilla.id)),
    [plantilla, allPlantillas],
  );
  const t = tiempoTotal(plantilla.pasos);

  const resultadosDelProyecto = useMemo(
    () => crearProyectoId ? state.resultados.filter((r) => r.proyectoId === crearProyectoId) : [],
    [state.resultados, crearProyectoId],
  );

  function crearDesdeSOPEntregable() {
    if (!crearResultadoId) return;
    const week = getISOWeek();
    const res = state.resultados.find((r) => r.id === crearResultadoId);
    if (res && !res.semana) {
      dispatch({ type: "UPDATE_RESULTADO", id: crearResultadoId, changes: { semana: week } });
    }
    const entId = generateId();
    const entregable: Entregable = {
      id: entId, nombre: plantilla.nombre, resultadoId: crearResultadoId,
      tipo: "sop", plantillaId: plantilla.id,
      diasEstimados: plantilla.pasos.length, diasHechos: 0,
      esDiaria: false, responsable: plantilla.responsableDefault,
      estado: "a_futuro", creado: new Date().toISOString(),
      semana: null, fechaLimite: null, fechaInicio: null,
    };
    dispatch({ type: "ADD_ENTREGABLE", payload: entregable });
    setShowCrear(false);
  }

  function crearDesdeSOPResultado() {
    if (!crearProyectoId) return;
    const week = getISOWeek();
    const resId = generateId();
    const resultado: Resultado = {
      id: resId, nombre: plantilla.nombre, descripcion: null, proyectoId: crearProyectoId,
      creado: new Date().toISOString(), semana: week,
      fechaLimite: null, fechaInicio: null,
      diasEstimados: null,
    };
    dispatch({ type: "ADD_RESULTADO", payload: resultado });

    const entId = generateId();
    const entregable: Entregable = {
      id: entId, nombre: plantilla.nombre, resultadoId: resId,
      tipo: "sop", plantillaId: plantilla.id,
      diasEstimados: plantilla.pasos.length, diasHechos: 0,
      esDiaria: false, responsable: plantilla.responsableDefault,
      estado: "a_futuro", creado: new Date().toISOString(),
      semana: null, fechaLimite: null, fechaInicio: null,
    };
    dispatch({ type: "ADD_ENTREGABLE", payload: entregable });
    setShowCrear(false);
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          Procesos
        </button>
        <div className="flex gap-1">
          <button onClick={() => downloadPDF([plantilla], `SOP-${plantilla.nombre.replace(/\s+/g, "-")}.pdf`)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-purple-50 hover:text-purple-600" title="Descargar PDF">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </button>
          <button onClick={() => setShowCrear(!showCrear)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-green-50 hover:text-green-600" title="Crear tarea desde SOP">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
          </button>
          <button onClick={onEdit} className="rounded-lg p-1.5 text-zinc-400 hover:bg-amber-50 hover:text-amber-600" title="Editar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </button>
          <button onClick={onDelete} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500" title="Eliminar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        </div>
      </div>

      {/* Panel crear tarea desde SOP */}
      {showCrear && (
        <div className="mb-4 rounded-xl border-2 border-green-200 bg-green-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-green-800">Crear tarea desde este SOP</p>
          <div className="flex gap-2">
            <button onClick={() => setCrearMode("entregable")}
              className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium ${crearMode === "entregable" ? "bg-green-600 text-white" : "bg-white text-green-700 border border-green-200"}`}>
              Entregable
            </button>
            <button onClick={() => setCrearMode("resultado")}
              className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium ${crearMode === "resultado" ? "bg-green-600 text-white" : "bg-white text-green-700 border border-green-200"}`}>
              Resultado + Entregable
            </button>
          </div>
          <select value={crearProyectoId} onChange={(e) => { setCrearProyectoId(e.target.value); setCrearResultadoId(""); }}
            className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-xs focus:outline-none">
            <option value="">Selecciona proyecto...</option>
            {state.proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          {crearMode === "entregable" && crearProyectoId && (
            <select value={crearResultadoId} onChange={(e) => setCrearResultadoId(e.target.value)}
              className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-xs focus:outline-none">
              <option value="">Selecciona resultado...</option>
              {resultadosDelProyecto.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          )}
          <button
            onClick={crearMode === "entregable" ? crearDesdeSOPEntregable : crearDesdeSOPResultado}
            disabled={crearMode === "entregable" ? !crearResultadoId : !crearProyectoId}
            className="w-full rounded-lg bg-green-600 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40">
            {crearMode === "entregable" ? "Crear entregable" : "Crear resultado + entregable"}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-5">
        {/* Nombre */}
        <h2 className="text-xl font-bold text-zinc-900">{plantilla.nombre}</h2>

        {/* Objetivo */}
        {plantilla.objetivo && (
          <SOPSection icon="🎯" title="Objetivo">
            <p className="text-xs text-zinc-600 leading-relaxed">{plantilla.objetivo}</p>
          </SOPSection>
        )}

        {/* Meta: area + responsable + disparador + tiempo */}
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${(AREA_COLORS[plantilla.area] ?? AREA_COLORS.operativa).bg} ${(AREA_COLORS[plantilla.area] ?? AREA_COLORS.operativa).text}`}>
            {AREAS_EMPRESA.find((a) => a.id === plantilla.area)?.label ?? plantilla.area}
          </span>
          <SOPBadge icon="👤" label={plantilla.responsableDefault} />
          {plantilla.programacion && <SOPBadge icon="📅" label={progLabel(plantilla.programacion)} accent />}
          {plantilla.disparador && <SOPBadge icon="🔔" label={plantilla.disparador} />}
          {t !== null && <SOPBadge icon="⏱" label={formatTiempo(t)} />}
          <SOPBadge icon="📋" label={`${plantilla.pasos.length} pasos`} />
        </div>

        {/* Herramientas */}
        {plantilla.herramientas.length > 0 && (
          <SOPSection icon="🛠" title="Herramientas necesarias">
            <div className="flex flex-wrap gap-1.5">
              {plantilla.herramientas.map((h) => (
                <span key={h} className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${TOOL_COLORS[h] ?? "bg-zinc-100 text-zinc-600"}`}>{h}</span>
              ))}
            </div>
          </SOPSection>
        )}

        {/* Dependencias */}
        {(dependencias.length > 0 || dependientes.length > 0) && (
          <div className="rounded-xl border border-zinc-200 p-3 space-y-2">
            {dependencias.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Requiere completar primero</p>
                <div className="flex flex-wrap gap-1.5">
                  {dependencias.map((d) => <span key={d.id} className="rounded-lg bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] text-red-600">{d.nombre}</span>)}
                </div>
              </div>
            )}
            {dependientes.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Desbloquea</p>
                <div className="flex flex-wrap gap-1.5">
                  {dependientes.map((d) => <span key={d.id} className="rounded-lg bg-green-50 border border-green-200 px-2 py-0.5 text-[10px] text-green-600">{d.nombre}</span>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Checklist */}
        <SOPSection icon="✅" title="Checklist paso a paso">
          <div className="space-y-1">
            {plantilla.pasos.map((paso, idx) => {
              const style = TIPO_ICON[paso.tipo];
              return (
                <div key={paso.id} className={`flex items-start gap-2 rounded-lg p-2.5 ${
                  paso.tipo === "advertencia" ? "bg-red-50/50 border border-red-100" :
                  paso.tipo === "condicional" ? "bg-blue-50/50 border border-blue-100" :
                  paso.tipo === "nota" ? "bg-amber-50/50 border border-amber-100" : "hover:bg-zinc-50"
                }`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${style.bg}`}>
                    {paso.tipo === "accion" ? idx + 1 : style.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-relaxed ${
                      paso.tipo === "advertencia" ? "text-red-700 font-medium" :
                      paso.tipo === "condicional" ? "text-blue-700" :
                      paso.tipo === "nota" ? "text-amber-700 italic" : "text-zinc-700"
                    }`}>{paso.nombre}</p>
                    {paso.descripcion && <p className="mt-0.5 text-[10px] text-zinc-400 whitespace-pre-wrap">{paso.descripcion}</p>}
                    {paso.herramientas.length > 0 && (
                      <div className="mt-1 flex gap-1">
                        {paso.herramientas.map((h) => <span key={h} className={`rounded px-1 py-0.5 text-[8px] font-medium ${TOOL_COLORS[h] ?? "bg-zinc-100 text-zinc-500"}`}>{h}</span>)}
                      </div>
                    )}
                  </div>
                  {paso.minutosEstimados !== null && (
                    <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">
                      {paso.minutosEstimados}′
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </SOPSection>

        {/* Excepciones */}
        {plantilla.excepciones && (
          <SOPSection icon="⚠️" title="Manejo de excepciones">
            <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap">{plantilla.excepciones}</p>
          </SOPSection>
        )}
      </div>

      {/* Footer stats + download */}
      <div className="mt-4 border-t border-zinc-100 pt-3 flex items-center gap-4 text-[10px] text-zinc-400">
        <span>{plantilla.pasos.filter((p) => p.tipo === "accion").length} acciones</span>
        <span>{plantilla.pasos.filter((p) => p.tipo === "condicional").length} condicionales</span>
        <span>{plantilla.pasos.filter((p) => p.tipo === "advertencia").length} advertencias</span>
      </div>
    </div>
  );
}

/* ============================================================
   Editar SOP
   ============================================================ */

function EditarSOP({ plantilla, onBack }: { plantilla: PlantillaProceso; onBack: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const [nombre, setNombre] = useState(plantilla.nombre);
  const [area, setArea] = useState(plantilla.area);
  const [objetivo, setObjetivo] = useState(plantilla.objetivo);
  const [responsable, setResponsable] = useState(plantilla.responsableDefault);
  const [disparador, setDisparador] = useState(plantilla.disparador);
  const [programacion, setProgramacion] = useState<Programacion | null>(plantilla.programacion);
  const [herramientasTxt, setHerramientasTxt] = useState(plantilla.herramientas.join(", "));
  const [excepciones, setExcepciones] = useState(plantilla.excepciones);
  const [texto, setTexto] = useState(() => plantilla.pasos.map((p, i) => {
    const minSuffix = p.minutosEstimados !== null ? ` [${p.minutosEstimados}min]` : "";
    return `${i + 1}. ${p.nombre}${minSuffix}`;
  }).join("\n"));

  function guardar() {
    const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
    const pasos: PasoPlantilla[] = lineas.map((line, i) => {
      let clean = line.replace(/^\d+\.\s*/, "").replace(/^[-•]\s*/, "");
      let min: number | null = null;
      const minMatch = clean.match(/\[(\d+)\s*min\]\s*$/);
      if (minMatch) { min = parseInt(minMatch[1]); clean = clean.replace(/\s*\[\d+\s*min\]\s*$/, ""); }

      let tipo: PasoPlantilla["tipo"] = "accion";
      if (/^(si |en caso|cuando no|si no )/i.test(clean)) tipo = "condicional";
      else if (/\b(atenci[oó]n|importante|cuidado|ojo)\b/i.test(clean)) tipo = "advertencia";
      else if (/^(\(|nota:|tip:)/i.test(clean)) tipo = "nota";

      return { id: generateId(), orden: i + 1, nombre: clean, descripcion: "", herramientas: [], tipo, minutosEstimados: min };
    });

    const herr = herramientasTxt.split(",").map((h) => h.trim()).filter(Boolean);

    dispatch({
      type: "UPDATE_PLANTILLA", id: plantilla.id,
      changes: {
        nombre: nombre.trim() || plantilla.nombre,
        area,
        objetivo: objetivo.trim(),
        disparador: disparador.trim(),
        programacion,
        excepciones: excepciones.trim(),
        responsableDefault: responsable,
        pasos,
        herramientas: herr,
      },
    });
    onBack();
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        Volver al detalle
      </button>
      <h2 className="mb-4 text-xl font-bold text-zinc-900">Editar SOP</h2>

      <div className="flex-1 space-y-3 overflow-y-auto">
        <Field label="Nombre">
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT_CLASS} />
        </Field>
        <Field label="Área">
          <select value={area} onChange={(e) => setArea(e.target.value as AreaEmpresa)} className={INPUT_CLASS}>
            {AREAS_EMPRESA.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </Field>
        <Field label="Objetivo">
          <textarea value={objetivo} onChange={(e) => setObjetivo(e.target.value)} rows={2} className={INPUT_CLASS + " resize-none"} />
        </Field>
        <div className="flex gap-3">
          <Field label="Responsable" className="flex-1">
            <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={INPUT_CLASS}>
              {state.miembros.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
            </select>
          </Field>
          <Field label="Disparador" className="flex-1">
            <input type="text" value={disparador} onChange={(e) => setDisparador(e.target.value)} placeholder="Detalle..." className={INPUT_CLASS} />
          </Field>
        </div>
        <div>
          <Field label="Programación automática">
            <ProgramacionPicker value={programacion} onChange={setProgramacion} />
          </Field>
        </div>
        <Field label="Herramientas" hint="Separadas por coma">
          <input type="text" value={herramientasTxt} onChange={(e) => setHerramientasTxt(e.target.value)} className={INPUT_CLASS} />
        </Field>
        <Field label="Pasos" hint="Un paso por línea. Añade [Xmin] al final para tiempo estimado">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={12}
            className={INPUT_CLASS + " resize-none font-mono"} />
        </Field>
        <Field label="Excepciones">
          <textarea value={excepciones} onChange={(e) => setExcepciones(e.target.value)} rows={3} className={INPUT_CLASS + " resize-none"} />
        </Field>
      </div>

      <button onClick={guardar}
        className="mt-4 w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white hover:bg-amber-600">
        Guardar cambios
      </button>
    </div>
  );
}

/* ============================================================
   Importar Markdown
   ============================================================ */

function ImportarMarkdown({ onBack }: { onBack: () => void }) {
  const dispatch = useAppDispatch();
  const state = useAppState();
  const { nombre: currentUser } = useUsuario();
  const [text, setText] = useState("");
  const [responsable, setResponsable] = useState(currentUser);

  const preview = useMemo(() => text.trim() ? parseMarkdownProcesos(text, responsable) : [], [text, responsable]);

  function importar() {
    if (preview.length === 0) return;
    dispatch({ type: "IMPORT_PLANTILLAS", plantillas: preview });
    onBack();
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        Procesos
      </button>
      <h2 className="mb-2 text-xl font-bold text-zinc-900">Importar desde texto</h2>
      <p className="mb-4 text-xs text-zinc-400">
        Usa <code className="bg-zinc-100 px-1 rounded">###</code> para separar procesos y listas numeradas para los pasos.
      </p>

      <div className="flex gap-3 mb-3">
        <Field label="Responsable por defecto" className="flex-1">
          <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={INPUT_CLASS}>
            {state.miembros.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
          </select>
        </Field>
      </div>

      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10}
        placeholder={"### Cierre de Facturación Mensual\n1. Descargar extracto bancario\n2. Cruzar con CRM\n3. Marcar facturas pagadas"}
        className="w-full flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs placeholder:text-zinc-300 focus:border-amber-400 focus:outline-none" />

      {preview.length > 0 && (
        <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-semibold text-green-700 mb-1">{preview.length} {preview.length === 1 ? "proceso" : "procesos"}</p>
          {preview.map((p) => (
            <div key={p.id} className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-green-600">{p.pasos.length} pasos</span>
              <span className="text-xs text-green-800">{p.nombre}</span>
            </div>
          ))}
        </div>
      )}

      <button onClick={importar} disabled={preview.length === 0}
        className="mt-4 w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40">
        Importar {preview.length} {preview.length === 1 ? "proceso" : "procesos"}
      </button>
    </div>
  );
}

/* ============================================================
   Convertir Entregable en SOP
   ============================================================ */

function ConvertirEntregable({ onBack }: { onBack: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [selectedEntId, setSelectedEntId] = useState<string | null>(null);

  const entregablesConPasos = useMemo(() => {
    return state.entregables
      .map((e) => {
        const pasos = state.pasos.filter((p) => p.entregableId === e.id && p.finTs);
        const resultado = state.resultados.find((r) => r.id === e.resultadoId);
        const proyecto = resultado ? state.proyectos.find((p) => p.id === resultado.proyectoId) : null;
        return { entregable: e, pasos, resultado, proyecto };
      })
      .filter((x) => x.pasos.length > 0)
      .sort((a, b) => b.pasos.length - a.pasos.length);
  }, [state.entregables, state.pasos, state.resultados, state.proyectos]);

  function convertir(entId: string) {
    const item = entregablesConPasos.find((x) => x.entregable.id === entId);
    if (!item) return;

    const plantilla: PlantillaProceso = {
      id: generateId(),
      nombre: item.entregable.nombre,
      area: "operativa",
      objetivo: "",
      disparador: "",
      programacion: null,
      proyectoId: item.proyecto?.id ?? null,
      responsableDefault: item.entregable.responsable,
      pasos: item.pasos.map((p, i) => ({
        id: generateId(), orden: i + 1, nombre: p.nombre,
        descripcion: [
          p.contexto.notas,
          p.contexto.urls.map((u) => `${u.nombre}: ${u.url}`).join("\n"),
          p.implicados.length > 0 ? `Implicados: ${p.implicados.map((im) => im.nombre).join(", ")}` : "",
        ].filter(Boolean).join("\n"),
        herramientas: p.contexto.apps,
        tipo: "accion" as const,
        minutosEstimados: minutosEfectivos(p),
      })),
      herramientas: [...new Set(item.pasos.flatMap((p) => p.contexto.apps))],
      excepciones: "",
      dependeDeIds: [],
      creado: new Date().toISOString(),
    };
    dispatch({ type: "ADD_PLANTILLA", payload: plantilla });
    onBack();
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        Procesos
      </button>
      <h2 className="mb-2 text-xl font-bold text-zinc-900">Crear desde entregable</h2>
      <p className="mb-4 text-xs text-zinc-400">Los pasos completados se convierten en el checklist del SOP. El tiempo real se usa como estimación.</p>

      {entregablesConPasos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-zinc-400">No hay entregables con pasos completados.</p>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto">
          {entregablesConPasos.map(({ entregable, pasos, resultado, proyecto }) => (
            <div key={entregable.id}
              className={`rounded-xl border p-3 cursor-pointer transition-colors ${
                selectedEntId === entregable.id ? "border-amber-300 bg-amber-50" : "border-zinc-100 bg-white hover:border-zinc-200"
              }`}
              onClick={() => setSelectedEntId(selectedEntId === entregable.id ? null : entregable.id)}>
              <p className="text-sm font-semibold text-zinc-800">{entregable.nombre}</p>
              <p className="text-[10px] text-zinc-400">{proyecto?.nombre} → {resultado?.nombre} · {pasos.length} pasos</p>
              {selectedEntId === entregable.id && (
                <div className="mt-3 space-y-1 border-t border-zinc-100 pt-2">
                  {pasos.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-zinc-100 text-[9px] font-bold text-zinc-500">{i + 1}</span>
                      <p className="flex-1 text-[11px] text-zinc-600 truncate">{p.nombre}</p>
                      {p.finTs && p.inicioTs && (
                        <span className="text-[9px] text-zinc-400">
                          {minutosEfectivos(p) ?? 0}′
                        </span>
                      )}
                    </div>
                  ))}
                  <button onClick={(e) => { e.stopPropagation(); convertir(entregable.id); }}
                    className="mt-2 w-full rounded-lg bg-amber-500 py-2 text-xs font-medium text-white hover:bg-amber-600">
                    Convertir en SOP
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Componentes UI reutilizables
   ============================================================ */

const INPUT_CLASS = "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none";

function Field({ label, hint, required, className, children }: {
  label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 flex items-baseline gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</span>
        {required && <span className="text-[9px] text-red-400">*</span>}
        {hint && <span className="text-[9px] text-zinc-300">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function SOPSection({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">{icon}</span>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SOPBadge({ icon, label, accent }: { icon: string; label: string; accent?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
      accent ? "bg-purple-100 text-purple-700" : "bg-zinc-100 text-zinc-600"
    }`}>
      <span className="text-xs">{icon}</span>
      {label}
    </span>
  );
}

