"use client";

import { useState, useMemo, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { usePasosActivos, useSOPsHoy, useDependenciasEntrantes, useEsperandoRespuesta, buildClosedPaso } from "@/lib/hooks";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { toDateKey } from "@/lib/date-utils";
import type { InboxItem, Paso } from "@/lib/types";
import { AREA_COLORS } from "@/lib/types";
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

  const { mios: sopsMios } = useSOPsHoy();
  const depsEntrantes = useDependenciasEntrantes();
  const esperando = useEsperandoRespuesta();
  const pendingInbox = useMemo(() => state.inbox.filter((i) => !i.procesado).length, [state.inbox]);

  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  useEffect(() => {
    const id = setInterval(() => { const k = toDateKey(new Date()); setTodayKey((prev) => prev !== k ? k : prev); }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Planned blocks for today (same logic as PlanHoy)
  const plannedBlocks = useMemo(() => {
    const { pasos, entregables, resultados, proyectos } = state;
    type PBlock = { id: string; title: string; subtitle: string; entregableId: string; pasoId?: string; area: string; hex: string };
    const result: PBlock[] = [];
    const entIdsWithPasos = new Set<string>();

    for (const p of pasos) {
      if (p.inicioTs && p.inicioTs.slice(0, 10) === todayKey) {
        entIdsWithPasos.add(p.entregableId);
      }
    }

    for (const paso of pasos) {
      if (!paso.finTs || !paso.siguientePaso) continue;
      if (paso.siguientePaso.tipo !== "continuar") continue;
      let fp = paso.siguientePaso.fechaProgramada;
      if (!fp) continue;
      if (fp === "manana") {
        const finDate = new Date(paso.finTs);
        finDate.setDate(finDate.getDate() + 1);
        fp = toDateKey(finDate);
      }
      if (fp > todayKey) continue;
      if (result.some((b) => b.id === `next-${paso.id}`)) continue;
      const newerPasoExists = pasos.some((p) => p.entregableId === paso.entregableId && p.inicioTs && paso.finTs && p.inicioTs >= paso.finTs);
      if (newerPasoExists) continue;
      const ent = entregables.find((e) => e.id === paso.entregableId);
      if (!ent) continue;
      if (ent.estado === "hecho" || ent.estado === "cancelada") continue;
      if (ent.responsable && ent.responsable !== currentUser) continue;
      entIdsWithPasos.add(ent.id);
      const res = resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? proyectos.find((pr) => pr.id === res.proyectoId) : undefined;
      result.push({ id: `next-${paso.id}`, title: paso.siguientePaso.nombre ?? paso.nombre, subtitle: `${proj?.nombre ?? ""} · ${ent.nombre}`, entregableId: ent.id, pasoId: paso.id, area: proj?.area ?? "operativa", hex: AREA_COLORS[proj?.area ?? ""]?.hex ?? "#888" });
    }

    for (const ent of entregables) {
      if (!ent.fechaInicio || ent.fechaInicio > todayKey) continue;
      if (ent.planNivel === "mes" || ent.planNivel === "trimestre") continue;
      if (ent.estado === "hecho" || ent.estado === "cancelada") continue;
      if (entIdsWithPasos.has(ent.id)) continue;
      if (ent.responsable && ent.responsable !== currentUser) continue;
      const res = resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? proyectos.find((pr) => pr.id === res.proyectoId) : undefined;
      result.push({ id: `ent-${ent.id}`, title: ent.nombre, subtitle: proj?.nombre ?? "", entregableId: ent.id, area: proj?.area ?? "operativa", hex: AREA_COLORS[proj?.area ?? ""]?.hex ?? "#888" });
    }

    for (const entId of entIdsWithPasos) {
      if (result.some((b) => b.id.startsWith("next-") && b.entregableId === entId)) continue;
      if (result.some((b) => b.id.startsWith("pending-") && b.entregableId === entId)) continue;
      const ent = entregables.find((e) => e.id === entId);
      if (!ent || ent.estado !== "en_proceso") continue;
      if (ent.responsable && ent.responsable !== currentUser) continue;
      const pendingPaso = pasos.find((p) => p.entregableId === entId && !p.inicioTs && !p.finTs);
      if (!pendingPaso) continue;
      const res = resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? proyectos.find((pr) => pr.id === res.proyectoId) : undefined;
      result.push({ id: `pending-${pendingPaso.id}`, title: pendingPaso.nombre, subtitle: `${proj?.nombre ?? ""} · ${ent.nombre}`, entregableId: ent.id, pasoId: pendingPaso.id, area: proj?.area ?? "operativa", hex: AREA_COLORS[proj?.area ?? ""]?.hex ?? "#888" });
    }

    return result;
  }, [state, todayKey, currentUser]);

  const [sopDestPicker, setSopDestPicker] = useState<string | null>(null);
  const [sopDestCache, setSopDestCache] = useState<Map<string, string>>(new Map());
  const [orphanBlock, setOrphanBlock] = useState<{ entregableId: string; title: string } | null>(null);

  if (isMentor) return <div className="p-8 text-center text-muted">Vista no disponible para mentor.</div>;

  const sopsPendientes = sopsMios.filter((s) => {
    if (s.completadoHoy || s.ejecucion) return false;
    const yaEnCurso = state.entregables.some(
      (e) => e.plantillaId === s.plantilla.id
        && state.pasosActivos.some((pid) => state.pasos.find((p) => p.id === pid)?.entregableId === e.id),
    );
    return !yaEnCurso;
  });
  const isEmpty = pasosActivos.length === 0 && plannedBlocks.length === 0;
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
    const existingPending = state.pasos.find((p) => p.entregableId === block.entregableId && !p.inicioTs && !p.finTs && p.nombre === block.title);
    if (existingPending) {
      dispatch({ type: "ACTIVATE_PASO", id: existingPending.id });
      dispatch({ type: "UPDATE_ENTREGABLE", id: block.entregableId, changes: { estado: "en_proceso" } });
    } else {
      const prevPasoId = block.id.startsWith("next-") ? block.id.slice(5) : null;
      const prevPaso = prevPasoId ? state.pasos.find((p) => p.id === prevPasoId) : null;
      const contexto = prevPaso
        ? { ...prevPaso.contexto }
        : { urls: [] as import("@/lib/types").UrlRef[], apps: [] as string[], notas: "" };
      dispatch({
        type: "START_PASO",
        payload: {
          id: generateId(), entregableId: block.entregableId, nombre: block.title,
          inicioTs: new Date().toISOString(), finTs: null, estado: "",
          contexto,
          implicados: [{ tipo: "equipo", nombre: currentUser }],
          pausas: [], siguientePaso: null,
        },
      });
    }
  }

  function startSOPStep(plantilla: import("@/lib/types").PlantillaProceso, pasoNombre: string) {
    const proj = plantilla.proyectoId ? state.proyectos.find((p) => p.id === plantilla.proyectoId) : undefined;
    const cachedResId = sopDestCache.get(plantilla.id);
    const res = cachedResId
      ? state.resultados.find((r) => r.id === cachedResId)
      : proj ? state.resultados.find((r) => r.proyectoId === proj.id) : undefined;

    if (!res) {
      setSopDestPicker(plantilla.id);
      return;
    }

    const existingEnt = state.entregables.find((e) => e.plantillaId === plantilla.id && e.fechaInicio === todayKey);
    let entregableId: string;

    if (existingEnt) {
      entregableId = existingEnt.id;
    } else {
      entregableId = generateId();
      dispatch({
        type: "MATERIALIZE_SOP",
        plantillaId: plantilla.id,
        area: plantilla.area,
        responsable: plantilla.responsableDefault ?? currentUser,
        currentUser,
        dateKey: todayKey,
        ids: { resultado: generateId(), entregable: entregableId, paso: generateId(), proyecto: generateId() },
        resultadoId: res.id,
        autoStart: false,
      });
    }

    dispatch({
      type: "START_PASO",
      payload: {
        id: generateId(), entregableId, nombre: pasoNombre,
        inicioTs: new Date().toISOString(), finTs: null, estado: "",
        contexto: { urls: [], apps: [], notas: "" },
        implicados: [{ tipo: "equipo", nombre: currentUser }],
        pausas: [], siguientePaso: null,
      },
    });
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
      {isEmpty && !showNuevoPaso && sopsPendientes.length === 0 && (
        <div className="mb-8 flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-4 text-5xl opacity-20">☀️</div>
          <p className="text-base text-muted">Tu día empieza vacío.</p>
          <p className="mt-1 text-sm text-muted/60">Inicia un paso o captura una idea.</p>
        </div>
      )}

      {/* Planned blocks for today */}
      {plannedBlocks.length > 0 && (
        <section className="mb-5 space-y-1.5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground/60">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Planificados para hoy ({plannedBlocks.length})
          </h2>
          {plannedBlocks.map((block) => (
            <div key={block.id} className="flex items-center gap-2 rounded-xl border-l-[3px] bg-surface/50 px-3 py-2.5" style={{ borderLeftColor: block.hex }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: block.hex }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{block.title}</p>
                <p className="truncate text-[11px] text-muted">{block.subtitle}</p>
              </div>
              <button onClick={() => startPlannedBlock(block)}
                className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white hover:brightness-110"
                style={{ backgroundColor: block.hex }}>
                Empezar
              </button>
            </div>
          ))}
        </section>
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

      {/* SOPs pendientes hoy — expandable cards */}
      {sopsPendientes.length > 0 && (
        <section className="mb-5 space-y-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            SOPs programados ({sopsPendientes.length})
          </h2>
          {sopsPendientes.map((sop) => (
            <SOPExpandableCard key={sop.plantilla.id} sop={sop} onStartStep={(pasoNombre) => startSOPStep(sop.plantilla, pasoNombre)} onPickDest={() => setSopDestPicker(sop.plantilla.id)} />
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
      {sopDestPicker && (() => {
        const pl = state.plantillas.find((p) => p.id === sopDestPicker);
        if (!pl) return null;
        return (
          <HierarchyPicker
            depth="resultado"
            initialArea={pl.area}
            title={`Destino para "${pl.nombre}"`}
            onSelect={(sel) => {
              if (sel.proyectoId) dispatch({ type: "UPDATE_PLANTILLA", id: pl.id, changes: { proyectoId: sel.proyectoId } });
              if (sel.resultadoId) setSopDestCache((prev) => new Map(prev).set(pl.id, sel.resultadoId!));
              setSopDestPicker(null);
            }}
            onCancel={() => setSopDestPicker(null)}
          />
        );
      })()}
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
   SOP EXPANDABLE CARD
   ============================================================ */

function SOPExpandableCard({ sop, onStartStep, onPickDest }: {
  sop: import("@/lib/sop-scheduler").SOPHoy;
  onStartStep: (pasoNombre: string) => void;
  onPickDest: () => void;
}) {
  const state = useAppState();
  const [open, setOpen] = useState(false);
  const pl = sop.plantilla;
  const hex = AREA_COLORS[pl.area]?.hex ?? "#6d28d9";

  const proj = pl.proyectoId ? state.proyectos.find((p) => p.id === pl.proyectoId) : undefined;
  const res = proj ? state.resultados.find((r) => r.proyectoId === proj.id) : undefined;
  const hasDest = !!proj && !!res;

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: hex + "40" }}>
      <button onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/50"
        style={{ backgroundColor: hex + "08" }}>
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: hex }}>{pl.nombre}</p>
          {hasDest ? (
            <p className="truncate text-[11px] text-muted">{proj!.nombre} → {res!.nombre}</p>
          ) : (
            <p className="text-[11px] font-medium text-amber-600">Sin destino asignado</p>
          )}
        </div>
        <span className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: hex + "15", color: hex }}>
          {pl.pasos.length}p
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}>
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>

      {open && (
        <div className="border-t px-4 py-2 space-y-1" style={{ borderColor: hex + "20" }}>
          {!hasDest && (
            <button onClick={onPickDest}
              className="mb-2 w-full rounded-lg border border-dashed border-amber-300 bg-amber-50 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100">
              Asignar proyecto y resultado
            </button>
          )}
          {pl.pasos.map((paso, i) => (
            <div key={paso.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: hex + "80" }}>
                {i + 1}
              </span>
              <span className="flex-1 truncate text-sm text-foreground">{paso.nombre}</span>
              {hasDest && (
                <button onClick={() => onStartStep(paso.nombre)}
                  className="shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:brightness-110"
                  style={{ backgroundColor: hex }}>
                  Iniciar
                </button>
              )}
            </div>
          ))}
        </div>
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
