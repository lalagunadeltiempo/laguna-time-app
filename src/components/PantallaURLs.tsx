"use client";

import { useState, useMemo } from "react";
import { useAppState } from "@/lib/context";

interface UrlEntry {
  url: string;
  nombre: string;
  descripcion: string;
  pasos: { id: string; nombre: string; fecha: string | null; persona: string }[];
}

export function PantallaURLs() {
  const state = useAppState();
  const [filter, setFilter] = useState("");

  const urls = useMemo(() => {
    const map = new Map<string, UrlEntry>();

    for (const paso of state.pasos) {
      const persona = paso.implicados?.find((i) => i.tipo === "equipo")?.nombre ?? "";
      for (const u of paso.contexto.urls) {
        if (!u.url) continue;
        const key = u.url.toLowerCase().replace(/\/+$/, "");
        const existing = map.get(key);
        if (existing) {
          existing.pasos.push({ id: paso.id, nombre: paso.nombre, fecha: paso.inicioTs, persona });
          if (u.nombre && !existing.nombre) existing.nombre = u.nombre;
          if (u.descripcion && !existing.descripcion) existing.descripcion = u.descripcion;
        } else {
          map.set(key, {
            url: u.url,
            nombre: u.nombre || "",
            descripcion: u.descripcion || "",
            pasos: [{ id: paso.id, nombre: paso.nombre, fecha: paso.inicioTs, persona }],
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const lastA = a.pasos.reduce((max, p) => (p.fecha && p.fecha > max ? p.fecha : max), "");
      const lastB = b.pasos.reduce((max, p) => (p.fecha && p.fecha > max ? p.fecha : max), "");
      return lastB.localeCompare(lastA);
    });
  }, [state.pasos]);

  const filtered = useMemo(() => {
    if (!filter) return urls;
    const q = filter.toLowerCase();
    return urls.filter(
      (u) =>
        u.url.toLowerCase().includes(q) ||
        u.nombre.toLowerCase().includes(q) ||
        u.descripcion.toLowerCase().includes(q),
    );
  }, [urls, filter]);

  return (
    <div className="px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Directorio de URLs</h1>
      <p className="mb-6 text-sm text-muted">
        {urls.length} {urls.length === 1 ? "enlace" : "enlaces"} recopilados de tus pasos
      </p>

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar por nombre, URL o descripción..."
        className="mb-6 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted">
            {urls.length === 0 ? "No hay URLs registradas todavía." : "Sin resultados para esta búsqueda."}
          </p>
          {urls.length === 0 && (
            <p className="mt-1 text-xs text-muted">Las URLs se recopilan automáticamente de los pasos que das.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <UrlCard key={entry.url} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function UrlCard({ entry }: { entry: UrlEntry }) {
  const [open, setOpen] = useState(false);
  const domain = (() => {
    try { return new URL(entry.url).hostname.replace("www.", ""); } catch { return ""; }
  })();

  return (
    <div className="rounded-xl border border-border bg-background p-4 transition-colors hover:border-accent/30">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-sm font-bold text-muted">
          {domain.charAt(0).toUpperCase() || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-medium text-accent hover:underline"
          >
            {entry.nombre || entry.url}
          </a>
          {entry.nombre && (
            <p className="truncate text-xs text-muted">{entry.url}</p>
          )}
          {entry.descripcion && (
            <p className="mt-1 text-sm text-muted">{entry.descripcion}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(() => {
            const people = [...new Set(entry.pasos.map((p) => p.persona).filter(Boolean))];
            if (people.length > 0) {
              return (
                <span className="text-[10px] text-muted">
                  {people.join(", ")}
                </span>
              );
            }
            return null;
          })()}
          <button
            onClick={() => setOpen(!open)}
            className="rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-surface"
          >
            {entry.pasos.length} {entry.pasos.length === 1 ? "paso" : "pasos"}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 border-t border-border pt-3">
          {entry.pasos.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-muted" />
              {p.persona && (
                <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {p.persona}
                </span>
              )}
              <span className="flex-1 truncate">{p.nombre}</span>
              {p.fecha && (
                <span className="shrink-0">
                  {new Date(p.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
