"use client";

import { useState, useMemo, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import type { Paso, DependeDe, Programacion, Area, PlantillaProceso } from "@/lib/types";
import { AREAS_EMPRESA, AREAS_PERSONAL, AREA_COLORS } from "@/lib/types";
import { generateId } from "@/lib/store";
import { formatDuracion } from "@/lib/duration";
import ProgramacionPicker from "./shared/ProgramacionPicker";

type Step = "nombre_paso" | "siguiente";
type CuandoMode = "manana" | "otro" | "depende";

function resolveCuandoLabel(cuando: string): string {
  if (cuando === "manana") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
  }
  if (cuando && cuando !== "otro" && cuando !== "depende") {
    const d = new Date(cuando + "T12:00:00");
    return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
  }
  return "";
}

interface Props {
  paso: Paso;
  onClose: () => void;
}

export function CerrarPaso({ paso, onClose }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const entregable = state.entregables.find((e) => e.id === paso.entregableId);

  const plantilla = entregable?.plantillaId
    ? state.plantillas.find((pl) => pl.id === entregable.plantillaId)
    : null;

  const pasosHechos = useMemo(() => state.pasos
    .filter((p) => p.entregableId === paso.entregableId && p.finTs)
    .sort((a, b) => (a.inicioTs ?? "").localeCompare(b.inicioTs ?? "")),
  [state.pasos, paso.entregableId]);

  const pasosPendientes = useMemo(() => state.pasos
    .filter((p) => p.entregableId === paso.entregableId && !p.inicioTs && !p.finTs && p.id !== paso.id),
  [state.pasos, paso.entregableId, paso.id]);

  const allDoneNames = useMemo(() => {
    const s = new Set<string>();
    for (const p of pasosHechos) s.add(p.nombre.toLowerCase());
    s.add(paso.nombre.toLowerCase());
    for (const p of pasosPendientes) s.add(p.nombre.toLowerCase());
    return s;
  }, [pasosHechos, paso.nombre, pasosPendientes]);

  const sopPendientes = useMemo(() => {
    if (!plantilla) return [];
    return plantilla.pasos.filter((pp) => !allDoneNames.has(pp.nombre.toLowerCase()));
  }, [plantilla, allDoneNames]);

  const firstSuggestion = pasosPendientes[0]?.nombre ?? sopPendientes[0]?.nombre ?? "";
  const allStepsDone = pasosPendientes.length === 0 && sopPendientes.length === 0;

  const defaultNombre =
    paso.nombre !== entregable?.nombre
      ? paso.nombre
      : `${entregable?.nombre ?? "Paso"} — ${new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;

  const [step, setStep] = useState<Step>("nombre_paso");
  const [nombrePaso, setNombrePaso] = useState(defaultNombre);
  const [sigTipo, setSigTipo] = useState<"fin" | "continuar">("continuar");
  const [sigNombre, setSigNombre] = useState("");
  const [sigCuando, setSigCuando] = useState<CuandoMode>("manana");
  const [sigFechaCustom, setSigFechaCustom] = useState("");

  const [dependePersonas, setDependePersonas] = useState<DependeDe[]>([]);
  const [dependeFecha, setDependeFecha] = useState("");
  const [newContacto, setNewContacto] = useState({ nombre: "", email: "", telefono: "" });

  const contactosExternos = useMemo(() => state.contactos ?? [], [state.contactos]);

  const [showConvertWizard, setShowConvertWizard] = useState(false);
  const [sopObjetivo, setSOPObjetivo] = useState("");
  const [sopProg, setSOPProg] = useState<Programacion | null>(null);
  const [sopArea, setSOPArea] = useState<Area | null>(null);

  useEffect(() => {
    if (!entregable) onClose();
  }, [entregable, onClose]);

  useEffect(() => {
    if (allStepsDone) setSigTipo("fin");
  }, [allStepsDone]);

  useEffect(() => {
    if (firstSuggestion) setSigNombre((prev) => prev || firstSuggestion);
  }, [firstSuggestion]);

  if (!entregable) return null;

  const cuandoActual = sigCuando === "otro" ? sigFechaCustom : sigCuando;
  const cuandoLabel = resolveCuandoLabel(cuandoActual);

  function toggleEquipo(nombre: string) {
    setDependePersonas((prev) => {
      const exists = prev.some((d) => d.tipo === "equipo" && d.nombre === nombre);
      return exists ? prev.filter((d) => !(d.tipo === "equipo" && d.nombre === nombre)) : [...prev, { tipo: "equipo", nombre }];
    });
  }

  function toggleExterno(nombre: string) {
    setDependePersonas((prev) => {
      const exists = prev.some((d) => d.tipo === "externo" && d.nombre === nombre);
      return exists ? prev.filter((d) => !(d.tipo === "externo" && d.nombre === nombre)) : [...prev, { tipo: "externo", nombre }];
    });
  }

  function crearContactoExterno() {
    if (!newContacto.nombre.trim()) return;
    const id = generateId();
    dispatch({
      type: "ADD_CONTACTO",
      payload: { id, nombre: newContacto.nombre.trim(), email: newContacto.email.trim() || undefined, telefono: newContacto.telefono.trim() || undefined },
    });
    toggleExterno(newContacto.nombre.trim());
    setNewContacto({ nombre: "", email: "", telefono: "" });
  }

  function handleFinish(skipClose = false) {
    const finalCuando = sigCuando === "otro" ? sigFechaCustom : sigCuando;

    let fechaProg: string | undefined;
    if (sigCuando === "manana") {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      fechaProg = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    } else if (sigCuando === "otro" && sigFechaCustom) {
      fechaProg = sigFechaCustom;
    } else if (sigCuando === "depende" && dependeFecha) {
      fechaProg = dependeFecha;
    }

    const updated: Paso = {
      ...paso,
      nombre: nombrePaso.trim() || paso.nombre,
      finTs: new Date().toISOString(),
      estado: nombrePaso.trim(),
      siguientePaso:
        sigTipo === "fin"
          ? { tipo: "fin" }
          : {
              tipo: "continuar",
              nombre: sigNombre.trim() || entregable?.nombre || "Continuar",
              cuando: sigCuando === "depende" ? "depende" : finalCuando,
              fechaProgramada: fechaProg,
              dependeDe: sigCuando === "depende" ? dependePersonas : [],
            },
    };

    dispatch({ type: "CLOSE_PASO", payload: updated });
    if (!skipClose) onClose();
  }

  return (
    <div className="mt-2 rounded-2xl border-2 border-green-200 bg-white p-5 shadow-lg">
        <div className="mb-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Paso Dado</h2>
              {entregable && (
                <p className="text-sm text-zinc-500">
                  Entregable: <span className="font-medium text-zinc-700">{entregable.nombre}</span>
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-500">
                <span className="font-medium">{nombrePaso || paso.nombre}</span>
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500">
              {formatDuracion(paso)}
            </span>
          </div>
        </div>

        {step === "nombre_paso" && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">Ponle nombre o mejora el que tenías:</p>
            <input type="text" value={nombrePaso} onChange={(e) => setNombrePaso(e.target.value)} autoFocus
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20" />
            <button onClick={() => setStep("siguiente")} disabled={!nombrePaso.trim()}
              className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-40">
              Siguiente
            </button>
          </div>
        )}

        {step === "siguiente" && (
          <div className="space-y-3">
            <button onClick={() => setStep("nombre_paso")} className="text-sm text-amber-600 hover:underline">&larr; Volver</button>
            <p className="text-sm text-zinc-600">
              El paso <span className="font-medium text-zinc-800">&ldquo;{nombrePaso}&rdquo;</span> pertenece
              al entregable <span className="font-medium text-zinc-800">&ldquo;{entregable?.nombre}&rdquo;</span>.
            </p>
            <p className="text-sm text-zinc-500">Este entregable...</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setSigTipo("continuar")}
                className={`rounded-xl border-2 py-4 text-center transition-all ${sigTipo === "continuar" ? "border-amber-400 bg-amber-50" : "border-zinc-200 hover:border-zinc-300"}`}>
                <span className={`block text-sm font-medium ${sigTipo === "continuar" ? "text-amber-700" : "text-zinc-600"}`}>Sigue en curso</span>
                <span className="mt-0.5 block text-xs text-zinc-400">Haré otro paso más adelante</span>
              </button>
              <button onClick={() => setSigTipo("fin")}
                className={`rounded-xl border-2 py-4 text-center transition-all ${sigTipo === "fin" ? "border-green-400 bg-green-50" : "border-zinc-200 hover:border-zinc-300"}`}>
                <span className={`block text-sm font-medium ${sigTipo === "fin" ? "text-green-700" : "text-zinc-600"}`}>Está terminado</span>
                <span className="mt-0.5 block text-xs text-zinc-400">No necesita más pasos</span>
              </button>
            </div>

            {sigTipo === "continuar" && (
              <div className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Progreso del entregable</p>
                <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-lg border border-zinc-100 bg-white p-1.5">
                  {/* Done steps */}
                  {pasosHechos.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-zinc-400">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500 text-[8px] text-white">✓</span>
                      <span className="truncate line-through">{p.nombre}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-zinc-300">
                        {p.inicioTs ? new Date(p.inicioTs).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : ""}
                      </span>
                    </div>
                  ))}
                  {/* Current step */}
                  <div className="flex items-center gap-2 rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500 text-[8px] text-white">✓</span>
                    <span className="truncate">{nombrePaso || paso.nombre}</span>
                    <span className="ml-auto shrink-0 text-[10px]">ahora</span>
                  </div>
                  {/* Separator if there are pending items */}
                  {(pasosPendientes.length > 0 || sopPendientes.length > 0) && (
                    <div className="my-1 border-t border-dashed border-zinc-200" />
                  )}
                  {/* Pending real steps (user-created) */}
                  {pasosPendientes.map((p) => (
                    <button key={p.id} type="button" onClick={() => setSigNombre(p.nombre)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-all ${
                        sigNombre === p.nombre ? "bg-amber-50 ring-1 ring-amber-400" : "hover:bg-amber-50/50"
                      }`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${
                        sigNombre === p.nombre ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-600"
                      }`}>→</span>
                      <span className="truncate text-zinc-700">{p.nombre}</span>
                    </button>
                  ))}
                  {/* Pending SOP steps (not yet in real steps) */}
                  {sopPendientes.map((sp) => (
                    <button key={sp.id} type="button" onClick={() => setSigNombre(sp.nombre)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-all ${
                        sigNombre === sp.nombre ? "bg-purple-50 ring-1 ring-purple-400" : "hover:bg-purple-50/50"
                      }`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold ${
                        sigNombre === sp.nombre ? "bg-purple-500 text-white" : "bg-purple-100 text-purple-500"
                      }`}>→</span>
                      <span className="truncate text-zinc-500">{sp.nombre}</span>
                      <span className="ml-auto shrink-0 text-[9px] text-purple-400">SOP</span>
                    </button>
                  ))}
                  {pasosPendientes.length === 0 && sopPendientes.length === 0 && (
                    <p className="px-2 py-1 text-[10px] italic text-green-600">Todos los pasos completados</p>
                  )}
                </div>
                <p className="mt-2 text-xs font-medium text-zinc-500">Siguiente paso:</p>
                <input type="text" value={sigNombre} onChange={(e) => setSigNombre(e.target.value)}
                  placeholder={`Ej: Continuar con ${entregable?.nombre ?? "el entregable"}...`}
                  className="w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20" />

                <p className="text-xs font-medium text-zinc-500">¿Cuándo?</p>
                <div className="flex gap-2">
                  {([
                    { id: "manana" as const, label: "Mañana" },
                    { id: "otro" as const, label: "Otra fecha" },
                    { id: "depende" as const, label: "Depende de..." },
                  ]).map((opt) => (
                    <button key={opt.id} onClick={() => { setSigCuando(opt.id); if (opt.id !== "depende") { setDependePersonas([]); setDependeFecha(""); } }}
                      className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all ${
                        sigCuando === opt.id ? "border-amber-400 bg-amber-50 text-amber-700" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Otra fecha */}
                {sigCuando === "otro" && (
                  <input type="date" value={sigFechaCustom} onChange={(e) => setSigFechaCustom(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none" />
                )}

                {/* Depende de... */}
                {sigCuando === "depende" && (
                  <div className="space-y-2 rounded-lg border border-purple-200 bg-purple-50 p-3">
                    <p className="text-xs font-semibold text-purple-600">¿De quién depende?</p>

                    {/* Equipo */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Equipo</p>
                      <div className="flex flex-wrap gap-1.5">
                        {state.miembros.map((mb) => mb.nombre).map((m) => {
                          const selected = dependePersonas.some((d) => d.tipo === "equipo" && d.nombre === m);
                          return (
                            <button key={m} type="button" onClick={() => toggleEquipo(m)}
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                                selected
                                  ? "border-purple-400 bg-purple-100 text-purple-700"
                                  : "border-zinc-200 bg-white text-zinc-600 hover:border-purple-300"
                              }`}>
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Contactos externos */}
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Contactos externos</p>
                      {contactosExternos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {contactosExternos.map((c) => {
                            const selected = dependePersonas.some((d) => d.tipo === "externo" && d.nombre === c.nombre);
                            return (
                              <button key={c.id} type="button" onClick={() => toggleExterno(c.nombre)}
                                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                                  selected
                                    ? "border-purple-400 bg-purple-100 text-purple-700"
                                    : "border-zinc-200 bg-white text-zinc-600 hover:border-purple-300"
                                }`}>
                                {c.nombre}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Nuevo contacto externo */}
                      <div className="rounded-lg border border-zinc-200 bg-white p-2 space-y-1.5">
                        <p className="text-[10px] text-zinc-500 font-medium">+ Nuevo contacto externo</p>
                        <input type="text" value={newContacto.nombre} onChange={(e) => setNewContacto((c) => ({ ...c, nombre: e.target.value }))}
                          placeholder="Nombre *" className="w-full rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-300 focus:border-purple-400 focus:outline-none" />
                        <div className="flex gap-1.5">
                          <input type="email" value={newContacto.email} onChange={(e) => setNewContacto((c) => ({ ...c, email: e.target.value }))}
                            placeholder="Email" className="flex-1 rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-300 focus:border-purple-400 focus:outline-none" />
                          <input type="tel" value={newContacto.telefono} onChange={(e) => setNewContacto((c) => ({ ...c, telefono: e.target.value }))}
                            placeholder="Teléfono" className="flex-1 rounded border border-zinc-200 px-2 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-300 focus:border-purple-400 focus:outline-none" />
                        </div>
                        <button type="button" onClick={crearContactoExterno} disabled={!newContacto.nombre.trim()}
                          className="rounded-lg bg-purple-500 px-3 py-1 text-[11px] font-medium text-white disabled:opacity-40 hover:bg-purple-600 transition-colors">
                          Añadir contacto
                        </button>
                      </div>
                    </div>

                    {/* Fecha para la dependencia */}
                    <div className="mt-2">
                      <p className="text-[10px] font-semibold text-purple-500 mb-1">¿Para cuándo?</p>
                      <input type="date" value={dependeFecha} onChange={(e) => setDependeFecha(e.target.value)}
                        className="w-full rounded-lg border border-purple-200 bg-white p-2 text-sm text-zinc-900 focus:border-purple-400 focus:outline-none" />
                    </div>

                    {dependePersonas.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-purple-100 px-3 py-2 text-sm text-purple-800">
                        <span>Depende de: </span>
                        {dependePersonas.map((d, i) => (
                          <span key={`${d.tipo}-${d.nombre}-${i}`} className="font-semibold">
                            {i > 0 ? ", " : ""}
                            {d.nombre}
                          </span>
                        ))}
                        {dependeFecha && (
                          <span className="text-purple-700">
                            ({new Date(dependeFecha + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Fecha preview */}
                {sigCuando !== "depende" && cuandoLabel && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                    Programado para <strong>{cuandoLabel}</strong>
                  </div>
                )}
              </div>
            )}

            <button onClick={() => handleFinish()}
              disabled={
                (sigTipo === "continuar" && sigCuando === "depende" && dependePersonas.length === 0) ||
                (sigTipo === "continuar" && sigCuando === "otro" && !sigFechaCustom)
              }
              className="w-full rounded-xl bg-green-600 py-3 text-base font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {sigTipo === "fin" ? "Paso dado y entregable terminado" : "Paso dado"}
            </button>
            {sigTipo === "fin" && entregable && entregable.tipo !== "sop" && pasosHechos.length >= 1 && (
              <button
                type="button"
                onClick={() => {
                  handleFinish(true);
                  dispatch({ type: "CONVERT_ENTREGABLE_TO_SOP", entregableId: entregable.id });
                  setShowConvertWizard(true);
                }}
                className="w-full rounded-xl border-2 border-purple-400 bg-purple-50 py-3 text-base font-semibold text-purple-700 transition-colors hover:bg-purple-100">
                Paso dado + Convertir en SOP
              </button>
            )}
            {sigTipo === "continuar" && sigCuando === "depende" && dependePersonas.length === 0 && (
              <p className="text-center text-xs text-red-500">Selecciona al menos una persona</p>
            )}
            {sigTipo === "continuar" && sigCuando === "otro" && !sigFechaCustom && (
              <p className="text-center text-xs text-red-500">Selecciona una fecha</p>
            )}
          </div>
        )}

        {showConvertWizard && (() => {
          const newPlantilla = entregable.plantillaId
            ? state.plantillas.find((pl) => pl.id === entregable.plantillaId)
            : state.plantillas.find((pl) => pl.nombre === entregable.nombre);
          if (!newPlantilla) return null;
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
              role="dialog" aria-modal="true" tabIndex={-1}
              onClick={(e) => { if (e.target === e.currentTarget) { setShowConvertWizard(false); onClose(); } }}
              onKeyDown={(e) => { if (e.key === "Escape") { setShowConvertWizard(false); onClose(); } }}>
              <div className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-xl">
                <h3 className="mb-3 text-base font-bold text-foreground">Configurar SOP</h3>
                <p className="mb-4 text-xs text-muted">El entregable se ha convertido en un proceso. Completa los detalles:</p>

                <label className="mb-1 block text-xs font-medium text-muted">Objetivo</label>
                <textarea value={sopObjetivo} onChange={(e) => setSOPObjetivo(e.target.value)}
                  placeholder="¿Para qué sirve este proceso?"
                  rows={2} className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent" />

                <label className="mb-1 block text-xs font-medium text-muted">Frecuencia</label>
                <div className="mb-3">
                  <ProgramacionPicker value={sopProg} onChange={setSOPProg} />
                </div>

                <label className="mb-1 block text-xs font-medium text-muted">Área</label>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {[...AREAS_EMPRESA, ...AREAS_PERSONAL].map((a) => {
                    const c = AREA_COLORS[a.id];
                    const current = sopArea ?? newPlantilla.area;
                    return (
                      <button key={a.id} onClick={() => setSOPArea(a.id)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${current === a.id ? "ring-2 ring-accent text-foreground" : "text-muted hover:text-foreground"}`}
                        style={{ backgroundColor: (c?.hex ?? "#888") + "15" }}>
                        {a.label}
                      </button>
                    );
                  })}
                </div>

                <button onClick={() => {
                  const upd: Partial<Pick<PlantillaProceso, "objetivo" | "programacion" | "area">> = {};
                  if (sopObjetivo.trim()) upd.objetivo = sopObjetivo.trim();
                  if (sopProg) upd.programacion = sopProg;
                  if (sopArea) upd.area = sopArea;
                  if (Object.keys(upd).length > 0) {
                    dispatch({ type: "UPDATE_PLANTILLA", id: newPlantilla.id, changes: upd });
                  }
                  setShowConvertWizard(false);
                  onClose();
                }}
                  className="mb-2 w-full rounded-xl bg-purple-600 py-3 text-sm font-semibold text-white hover:bg-purple-700">
                  Guardar configuración
                </button>
                <button onClick={() => { setShowConvertWizard(false); onClose(); }}
                  className="w-full rounded-xl border border-border py-2 text-xs text-muted hover:bg-surface">
                  Omitir
                </button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
