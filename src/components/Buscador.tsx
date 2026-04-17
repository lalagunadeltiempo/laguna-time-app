"use client";

import { useState, useMemo } from "react";
import { useAppState } from "@/lib/context";
import { buscar, type SearchResult } from "@/lib/search";

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  paso: { label: "Paso", color: "bg-amber-100 text-amber-700" },
  entregable: { label: "Entregable", color: "bg-blue-100 text-blue-700" },
  resultado: { label: "Resultado", color: "bg-purple-100 text-purple-700" },
  proyecto: { label: "Proyecto", color: "bg-green-100 text-green-700" },
  url: { label: "URL", color: "bg-cyan-100 text-cyan-700" },
  nota: { label: "Nota", color: "bg-zinc-100 text-zinc-600" },
  contacto: { label: "Contacto", color: "bg-pink-100 text-pink-700" },
  inbox: { label: "Inbox", color: "bg-orange-100 text-orange-700" },
};

const NAVIGABLE_TYPES = new Set(["paso", "entregable", "resultado", "proyecto", "url", "nota"]);

interface Props {
  onClose: () => void;
  onNavigate?: (tipo: string, id: string) => void;
}

export function Buscador({ onClose, onNavigate }: Props) {
  const state = useAppState();
  const [query, setQuery] = useState("");
  const results = useMemo(() => buscar(state, query), [state, query]);

  function handleClick(r: SearchResult) {
    if (!onNavigate) return;
    if (!NAVIGABLE_TYPES.has(r.tipo)) return;
    const navTipo = (r.tipo === "url" || r.tipo === "nota") ? "paso" : r.tipo;
    onNavigate(navTipo, r.id);
  }

  return (
    <div className="flex h-full flex-col px-4 py-4 sm:px-5 sm:py-6">
      <div className="flex w-full flex-1 flex-col overflow-hidden rounded-2xl border-2 border-border bg-background shadow-lg">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-muted">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pasos, URLs, notas, proyectos..."
            autoFocus
            className="flex-1 bg-transparent text-base text-foreground placeholder:text-muted focus:outline-none"
          />
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">Sin resultados para &ldquo;{query}&rdquo;</p>
          )}
          {results.map((r, i) => {
            const canNav = NAVIGABLE_TYPES.has(r.tipo) && !!onNavigate;
            return (
              <button key={`${r.tipo}-${r.id}-${i}`} type="button" disabled={!canNav}
                onClick={() => handleClick(r)}
                className={`flex w-full items-start gap-3 border-b border-zinc-50 px-4 py-3 text-left last:border-0 transition-colors ${
                  canNav ? "hover:bg-accent/5 cursor-pointer" : "hover:bg-zinc-50"
                }`}>
                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TIPO_LABELS[r.tipo]?.color ?? "bg-zinc-100 text-zinc-600"}`}>
                  {TIPO_LABELS[r.tipo]?.label ?? r.tipo}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-800">{r.titulo}</p>
                  {r.subtitulo && <p className="truncate text-xs text-zinc-400">{r.subtitulo}</p>}
                </div>
                {r.fecha && (
                  <span className="shrink-0 text-[10px] text-zinc-400">
                    {new Date(r.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  </span>
                )}
                {canNav && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-1 shrink-0 text-zinc-300">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {!query.trim() && (
          <p className="px-4 py-6 text-center text-xs text-zinc-400">
            Busca en pasos, entregables, URLs, notas, contactos...
          </p>
        )}
      </div>
    </div>
  );
}
