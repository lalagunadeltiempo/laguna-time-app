"use client";

import { useState, useCallback } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useArbol } from "@/lib/hooks";
import { generateId } from "@/lib/store";
import type { Contexto, Implicado, UrlRef, Paso } from "@/lib/types";
import { Timer } from "./Timer";
import { CerrarPaso } from "./CerrarPaso";

interface CardProps {
  paso: Paso;
}

export function PasoActivoCard({ paso }: CardProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { entregable, resultado, proyecto } = useArbol(paso.entregableId);
  const [expanded, setExpanded] = useState(false);
  const [showCerrar, setShowCerrar] = useState(false);
  const [showAddExterno, setShowAddExterno] = useState(false);
  const [externoNombre, setExternoNombre] = useState("");
  const [newContactoEmail, setNewContactoEmail] = useState("");
  const [newContactoTel, setNewContactoTel] = useState("");
  const [urlDraft, setUrlDraft] = useState<UrlRef>({ nombre: "", descripcion: "", url: "" });

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
      updateContexto({
        ...paso.contexto,
        urls: paso.contexto.urls.filter((_, i) => i !== idx),
      });
    },
    [paso.contexto, updateContexto],
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

  return (
    <>
      <div className="rounded-xl border-2 border-green-200 bg-green-50 overflow-hidden">
        {/* Compact header — always visible */}
        <div className="flex w-full items-center gap-3 p-3">
          <button type="button" onClick={toggleExpanded} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="relative flex h-3 w-3 shrink-0">
              {!isPaused && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${isPaused ? "bg-amber-500" : "bg-green-500"}`}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-zinc-800">{entregable.nombre}</p>
              <p className="truncate text-[10px] text-zinc-500">{paso.nombre}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: isPaused ? "RESUME_PASO" : "PAUSE_PASO", id: paso.id });
            }}
            className={`shrink-0 rounded-lg p-1.5 transition-colors ${isPaused ? "bg-green-200 text-green-700 hover:bg-green-300" : "bg-amber-100 text-amber-600 hover:bg-amber-200"}`}
            title={isPaused ? "Reanudar" : "Pausar"}
          >
            {isPaused ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            )}
          </button>
          <Timer startTime={paso.inicioTs!} pausas={paso.pausas} compact />
          <button type="button" onClick={toggleExpanded} className="shrink-0 text-zinc-400" aria-label={expanded ? "Contraer" : "Expandir"}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-green-200 bg-white p-4 space-y-4">
            {/* Breadcrumb */}
            <p className="text-[10px] text-zinc-400">
              {proyecto?.nombre && <><span className="text-zinc-500 font-medium">{proyecto.nombre}</span> → </>}
              {resultado?.nombre && <><span className="text-zinc-400">{resultado.nombre}</span> → </>}
              <span className="text-zinc-400">{entregable.nombre}</span>
            </p>

            {/* Progress */}
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-zinc-100">
                <div className="h-1.5 rounded-full bg-amber-500 transition-all" style={{ width: `${progreso}%` }} />
              </div>
              <span className="text-[10px] text-zinc-400">{entregable.diasHechos}/{entregable.diasEstimados}</span>
            </div>

            {/* Implicados */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Implicados</p>
              <div className="flex flex-wrap gap-1">
                {state.miembros.map((mb) => mb.nombre).map((m) => (
                  <button key={m} onClick={() => toggleImplicado(m)}
                    className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${
                      paso.implicados.some((i) => i.tipo === "equipo" && i.nombre === m)
                        ? "border-amber-400 bg-amber-50 text-amber-700"
                        : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
              {paso.implicados.filter((i) => i.tipo === "externo").length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {paso.implicados.filter((i) => i.tipo === "externo").map((i) => (
                    <button key={i.nombre} onClick={() => toggleImplicado(i.nombre, "externo")}
                      className="rounded-md border border-pink-300 bg-pink-50 px-2 py-1 text-[10px] font-medium text-pink-700">
                      {i.nombre} x
                    </button>
                  ))}
                </div>
              )}
              {!showAddExterno ? (
                <button onClick={() => setShowAddExterno(true)} className="text-[10px] text-zinc-400 hover:text-amber-600">+ Externo</button>
              ) : (
                <div className="space-y-1.5 rounded-lg border border-pink-200 bg-pink-50 p-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={externoNombre}
                      onChange={(e) => setExternoNombre(e.target.value)}
                      placeholder="Buscar o crear contacto..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setShowAddExterno(false);
                          setExternoNombre("");
                          setNewContactoEmail("");
                          setNewContactoTel("");
                        }
                      }}
                      className="flex-1 rounded border border-zinc-200 bg-white px-1.5 py-1 text-[10px] focus:border-pink-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddExterno(false);
                        setExternoNombre("");
                        setNewContactoEmail("");
                        setNewContactoTel("");
                      }}
                      className="text-[10px] text-zinc-400 hover:text-zinc-600"
                    >
                      ✕
                    </button>
                  </div>
                  {filteredExternos.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {filteredExternos.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            toggleImplicado(c.nombre, "externo");
                            setShowAddExterno(false);
                            setExternoNombre("");
                            setNewContactoEmail("");
                            setNewContactoTel("");
                          }}
                          className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-600 hover:border-pink-300 hover:bg-pink-50"
                        >
                          {c.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                  {externoNombre.trim() && !exactMatch && (
                    <div className="rounded border border-pink-200 bg-white p-1.5 space-y-1">
                      <p className="text-[10px] text-pink-600 font-medium">Crear &quot;{externoNombre.trim()}&quot;</p>
                      <div className="flex gap-1">
                        <input
                          type="email"
                          value={newContactoEmail}
                          onChange={(e) => setNewContactoEmail(e.target.value)}
                          placeholder="Email (opc.)"
                          className="flex-1 rounded border border-zinc-200 px-1.5 py-1 text-[10px] focus:border-pink-400 focus:outline-none"
                        />
                        <input
                          type="tel"
                          value={newContactoTel}
                          onChange={(e) => setNewContactoTel(e.target.value)}
                          placeholder="Tel. (opc.)"
                          className="flex-1 rounded border border-zinc-200 px-1.5 py-1 text-[10px] focus:border-pink-400 focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={addExterno}
                        className="rounded-lg bg-pink-500 px-3 py-1 text-[10px] font-medium text-white hover:bg-pink-600"
                      >
                        Añadir y asignar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* URLs */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Contexto</p>
              {paso.contexto.urls.map((u, i) => (
                <div key={i} className="flex items-start gap-1 rounded border border-zinc-100 bg-zinc-50 p-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-medium text-zinc-800">{u.nombre}</p>
                    <a href={u.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[10px] text-amber-600 hover:underline">{u.url}</a>
                  </div>
                  <button onClick={() => removeUrl(i)} className="text-[10px] text-zinc-300 hover:text-red-400">x</button>
                </div>
              ))}
              <div className="space-y-1 rounded border border-dashed border-zinc-200 p-1.5">
                <input type="text" value={urlDraft.url} onChange={(e) => setUrlDraft({ ...urlDraft, url: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
                  placeholder="https://..." className="w-full rounded border border-zinc-200 px-1.5 py-1 text-[10px] focus:border-amber-400 focus:outline-none" />
                <div className="flex gap-1">
                  <input type="text" value={urlDraft.nombre} onChange={(e) => setUrlDraft({ ...urlDraft, nombre: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
                    placeholder="Nombre" className="flex-1 rounded border border-zinc-200 px-1.5 py-1 text-[10px] focus:border-amber-400 focus:outline-none" />
                  <input type="text" value={urlDraft.descripcion} onChange={(e) => setUrlDraft({ ...urlDraft, descripcion: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
                    placeholder="Descripción" className="flex-1 rounded border border-zinc-200 px-1.5 py-1 text-[10px] focus:border-amber-400 focus:outline-none" />
                </div>
              </div>
              <textarea value={paso.contexto.notas}
                onChange={(e) => updateContexto({ ...paso.contexto, notas: e.target.value })}
                placeholder="Notas..." rows={2}
                className="w-full resize-none rounded border border-zinc-200 bg-white p-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none" />
            </div>

            {/* Close */}
            <button onClick={() => setShowCerrar(true)}
              className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700">
              Paso Dado
            </button>
          </div>
        )}
      </div>

      {showCerrar && <CerrarPaso paso={paso} onClose={() => setShowCerrar(false)} />}
    </>
  );
}
