"use client";

import { useState, useMemo, useCallback } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useIsMentor } from "@/lib/usuario";
import {
  AREA_COLORS, AREAS_PERSONAL, AREAS_EMPRESA,
  type Area, type Paso,
} from "@/lib/types";

const ALL_AREAS = [...AREAS_PERSONAL, ...AREAS_EMPRESA];

interface PasoRef {
  id: string;
  nombre: string;
  fecha: string | null;
  persona: string;
  area: Area | null;
  proyecto: string;
}

interface UrlEntry {
  url: string;
  nombre: string;
  descripcion: string;
  pasos: PasoRef[];
  areas: Set<Area>;
  proyectos: Set<string>;
}

export function PantallaURLs() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const [filter, setFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState<Area | null>(null);

  const urls = useMemo(() => {
    const map = new Map<string, UrlEntry>();
    const { pasos, entregables, resultados, proyectos } = state;

    const entMap = new Map(entregables.map((e) => [e.id, e]));
    const resMap = new Map(resultados.map((r) => [r.id, r]));
    const projMap = new Map(proyectos.map((p) => [p.id, p]));

    for (const paso of pasos) {
      const persona = paso.implicados?.find((i) => i.tipo === "equipo")?.nombre ?? "";
      const ent = entMap.get(paso.entregableId);
      const res = ent ? resMap.get(ent.resultadoId) : undefined;
      const proj = res ? projMap.get(res.proyectoId) : undefined;
      const area = proj?.area ?? null;
      const proyNombre = proj?.nombre ?? "";

      for (const u of paso.contexto.urls) {
        if (!u.url) continue;
        const key = u.url.toLowerCase().replace(/\/+$/, "");
        const ref: PasoRef = { id: paso.id, nombre: paso.nombre, fecha: paso.inicioTs, persona, area, proyecto: proyNombre };
        const existing = map.get(key);
        if (existing) {
          existing.pasos.push(ref);
          if (u.nombre && !existing.nombre) existing.nombre = u.nombre;
          if (u.descripcion && !existing.descripcion) existing.descripcion = u.descripcion;
          if (area) existing.areas.add(area);
          if (proyNombre) existing.proyectos.add(proyNombre);
        } else {
          const areas = new Set<Area>();
          if (area) areas.add(area);
          const proyectoSet = new Set<string>();
          if (proyNombre) proyectoSet.add(proyNombre);
          map.set(key, { url: u.url, nombre: u.nombre || "", descripcion: u.descripcion || "", pasos: [ref], areas, proyectos: proyectoSet });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const lastA = a.pasos.reduce((max, p) => (p.fecha && p.fecha > max ? p.fecha : max), "");
      const lastB = b.pasos.reduce((max, p) => (p.fecha && p.fecha > max ? p.fecha : max), "");
      return lastB.localeCompare(lastA);
    });
  }, [state.pasos, state.entregables, state.resultados, state.proyectos]);

  const filtered = useMemo(() => {
    let result = urls;
    if (areaFilter) {
      result = result.filter((u) => u.areas.has(areaFilter));
    }
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter(
        (u) =>
          u.url.toLowerCase().includes(q) ||
          u.nombre.toLowerCase().includes(q) ||
          u.descripcion.toLowerCase().includes(q) ||
          [...u.proyectos].some((p) => p.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [urls, filter, areaFilter]);

  const usedAreas = useMemo(() => {
    const s = new Set<Area>();
    for (const u of urls) for (const a of u.areas) s.add(a);
    return s;
  }, [urls]);

  const updateUrlInAllPasos = useCallback((targetUrl: string, field: "nombre" | "descripcion", value: string) => {
    const normalizedTarget = targetUrl.toLowerCase().replace(/\/+$/, "");
    for (const paso of state.pasos) {
      const idx = paso.contexto.urls.findIndex(
        (u) => u.url.toLowerCase().replace(/\/+$/, "") === normalizedTarget,
      );
      if (idx === -1) continue;
      const newUrls = [...paso.contexto.urls];
      newUrls[idx] = { ...newUrls[idx], [field]: value };
      dispatch({ type: "UPDATE_PASO_CONTEXTO", id: paso.id, contexto: { ...paso.contexto, urls: newUrls } });
    }
  }, [state.pasos, dispatch]);

  const removeUrlFromPaso = useCallback((pasoId: string, targetUrl: string) => {
    const paso = state.pasos.find((p) => p.id === pasoId);
    if (!paso) return;
    const normalizedTarget = targetUrl.toLowerCase().replace(/\/+$/, "");
    const newUrls = paso.contexto.urls.filter(
      (u) => u.url.toLowerCase().replace(/\/+$/, "") !== normalizedTarget,
    );
    dispatch({ type: "UPDATE_PASO_CONTEXTO", id: pasoId, contexto: { ...paso.contexto, urls: newUrls } });
  }, [state.pasos, dispatch]);

  return (
    <div className="px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Directorio de URLs</h1>
      <p className="mb-4 text-sm text-muted">
        {urls.length} {urls.length === 1 ? "enlace" : "enlaces"} recopilados de tus pasos
      </p>

      {/* Area filter chips */}
      {usedAreas.size > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setAreaFilter(null)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${!areaFilter ? "bg-foreground text-background" : "bg-surface text-muted hover:bg-border"}`}>
            Todas
          </button>
          {ALL_AREAS.filter((a) => usedAreas.has(a.id)).map((a) => {
            const hex = AREA_COLORS[a.id]?.hex ?? "#888";
            const active = areaFilter === a.id;
            return (
              <button key={a.id} type="button" onClick={() => setAreaFilter(active ? null : a.id)}
                className="rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
                style={active
                  ? { backgroundColor: hex, color: "#fff" }
                  : { backgroundColor: hex + "15", color: hex }
                }>
                {a.label}
              </button>
            );
          })}
        </div>
      )}

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar por nombre, URL, descripción o proyecto..."
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
            <UrlCard key={entry.url} entry={entry} isMentor={isMentor}
              onEditField={(field, value) => updateUrlInAllPasos(entry.url, field, value)}
              onRemoveFromPaso={(pasoId) => removeUrlFromPaso(pasoId, entry.url)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Favicon with fallback ─── */

function Favicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const domain = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  const initial = domain.replace("www.", "").charAt(0).toUpperCase() || "?";

  if (!domain || failed) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-sm font-bold text-muted">
        {initial}
      </div>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt={domain}
      width={28} height={28}
      className="h-7 w-7 shrink-0 rounded"
      onError={() => setFailed(true)}
    />
  );
}

/* ─── URL Card ─── */

function UrlCard({ entry, isMentor, onEditField, onRemoveFromPaso }: {
  entry: UrlEntry; isMentor: boolean;
  onEditField: (field: "nombre" | "descripcion", value: string) => void;
  onRemoveFromPaso: (pasoId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingField, setEditingField] = useState<"nombre" | "descripcion" | null>(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const areaList = [...entry.areas];
  const projList = [...entry.proyectos];

  function startEdit(field: "nombre" | "descripcion") {
    setEditingField(field);
    setDraft(field === "nombre" ? entry.nombre : entry.descripcion);
  }
  function saveEdit() {
    if (!editingField) return;
    const v = draft.trim();
    if (v !== (editingField === "nombre" ? entry.nombre : entry.descripcion)) {
      onEditField(editingField, v);
    }
    setEditingField(null);
  }
  function cancelEdit() { setEditingField(null); setDraft(""); }

  function copyUrl() {
    navigator.clipboard.writeText(entry.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-background p-4 transition-colors hover:border-accent/30">
      <div className="flex items-start gap-3">
        <Favicon url={entry.url} />
        <div className="min-w-0 flex-1">
          {/* Title */}
          {editingField === "nombre" ? (
            <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
              onClick={(e) => e.stopPropagation()}
              onBlur={saveEdit}
              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
              className="w-full rounded-lg border-2 border-accent bg-background px-2 py-1 text-sm font-medium text-foreground outline-none" />
          ) : (
            <div className="flex items-center gap-1.5 group">
              <a href={entry.url} target="_blank" rel="noopener noreferrer"
                className="block truncate text-sm font-medium text-accent hover:underline">
                {entry.nombre || entry.url}
              </a>
              {!isMentor && (
                <button type="button" onClick={() => startEdit("nombre")} title="Editar título"
                  className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {/* URL display */}
          {entry.nombre && <p className="truncate text-xs text-muted">{entry.url}</p>}
          {/* Description */}
          {editingField === "descripcion" ? (
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus rows={2}
              onClick={(e) => e.stopPropagation()}
              onBlur={saveEdit}
              onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
              className="mt-1 w-full rounded-lg border-2 border-accent bg-background px-2 py-1 text-sm text-muted outline-none" />
          ) : (
            <div className="flex items-center gap-1.5 group">
              {entry.descripcion
                ? <p className="mt-1 text-sm text-muted">{entry.descripcion}</p>
                : !isMentor && <p className="mt-1 text-xs italic text-muted/50 cursor-pointer hover:text-muted" onClick={() => startEdit("descripcion")}>Añadir descripción...</p>
              }
              {entry.descripcion && !isMentor && (
                <button type="button" onClick={() => startEdit("descripcion")} title="Editar descripción"
                  className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {/* Area badges + project names */}
          {(areaList.length > 0 || projList.length > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {areaList.map((a) => {
                const hex = AREA_COLORS[a]?.hex ?? "#888";
                return (
                  <span key={a} className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: hex + "18", color: hex }}>
                    {ALL_AREAS.find((x) => x.id === a)?.label ?? a}
                  </span>
                );
              })}
              {projList.length > 0 && (
                <span className="text-[10px] text-muted">
                  {projList.join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
        {/* Right side actions */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            {/* Copy URL */}
            <button type="button" onClick={copyUrl} title="Copiar URL"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground">
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
            {/* Open in new tab */}
            <a href={entry.url} target="_blank" rel="noopener noreferrer" title="Abrir en nueva pestaña"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
          {/* People & paso count */}
          <div className="flex items-center gap-1.5">
            {(() => {
              const people = [...new Set(entry.pasos.map((p) => p.persona).filter(Boolean))];
              return people.length > 0 ? <span className="text-[10px] text-muted">{people.join(", ")}</span> : null;
            })()}
            <button type="button" onClick={() => setOpen(!open)}
              className="rounded-lg px-2 py-0.5 text-[10px] text-muted transition-colors hover:bg-surface">
              {entry.pasos.length} {entry.pasos.length === 1 ? "paso" : "pasos"}
              <span className="ml-1">{open ? "▲" : "▼"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Expanded pasos list */}
      {open && (
        <div className="mt-3 border-t border-border pt-3">
          {entry.pasos.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1.5 text-xs text-muted">
              {p.area && (
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: AREA_COLORS[p.area]?.hex ?? "#888" }} />
              )}
              {!p.area && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />}
              {p.persona && (
                <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {p.persona}
                </span>
              )}
              <span className="flex-1 truncate">{p.nombre}</span>
              {p.proyecto && <span className="shrink-0 text-[10px] text-muted/70">{p.proyecto}</span>}
              {p.fecha && (
                <span className="shrink-0">
                  {new Date(p.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </span>
              )}
              {!isMentor && (
                confirmRemove === p.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => { onRemoveFromPaso(p.id); setConfirmRemove(null); }}
                      className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] text-white">Sí</button>
                    <button type="button" onClick={() => setConfirmRemove(null)}
                      className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">No</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmRemove(p.id)} title="Quitar URL de este paso"
                    className="shrink-0 rounded p-0.5 text-muted/50 transition-colors hover:text-red-500">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
