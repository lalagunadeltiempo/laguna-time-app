"use client";

import { useState, useRef, useEffect } from "react";
import { useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";

export function InboxButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    dispatch({
      type: "ADD_INBOX",
      payload: { id: generateId(), texto: trimmed, creado: new Date().toISOString(), procesado: false },
    });
    setText("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-16 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg shadow-amber-500/30 transition-transform hover:scale-105 active:scale-95"
          aria-label="Captura rápida">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}

      {open && (
        <div className="fixed bottom-16 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 px-4">
          <div className="rounded-2xl border-2 border-amber-200 bg-white p-4 shadow-lg">
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">Captura rápida</h3>
            <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="Idea, tarea, lo que sea..." rows={2}
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none" />
            <div className="mt-2 flex gap-2">
              <button onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-zinc-200 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={!text.trim()}
                className="flex-1 rounded-lg bg-amber-500 py-2 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-40">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
