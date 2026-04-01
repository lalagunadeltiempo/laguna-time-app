"use client";

import { useState, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import type { Paso, DependeDe } from "@/lib/types";
import { generateId } from "@/lib/store";

type Step = "nombre_paso" | "siguiente";
type CuandoMode = "manana" | "otro" | "depende";

function formatDuration(paso: Paso): string {
  if (!paso.inicioTs) return "—";
  const totalMs = Date.now() - new Date(paso.inicioTs).getTime();
  const pausedMs = (paso.pausas ?? []).reduce((acc, p) => {
    const start = new Date(p.pauseTs).getTime();
    const end = p.resumeTs ? new Date(p.resumeTs).getTime() : Date.now();
    return acc + (end - start);
  }, 0);
  const mins = Math.max(0, Math.round((totalMs - pausedMs) / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

function resolveCuandoLabel(cuando: string): string {
  if (cuando === "manana") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatDate(d.toISOString());
  }
  if (cuando && cuando !== "otro" && cuando !== "depende") {
    return formatDate(new Date(cuando).toISOString());
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

  // Depende de (múltiples personas + fecha programada)
  const [dependePersonas, setDependePersonas] = useState<DependeDe[]>([]);
  const [dependeFecha, setDependeFecha] = useState("");
  const [newContacto, setNewContacto] = useState({ nombre: "", email: "", telefono: "" });

  const contactosExternos = useMemo(() => state.contactos ?? [], [state.contactos]);

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

  function handleFinish() {
    const finalCuando = sigCuando === "otro" ? sigFechaCustom : sigCuando;

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
              fechaProgramada: sigCuando === "depende" && dependeFecha ? dependeFecha : undefined,
              dependeDe: sigCuando === "depende" ? dependePersonas : [],
            },
    };

    dispatch({ type: "CLOSE_PASO", payload: updated });
    onClose();
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
              {formatDuration(paso)}
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
                <p className="text-xs font-medium text-zinc-500">Siguiente paso:</p>
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

            <button onClick={handleFinish}
              disabled={
                (sigTipo === "continuar" && sigCuando === "depende" && dependePersonas.length === 0) ||
                (sigTipo === "continuar" && sigCuando === "otro" && !sigFechaCustom)
              }
              className="w-full rounded-xl bg-green-600 py-3 text-base font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {sigTipo === "fin" ? "Paso dado y entregable terminado" : "Paso dado"}
            </button>
            {sigTipo === "continuar" && sigCuando === "depende" && dependePersonas.length === 0 && (
              <p className="text-center text-xs text-red-500">Selecciona al menos una persona</p>
            )}
            {sigTipo === "continuar" && sigCuando === "otro" && !sigFechaCustom && (
              <p className="text-center text-xs text-red-500">Selecciona una fecha</p>
            )}
          </div>
        )}
    </div>
  );
}
