import type { AppState, Paso } from "./types";

export interface SearchResult {
  tipo: "paso" | "entregable" | "resultado" | "proyecto" | "url" | "nota" | "contacto" | "inbox";
  id: string;
  titulo: string;
  subtitulo?: string;
  fecha?: string | null;
}

export function buscar(state: AppState, query: string): SearchResult[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const p of state.pasos) {
    if (p.nombre.toLowerCase().includes(q)) {
      results.push({ tipo: "paso", id: p.id, titulo: p.nombre, subtitulo: entregableNombre(state, p), fecha: p.inicioTs });
    }
    for (const url of p.contexto.urls) {
      const hayMatch = url.nombre.toLowerCase().includes(q) ||
        url.descripcion.toLowerCase().includes(q) ||
        url.url.toLowerCase().includes(q);
      if (hayMatch) {
        results.push({ tipo: "url", id: p.id, titulo: url.nombre || url.url, subtitulo: p.nombre, fecha: p.inicioTs });
      }
    }
    if (p.contexto.notas.toLowerCase().includes(q)) {
      const fragment = extractFragment(p.contexto.notas, q);
      results.push({ tipo: "nota", id: p.id, titulo: fragment, subtitulo: p.nombre, fecha: p.inicioTs });
    }
    for (const app of p.contexto.apps) {
      if (app.toLowerCase().includes(q)) {
        results.push({ tipo: "paso", id: p.id, titulo: `${p.nombre} (${app})`, subtitulo: entregableNombre(state, p), fecha: p.inicioTs });
      }
    }
  }

  for (const e of state.entregables) {
    if (e.nombre.toLowerCase().includes(q)) {
      results.push({ tipo: "entregable", id: e.id, titulo: e.nombre, subtitulo: resultadoNombre(state, e.resultadoId) });
    }
  }

  for (const r of state.resultados) {
    if (r.nombre.toLowerCase().includes(q)) {
      results.push({ tipo: "resultado", id: r.id, titulo: r.nombre, subtitulo: proyectoNombre(state, r.proyectoId) });
    }
  }

  for (const p of state.proyectos) {
    if (p.nombre.toLowerCase().includes(q)) {
      results.push({ tipo: "proyecto", id: p.id, titulo: p.nombre });
    }
  }

  for (const c of state.contactos) {
    if (c.nombre.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)) {
      results.push({ tipo: "contacto", id: c.id, titulo: c.nombre, subtitulo: c.email });
    }
  }

  for (const i of state.inbox) {
    if (i.texto.toLowerCase().includes(q)) {
      results.push({ tipo: "inbox", id: i.id, titulo: i.texto, fecha: i.creado });
    }
  }

  return results.slice(0, 30);
}

function entregableNombre(state: AppState, paso: Paso): string {
  return state.entregables.find((e) => e.id === paso.entregableId)?.nombre ?? "";
}

function resultadoNombre(state: AppState, resultadoId: string): string {
  return state.resultados.find((r) => r.id === resultadoId)?.nombre ?? "";
}

function proyectoNombre(state: AppState, proyectoId: string): string {
  return state.proyectos.find((p) => p.id === proyectoId)?.nombre ?? "";
}

function extractFragment(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query);
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 30);
  let frag = text.slice(start, end);
  if (start > 0) frag = "…" + frag;
  if (end < text.length) frag = frag + "…";
  return frag;
}
