"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useArbol } from "@/lib/hooks";
import { useUsuario } from "@/lib/usuario";
import { generateId } from "@/lib/store";
import type { Contexto, Implicado, UrlRef, Entregable, Paso, SesionEntregable, PausaEntry, Nota } from "@/lib/types";
import { AREA_COLORS } from "@/lib/types";
import { toDateKey } from "@/lib/date-utils";
import { Timer } from "./Timer";
import { NotasSection } from "./shared/NotasSection";
import { EditableText } from "./shared/EditableText";
import { RegistrarSesionIconButton, EditarSesionPopover } from "./shared/RegistrarSesionPopover";

interface Props {
  entregable: Entregable;
  /**
   * "trabajo" (default): tarjeta de sesión activa con cronómetro, pausa y
   * botones de cerrar/descartar sesión.
   * "detalle": se usa cuando queremos ver/editar el entregable desde
   * planificación (pasos, notas, URLs, historial). Sin cronómetro ni acciones
   * de cierre de sesión; se abre siempre expandido.
   */
  mode?: "trabajo" | "detalle";
}

const EMPTY_CONTEXTO: Contexto = { urls: [], apps: [], notas: "" };

function fmtPasoDuration(inicioTs: string, finTs: string): string {
  const ms = new Date(finTs).getTime() - new Date(inicioTs).getTime();
  if (!Number.isFinite(ms) || ms < 60000) return "<1m";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function pasoDuracionMinutos(inicioTs: string, finTs: string): number {
  const ms = new Date(finTs).getTime() - new Date(inicioTs).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.round(ms / 60000));
}

export function EntregableActivoCard({ entregable, mode = "trabajo" }: Props) {
  const isDetalle = mode === "detalle";
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const { resultado, proyecto } = useArbol(entregable.id);

  const pasosDelEntregable = useMemo(
    () =>
      state.pasos
        .filter((p) => p.entregableId === entregable.id)
        .sort((a, b) => {
          const ao = a.orden ?? 999;
          const bo = b.orden ?? 999;
          if (ao !== bo) return ao - bo;
          return (a.inicioTs ?? "z").localeCompare(b.inicioTs ?? "z");
        }),
    [state.pasos, entregable.id],
  );

  const contexto: Contexto = entregable.contexto ?? EMPTY_CONTEXTO;
  const implicados: Implicado[] = entregable.implicados ?? [];

  // Promoción automática (one-shot por sesión): cuando se abre un entregable,
  // las notas y URLs que vivían en sus pasos antiguos se promocionan al
  // entregable, sin duplicar lo ya presente. Idempotente.
  const promotedRef = useRef<string | null>(null);
  useEffect(() => {
    if (promotedRef.current === entregable.id) return;
    promotedRef.current = entregable.id;
    if (pasosDelEntregable.length === 0) return;

    const ctxActual = entregable.contexto ?? EMPTY_CONTEXTO;
    const norm = (u: string) => u.toLowerCase().replace(/\/+$/, "");
    const urlsExistentes = new Set(ctxActual.urls.map((u) => norm(u.url)));
    const notasExistentes = new Set((entregable.notas ?? []).map((n) => n.texto.trim()));

    const urlsNuevas: UrlRef[] = [];
    const notasNuevas: Nota[] = [];

    for (const paso of pasosDelEntregable) {
      for (const u of paso.contexto?.urls ?? []) {
        if (!u.url) continue;
        const k = norm(u.url);
        if (urlsExistentes.has(k)) continue;
        urlsExistentes.add(k);
        urlsNuevas.push({ ...u });
      }
      for (const n of paso.notas ?? []) {
        const t = n.texto.trim();
        if (!t || notasExistentes.has(t)) continue;
        notasExistentes.add(t);
        notasNuevas.push({ ...n });
      }
    }

    if (urlsNuevas.length > 0) {
      dispatch({
        type: "UPDATE_ENTREGABLE_CONTEXTO",
        id: entregable.id,
        contexto: { ...ctxActual, urls: [...ctxActual.urls, ...urlsNuevas] },
      });
    }
    for (const nota of notasNuevas) {
      dispatch({ type: "ADD_NOTA", nivel: "entregable", targetId: entregable.id, nota });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregable.id]);


  const sesiones: SesionEntregable[] = useMemo(
    () => Array.isArray(entregable.sesiones) ? entregable.sesiones : [],
    [entregable.sesiones],
  );
  const sesionAbierta = sesiones.find((s) => s.finTs === null) ?? null;
  const pausasSesion: PausaEntry[] = sesionAbierta?.pausas ?? [];
  const isPaused = !!pausasSesion.length && !pausasSesion[pausasSesion.length - 1].resumeTs;

  const [expanded, setExpanded] = useState(isDetalle);
  const [showCloseOptions, setShowCloseOptions] = useState(false);
  const [showEsperaPicker, setShowEsperaPicker] = useState(false);
  const [esperaExternoDraft, setEsperaExternoDraft] = useState("");
  // Edición inline de la duración (minutos) de un paso. Solo aplica a pasos
  // ya hechos con inicioTs/finTs definidos.
  const [editingDurId, setEditingDurId] = useState<string | null>(null);
  const [editingDurDraft, setEditingDurDraft] = useState("");
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

  const areaColor = proyecto?.area ? AREA_COLORS[proyecto.area]?.hex : undefined;
  const borderColor = areaColor ?? "#22c55e";

  const updateContexto = useCallback(
    (ctx: Contexto) => {
      dispatch({ type: "UPDATE_ENTREGABLE_CONTEXTO", id: entregable.id, contexto: ctx });
    },
    [entregable.id, dispatch],
  );

  const addUrl = useCallback(() => {
    if (!urlDraft.url.trim()) return;
    const newUrl: UrlRef = {
      nombre: urlDraft.nombre.trim() || urlDraft.url.trim(),
      descripcion: urlDraft.descripcion.trim(),
      url: urlDraft.url.trim(),
    };
    updateContexto({ ...contexto, urls: [...contexto.urls, newUrl] });
    setUrlDraft({ nombre: "", descripcion: "", url: "" });
  }, [contexto, urlDraft, updateContexto]);

  const removeUrl = useCallback(
    (idx: number) => {
      setEditUrlIdx(null);
      updateContexto({ ...contexto, urls: contexto.urls.filter((_, i) => i !== idx) });
    },
    [contexto, updateContexto],
  );

  const saveEditUrl = useCallback(
    (idx: number) => {
      if (!editUrlDraft.url.trim()) return;
      const urls = [...contexto.urls];
      urls[idx] = {
        nombre: editUrlDraft.nombre.trim() || editUrlDraft.url.trim(),
        descripcion: editUrlDraft.descripcion.trim(),
        url: editUrlDraft.url.trim(),
      };
      updateContexto({ ...contexto, urls });
      setEditUrlIdx(null);
    },
    [contexto, editUrlDraft, updateContexto],
  );

  const toggleImplicado = useCallback(
    (nombre: string, tipo: "equipo" | "externo" = "equipo") => {
      const exists = implicados.some((i) => i.tipo === tipo && i.nombre === nombre);
      const updated: Implicado[] = exists
        ? implicados.filter((i) => !(i.tipo === tipo && i.nombre === nombre))
        : [...implicados, { tipo, nombre }];
      dispatch({ type: "UPDATE_ENTREGABLE_IMPLICADOS", id: entregable.id, implicados: updated });
    },
    [implicados, entregable.id, dispatch],
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
    .filter((c) => !implicados.some((i) => i.tipo === "externo" && i.nombre === c.nombre))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const filteredExternos = externosConocidos.filter(
    (c) => !externoNombre.trim() || c.nombre.toLowerCase().includes(externoNombre.trim().toLowerCase()),
  );

  const exactMatch = state.contactos.some(
    (c) => c.nombre.toLowerCase() === externoNombre.trim().toLowerCase(),
  );

  const pasosTotales = pasosDelEntregable.length;
  const pasosHechos = pasosDelEntregable.filter((p) => p.estado === "hecho" || p.finTs).length;
  const progreso = pasosTotales > 0
    ? Math.round((pasosHechos / pasosTotales) * 100)
    : Math.min(100, (entregable.diasHechos / Math.max(1, entregable.diasEstimados)) * 100);

  function handleCerrarSesionHoy() {
    // Cierra la sesión activa y oculta el entregable de HOY operativo el resto
    // del día. NO toca la planificación: si mañana sigue planificado en el
    // calendario semanal, volverá a aparecer; si no, se planifica desde
    // Plan Mapa/Trimestre/Mes/Semana.
    dispatch({ type: "END_ENTREGABLE_SESION", id: entregable.id });
    const hoy = toDateKey(new Date());
    dispatch({ type: "OCULTAR_ENTREGABLE_HASTA", id: entregable.id, hasta: hoy });
    setShowCloseOptions(false);
  }
  function handleFinalizar() {
    dispatch({ type: "FINISH_ENTREGABLE", id: entregable.id });
    setShowCloseOptions(false);
    setShowEsperaPicker(false);
  }
  function handleEnEsperaMiembro(nombre: string) {
    dispatch({
      type: "SET_ENTREGABLE_EN_ESPERA",
      id: entregable.id,
      enEsperaDe: { tipo: "equipo", nombre },
    });
    setShowEsperaPicker(false);
    setShowCloseOptions(false);
    setEsperaExternoDraft("");
  }
  function handleEnEsperaExterno() {
    const nombre = esperaExternoDraft.trim();
    if (!nombre) return;
    dispatch({
      type: "SET_ENTREGABLE_EN_ESPERA",
      id: entregable.id,
      enEsperaDe: { tipo: "externo", nombre },
    });
    setShowEsperaPicker(false);
    setShowCloseOptions(false);
    setEsperaExternoDraft("");
  }
  function handleDescartarSesion() {
    dispatch({ type: "DISCARD_ENTREGABLE_SESION", id: entregable.id });
    setShowDiscard(false);
  }

  function handlePause() {
    dispatch({ type: "PAUSE_ENTREGABLE_SESION", id: entregable.id });
  }
  function handleResume() {
    dispatch({ type: "RESUME_ENTREGABLE_SESION", id: entregable.id });
  }

  function togglePaso(p: Paso) {
    if (p.estado === "hecho" || p.finTs) {
      dispatch({ type: "UNCHECK_PASO", id: p.id });
    } else {
      dispatch({ type: "CHECK_PASO", id: p.id });
    }
  }

  function startEditDuracion(p: Paso) {
    if (!p.inicioTs || !p.finTs) return;
    setEditingDurId(p.id);
    setEditingDurDraft(String(pasoDuracionMinutos(p.inicioTs, p.finTs)));
  }
  function cancelEditDuracion() {
    setEditingDurId(null);
    setEditingDurDraft("");
  }
  function saveEditDuracion(p: Paso) {
    if (!p.inicioTs) return cancelEditDuracion();
    const minutos = parseInt(editingDurDraft, 10);
    if (!Number.isFinite(minutos) || minutos < 1) return cancelEditDuracion();
    // Solo movemos `finTs`; `inicioTs` se mantiene. Si el siguiente paso
    // empezaba justo en el `finTs` antiguo, el usuario decidirá si lo ajusta.
    const nuevoFinTs = new Date(new Date(p.inicioTs).getTime() + minutos * 60000).toISOString();
    dispatch({ type: "UPDATE_PASO_TIMES", id: p.id, inicioTs: p.inicioTs, finTs: nuevoFinTs });
    cancelEditDuracion();
  }

  function addPaso() {
    const nombre = newPasoName.trim();
    if (!nombre) return;
    const maxOrden = pasosDelEntregable.reduce((m, p) => Math.max(m, p.orden ?? 0), 0);
    dispatch({
      type: "ADD_PASO",
      payload: {
        id: generateId(),
        entregableId: entregable.id,
        nombre,
        orden: maxOrden + 1,
        inicioTs: null,
        finTs: null,
        estado: "pendiente",
        contexto: { urls: [], apps: [], notas: "" },
        implicados: [],
        pausas: [],
        siguientePaso: null,
        responsable: entregable.responsable ?? currentUser,
      },
    });
    setNewPasoName("");
    addPasoRef.current?.focus();
  }

  return (
    <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor }}>
      {/* Header */}
      <div className="flex w-full items-center gap-3 p-3" style={{ backgroundColor: `${borderColor}10` }}>
        <button type="button" onClick={() => setExpanded((e) => !e)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="relative flex h-3 w-3 shrink-0">
            {!isPaused && sesionAbierta && !isDetalle && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: borderColor }} />
            )}
            <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: isPaused && !isDetalle ? "#f59e0b" : borderColor }} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">{entregable.nombre}</p>
            <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
              {proyecto?.nombre ?? resultado?.nombre ?? "Entregable"}
            </p>
          </div>
        </button>
        {!isDetalle && sesionAbierta && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); isPaused ? handleResume() : handlePause(); }}
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
        )}
        {!isDetalle && sesionAbierta && <Timer startTime={sesionAbierta.inicioTs} pausas={pausasSesion} compact />}
        <button type="button" onClick={() => setExpanded((e) => !e)} className="shrink-0 text-zinc-400" aria-label={expanded ? "Contraer" : "Expandir"}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t bg-white dark:bg-zinc-900 p-4 space-y-4" style={{ borderColor: `${borderColor}40` }}>
          {/* Breadcrumb */}
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
            {proyecto?.nombre && <><span className="text-zinc-500 dark:text-zinc-400 font-medium">{proyecto.nombre}</span> → </>}
            {resultado?.nombre && <span className="text-zinc-400 dark:text-zinc-500">{resultado.nombre}</span>}
          </p>

          {/* Editable name */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">Entregable</p>
            <EditableText
              value={entregable.nombre}
              onChange={(v) => dispatch({ type: "RENAME_ENTREGABLE", id: entregable.id, nombre: v })}
              className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
            />
          </div>

          {/* Progreso */}
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${progreso}%`, backgroundColor: borderColor }} />
            </div>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              {pasosTotales > 0 ? `${pasosHechos}/${pasosTotales}` : `${entregable.diasHechos}/${entregable.diasEstimados}`}
            </span>
          </div>

          {/* Checklist de pasos */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Pasos de este entregable
            </p>
            <div className="space-y-0.5">
              {pasosDelEntregable.map((p, idx) => {
                const done = p.estado === "hecho" || !!p.finTs;
                const isFirst = idx === 0;
                const isLast = idx === pasosDelEntregable.length - 1;
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "REORDER_PASO", id: p.id, direction: "up" })}
                        disabled={isFirst}
                        className="text-[8px] leading-none text-zinc-300 hover:text-zinc-600 disabled:opacity-20 disabled:hover:text-zinc-300"
                        title="Subir"
                        aria-label="Subir paso"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "REORDER_PASO", id: p.id, direction: "down" })}
                        disabled={isLast}
                        className="text-[8px] leading-none text-zinc-300 hover:text-zinc-600 disabled:opacity-20 disabled:hover:text-zinc-300"
                        title="Bajar"
                        aria-label="Bajar paso"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePaso(p)}
                      className="h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center"
                      style={{
                        borderColor: done ? borderColor : "#d4d4d8",
                        backgroundColor: done ? borderColor : "transparent",
                      }}
                      aria-label={done ? "Desmarcar" : "Marcar como hecho"}
                    >
                      {done && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                    <EditableText
                      value={p.nombre}
                      onChange={(v) => dispatch({ type: "RENAME_PASO", id: p.id, nombre: v })}
                      className={`flex-1 text-xs ${done ? "text-zinc-400 dark:text-zinc-500 line-through" : "text-zinc-700 dark:text-zinc-300"}`}
                    />
                    {done && p.inicioTs && p.finTs && (
                      editingDurId === p.id ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            value={editingDurDraft}
                            onChange={(e) => setEditingDurDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saveEditDuracion(p); }
                              if (e.key === "Escape") cancelEditDuracion();
                            }}
                            autoFocus
                            onFocus={(e) => e.currentTarget.select()}
                            className="w-12 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1 py-0.5 text-right text-[10px] tabular-nums text-zinc-700 dark:text-zinc-200 focus:outline-none"
                            style={{ borderColor: `${borderColor}80` }}
                            aria-label="Duración en minutos"
                          />
                          <span className="text-[10px] text-zinc-400">min</span>
                          <button
                            type="button"
                            onClick={() => saveEditDuracion(p)}
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                            style={{ backgroundColor: borderColor }}
                            title="Guardar"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditDuracion}
                            className="rounded px-1 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-600"
                            title="Cancelar"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditDuracion(p)}
                          className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium tabular-nums text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                          title={`${new Date(p.inicioTs).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} → ${new Date(p.finTs).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · clic para editar`}
                        >
                          {fmtPasoDuration(p.inicioTs, p.finTs)}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "DELETE_PASO", id: p.id })}
                      className="shrink-0 text-[10px] text-zinc-300 hover:text-red-400"
                      title="Eliminar paso"
                    >
                      ✕
                    </button>
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
                      if (e.key === "Enter" && newPasoName.trim()) addPaso();
                      if (e.key === "Escape") { setShowAddPaso(false); setNewPasoName(""); }
                    }}
                    autoFocus
                    placeholder="Nombre del paso..."
                    className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-1 text-[10px] focus:outline-none text-zinc-800 dark:text-zinc-200"
                    style={{ borderColor: `${borderColor}60` }}
                  />
                  <button type="button" onClick={addPaso} className="rounded px-2 py-1 text-[10px] font-medium text-white" style={{ backgroundColor: borderColor }}>+</button>
                  <button type="button" onClick={() => { setShowAddPaso(false); setNewPasoName(""); }} className="text-[10px] text-zinc-400 hover:text-zinc-600">✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowAddPaso(true)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] hover:text-zinc-700"
                  style={{ color: `${borderColor}99` }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Añadir paso
                </button>
              )}
            </div>
          </div>

          {/* Implicados */}
          <div className="space-y-1.5">
            <button type="button" onClick={() => setShowImplicados((s) => !s)}
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Implicados
              {implicados.length > 0 && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ backgroundColor: borderColor }}>{implicados.length}</span>}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`transition-transform ${showImplicados ? "rotate-180" : ""}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {!showImplicados && implicados.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {implicados.map((i) => (
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
                      style={implicados.some((i) => i.tipo === "equipo" && i.nombre === m)
                        ? { borderColor, backgroundColor: `${borderColor}10`, color: borderColor }
                        : { borderColor: "#e4e4e7", color: "#71717a" }}>
                      {m}
                    </button>
                  ))}
                </div>
                {implicados.filter((i) => i.tipo === "externo").length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {implicados.filter((i) => i.tipo === "externo").map((i) => (
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

          {/* URLs */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Contexto</p>
            {contexto.urls.map((u, i) => (
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
            <NotasSection notas={entregable.notas ?? []} nivel="entregable" targetId={entregable.id} />
          </div>

          {/* Historial de sesiones */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Sesiones ({sesiones.length})
              </p>
              <RegistrarSesionIconButton
                entregableId={entregable.id}
                variant="ghost"
                title="Añadir sesión a mano"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                  <path d="M19 4v4M17 6h4" />
                </svg>
                <span>+ Añadir sesión a mano</span>
              </RegistrarSesionIconButton>
            </div>
            {sesiones.length > 0 && (
              <SesionesEntregableHistory sesiones={sesiones} borderColor={borderColor} hideTitle entregableId={entregable.id} />
            )}
          </div>

          {/* Acciones */}
          {!isDetalle && (
          <div className="space-y-2">
            {!showCloseOptions ? (
              <button
                onClick={() => setShowCloseOptions(true)}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: borderColor }}
              >
                Cerrar sesión del entregable
              </button>
            ) : (
              <div className="space-y-2 rounded-xl border-2 p-3" style={{ borderColor: `${borderColor}40`, backgroundColor: `${borderColor}08` }}>
                <button
                  onClick={handleCerrarSesionHoy}
                  className="w-full rounded-lg py-2 text-xs font-semibold text-white"
                  style={{ backgroundColor: borderColor }}
                >
                  Cerrar sesión de hoy
                </button>
                <button
                  onClick={handleFinalizar}
                  className="w-full rounded-lg border-2 py-2 text-xs font-medium"
                  style={{ borderColor, color: borderColor }}
                >
                  Entregable completado
                </button>
                {!showEsperaPicker ? (
                  <button
                    onClick={() => setShowEsperaPicker(true)}
                    className="w-full rounded-lg border-2 border-dashed py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    style={{ borderColor: `${borderColor}60` }}
                  >
                    En espera de…
                  </button>
                ) : (
                  <div className="space-y-2 rounded-lg border-2 border-dashed p-2" style={{ borderColor: `${borderColor}60`, backgroundColor: "white" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      ¿De quién esperas respuesta?
                    </p>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Miembro del equipo</p>
                    <div className="flex flex-wrap gap-1">
                      {state.miembros.map((mb) => (
                        <button
                          key={mb.id}
                          type="button"
                          onClick={() => handleEnEsperaMiembro(mb.nombre)}
                          className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 transition-all hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-violet-500/10"
                        >
                          {mb.nombre}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 pt-1">o escribe un externo</p>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={esperaExternoDraft}
                        onChange={(e) => setEsperaExternoDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); handleEnEsperaExterno(); }
                          if (e.key === "Escape") setShowEsperaPicker(false);
                        }}
                        placeholder="Cliente, proveedor…"
                        className="flex-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-1 text-[11px] focus:outline-none text-zinc-800 dark:text-zinc-200"
                      />
                      <button
                        type="button"
                        onClick={handleEnEsperaExterno}
                        disabled={!esperaExternoDraft.trim()}
                        className="rounded bg-violet-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-violet-600 disabled:opacity-40"
                      >
                        Marcar
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowEsperaPicker(false); setEsperaExternoDraft(""); }}
                      className="w-full text-center text-[10px] text-zinc-400 hover:text-zinc-600 py-1"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                <button onClick={() => { setShowCloseOptions(false); setShowEsperaPicker(false); setEsperaExternoDraft(""); }} className="w-full text-center text-[11px] text-zinc-400 hover:text-zinc-600 py-1">
                  Cancelar
                </button>
              </div>
            )}

            {!showDiscard ? (
              <button onClick={() => setShowDiscard(true)}
                className="w-full text-center text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-red-500 transition-colors py-1">
                Descartar sesión (no cuenta el tiempo)
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-700/30 p-2">
                <p className="text-xs text-red-600">¿Seguro?</p>
                <button onClick={handleDescartarSesion}
                  className="rounded bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600">Sí, descartar</button>
                <button onClick={() => setShowDiscard(false)}
                  className="rounded border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50">No</button>
              </div>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

function SesionesEntregableHistory({ sesiones, borderColor, hideTitle, entregableId }: { sesiones: SesionEntregable[]; borderColor: string; hideTitle?: boolean; entregableId?: string }) {
  const [editing, setEditing] = useState<number | null>(null);

  if (sesiones.length === 0) return null;

  const fmtTs = (ts: string) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
  };

  const durationMs = (start: string, end: string) => new Date(end).getTime() - new Date(start).getTime();
  const fmtDuration = (ms: number) => {
    if (ms < 60000) return "<1m";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // Mantenemos el índice global (posición en `sesiones`) para que al editar
  // podamos referenciarla sin depender del agrupado por día.
  type SesionConIdx = { s: SesionEntregable; globalIdx: number };
  const byDay = new Map<string, SesionConIdx[]>();
  sesiones.forEach((s, globalIdx) => {
    const k = s.inicioTs.slice(0, 10);
    const arr = byDay.get(k) ?? [];
    arr.push({ s, globalIdx });
    byDay.set(k, arr);
  });
  const days = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a));

  const editingSesion = editing !== null ? sesiones[editing] : null;

  return (
    <div className="space-y-1">
      {!hideTitle && (
        <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Sesiones ({sesiones.length})</p>
      )}
      <div className="space-y-1">
        {days.map((day) => (
          <div key={day} className="space-y-0.5">
            <p className="text-[9px] text-zinc-400 dark:text-zinc-500">
              {new Date(`${day}T00:00:00`).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
            </p>
            {(byDay.get(day) ?? []).map(({ s, globalIdx }) => {
              const clickable = !!entregableId;
              const row = (
                <>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.finTs === null ? borderColor : "#d4d4d8" }} />
                <span className="text-zinc-500 dark:text-zinc-400">{fmtTs(s.inicioTs)}</span>
                {s.finTs ? (
                  <>
                    <span className="text-zinc-300">→</span>
                    <span className="text-zinc-500 dark:text-zinc-400">{fmtTs(s.finTs)}</span>
                    <span className="ml-auto text-zinc-400 dark:text-zinc-500 font-medium">{fmtDuration(durationMs(s.inicioTs, s.finTs))}</span>
                  </>
                ) : (
                  <span className="ml-auto text-[9px] font-medium" style={{ color: borderColor }}>En curso</span>
                )}
                </>
              );
              const commonStyle = s.finTs === null ? { backgroundColor: `${borderColor}10` } : undefined;
              return clickable ? (
                <button
                  key={globalIdx}
                  type="button"
                  onClick={() => setEditing(globalIdx)}
                  title="Editar hora"
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[10px] transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  style={commonStyle}
                >
                  {row}
                </button>
              ) : (
                <div key={globalIdx} className="flex items-center gap-2 rounded px-2 py-1 text-[10px]" style={commonStyle}>
                  {row}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {editing !== null && editingSesion && entregableId && (
        <EditarSesionPopover
          entregableId={entregableId}
          sesionIdx={editing}
          inicioTsActual={editingSesion.inicioTs}
          finTsActual={editingSesion.finTs}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
