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

interface Props {
  onClose: () => void;
}

export function Buscador({ onClose }: Props) {
  const state = useAppState();
  const [query, setQuery] = useState("");
  const results = useMemo(() => buscar(state, query), [state, query]);

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      <div className="w-full rounded-2xl border-2 border-zinc-200 bg-white shadow-lg">
        <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-zinc-400">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pasos, URLs, notas, proyectos..."
            autoFocus
            className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">Sin resultados para &ldquo;{query}&rdquo;</p>
          )}
          {results.map((r, i) => (
            <ResultItem key={`${r.tipo}-${r.id}-${i}`} result={r} />
          ))}
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

function ResultItem({ result }: { result: SearchResult }) {
  const meta = TIPO_LABELS[result.tipo] ?? { label: result.tipo, color: "bg-zinc-100 text-zinc-600" };

  return (
    <div className="flex items-start gap-3 border-b border-zinc-50 px-4 py-3 last:border-0 hover:bg-zinc-50">
      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.color}`}>
        {meta.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-zinc-800">{result.titulo}</p>
        {result.subtitulo && (
          <p className="truncate text-xs text-zinc-400">{result.subtitulo}</p>
        )}
      </div>
      {result.fecha && (
        <span className="shrink-0 text-[10px] text-zinc-400">
          {new Date(result.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
        </span>
      )}
    </div>
  );
}
