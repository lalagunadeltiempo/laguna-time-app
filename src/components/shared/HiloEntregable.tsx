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

/**
 * Hilo de chat ligado a un entregable. Cualquier miembro del workspace puede
 * escribir y leer. Se renderiza dentro de la ficha del entregable.
 *
 * Al abrirse marca automáticamente como leídos los mensajes del usuario actual
 * (solo si `defaultCollapsed` viene de true y el usuario lo despliega).
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mensajes = useMemo<MensajeEntregable[]>(
    () =>
      (state.mensajes ?? [])
        .filter((m) => m.entregableId === entregableId)
        .sort((a, b) => a.creado.localeCompare(b.creado)),
    [state.mensajes, entregableId],
  );

  const noLeidos = useMemo(
    () => mensajes.filter((m) => m.autor !== currentUser && !(m.leidoPor ?? []).includes(currentUser)).length,
    [mensajes, currentUser],
  );

  // Marca como leídos al abrir el hilo (y al añadir un mensaje nuevo del otro mientras está abierto).
  useEffect(() => {
    if (!open || !currentUser || isMentor) return;
    if (noLeidos === 0) return;
    dispatch({ type: "MARCAR_MENSAJES_LEIDOS", entregableId, usuario: currentUser });
  }, [open, currentUser, isMentor, noLeidos, entregableId, dispatch]);

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
    };
    dispatch({ type: "ADD_MENSAJE", payload });
    setDraft("");
  }

  function empezarEdicion(m: MensajeEntregable) {
    setEditingId(m.id);
    setEditDraft(m.texto);
  }

  function guardarEdicion() {
    const texto = editDraft.trim();
    if (!editingId || !texto) {
      setEditingId(null);
      return;
    }
    dispatch({ type: "UPDATE_MENSAJE", id: editingId, changes: { texto } });
    setEditingId(null);
    setEditDraft("");
  }

  function borrar(id: string) {
    if (!window.confirm("¿Borrar este mensaje?")) return;
    dispatch({ type: "DELETE_MENSAJE", id });
  }

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
        {noLeidos > 0 && (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-white">
            {noLeidos} sin leer
          </span>
        )}
      </button>
      {open && (
        <>
          {mensajes.length === 0 ? (
            <p className="rounded border border-dashed border-border px-2 py-1.5 text-[11px] text-muted">
              Sin mensajes. Escribe el primero para hablar con el equipo sobre este entregable.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {mensajes.map((m) => {
                const esMio = m.autor === currentUser;
                const editable = esMio && !isMentor;
                const estaEditando = editingId === m.id;
                return (
                  <li
                    key={m.id}
                    className="rounded-md border border-border bg-background/80 px-2 py-1.5 text-[12px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted">
                        <ChipMiembro nombre={m.autor} miembros={state.miembros} compact />
                        <span>{m.autor}</span>
                        <span>·</span>
                        <span title={new Date(m.creado).toLocaleString("es-ES")}>
                          {horaRelativa(m.creado)}
                          {m.editado && m.editado !== m.creado && (
                            <span className="ml-1 italic">· editado</span>
                          )}
                        </span>
                      </div>
                      {editable && !estaEditando && (
                        <div className="flex shrink-0 gap-1 text-[9px] text-muted">
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

/** Contador de mensajes sin leer por el usuario actual en un entregable. Útil en tarjetas. */
export function useMensajesNoLeidos(entregableId: string | undefined): number {
  const state = useAppState();
  const { nombre: currentUser } = useUsuario();
  return useMemo(() => {
    if (!entregableId || !currentUser) return 0;
    return (state.mensajes ?? []).filter(
      (m) =>
        m.entregableId === entregableId &&
        m.autor !== currentUser &&
        !(m.leidoPor ?? []).includes(currentUser),
    ).length;
  }, [state.mensajes, entregableId, currentUser]);
}
