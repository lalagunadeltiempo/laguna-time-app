"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { usePasosActivos } from "@/lib/hooks";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import type { InboxItem, Paso } from "@/lib/types";
import { PasoActivoCard } from "./PasoActivo";
import { NuevoPaso } from "./NuevoPaso";
import { VistaInbox } from "./VistaInbox";

export function PantallaHoy() {
  const isMentor = useIsMentor();
  const { nombre: currentUser } = useUsuario();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const pasosActivos = usePasosActivos();
  const [showNuevoPaso, setShowNuevoPaso] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showEndOfDay, setShowEndOfDay] = useState(false);
  const [quickCapture, setQuickCapture] = useState("");

  const autoCloseAtMidnight = useCallback(() => {
    for (const paso of pasosActivos) {
      dispatch({ type: "CLOSE_PASO", payload: buildClosedPaso(paso) });
    }
  }, [pasosActivos, dispatch]);

  useEffect(() => {
    if (pasosActivos.length === 0) return;
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const ms = midnight.getTime() - now.getTime();
    const timer = setTimeout(autoCloseAtMidnight, ms);
    return () => clearTimeout(timer);
  }, [pasosActivos, autoCloseAtMidnight]);

  if (isMentor) return <div className="p-8 text-center text-muted">Vista no disponible para mentor.</div>;

  const pendingInbox = useMemo(() => state.inbox.filter((i) => !i.procesado).length, [state.inbox]);
  const isEmpty = pasosActivos.length === 0;
  const hasOpenWork = pasosActivos.length > 0 || pendingInbox > 0;

  function captureIdea() {
    const text = quickCapture.trim();
    if (!text) return;
    const item: InboxItem = { id: generateId(), texto: text, creado: new Date().toISOString(), procesado: false };
    dispatch({ type: "ADD_INBOX", payload: item });
    setQuickCapture("");
  }

  return (
    <div className="flex flex-1 flex-col px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Hoy</h1>
        <p className="mt-1 text-sm text-muted">
          {currentUser} · {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Active steps */}
      {pasosActivos.length > 0 && (
        <section className="mb-6 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-green-600">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
            {pasosActivos.length === 1 ? "1 paso en curso" : `${pasosActivos.length} pasos en curso`}
          </h2>
          {pasosActivos.map((p) => (
            <PasoActivoCard key={p.id} paso={p} />
          ))}
        </section>
      )}

      {/* Empty state */}
      {isEmpty && !showNuevoPaso && (
        <div className="mb-8 flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 text-5xl opacity-20">☀️</div>
          <p className="text-base text-muted">Tu día empieza vacío.</p>
          <p className="mt-1 text-sm text-muted/60">Inicia un paso o captura una idea.</p>
        </div>
      )}

      {/* CTA: Start step */}
      <button
        onClick={() => setShowNuevoPaso(true)}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-orange-500 py-4 text-base font-semibold text-white shadow-lg shadow-accent/20 transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><path d="M12 6v12M6 12h12" />
        </svg>
        {pasosActivos.length > 0 ? "Iniciar otro paso" : "Iniciar un paso"}
      </button>

      {/* Quick capture (Inbox GTD) */}
      <div className="mb-5">
        <div className="flex gap-2">
          <input
            type="text"
            value={quickCapture}
            onChange={(e) => setQuickCapture(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") captureIdea(); }}
            placeholder="Captura una idea al vuelo..."
            className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            onClick={captureIdea}
            disabled={!quickCapture.trim()}
            className="rounded-xl bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/80 disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>

      {/* Inbox badge */}
      {pendingInbox > 0 && (
        <button onClick={() => setShowInbox(true)} className="mb-5 w-full rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-left transition-colors hover:bg-accent-soft/80">
          <p className="text-sm font-medium text-accent">
            {pendingInbox} {pendingInbox === 1 ? "idea" : "ideas"} por clasificar
          </p>
        </button>
      )}

      {/* End of day button — always visible */}
      <button
        onClick={() => setShowEndOfDay(true)}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
        {hasOpenWork ? "Cerrar el día" : "Día completado"}
      </button>

      {/* End of day flow */}
      {showEndOfDay && (
        <EndOfDayFlow
          pasosActivos={pasosActivos}
          pendingInbox={pendingInbox}
          onClose={() => setShowEndOfDay(false)}
          onOpenInbox={() => { setShowEndOfDay(false); setShowInbox(true); }}
        />
      )}

      {/* Panels */}
      {showNuevoPaso && <NuevoPaso onClose={() => setShowNuevoPaso(false)} />}
      {showInbox && <VistaInbox onClose={() => setShowInbox(false)} />}
    </div>
  );
}

/* ============================================================
   END OF DAY FLOW
   ============================================================ */

function tomorrowStr() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function buildClosedPaso(paso: Paso): Paso {
  return {
    ...paso,
    finTs: new Date().toISOString(),
    estado: paso.nombre,
    siguientePaso: {
      tipo: "continuar",
      nombre: paso.nombre,
      cuando: "manana",
      fechaProgramada: tomorrowStr(),
    },
  };
}

function EndOfDayFlow({
  pasosActivos,
  pendingInbox,
  onClose,
  onOpenInbox,
}: {
  pasosActivos: Paso[];
  pendingInbox: number;
  onClose: () => void;
  onOpenInbox: () => void;
}) {
  const dispatch = useAppDispatch();
  const state = useAppState();

  function markContinueTomorrow(paso: Paso) {
    dispatch({ type: "CLOSE_PASO", payload: buildClosedPaso(paso) });
  }

  function closeAll() {
    for (const paso of pasosActivos) {
      dispatch({ type: "CLOSE_PASO", payload: buildClosedPaso(paso) });
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Cerrar el día"
      tabIndex={-1}
      ref={(el) => el?.focus()}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Cerrar el día</h2>
            <p className="text-sm text-muted">Revisa tu trabajo antes de terminar</p>
          </div>
        </div>

        {/* Active steps */}
        {pasosActivos.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {pasosActivos.length} {pasosActivos.length === 1 ? "paso abierto" : "pasos abiertos"}
              </h3>
            </div>

            {/* Close all button */}
            <button
              onClick={closeAll}
              className="mb-3 w-full rounded-xl bg-gradient-to-r from-accent to-orange-500 py-3 text-sm font-semibold text-white shadow-md shadow-accent/20 transition-transform hover:scale-[1.01] active:scale-[0.99]"
            >
              Cerrar todos y continuar mañana
            </button>

            <p className="mb-2 text-center text-[10px] text-muted">o cierra uno a uno:</p>
            <div className="space-y-2">
              {pasosActivos.map((paso) => {
                const ent = state.entregables.find((e) => e.id === paso.entregableId);
                return (
                  <div key={paso.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{paso.nombre}</p>
                      {ent && <p className="truncate text-xs text-muted">{ent.nombre}</p>}
                    </div>
                    <button
                      onClick={() => markContinueTomorrow(paso)}
                      className="shrink-0 rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                    >
                      Mañana
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pending inbox */}
        {pendingInbox > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {pendingInbox} {pendingInbox === 1 ? "idea sin clasificar" : "ideas sin clasificar"}
            </h3>
            <button
              onClick={onOpenInbox}
              className="w-full rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            >
              Clasificar ideas
            </button>
          </div>
        )}

        {/* All clear */}
        {pasosActivos.length === 0 && pendingInbox === 0 && (
          <div className="mb-6 py-4 text-center">
            <div className="mb-2 text-3xl">✓</div>
            <p className="text-sm text-muted">Todo listo. Buen trabajo hoy.</p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full rounded-xl border border-border py-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          {pasosActivos.length === 0 && pendingInbox === 0 ? "Cerrar" : "Cerrar sin terminar"}
        </button>
      </div>
    </div>
  );
}
