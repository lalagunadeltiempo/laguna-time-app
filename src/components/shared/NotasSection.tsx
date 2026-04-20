"use client";

import { useState } from "react";
import { useAppDispatch } from "@/lib/context";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { generateId } from "@/lib/store";
import type { Nota } from "@/lib/types";

interface Props {
  notas: Nota[];
  nivel: "paso" | "entregable" | "resultado" | "proyecto" | "plantilla";
  targetId: string;
}

export function NotasSection({ notas, nivel, targetId }: Props) {
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();
  const [draft, setDraft] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  function addNota() {
    const t = draft.trim();
    if (!t) return;
    dispatch({ type: "ADD_NOTA", nivel, targetId, nota: { id: generateId(), texto: t, autor: currentUser, creadoTs: new Date().toISOString() } });
    setDraft("");
    setShowForm(false);
  }

  function startEdit(n: Nota) {
    setEditingId(n.id);
    setEditDraft(n.texto);
  }

  function saveEdit() {
    if (!editingId) return;
    const t = editDraft.trim();
    if (t) dispatch({ type: "UPDATE_NOTA", nivel, targetId, notaId: editingId, texto: t });
    setEditingId(null);
    setEditDraft("");
  }

  const isMentorNote = (n: Nota) => n.autor === "Mentor";
  const canDelete = (n: Nota) => n.autor === currentUser || (isMentor && isMentorNote(n));
  const canEdit = (n: Nota) => n.autor === currentUser;

  return (
    <div className="mt-2 space-y-1.5">
      {notas.map((n) => (
        <div key={n.id} className={`flex items-start gap-2 rounded-lg px-3 py-2 ${isMentorNote(n) ? "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700/30" : "bg-surface/50"}`}>
          {isMentorNote(n) && (
            <svg className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}
          <div className="flex-1 min-w-0">
            {editingId === n.id ? (
              <div className="flex flex-col gap-1.5">
                <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setEditingId(null); setEditDraft(""); } }}
                  rows={Math.max(2, editDraft.split("\n").length)}
                  autoFocus className="w-full resize-y rounded-lg border border-accent bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none sm:text-xs" />
                <div className="flex gap-1.5">
                  <button onClick={saveEdit} className="rounded-lg bg-accent px-3 py-1 text-[10px] font-medium text-white">Guardar</button>
                  <button onClick={() => setEditingId(null)} className="text-[10px] text-muted hover:text-foreground">Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                <p className={`text-sm text-foreground whitespace-pre-wrap sm:text-xs ${canEdit(n) ? "cursor-pointer hover:bg-accent-soft rounded px-1 -mx-1 transition-colors" : ""}`}
                  onClick={() => canEdit(n) && startEdit(n)}
                  title={canEdit(n) ? "Clic para editar" : undefined}>
                  {n.texto}
                </p>
                <p className="mt-0.5 text-xs text-muted sm:text-[10px]">
                  {n.autor} · {new Date(n.creadoTs).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </>
            )}
          </div>
          {canDelete(n) && editingId !== n.id && (confirmDeleteId === n.id ? (
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => { dispatch({ type: "DELETE_NOTA", nivel, targetId, notaId: n.id }); setConfirmDeleteId(null); }}
                className="rounded bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-600">Sí</button>
              <button onClick={() => setConfirmDeleteId(null)}
                className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:bg-surface">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDeleteId(n.id)}
              className="shrink-0 text-muted opacity-40 hover:text-red-500 hover:opacity-100" title="Borrar nota">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          ))}
        </div>
      ))}
      {showForm ? (
        <div className="flex flex-col gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={isMentor ? "Escribe un comentario..." : "Escribe una nota..."}
            onKeyDown={(e) => { if (e.key === "Escape") { setDraft(""); setShowForm(false); } }}
            rows={Math.max(3, draft.split("\n").length)}
            autoFocus className={`w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none sm:text-xs ${isMentor ? "border-amber-300 focus:border-amber-500" : "border-border focus:border-accent"}`} />
          <div className="flex gap-2">
            <button onClick={addNota} className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${isMentor ? "bg-amber-500 hover:bg-amber-600" : "bg-accent hover:bg-accent/90"}`}>
              {isMentor ? "Comentar" : "Añadir"}
            </button>
            <button onClick={() => { setDraft(""); setShowForm(false); }} className="text-xs text-muted hover:text-foreground">Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className={`flex items-center gap-1 text-[11px] ${isMentor ? "text-amber-600 hover:text-amber-700" : "text-muted hover:text-accent"}`}>
          {isMentor ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              Añadir comentario
            </>
          ) : (
            <>+ Añadir nota</>
          )}
        </button>
      )}
    </div>
  );
}
