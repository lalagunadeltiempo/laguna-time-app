"use client";

import { useState, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { usePasosActivos } from "@/lib/hooks";
import { generateId } from "@/lib/store";
import { USUARIO_ACTUAL } from "@/lib/usuario";
import type { InboxItem } from "@/lib/types";
import { PasoActivoCard } from "./PasoActivo";
import { NuevoPaso } from "./NuevoPaso";
import { VistaInbox } from "./VistaInbox";

interface Props {
  onOpenBuscador?: () => void;
}

export function PantallaHoy({ onOpenBuscador }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const pasosActivos = usePasosActivos();
  const [showNuevoPaso, setShowNuevoPaso] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [quickCapture, setQuickCapture] = useState("");

  const pendingInbox = useMemo(() => state.inbox.filter((i) => !i.procesado).length, [state.inbox]);

  function captureIdea() {
    const text = quickCapture.trim();
    if (!text) return;
    const item: InboxItem = { id: generateId(), texto: text, creado: new Date().toISOString(), procesado: false };
    dispatch({ type: "ADD_INBOX", payload: item });
    setQuickCapture("");
  }

  const isEmpty = pasosActivos.length === 0;

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Hoy</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {USUARIO_ACTUAL} · {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Pasos activos */}
      {pasosActivos.length > 0 && (
        <section className="mb-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-green-600">
            {pasosActivos.length === 1 ? "1 paso en curso" : `${pasosActivos.length} pasos en curso`}
          </h2>
          {pasosActivos.map((p) => (
            <PasoActivoCard key={p.id} paso={p} />
          ))}
        </section>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="mb-6 flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 text-5xl opacity-30">☀️</div>
          <p className="text-sm text-zinc-400">Tu día empieza vacío.</p>
          <p className="text-xs text-zinc-300">Inicia un paso o captura una idea.</p>
        </div>
      )}

      {/* CTA: Empezar paso */}
      <button
        onClick={() => setShowNuevoPaso(true)}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-base font-semibold text-white shadow-lg shadow-amber-500/20 transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v12M6 12h12" /></svg>
        {pasosActivos.length > 0 ? "Iniciar otro paso" : "Iniciar un paso"}
      </button>

      {/* Quick capture (Inbox GTD) */}
      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={quickCapture}
            onChange={(e) => setQuickCapture(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") captureIdea(); }}
            placeholder="Captura una idea al vuelo..."
            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 focus:border-amber-300 focus:outline-none"
          />
          <button
            onClick={captureIdea}
            disabled={!quickCapture.trim()}
            className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>

      {/* Inbox badge */}
      {pendingInbox > 0 && (
        <button onClick={() => setShowInbox(true)} className="mb-4 w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition-colors hover:bg-amber-100">
          <p className="text-sm font-medium text-amber-700">
            {pendingInbox} {pendingInbox === 1 ? "idea" : "ideas"} por clasificar
          </p>
        </button>
      )}

      {/* Search */}
      {onOpenBuscador && (
        <button onClick={onOpenBuscador} className="mb-4 flex w-full items-center gap-2 rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-400 transition-colors hover:bg-zinc-50">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          Buscar...
        </button>
      )}

      {/* Panels */}
      {showNuevoPaso && <NuevoPaso onClose={() => setShowNuevoPaso(false)} />}
      {showInbox && <VistaInbox onClose={() => setShowInbox(false)} />}
    </div>
  );
}
