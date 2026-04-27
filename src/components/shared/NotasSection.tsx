"use client";

import { useState, useRef } from "react";
import { useAppDispatch } from "@/lib/context";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { generateId } from "@/lib/store";
import type { Nota } from "@/lib/types";
import { MarkdownView, previewFromMarkdown } from "./MarkdownView";

interface Props {
  notas: Nota[];
  nivel: "paso" | "entregable" | "resultado" | "proyecto" | "plantilla";
  targetId: string;
}

/** Toolbar mínima que envuelve la selección actual del textarea con los
 *  marcadores markdown indicados, o aplica un prefijo al inicio de la línea
 *  (h1/h2/h3, lista). Es un editor "lo más simple posible" — no soporta
 *  selecciones multilínea inteligentes. */
type FormatAction =
  | { kind: "wrap"; before: string; after: string }
  | { kind: "linePrefix"; prefix: string };

function applyFormat(
  textarea: HTMLTextAreaElement,
  action: FormatAction,
  setValue: (v: string) => void,
) {
  const { value, selectionStart: start, selectionEnd: end } = textarea;
  if (action.kind === "wrap") {
    const selected = value.slice(start, end) || "texto";
    const newValue = value.slice(0, start) + action.before + selected + action.after + value.slice(end);
    setValue(newValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + action.before.length + selected.length;
      textarea.setSelectionRange(start + action.before.length, cursor);
    });
    return;
  }
  // linePrefix: encontrar inicio de la línea actual y añadir/quitar prefijo.
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const restoMismaLinea = value.slice(lineStart);
  const lineEnd = lineStart + (restoMismaLinea.indexOf("\n") === -1 ? restoMismaLinea.length : restoMismaLinea.indexOf("\n"));
  const line = value.slice(lineStart, lineEnd);
  // Si la línea ya empieza con cualquiera de los prefijos de heading (#…),
  // los reemplazamos por el nuevo (toggle/cambio rápido).
  const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
  let newLine: string;
  if (headingMatch && action.prefix.startsWith("#")) {
    newLine = `${action.prefix}${headingMatch[2]}`;
  } else if (line.startsWith(action.prefix)) {
    newLine = line.slice(action.prefix.length);
  } else {
    newLine = action.prefix + line;
  }
  const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
  setValue(newValue);
  requestAnimationFrame(() => {
    textarea.focus();
    const newCursor = lineStart + newLine.length;
    textarea.setSelectionRange(newCursor, newCursor);
  });
}

function FormatToolbar({
  textareaRef,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (v: string) => void;
}) {
  function run(action: FormatAction) {
    const ta = textareaRef.current;
    if (!ta) return;
    applyFormat(ta, action, onChange);
  }
  const btnCls = "rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-surface hover:text-foreground";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" onClick={() => run({ kind: "linePrefix", prefix: "# " })} className={btnCls} title="Título 1">H1</button>
      <button type="button" onClick={() => run({ kind: "linePrefix", prefix: "## " })} className={btnCls} title="Título 2">H2</button>
      <button type="button" onClick={() => run({ kind: "linePrefix", prefix: "### " })} className={btnCls} title="Título 3">H3</button>
      <span className="mx-0.5 h-3 w-px bg-border" />
      <button type="button" onClick={() => run({ kind: "wrap", before: "**", after: "**" })} className={`${btnCls} font-bold`} title="Negrita">B</button>
      <button type="button" onClick={() => run({ kind: "wrap", before: "*", after: "*" })} className={`${btnCls} italic`} title="Cursiva">I</button>
      <span className="mx-0.5 h-3 w-px bg-border" />
      <button type="button" onClick={() => run({ kind: "linePrefix", prefix: "- " })} className={btnCls} title="Lista">•</button>
    </div>
  );
}

/** Editor de una nota (creación o edición). Maneja título + textarea con toolbar. */
function NotaEditor({
  initialTitulo,
  initialTexto,
  onSave,
  onCancel,
  saveLabel,
  isMentor,
}: {
  initialTitulo: string;
  initialTexto: string;
  onSave: (data: { titulo: string; texto: string }) => void;
  onCancel: () => void;
  saveLabel: string;
  isMentor: boolean;
}) {
  const [titulo, setTitulo] = useState(initialTitulo);
  const [texto, setTexto] = useState(initialTexto);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const tonoBorde = isMentor ? "border-amber-300 focus:border-amber-500" : "border-border focus:border-accent";

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-2">
      <input
        type="text"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título (opcional)"
        className={`w-full rounded border bg-background px-2 py-1.5 text-sm font-semibold text-foreground outline-none sm:text-xs ${tonoBorde}`}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />
      <FormatToolbar textareaRef={textareaRef} onChange={setTexto} />
      <textarea
        ref={textareaRef}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        rows={Math.max(3, Math.min(12, texto.split("\n").length + 1))}
        autoFocus={!initialTexto && !initialTitulo}
        placeholder={isMentor ? "Comentario… (puedes usar **negrita**, *cursiva*, # títulos)" : "Escribe la nota… (puedes usar **negrita**, *cursiva*, # títulos)"}
        className={`w-full resize-y rounded border bg-background px-2 py-1.5 text-sm leading-relaxed text-foreground outline-none sm:text-xs ${tonoBorde}`}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const t = texto.trim();
            const tit = titulo.trim();
            if (!t && !tit) return;
            onSave({ titulo: tit, texto: t });
          }}
          className={`rounded-lg px-3 py-1 text-xs font-medium text-white ${isMentor ? "bg-amber-500 hover:bg-amber-600" : "bg-accent hover:bg-accent/90"}`}
        >
          {saveLabel}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-muted hover:text-foreground">
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function NotasSection({ notas, nivel, targetId }: Props) {
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Notas que están desplegadas. Por defecto TODAS están colapsadas: ese era
   *  el motivo por el que el usuario las pedía colapsables — ocupaban demasiado.
   *  El header (título / preview) sigue siendo visible y clicable para abrir. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(notas.map((n) => n.id)));
  }
  function collapseAll() {
    setExpanded(new Set());
  }

  function addNota(data: { titulo: string; texto: string }) {
    const nota: Nota = {
      id: generateId(),
      texto: data.texto,
      autor: currentUser,
      creadoTs: new Date().toISOString(),
    };
    if (data.titulo) nota.titulo = data.titulo;
    dispatch({ type: "ADD_NOTA", nivel, targetId, nota });
    setShowForm(false);
  }

  function saveEdit(id: string, data: { titulo: string; texto: string }) {
    dispatch({
      type: "UPDATE_NOTA",
      nivel,
      targetId,
      notaId: id,
      changes: { texto: data.texto, titulo: data.titulo || undefined },
    });
    setEditingId(null);
  }

  const isMentorNote = (n: Nota) => n.autor === "Mentor";
  const canDelete = (n: Nota) => isMentor ? isMentorNote(n) : true;
  const canEdit = (n: Nota) => isMentor ? isMentorNote(n) : true;

  const totalExpanded = expanded.size;
  const showBulkToggle = notas.length >= 2;

  return (
    <div className="mt-2 space-y-1.5">
      {showBulkToggle && (
        <div className="flex items-center justify-end gap-2 text-[10px]">
          {totalExpanded < notas.length && (
            <button onClick={expandAll} className="text-muted hover:text-foreground">Desplegar todas</button>
          )}
          {totalExpanded > 0 && (
            <button onClick={collapseAll} className="text-muted hover:text-foreground">Colapsar todas</button>
          )}
        </div>
      )}

      {notas.map((n) => {
        const isOpen = expanded.has(n.id);
        const isEditing = editingId === n.id;
        const headerLabel = n.titulo?.trim() || previewFromMarkdown(n.texto, 80) || "Sin título";
        const tieneTitulo = !!n.titulo?.trim();
        const baseCls = isMentorNote(n)
          ? "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700/30"
          : "bg-surface/50 border border-border/50";

        if (isEditing) {
          return (
            <div key={n.id} className={`rounded-lg ${baseCls} p-2`}>
              <NotaEditor
                initialTitulo={n.titulo ?? ""}
                initialTexto={n.texto}
                onSave={(data) => saveEdit(n.id, data)}
                onCancel={() => setEditingId(null)}
                saveLabel="Guardar"
                isMentor={isMentor}
              />
            </div>
          );
        }

        return (
          <div key={n.id} className={`rounded-lg ${baseCls}`}>
            <div className="flex items-start gap-2 px-3 py-2">
              {isMentorNote(n) && (
                <svg className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              )}
              <button
                type="button"
                onClick={() => toggleExpand(n.id)}
                className="flex min-w-0 flex-1 items-start gap-2 text-left"
                aria-expanded={isOpen}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className={`mt-1 shrink-0 text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm sm:text-xs ${tieneTitulo ? "font-semibold text-foreground" : "text-foreground"}`}>
                    {headerLabel}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {n.autor} · {new Date(n.creadoTs).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {canEdit(n) && (
                  <button
                    type="button"
                    onClick={() => { setEditingId(n.id); setExpanded((s) => new Set(s).add(n.id)); }}
                    className="text-muted opacity-50 hover:text-accent hover:opacity-100"
                    title="Editar nota"
                    aria-label="Editar nota"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                    </svg>
                  </button>
                )}
                {canDelete(n) && (
                  confirmDeleteId === n.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { dispatch({ type: "DELETE_NOTA", nivel, targetId, notaId: n.id }); setConfirmDeleteId(null); }}
                        className="rounded bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-600"
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded border border-border px-2 py-0.5 text-[10px] text-muted hover:bg-surface"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(n.id)}
                      className="text-muted opacity-40 hover:text-red-500 hover:opacity-100"
                      title="Borrar nota"
                      aria-label="Borrar nota"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  )
                )}
              </div>
            </div>
            {isOpen && (
              <div className="border-t border-border/40 px-3 py-2">
                <MarkdownView text={n.texto} />
              </div>
            )}
          </div>
        );
      })}

      {showForm ? (
        <NotaEditor
          initialTitulo=""
          initialTexto=""
          onSave={addNota}
          onCancel={() => setShowForm(false)}
          saveLabel={isMentor ? "Comentar" : "Añadir"}
          isMentor={isMentor}
        />
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
