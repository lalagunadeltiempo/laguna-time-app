"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useArbol } from "@/lib/hooks";
import { generateId } from "@/lib/store";
import type { Contexto, Implicado, UrlRef, Paso } from "@/lib/types";
import { AREA_COLORS } from "@/lib/types";
import { Timer } from "./Timer";
import { CerrarPaso } from "./CerrarPaso";
import { NotasSection } from "./shared/NotasSection";
import { EditableText } from "./shared/EditableText";

interface CardProps {
  paso: Paso;
}

export function PasoActivoCard({ paso }: CardProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { entregable, resultado, proyecto } = useArbol(paso.entregableId);

  const pasosDelEntregable = state.pasos
    .filter((p) => p.entregableId === entregable?.id)
    .sort((a, b) => (a.inicioTs ?? "z").localeCompare(b.inicioTs ?? "z"));

  const plantilla = entregable?.plantillaId
    ? state.plantillas.find((pl) => pl.id === entregable.plantillaId)
    : null;

  const [expanded, setExpanded] = useState(false);
  const [showCerrar, setShowCerrar] = useState(false);
  const [showAddExterno, setShowAddExterno] = useState(false);
  const [externoNombre, setExternoNombre] = useState("");
  const [newContactoEmail, setNewContactoEmail] = useState("");
  const [newContactoTel, setNewContactoTel] = useState("");
  const [urlDraft, setUrlDraft] = useState<UrlRef>({ nombre: "", descripcion: "", url: "" });
  const [showAddPaso, setShowAddPaso] = useState(false);
  const [newPasoName, setNewPasoName] = useState("");
  const addPasoRef = useRef<HTMLInputElement>(null);
  const [showImplicados, setShowImplicados] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [editUrlIdx, setEditUrlIdx] = useState<number | null>(null);
  const [editUrlDraft, setEditUrlDraft] = useState<UrlRef>({ nombre: "", descripcion: "", url: "" });
  const cerrarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showCerrar && cerrarRef.current) {
      cerrarRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [showCerrar]);

  const areaColor = proyecto?.area ? AREA_COLORS[proyecto.area]?.hex : undefined;

  const updateContexto = useCallback(
    (contexto: Contexto) => {
      dispatch({ type: "UPDATE_PASO_CONTEXTO", id: paso.id, contexto });
    },
    [paso.id, dispatch],
  );

  const addUrl = useCallback(() => {
    if (!urlDraft.url.trim()) return;
    const newUrl: UrlRef = {
      nombre: urlDraft.nombre.trim() || urlDraft.url.trim(),
      descripcion: urlDraft.descripcion.trim(),
      url: urlDraft.url.trim(),
    };
    updateContexto({ ...paso.contexto, urls: [...paso.contexto.urls, newUrl] });
    setUrlDraft({ nombre: "", descripcion: "", url: "" });
  }, [paso.contexto, urlDraft, updateContexto]);

  const removeUrl = useCallback(
    (idx: number) => {
      setEditUrlIdx(null);
      updateContexto({
        ...paso.contexto,
        urls: paso.contexto.urls.filter((_, i) => i !== idx),
      });
    },
    [paso.contexto, updateContexto],
  );

  const saveEditUrl = useCallback(
    (idx: number) => {
      if (!editUrlDraft.url.trim()) return;
      const urls = [...paso.contexto.urls];
      urls[idx] = { nombre: editUrlDraft.nombre.trim() || editUrlDraft.url.trim(), descripcion: editUrlDraft.descripcion.trim(), url: editUrlDraft.url.trim() };
      updateContexto({ ...paso.contexto, urls });
      setEditUrlIdx(null);
    },
    [paso.contexto, editUrlDraft, updateContexto],
  );

  const toggleImplicado = useCallback(
    (nombre: string, tipo: "equipo" | "externo" = "equipo") => {
      const exists = paso.implicados.some((i) => i.tipo === tipo && i.nombre === nombre);
      const updated: Implicado[] = exists
        ? paso.implicados.filter((i) => !(i.tipo === tipo && i.nombre === nombre))
        : [...paso.implicados, { tipo, nombre }];
      dispatch({ type: "UPDATE_PASO_IMPLICADOS", id: paso.id, implicados: updated });
    },
    [paso, dispatch],
  );

  function addExterno() {
    if (!externoNombre.trim()) return;
    const nombre = externoNombre.trim();
    const yaExiste = state.contactos.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase());
    if (!yaExiste) {
      dispatch({
        type: "ADD_CONTACTO",
        payload: {
          id: generateId(),
          nombre,
          email: newContactoEmail.trim() || undefined,
          telefono: newContactoTel.trim() || undefined,
        },
      });
    }
    toggleImplicado(nombre, "externo");
    setExternoNombre("");
    setNewContactoEmail("");
    setNewContactoTel("");
    setShowAddExterno(false);
  }

  const externosConocidos = state.contactos
    .filter((c) => !paso.implicados.some((i) => i.tipo === "externo" && i.nombre === c.nombre))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const filteredExternos = externosConocidos.filter(
    (c) => !externoNombre.trim() || c.nombre.toLowerCase().includes(externoNombre.trim().toLowerCase()),
  );

  const exactMatch = state.contactos.some(
    (c) => c.nombre.toLowerCase() === externoNombre.trim().toLowerCase(),
  );

  if (!entregable) return null;

  const progreso = Math.min(100, (entregable.diasHechos / Math.max(1, entregable.diasEstimados)) * 100);
  const isPaused = paso.pausas.length > 0 && !paso.pausas[paso.pausas.length - 1].resumeTs;
  const toggleExpanded = () => setExpanded((e) => !e);
  const selectedImplicados = paso.implicados;
  const borderColor = areaColor ?? "#22c55e";

  function handleQuickClose() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const fechaProg = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    const updated: Paso = {
      ...paso,
      finTs: new Date().toISOString(),
      estado: paso.nombre,
      siguientePaso: {
        tipo: "continuar",
        nombre: entregable?.nombre || "Continuar",
        cuando: "manana",
        fechaProgramada: fechaProg,
        dependeDe: [],
      },
    };
    dispatch({ type: "CLOSE_PASO", payload: updated });
  }

  function handleDiscard() {
    dispatch({ type: "DISCARD_PASO", id: paso.id });
    setShowDiscard(false);
  }

  return (
    <>
      <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor }}>
        {/* Compact header */}
        <div className="flex w-full items-center gap-3 p-3" style={{ backgroundColor: `${borderColor}10` }}>
          <button type="button" onClick={toggleExpanded} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="relative flex h-3 w-3 shrink-0">
              {!isPaused && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: borderColor }} />
              )}
              <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: isPaused ? "#f59e0b" : borderColor }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">{entregable.nombre}</p>
              <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">{paso.nombre}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: isPaused ? "RESUME_PASO" : "PAUSE_PASO", id: paso.id });
            }}
            className="shrink-0 rounded-lg p-1.5 transition-colors"
            style={{ backgroundColor: isPaused ? `${borderColor}30` : "#fef3c7", color: isPaused ? borderColor : "#d97706" }}
            title={isPaused ? "Reanudar" : "Pausar"}
          >
            {isPaused ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            )}
          </button>
          {paso.inicioTs && <Timer startTime={paso.inicioTs} pausas={paso.pausas} compact />}
          <button type="button" onClick={toggleExpanded} className="shrink-0 text-zinc-400" aria-label={expanded ? "Contraer" : "Expandir"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t bg-white dark:bg-zinc-900 p-4 space-y-4" style={{ borderColor: `${borderColor}40` }}>
            {/* Breadcrumb */}
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {proyecto?.nombre && <><span className="text-zinc-500 dark:text-zinc-400 font-medium">{proyecto.nombre}</span> → </>}
              {resultado?.nombre && <><span className="text-zinc-400 dark:text-zinc-500">{resultado.nombre}</span> → </>}
              <span className="text-zinc-400 dark:text-zinc-500">{entregable.nombre}</span>
            </p>

            {/* Editable paso name */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">Nombre del paso</p>
              <EditableText
                value={paso.nombre}
                onChange={(v) => dispatch({ type: "RENAME_PASO", id: paso.id, nombre: v })}
                className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
              />
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${progreso}%`, backgroundColor: borderColor }} />
              </div>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{entregable.diasHechos}/{entregable.diasEstimados}</span>
            </div>

            {/* Steps of this entregable */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {plantilla ? `Checklist SOP (${plantilla.nombre})` : "Pasos de este entregable"}
              </p>
              {plantilla ? (
                <div className="space-y-0.5">
                  {plantilla.pasos.map((pp, idx) => {
                    const realPaso = pasosDelEntregable.find((rp) => rp.nombre === pp.nombre || rp.estado === pp.nombre);
                    const isCurrent = realPaso?.id === paso.id;
                    const isDone = realPaso?.finTs;
                    return (
                      <div key={pp.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${isCurrent ? "font-semibold" : ""}`}
                        style={isCurrent ? { backgroundColor: `${borderColor}20`, color: borderColor } : undefined}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold`}
                          style={isDone ? { backgroundColor: borderColor, color: "white" } : isCurrent ? { backgroundColor: `${borderColor}30`, color: borderColor } : { backgroundColor: "#f4f4f5", color: "#a1a1aa" }}>
                          {isDone ? "✓" : idx + 1}
                        </span>
                        <span className={isDone && !isCurrent ? "text-zinc-400 line-through" : isCurrent ? "" : "text-zinc-600 dark:text-zinc-400"}>
                          {pp.nombre}
                        </span>
                        {pp.minutosEstimados && <span className="ml-auto text-[10px] text-zinc-300 dark:text-zinc-600">{pp.minutosEstimados}min</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {pasosDelEntregable.map((p) => {
                    const isCurrent = p.id === paso.id;
                    const isEditable = !!p.finTs && !isCurrent;
                    return (
                      <div key={p.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${isCurrent ? "font-semibold" : ""}`}
                        style={isCurrent ? { backgroundColor: `${borderColor}20`, color: borderColor } : undefined}>
                        <span className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: p.finTs ? borderColor : isCurrent ? "#f59e0b" : "#e4e4e7" }} />
                        {isEditable ? (
                          <EditableText
                            value={p.nombre}
                            onChange={(v) => dispatch({ type: "RENAME_PASO", id: p.id, nombre: v })}
                            className="text-zinc-400 dark:text-zinc-500 line-through text-xs"
                          />
                        ) : (
                          <span className={isCurrent ? "" : "text-zinc-600 dark:text-zinc-400"}>
                            {p.nombre}
                          </span>
                        )}
                        {p.inicioTs && !isCurrent && (
                          <span className="ml-auto text-[10px] text-zinc-300 dark:text-zinc-600">
                            {new Date(p.inicioTs).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {showAddPaso ? (
                    <div className="flex items-center gap-1 px-2 py-1">
                      <input
                        ref={addPasoRef}
                        type="text"
                        value={newPasoName}
                        onChange={(e) => setNewPasoName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newPasoName.trim()) {
                            dispatch({ type: "ADD_PASO", payload: { id: generateId(), entregableId: entregable.id, nombre: newPasoName.trim(), inicioTs: null, finTs: null, estado: "", contexto: { urls: [], apps: [], notas: "" }, implicados: [], pausas: [], siguientePaso: null } });
                            setNewPasoName("");
                            addPasoRef.current?.focus();
                          }
                          if (e.key === "Escape") { setShowAddPaso(false); setNewPasoName(""); }
                        }}
                        autoFocus
                        placeholder="Nombre del paso..."
                        className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-1 text-[10px] focus:outline-none text-zinc-800 dark:text-zinc-200"
                        style={{ borderColor: `${borderColor}60` }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newPasoName.trim()) {
                            dispatch({ type: "ADD_PASO", payload: { id: generateId(), entregableId: entregable.id, nombre: newPasoName.trim(), inicioTs: null, finTs: null, estado: "", contexto: { urls: [], apps: [], notas: "" }, implicados: [], pausas: [], siguientePaso: null } });
                            setNewPasoName("");
                            addPasoRef.current?.focus();
                          }
                        }}
                        className="rounded px-2 py-1 text-[10px] font-medium text-white"
                        style={{ backgroundColor: borderColor }}
                      >+</button>
                      <button type="button" onClick={() => { setShowAddPaso(false); setNewPasoName(""); }}
                        className="text-[10px] text-zinc-400 hover:text-zinc-600">✕</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowAddPaso(true)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-600"
                      style={{ color: `${borderColor}99` }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      Añadir paso
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Implicados — collapsible */}
            <div className="space-y-1.5">
              <button type="button" onClick={() => setShowImplicados((s) => !s)}
                className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Implicados
                {selectedImplicados.length > 0 && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ backgroundColor: borderColor }}>{selectedImplicados.length}</span>}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`transition-transform ${showImplicados ? "rotate-180" : ""}`}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {/* Always show selected */}
              {!showImplicados && selectedImplicados.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedImplicados.map((i) => (
                    <span key={`${i.tipo}-${i.nombre}`} className="rounded-md border px-2 py-0.5 text-[10px] font-medium"
                      style={{ borderColor: i.tipo === "externo" ? "#f472b6" : borderColor, backgroundColor: i.tipo === "externo" ? "#fdf2f8" : `${borderColor}10`, color: i.tipo === "externo" ? "#be185d" : borderColor }}>
                      {i.nombre}
                    </span>
                  ))}
                </div>
              )}
              {showImplicados && (
                <>
                  <div className="flex flex-wrap gap-1">
                    {state.miembros.map((mb) => mb.nombre).map((m) => (
                      <button key={m} onClick={() => toggleImplicado(m)}
                        className="rounded-md border px-2 py-1 text-[10px] font-medium transition-all"
                        style={paso.implicados.some((i) => i.tipo === "equipo" && i.nombre === m)
                          ? { borderColor, backgroundColor: `${borderColor}10`, color: borderColor }
                          : { borderColor: "#e4e4e7", color: "#71717a" }}>
                        {m}
                      </button>
                    ))}
                  </div>
                  {paso.implicados.filter((i) => i.tipo === "externo").length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {paso.implicados.filter((i) => i.tipo === "externo").map((i) => (
                        <button key={i.nombre} onClick={() => toggleImplicado(i.nombre, "externo")}
                          className="rounded-md border border-pink-300 bg-pink-50 px-2 py-1 text-[10px] font-medium text-pink-700">
                          {i.nombre} ✕
                        </button>
                      ))}
                    </div>
                  )}
                  {!showAddExterno ? (
                    <button onClick={() => setShowAddExterno(true)} className="text-[10px] text-zinc-400 hover:text-amber-600">+ Externo</button>
                  ) : (
                    <div className="space-y-1.5 rounded-lg border border-pink-200 bg-pink-50 dark:bg-pink-500/10 dark:border-pink-700/30 p-2">
                      <div className="flex items-center gap-1">
                        <input type="text" value={externoNombre} onChange={(e) => setExternoNombre(e.target.value)}
                          placeholder="Buscar o crear contacto..." autoFocus
                          onKeyDown={(e) => { if (e.key === "Escape") { setShowAddExterno(false); setExternoNombre(""); setNewContactoEmail(""); setNewContactoTel(""); } }}
                          className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-1 text-[10px] focus:border-pink-400 focus:outline-none text-zinc-800 dark:text-zinc-200" />
                        <button type="button" onClick={() => { setShowAddExterno(false); setExternoNombre(""); setNewContactoEmail(""); setNewContactoTel(""); }}
                          className="text-[10px] text-zinc-400 hover:text-zinc-600">✕</button>
                      </div>
                      {filteredExternos.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {filteredExternos.map((c) => (
                            <button key={c.id} type="button"
                              onClick={() => { toggleImplicado(c.nombre, "externo"); setShowAddExterno(false); setExternoNombre(""); setNewContactoEmail(""); setNewContactoTel(""); }}
                              className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-600 hover:border-pink-300 hover:bg-pink-50">
                              {c.nombre}
                            </button>
                          ))}
                        </div>
                      )}
                      {externoNombre.trim() && !exactMatch && (
                        <div className="rounded border border-pink-200 bg-white dark:bg-zinc-800 p-1.5 space-y-1">
                          <p className="text-[10px] text-pink-600 font-medium">Crear &quot;{externoNombre.trim()}&quot;</p>
                          <div className="flex gap-1">
                            <input type="email" value={newContactoEmail} onChange={(e) => setNewContactoEmail(e.target.value)}
                              placeholder="Email (opc.)" className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 px-1.5 py-1 text-[10px] focus:border-pink-400 focus:outline-none bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200" />
                            <input type="tel" value={newContactoTel} onChange={(e) => setNewContactoTel(e.target.value)}
                              placeholder="Tel. (opc.)" className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 px-1.5 py-1 text-[10px] focus:border-pink-400 focus:outline-none bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200" />
                          </div>
                          <button type="button" onClick={addExterno}
                            className="rounded-lg bg-pink-500 px-3 py-1 text-[10px] font-medium text-white hover:bg-pink-600">
                            Añadir y asignar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* URLs — with inline editing */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Contexto</p>
              {paso.contexto.urls.map((u, i) => (
                editUrlIdx === i ? (
                  <div key={`url-${i}-${u.url}`} className="space-y-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-1.5">
                    <input type="text" value={editUrlDraft.url} onChange={(e) => setEditUrlDraft({ ...editUrlDraft, url: e.target.value })}
                      placeholder="https://..." className="w-full rounded border border-zinc-200 dark:border-zinc-700 px-1.5 py-1 text-[10px] bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none" style={{ borderColor: `${borderColor}60` }} />
                    <div className="flex gap-1">
                      <input type="text" value={editUrlDraft.nombre} onChange={(e) => setEditUrlDraft({ ...editUrlDraft, nombre: e.target.value })}
                        placeholder="Nombre" className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 px-1.5 py-1 text-[10px] bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none" />
                      <input type="text" value={editUrlDraft.descripcion} onChange={(e) => setEditUrlDraft({ ...editUrlDraft, descripcion: e.target.value })}
                        placeholder="Descripción" className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 px-1.5 py-1 text-[10px] bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none" />
                    </div>
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => saveEditUrl(i)} className="rounded px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: borderColor }}>Guardar</button>
                      <button onClick={() => setEditUrlIdx(null)} className="text-[10px] text-zinc-400 px-2 py-0.5">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div key={`url-${i}-${u.url}`} className="flex items-start gap-1 rounded border border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-medium text-zinc-800 dark:text-zinc-200">{u.nombre}</p>
                      {u.descripcion && <p className="truncate text-[10px] text-zinc-400 dark:text-zinc-500">{u.descripcion}</p>}
                      <a href={u.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[10px] hover:underline" style={{ color: borderColor }}>{u.url}</a>
                    </div>
                    <button onClick={() => { setEditUrlIdx(i); setEditUrlDraft({ ...u }); }}
                      className="text-[10px] text-zinc-300 hover:text-zinc-600" title="Editar">✎</button>
                    <button onClick={() => removeUrl(i)} className="text-[10px] text-zinc-300 hover:text-red-400">✕</button>
                  </div>
                )
              ))}
              <div className="space-y-1 rounded border border-dashed border-zinc-200 dark:border-zinc-700 p-1.5">
                <input type="text" value={urlDraft.url} onChange={(e) => setUrlDraft({ ...urlDraft, url: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
                  placeholder="https://..." className="w-full rounded border border-zinc-200 dark:border-zinc-700 px-1.5 py-1 text-[10px] bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none" style={{ borderColor: `${borderColor}40` }} />
                <div className="flex gap-1">
                  <input type="text" value={urlDraft.nombre} onChange={(e) => setUrlDraft({ ...urlDraft, nombre: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
                    placeholder="Nombre" className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 px-1.5 py-1 text-[10px] bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none" />
                  <input type="text" value={urlDraft.descripcion} onChange={(e) => setUrlDraft({ ...urlDraft, descripcion: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
                    placeholder="Descripción" className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 px-1.5 py-1 text-[10px] bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none" />
                </div>
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Notas</p>
              <NotasSection notas={paso.notas ?? []} nivel="paso" targetId={paso.id} />
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              {/* Quick close */}
              <button onClick={handleQuickClose}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: borderColor }}>
                Paso dado y continúo mañana
              </button>

              {/* Full close */}
              <button onClick={() => setShowCerrar(true)}
                className="w-full rounded-xl border-2 py-2 text-sm font-medium transition-colors"
                style={{ borderColor, color: borderColor, backgroundColor: `${borderColor}08` }}>
                Paso dado (más opciones)
              </button>

              {/* Discard */}
              {!showDiscard ? (
                <button onClick={() => setShowDiscard(true)}
                  className="w-full text-center text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-red-500 transition-colors py-1">
                  Descartar este paso
                </button>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-700/30 p-2">
                  <p className="text-xs text-red-600">¿Seguro?</p>
                  <button onClick={handleDiscard}
                    className="rounded bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600">Sí, descartar</button>
                  <button onClick={() => setShowDiscard(false)}
                    className="rounded border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50">No</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showCerrar && (
        <div ref={cerrarRef}>
          <CerrarPaso paso={paso} onClose={() => setShowCerrar(false)} />
        </div>
      )}
    </>
  );
}
