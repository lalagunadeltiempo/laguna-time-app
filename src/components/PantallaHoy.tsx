"use client";

import { useState, useMemo, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { usePasosActivos, useDependenciasEntrantes, useEsperandoRespuesta, usePlannedBlocks, splitPlannedBlocks, useFocoProyectos, buildClosedPaso, type PlannedBlock } from "@/lib/hooks";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { toDateKey } from "@/lib/date-utils";
import type { InboxItem, Paso } from "@/lib/types";
import { PasoActivoCard } from "./PasoActivo";
import { NuevoPaso } from "./NuevoPaso";
import { VistaInbox } from "./VistaInbox";
import HierarchyPicker from "./shared/HierarchyPicker";

export function PantallaHoy() {
  const isMentor = useIsMentor();
  const { nombre: currentUser } = useUsuario();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const pasosActivos = usePasosActivos();
  const [showNuevoPaso, setShowNuevoPaso] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showEndOfDay, setShowEndOfDay] = useState(false);
  const [showRetro, setShowRetro] = useState(false);
  const [quickCapture, setQuickCapture] = useState("");

  const depsEntrantes = useDependenciasEntrantes();
  const esperando = useEsperandoRespuesta();
  const pendingInbox = useMemo(() => state.inbox.filter((i) => !i.procesado).length, [state.inbox]);

  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  useEffect(() => {
    const id = setInterval(() => { const k = toDateKey(new Date()); setTodayKey((prev) => prev !== k ? k : prev); }, 60_000);
    return () => clearInterval(id);
  }, []);

  const plannedBlocks = usePlannedBlocks(todayKey);
  const { hoy: blocksHoy, arrastrado: blocksArrastrado, enMarcha: blocksEnMarcha } = useMemo(
    () => splitPlannedBlocks(plannedBlocks),
    [plannedBlocks],
  );
  const blocksPrincipalesAll = useMemo(() => [...blocksHoy, ...blocksEnMarcha], [blocksHoy, blocksEnMarcha]);

  const { focoIds, toggleFoco, clearFoco, focoMax } = useFocoProyectos();
  const focoActivo = focoIds.length > 0;

  const { blocksPrincipales, blocksOtros } = useMemo(() => {
    if (!focoActivo) return { blocksPrincipales: blocksPrincipalesAll, blocksOtros: [] as PlannedBlock[] };
    const foco: PlannedBlock[] = [];
    const otros: PlannedBlock[] = [];
    for (const b of blocksPrincipalesAll) {
      if (b.proyectoId && focoIds.includes(b.proyectoId)) foco.push(b);
      else otros.push(b);
    }
    return { blocksPrincipales: foco, blocksOtros: otros };
  }, [blocksPrincipalesAll, focoIds, focoActivo]);

  const proyectosConTrabajoHoy = useMemo(() => {
    const map = new Map<string, { proyectoId: string; proyectoNombre: string; hex: string; count: number }>();
    for (const b of blocksPrincipalesAll) {
      if (!b.proyectoId) continue;
      const existing = map.get(b.proyectoId);
      if (existing) existing.count++;
      else map.set(b.proyectoId, { proyectoId: b.proyectoId, proyectoNombre: b.proyectoNombre ?? "Sin proyecto", hex: b.hex, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [blocksPrincipalesAll]);

  const [showFocoPicker, setShowFocoPicker] = useState(false);
  const [otrosOpen, setOtrosOpen] = useState(false);

  const [orphanBlock, setOrphanBlock] = useState<{ entregableId: string; title: string } | null>(null);

  if (isMentor) return <div className="p-8 text-center text-muted">Vista no disponible para mentor.</div>;

  const isEmpty = pasosActivos.length === 0 && blocksPrincipalesAll.length === 0 && blocksArrastrado.length === 0;
  const hasOpenWork = pasosActivos.length > 0 || pendingInbox > 0;

  function captureIdea() {
    const text = quickCapture.trim();
    if (!text) return;
    const item: InboxItem = { id: generateId(), texto: text, creado: new Date().toISOString(), procesado: false };
    dispatch({ type: "ADD_INBOX", payload: item });
    setQuickCapture("");
  }

  function startPlannedBlock(block: typeof plannedBlocks[0]) {
    const ent = state.entregables.find((e) => e.id === block.entregableId);
    if (!ent) return;
    const res = state.resultados.find((r) => r.id === ent.resultadoId);
    const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
    if (!res || !proj) {
      setOrphanBlock({ entregableId: block.entregableId, title: block.title });
      return;
    }
    doStartPlanned(block);
  }

  function doStartPlanned(block: typeof plannedBlocks[0]) {
    if (!block.entregableId) return;
    if (block.id.startsWith("next-")) {
      const pasoId = block.id.slice(5);
      dispatch({ type: "REOPEN_PASO", id: pasoId });
      return;
    }
    const existingPending = state.pasos.find((p) => p.entregableId === block.entregableId && !p.inicioTs && !p.finTs && p.nombre === block.title);
    if (existingPending) {
      dispatch({ type: "ACTIVATE_PASO", id: existingPending.id });
      dispatch({ type: "UPDATE_ENTREGABLE", id: block.entregableId, changes: { estado: "en_proceso" } });
    } else {
      dispatch({
        type: "START_PASO",
        payload: {
          id: generateId(), entregableId: block.entregableId, nombre: block.title,
          inicioTs: new Date().toISOString(), finTs: null, estado: "",
          contexto: { urls: [] as import("@/lib/types").UrlRef[], apps: [] as string[], notas: "" },
          implicados: [{ tipo: "equipo", nombre: currentUser }],
          pausas: [], siguientePaso: null,
        },
      });
    }
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

      {/* Planned blocks for today */}
      {(blocksPrincipalesAll.length > 0 || focoActivo) && (
        <section className="mb-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground/60">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Planificados para hoy ({blocksPrincipales.length})
              {focoActivo && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700" title="Modo foco activo">
                  Foco · {focoIds.length}
                </span>
              )}
            </h2>
            {proyectosConTrabajoHoy.length > 0 && (
              <button
                onClick={() => setShowFocoPicker(true)}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${focoActivo ? "border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100" : "border-border bg-background text-muted hover:bg-surface hover:text-foreground"}`}
                title="Modo foco: limita HOY a 1-3 proyectos"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                </svg>
                Foco
              </button>
            )}
          </div>
          {blocksPrincipales.length === 0 && focoActivo && (
            <p className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 text-[12px] text-violet-700">
              Nada de tus proyectos en foco hoy. Despliega &quot;Otros proyectos&quot; si quieres verlos, o quita el foco.
            </p>
          )}
          {blocksPrincipales.map((block) => (
            <PlannedRow key={block.id} block={block} onStart={() => startPlannedBlock(block)} />
          ))}
        </section>
      )}

      {/* Otros proyectos (modo foco) */}
      {focoActivo && blocksOtros.length > 0 && (
        <section className="mb-5">
          <button
            type="button"
            onClick={() => setOtrosOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 px-3 py-2.5 text-left transition-colors hover:bg-violet-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`shrink-0 text-violet-500 transition-transform ${otrosOpen ? "rotate-90" : ""}`}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <p className="flex-1 text-xs font-semibold uppercase tracking-wider text-violet-700">
              Otros proyectos con trabajo hoy ({blocksOtros.length})
            </p>
          </button>
          {otrosOpen && (
            <div className="mt-2 space-y-1.5">
              {blocksOtros.map((block) => (
                <PlannedRow key={block.id} block={block} onStart={() => startPlannedBlock(block)} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Arrastrados desde días anteriores */}
      {blocksArrastrado.length > 0 && (
        <ArrastradoSection
          blocks={blocksArrastrado}
          todayKey={todayKey}
          onStart={startPlannedBlock}
        />
      )}

      {/* CTA: Start step */}
      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setShowNuevoPaso(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-orange-500 py-4 text-base font-semibold text-white shadow-lg shadow-accent/20 transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v12M6 12h12" />
          </svg>
          {pasosActivos.length > 0 ? "Iniciar otro paso" : "Iniciar un paso"}
        </button>
        <button
          onClick={() => setShowRetro(true)}
          className="flex items-center gap-1.5 rounded-2xl border border-border px-4 py-4 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
          title="Registrar un paso que ya hiciste"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          Registrar
        </button>
      </div>

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

      {/* Dependencias entrantes */}
      {depsEntrantes.length > 0 && (
        <section className="mb-5 space-y-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-600">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
            Esperan tu parte ({depsEntrantes.length})
          </h2>
          {depsEntrantes.map((dep) => (
            <div key={dep.paso.id} className="rounded-xl border border-purple-200 bg-purple-50 p-3">
              <p className="text-sm font-medium text-purple-900">{dep.entregableNombre}</p>
              <p className="text-xs text-purple-700">
                <span className="font-semibold">{dep.remitente}</span> espera que hagas tu parte
              </p>
              {dep.proyectoNombre && <p className="mt-0.5 text-[11px] text-purple-500">{dep.proyectoNombre}</p>}
            </div>
          ))}
        </section>
      )}

      {/* Esperando respuesta (tracking para remitente) */}
      {esperando.length > 0 && (
        <section className="mb-5 space-y-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-600">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Esperando respuesta ({esperando.length})
          </h2>
          {esperando.map((item) => (
            <div key={item.paso.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">{item.entregableNombre}</p>
              <p className="text-xs text-amber-700">
                Depende de: {item.dependeDe.map((d) => d.nombre).join(", ")}
              </p>
              {item.fechaProgramada && (
                <p className="mt-0.5 text-[11px] text-amber-500">Estimado: {item.fechaProgramada}</p>
              )}
            </div>
          ))}
        </section>
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
      {showRetro && <RegistrarPasoPasado onClose={() => setShowRetro(false)} />}
      {showFocoPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
          role="dialog" aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setShowFocoPicker(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") setShowFocoPicker(false); }}>
          <div className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-background p-5 shadow-2xl">
            <div className="mb-1 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" fill="currentColor" />
              </svg>
              <h2 className="text-base font-semibold text-foreground">Modo foco</h2>
            </div>
            <p className="mb-3 text-[12px] text-muted">
              Elige hasta {focoMax} proyectos. Solo verás trabajo de esos proyectos como principal; el resto queda en &quot;Otros proyectos con trabajo hoy&quot;.
            </p>
            {proyectosConTrabajoHoy.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No hay proyectos con trabajo hoy.</p>
            ) : (
              <div className="mb-3 space-y-1.5">
                {proyectosConTrabajoHoy.map((p) => {
                  const selected = focoIds.includes(p.proyectoId);
                  const disabled = !selected && focoIds.length >= focoMax;
                  return (
                    <button
                      key={p.proyectoId}
                      onClick={() => toggleFoco(p.proyectoId)}
                      disabled={disabled}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${selected ? "border-violet-400 bg-violet-50" : "border-border bg-surface/50 hover:bg-surface"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                      title={disabled ? `Máximo ${focoMax} proyectos en foco` : undefined}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.hex }} />
                      <span className="flex-1 truncate text-sm font-medium text-foreground">{p.proyectoNombre}</span>
                      <span className="text-[11px] text-muted">{p.count}</span>
                      {selected && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { clearFoco(); setShowFocoPicker(false); }}
                disabled={!focoActivo}
                className="flex-1 rounded-lg border border-border py-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-40"
              >
                Quitar foco
              </button>
              <button
                onClick={() => setShowFocoPicker(false)}
                className="flex-1 rounded-lg bg-foreground py-2.5 text-xs font-semibold text-background hover:bg-foreground/90"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {orphanBlock && (
        <HierarchyPicker
          depth="resultado"
          title={`Destino para "${orphanBlock.title}"`}
          onSelect={(sel) => {
            if (sel.resultadoId && orphanBlock.entregableId) {
              dispatch({ type: "MOVE_ENTREGABLE", entregableId: orphanBlock.entregableId, nuevoResultadoId: sel.resultadoId });
            }
            setOrphanBlock(null);
          }}
          onCancel={() => setOrphanBlock(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   END OF DAY FLOW
   ============================================================ */


/* ============================================================
   REGISTRAR PASO PASADO (retroactive)
   ============================================================ */

function RegistrarPasoPasado({ onClose }: { onClose: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();

  const [nombre, setNombre] = useState("");
  const [entregableId, setEntregableId] = useState<string | null>(null);
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() - 1);
    return toLocalDateTimeStr(d);
  });
  const [fechaFin, setFechaFin] = useState(() => toLocalDateTimeStr(new Date()));

  const entregables = useMemo(() => {
    const lastAct = new Map<string, number>();
    for (const p of state.pasos) {
      if (!p.inicioTs) continue;
      const ts = new Date(p.inicioTs).getTime();
      const prev = lastAct.get(p.entregableId) ?? 0;
      if (ts > prev) lastAct.set(p.entregableId, ts);
    }
    return state.entregables
      .filter((e) => e.estado !== "hecho" && e.estado !== "cancelada")
      .sort((a, b) => (lastAct.get(b.id) ?? 0) - (lastAct.get(a.id) ?? 0))
      .slice(0, 15);
  }, [state.entregables, state.pasos]);

  function submit() {
    if (!nombre.trim() || !entregableId) return;
    const inicioTs = new Date(fechaInicio).toISOString();
    const finTs = new Date(fechaFin).toISOString();
    if (new Date(finTs) <= new Date(inicioTs)) return;
    const paso: Paso = {
      id: generateId(),
      entregableId,
      nombre: nombre.trim(),
      inicioTs,
      finTs,
      estado: nombre.trim(),
      contexto: { urls: [], apps: [], notas: "" },
      implicados: [{ tipo: "equipo", nombre: currentUser }],
      pausas: [],
      siguientePaso: null,
    };
    dispatch({ type: "ADD_PASO", payload: paso });
    dispatch({ type: "CLOSE_PASO", payload: paso });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-background p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold text-foreground">Registrar paso pasado</h2>

        <label className="mb-1 block text-xs font-medium text-muted">Entregable</label>
        <div className="mb-3 max-h-32 overflow-y-auto rounded-lg border border-border">
          {entregables.map((e) => (
            <button key={e.id} onClick={() => setEntregableId(e.id)}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors ${entregableId === e.id ? "bg-accent-soft font-medium text-accent" : "text-foreground hover:bg-surface"}`}>
              {e.nombre}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-xs font-medium text-muted">Nombre del paso</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
          placeholder="¿Qué hiciste?"
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent" />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Inicio</label>
            <input type="datetime-local" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-base text-foreground outline-none focus:border-accent" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Fin</label>
            <input type="datetime-local" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-base text-foreground outline-none focus:border-accent" />
          </div>
        </div>

        <button onClick={submit} disabled={!nombre.trim() || !entregableId}
          className="mb-2 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white disabled:opacity-40 hover:bg-accent/90">
          Registrar
        </button>
        <button onClick={onClose}
          className="w-full rounded-xl border border-border py-2.5 text-xs font-medium text-muted hover:bg-surface">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function toLocalDateTimeStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-background p-6 shadow-2xl">
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

/* ============================================================
   PlannedRow / ArrastradoSection — UI para "Planificados para hoy"
   ============================================================ */

function PlannedRow({ block, onStart }: { block: PlannedBlock; onStart: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border-l-[3px] bg-surface/50 px-3 py-2.5" style={{ borderLeftColor: block.hex }}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: block.hex }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{block.title}</p>
        <p className="truncate text-[11px] text-muted">{block.subtitle}</p>
      </div>
      <button
        onClick={onStart}
        className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white hover:brightness-110"
        style={{ backgroundColor: block.hex }}
      >
        Empezar
      </button>
    </div>
  );
}

function ArrastradoSection({
  blocks,
  todayKey,
  onStart,
}: {
  blocks: PlannedBlock[];
  todayKey: string;
  onStart: (block: PlannedBlock) => void;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  const grupos = useMemo(() => {
    const map = new Map<string, { proyectoId: string; proyectoNombre: string; hex: string; items: PlannedBlock[] }>();
    for (const b of blocks) {
      const key = b.proyectoId ?? "sin-proyecto";
      const existing = map.get(key);
      if (existing) {
        existing.items.push(b);
      } else {
        map.set(key, {
          proyectoId: key,
          proyectoNombre: b.proyectoNombre ?? "Sin proyecto",
          hex: b.hex,
          items: [b],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [blocks]);

  function planificarHoy(block: PlannedBlock) {
    if (!block.entregableId) return;
    dispatch({
      type: "UPDATE_ENTREGABLE",
      id: block.entregableId,
      changes: { fechaInicio: todayKey, planNivel: "dia" },
    });
  }

  function posponerManana(block: PlannedBlock) {
    if (!block.entregableId) return;
    const d = new Date(todayKey + "T12:00:00");
    d.setDate(d.getDate() + 1);
    const manana = toDateKey(d);
    dispatch({
      type: "UPDATE_ENTREGABLE",
      id: block.entregableId,
      changes: { fechaInicio: manana, planNivel: "dia" },
    });
  }

  function ponerEnEspera(block: PlannedBlock) {
    if (!block.entregableId) return;
    dispatch({
      type: "UPDATE_ENTREGABLE",
      id: block.entregableId,
      changes: { estado: "en_espera" },
    });
  }

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border bg-surface/30 px-3 py-2.5 text-left transition-colors hover:bg-surface/60"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Abierto desde días anteriores ({blocks.length})
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted/70">
            {grupos
              .slice(0, 3)
              .map((g) => `${g.proyectoNombre} · ${g.items.length}`)
              .join("  ·  ")}
            {grupos.length > 3 ? `  ·  +${grupos.length - 3}` : ""}
          </p>
        </div>
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {grupos.map((g) => (
            <div key={g.proyectoId} className="rounded-xl border border-border/60 bg-surface/30 p-2">
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: g.hex }} />
                <p className="flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
                  {g.proyectoNombre}
                </p>
                <span className="text-[10px] text-muted">{g.items.length} abiertos</span>
              </div>
              <div className="space-y-1.5">
                {g.items.map((block) => (
                  <div
                    key={block.id}
                    className="flex flex-wrap items-center gap-1.5 rounded-lg border-l-[3px] bg-background px-2.5 py-2"
                    style={{ borderLeftColor: block.hex }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{block.title}</p>
                      <p className="truncate text-[11px] text-muted">{block.subtitle}</p>
                    </div>
                    <button
                      onClick={() => planificarHoy(block)}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-accent-soft hover:text-accent"
                      title="Fijar hoy como fecha de inicio"
                    >
                      Hoy
                    </button>
                    <button
                      onClick={() => posponerManana(block)}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-accent-soft hover:text-accent"
                      title="Mover la fecha de inicio a mañana"
                    >
                      Mañana
                    </button>
                    <button
                      onClick={() => ponerEnEspera(block)}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-amber-100 hover:text-amber-700"
                      title="Marcar como en_espera para que deje de aparecer"
                    >
                      En espera
                    </button>
                    <button
                      onClick={() => onStart(block)}
                      className="shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold text-white hover:brightness-110"
                      style={{ backgroundColor: block.hex }}
                    >
                      Empezar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
