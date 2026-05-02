"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { generateId } from "@/lib/store";
import type { MensajeEntregable } from "@/lib/types";
import { MarkdownView } from "./MarkdownView";
import { ChipMiembro } from "../plan/InlineEditors";

interface Props {
  entregableId: string;
  /** Si es true, arranca plegado con solo la cabecera y el contador de no leídos. */
  defaultCollapsed?: boolean;
}

type PestanaHilo = "todos" | "para_mi" | "mios";

function horaRelativa(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return "ahora";
  const min = Math.floor(s / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  const date = new Date(iso);
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

/** Un mensaje "va dirigido" a un usuario si:
 *  - es broadcast (paraQuien vacío o undefined), o
 *  - la lista `paraQuien` contiene explícitamente su nombre.
 *  El autor no cuenta como destinatario de su propio mensaje para contadores. */
function vaDirigidoA(m: MensajeEntregable, usuario: string): boolean {
  if (!usuario) return false;
  const lista = m.paraQuien ?? [];
  if (lista.length === 0) return true;
  return lista.includes(usuario);
}

function esPendiente(m: MensajeEntregable): boolean {
  return (m.estado ?? "abierto") !== "resuelto";
}

/**
 * Hilo de chat ligado a un entregable. Cualquier miembro del workspace puede
 * escribir y leer. Se renderiza dentro de la ficha del entregable.
 *
 * Al abrirse marca automáticamente como leídos los mensajes del usuario actual.
 * Soporta destinatarios explícitos (`paraQuien`), estado (`abierto`/`resuelto`/`duda`)
 * y pestañas de filtrado (todos, para mí, míos enviados).
 */
export function HiloEntregable({ entregableId, defaultCollapsed = false }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();
  const [open, setOpen] = useState(!defaultCollapsed);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editDraftPara, setEditDraftPara] = useState<string[]>([]);
  const [destinatarios, setDestinatarios] = useState<string[]>([]);
  const [pestana, setPestana] = useState<PestanaHilo>("todos");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mensajes = useMemo<MensajeEntregable[]>(
    () =>
      (state.mensajes ?? [])
        .filter((m) => m.entregableId === entregableId)
        .sort((a, b) => a.creado.localeCompare(b.creado)),
    [state.mensajes, entregableId],
  );

  // Para la cabecera del hilo: pendientes para este usuario (no leídos + dirigidos + no resueltos).
  const pendientesParaMi = useMemo(
    () =>
      mensajes.filter(
        (m) =>
          m.autor !== currentUser &&
          vaDirigidoA(m, currentUser) &&
          esPendiente(m) &&
          !(m.leidoPor ?? []).includes(currentUser),
      ),
    [mensajes, currentUser],
  );

  // Mensajes tras aplicar pestaña + filtro "solo pendientes".
  const mensajesFiltrados = useMemo(() => {
    return mensajes.filter((m) => {
      if (pestana === "para_mi") {
        if (!vaDirigidoA(m, currentUser) || m.autor === currentUser) return false;
      } else if (pestana === "mios") {
        if (m.autor !== currentUser) return false;
      }
      if (soloPendientes && !esPendiente(m)) return false;
      return true;
    });
  }, [mensajes, pestana, currentUser, soloPendientes]);

  // Al abrir el hilo, marcamos como leídos los mensajes que nos van dirigidos.
  useEffect(() => {
    if (!open || !currentUser || isMentor) return;
    const algoSinLeer = mensajes.some(
      (m) => m.autor !== currentUser && !(m.leidoPor ?? []).includes(currentUser),
    );
    if (!algoSinLeer) return;
    dispatch({ type: "MARCAR_MENSAJES_LEIDOS", entregableId, usuario: currentUser });
  }, [open, currentUser, isMentor, mensajes, entregableId, dispatch]);

  const miembros = state.miembros ?? [];
  const otrosMiembros = useMemo(
    () => miembros.filter((m) => m.nombre !== currentUser),
    [miembros, currentUser],
  );

  function toggleDestinatario(nombre: string) {
    setDestinatarios((prev) =>
      prev.includes(nombre) ? prev.filter((x) => x !== nombre) : [...prev, nombre],
    );
  }

  function toggleEditDestinatario(nombre: string) {
    setEditDraftPara((prev) =>
      prev.includes(nombre) ? prev.filter((x) => x !== nombre) : [...prev, nombre],
    );
  }

  function enviar() {
    const texto = draft.trim();
    if (!texto || !currentUser || isMentor) return;
    const payload: MensajeEntregable = {
      id: generateId(),
      entregableId,
      autor: currentUser,
      texto,
      creado: new Date().toISOString(),
      leidoPor: [currentUser],
      estado: "abierto",
    };
    if (destinatarios.length > 0) payload.paraQuien = destinatarios;
    dispatch({ type: "ADD_MENSAJE", payload });
    setDraft("");
    setDestinatarios([]);
  }

  function empezarEdicion(m: MensajeEntregable) {
    setEditingId(m.id);
    setEditDraft(m.texto);
    setEditDraftPara(m.paraQuien ?? []);
  }

  function guardarEdicion() {
    const texto = editDraft.trim();
    if (!editingId || !texto) {
      setEditingId(null);
      return;
    }
    dispatch({
      type: "UPDATE_MENSAJE",
      id: editingId,
      changes: {
        texto,
        paraQuien: editDraftPara.length > 0 ? editDraftPara : undefined,
      },
    });
    setEditingId(null);
    setEditDraft("");
    setEditDraftPara([]);
  }

  function borrar(id: string) {
    if (!window.confirm("¿Borrar este mensaje?")) return;
    dispatch({ type: "DELETE_MENSAJE", id });
  }

  function resolver(id: string) {
    if (!currentUser) return;
    dispatch({ type: "RESOLVER_MENSAJE", id, usuario: currentUser });
  }

  function reabrir(id: string) {
    dispatch({ type: "REABRIR_MENSAJE", id });
  }

  const contadorMios = useMemo(
    () => mensajes.filter((m) => m.autor === currentUser).length,
    [mensajes, currentUser],
  );
  const contadorParaMi = useMemo(
    () => mensajes.filter((m) => m.autor !== currentUser && vaDirigidoA(m, currentUser)).length,
    [mensajes, currentUser],
  );

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface/50"
      >
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          <span aria-hidden className={`text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
          Mensajes ({mensajes.length})
        </span>
        {pendientesParaMi.length > 0 && (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-white">
            {pendientesParaMi.length} pendientes para ti
          </span>
        )}
      </button>
      {open && (
        <>
          {pendientesParaMi.length > 0 && (
            <div className="rounded-md border border-accent/40 bg-accent/5 px-2 py-1.5 text-[11px] text-foreground">
              <strong className="text-accent">
                {pendientesParaMi.length === 1
                  ? "Tienes 1 mensaje pendiente dirigido a ti."
                  : `Tienes ${pendientesParaMi.length} mensajes pendientes dirigidos a ti.`}
              </strong>{" "}
              <span className="text-muted">
                Puedes resolverlos con el botón de cada mensaje.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            <div className="flex overflow-hidden rounded border border-border">
              <PestanaBtn
                active={pestana === "todos"}
                onClick={() => setPestana("todos")}
                label={`Todos (${mensajes.length})`}
              />
              <PestanaBtn
                active={pestana === "para_mi"}
                onClick={() => setPestana("para_mi")}
                label={`Para mí (${contadorParaMi})`}
              />
              <PestanaBtn
                active={pestana === "mios"}
                onClick={() => setPestana("mios")}
                label={`Míos (${contadorMios})`}
              />
            </div>
            <label className="flex items-center gap-1 text-muted">
              <input
                type="checkbox"
                checked={soloPendientes}
                onChange={(e) => setSoloPendientes(e.target.checked)}
                className="h-3 w-3 accent-accent"
              />
              Solo pendientes
            </label>
          </div>

          {mensajesFiltrados.length === 0 ? (
            <p className="rounded border border-dashed border-border px-2 py-1.5 text-[11px] text-muted">
              {mensajes.length === 0
                ? "Sin mensajes. Escribe el primero para hablar con el equipo sobre este entregable."
                : "No hay mensajes que cumplan el filtro actual."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {mensajesFiltrados.map((m) => {
                const esMio = m.autor === currentUser;
                const editable = esMio && !isMentor;
                const estaEditando = editingId === m.id;
                const resuelto = m.estado === "resuelto";
                const para = m.paraQuien ?? [];
                const soyDestinatario = vaDirigidoA(m, currentUser) && !esMio;
                return (
                  <li
                    key={m.id}
                    className={`rounded-md border px-2 py-1.5 text-[12px] ${
                      resuelto
                        ? "border-border/40 bg-surface/30 opacity-70"
                        : soyDestinatario
                        ? "border-accent/40 bg-accent/5"
                        : "border-border bg-background/80"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                        <ChipMiembro nombre={m.autor} miembros={state.miembros} compact />
                        <span>{m.autor}</span>
                        {para.length > 0 && (
                          <>
                            <span>→</span>
                            {para.map((n) => (
                              <ChipMiembro
                                key={n}
                                nombre={n}
                                miembros={state.miembros}
                                compact
                                title={`Dirigido a ${n}`}
                              />
                            ))}
                          </>
                        )}
                        <span>·</span>
                        <span title={new Date(m.creado).toLocaleString("es-ES")}>
                          {horaRelativa(m.creado)}
                          {m.editado && m.editado !== m.creado && (
                            <span className="ml-1 italic">· editado</span>
                          )}
                        </span>
                        {resuelto && (
                          <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                            ✓ resuelto{m.resueltoPor ? ` por ${m.resueltoPor}` : ""}
                          </span>
                        )}
                        {m.estado === "duda" && !resuelto && (
                          <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                            ? duda
                          </span>
                        )}
                      </div>
                      {!estaEditando && (
                        <div className="flex shrink-0 gap-1 text-[9px] text-muted">
                          {!isMentor && !resuelto && (
                            <button
                              type="button"
                              onClick={() => resolver(m.id)}
                              className="rounded px-1 hover:bg-surface hover:text-emerald-600"
                              title="Marcar como resuelto"
                            >
                              ✓ Resolver
                            </button>
                          )}
                          {!isMentor && resuelto && (
                            <button
                              type="button"
                              onClick={() => reabrir(m.id)}
                              className="rounded px-1 hover:bg-surface hover:text-foreground"
                              title="Reabrir mensaje"
                            >
                              ↺ Reabrir
                            </button>
                          )}
                          {editable && (
                            <>
                              <button
                                type="button"
                                onClick={() => empezarEdicion(m)}
                                className="rounded px-1 hover:bg-surface hover:text-foreground"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => borrar(m.id)}
                                className="rounded px-1 hover:bg-surface hover:text-red-600"
                              >
                                Borrar
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {estaEditando ? (
                      <div className="mt-1 space-y-1">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          className="w-full resize-y rounded border border-accent/40 bg-background px-1.5 py-1 text-[12px] outline-none focus:border-accent"
                          rows={3}
                          autoFocus
                        />
                        {otrosMiembros.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted">
                            <span>Para:</span>
                            {otrosMiembros.map((mb) => {
                              const sel = editDraftPara.includes(mb.nombre);
                              return (
                                <button
                                  key={mb.id}
                                  type="button"
                                  onClick={() => toggleEditDestinatario(mb.nombre)}
                                  className={`rounded border px-1.5 py-0.5 text-[10px] ${
                                    sel
                                      ? "border-accent bg-accent/10 text-accent"
                                      : "border-border text-muted hover:text-foreground"
                                  }`}
                                >
                                  {mb.nombre}
                                </button>
                              );
                            })}
                            {editDraftPara.length === 0 && (
                              <span className="italic opacity-60">(todos)</span>
                            )}
                          </div>
                        )}
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={guardarEdicion}
                            className="rounded bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent/90"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft("");
                              setEditDraftPara([]);
                            }}
                            className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:bg-surface"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 text-foreground">
                        <MarkdownView text={m.texto} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!isMentor && currentUser && (
            <div className="space-y-1">
              {otrosMiembros.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted">
                  <span>Para:</span>
                  {otrosMiembros.map((mb) => {
                    const sel = destinatarios.includes(mb.nombre);
                    return (
                      <button
                        key={mb.id}
                        type="button"
                        onClick={() => toggleDestinatario(mb.nombre)}
                        className={`rounded border px-1.5 py-0.5 text-[10px] ${
                          sel
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border text-muted hover:text-foreground"
                        }`}
                      >
                        {mb.nombre}
                      </button>
                    );
                  })}
                  {destinatarios.length === 0 && (
                    <span className="italic opacity-60">(todos)</span>
                  )}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    enviar();
                  }
                }}
                placeholder={`Escribe como ${currentUser}… (Cmd/Ctrl+Enter para enviar)`}
                className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-accent"
                rows={2}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={enviar}
                  disabled={!draft.trim()}
                  className="rounded bg-accent px-3 py-1 text-[11px] font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
                >
                  Enviar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PestanaBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
        active ? "bg-accent/10 text-accent" : "bg-background text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

/** Contador de mensajes pendientes para el usuario actual en un entregable.
 *  Cuenta sólo los que:
 *   - no los escribió él,
 *   - le van dirigidos (broadcast o con su nombre en `paraQuien`),
 *   - no están resueltos,
 *   - y aún no ha leído.
 *  Útil para el badge 💬N en la lista de Operativo HOY. */
export function useMensajesNoLeidos(entregableId: string | undefined): number {
  const state = useAppState();
  const { nombre: currentUser } = useUsuario();
  return useMemo(() => {
    if (!entregableId || !currentUser) return 0;
    return (state.mensajes ?? []).filter(
      (m) =>
        m.entregableId === entregableId &&
        m.autor !== currentUser &&
        vaDirigidoA(m, currentUser) &&
        esPendiente(m) &&
        !(m.leidoPor ?? []).includes(currentUser),
    ).length;
  }, [state.mensajes, entregableId, currentUser]);
}
