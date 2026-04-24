"use client";

import { useState, useMemo, useCallback } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useIsMentor, useUsuario } from "@/lib/usuario";
import type { ActivityEntry } from "@/lib/types";
import { generateId } from "@/lib/store";
import HierarchyPicker, { type HierarchySelection } from "@/components/shared/HierarchyPicker";

function groupByDate(entries: ActivityEntry[]): [string, ActivityEntry[]][] {
  const map = new Map<string, ActivityEntry[]>();
  for (const e of entries) {
    const key = e.timestamp.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries());
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ACTION_LABELS: Record<string, string> = {
  start_paso: "Paso iniciado",
  close_paso: "Paso dado",
  add_nota: "Nota",
  add_entregable: "Nuevo entregable",
  add_resultado: "Nuevo resultado",
  add_proyecto: "Nuevo proyecto",
  convert_to_sop: "Convertido a SOP",
  start_sop: "SOP iniciado",
  pause_paso: "Paso pausado",
  resume_paso: "Paso reanudado",
};

const ACTION_COLORS: Record<string, string> = {
  start_paso: "#22c55e",
  close_paso: "#16a34a",
  add_nota: "#8b5cf6",
  add_entregable: "#f59e0b",
  add_resultado: "#f59e0b",
  add_proyecto: "#3b82f6",
  convert_to_sop: "#6366f1",
  start_sop: "#6366f1",
  pause_paso: "#eab308",
  resume_paso: "#22c55e",
};

export function PantallaCuaderno() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const { nombre: currentUser } = useUsuario();
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [pickerForNota, setPickerForNota] = useState<{ texto: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const todayKey = toDateKey(new Date());

  const difundirNotaAEntregable = useCallback((texto: string, entregableId: string) => {
    const ent = state.entregables.find((e) => e.id === entregableId);
    if (!ent) return;
    const yaEstaba = (ent.notas ?? []).some((n) => n.texto.trim() === texto.trim());
    if (yaEstaba) {
      setToast(`La nota ya estaba en ${ent.nombre}`);
    } else {
      const nuevaNota = { id: generateId(), texto, autor: currentUser, creadoTs: new Date().toISOString() };
      dispatch({ type: "ADD_NOTA", nivel: "entregable", targetId: entregableId, nota: nuevaNota });
      setToast(`Nota añadida a ${ent.nombre}`);
    }
    setTimeout(() => setToast(null), 2500);
    setPickerForNota(null);
  }, [state, dispatch, currentUser]);

  const onPickerSelect = useCallback((sel: HierarchySelection) => {
    if (pickerForNota && sel.entregableId) {
      difundirNotaAEntregable(pickerForNota.texto, sel.entregableId);
    } else {
      setPickerForNota(null);
    }
  }, [pickerForNota, difundirNotaAEntregable]);

  const entries = useMemo(() => {
    let list = [...(state.activityLog ?? [])].sort(
      (a, b) => b.timestamp.localeCompare(a.timestamp),
    );
    if (filterUser !== "all") list = list.filter((e) => e.userId === filterUser);
    if (filterAction !== "all") list = list.filter((e) => e.action === filterAction);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter((e) =>
        e.descripcion.toLowerCase().includes(q) ||
        (e.detalle?.toLowerCase().includes(q)) ||
        (e.ruta?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [state.activityLog, filterUser, filterAction, searchText]);

  const grouped = useMemo(() => groupByDate(entries), [entries]);

  const uniqueUsers = useMemo(() => {
    const set = new Set((state.activityLog ?? []).map((e) => e.userId));
    return Array.from(set).sort();
  }, [state.activityLog]);

  const uniqueActions = useMemo(() => {
    const set = new Set((state.activityLog ?? []).map((e) => e.action));
    return Array.from(set).sort();
  }, [state.activityLog]);

  return (
    <div className="w-full px-6 py-8 sm:px-10">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Cuaderno</h1>
      <p className="mb-6 text-sm text-muted">Todo lo que sucede, en orden cronológico</p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Buscar..."
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="all">Todos</option>
          {uniqueUsers.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="all">Todas las acciones</option>
          {uniqueActions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
        </select>
        {(filterUser !== "all" || filterAction !== "all" || searchText) && (
          <button
            onClick={() => { setFilterUser("all"); setFilterAction("all"); setSearchText(""); }}
            className="text-xs text-accent hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted">Sin actividad registrada</p>
          <p className="mt-2 text-sm text-muted/60">Las acciones que realices aparecerán aquí.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([dateKey, dayEntries]) => (
            <DaySection key={dateKey} dateKey={dateKey} entries={dayEntries} isToday={dateKey === todayKey}
              onDifundirNota={isMentor ? undefined : (texto) => setPickerForNota({ texto })} />
          ))}
        </div>
      )}

      {pickerForNota && (
        <HierarchyPicker
          depth="entregable"
          title="Añadir nota a otro entregable"
          onSelect={onPickerSelect}
          onCancel={() => setPickerForNota(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function DaySection({ dateKey, entries, isToday, onDifundirNota }: { dateKey: string; entries: ActivityEntry[]; isToday: boolean; onDifundirNota?: (texto: string) => void }) {
  const [open, setOpen] = useState(isToday);

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground capitalize">{formatDate(dateKey)}</span>
          {isToday && <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">Hoy</span>}
        </div>
        <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-muted">
          {entries.length}
        </span>
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border/50">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onDifundirNota={onDifundirNota} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry, onDifundirNota }: { entry: ActivityEntry; onDifundirNota?: (texto: string) => void }) {
  const color = ACTION_COLORS[entry.action] ?? "#888";
  const label = ACTION_LABELS[entry.action] ?? entry.action;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {entry.action === "close_paso" ? "✓" : entry.action === "add_nota" ? "N" : entry.action.includes("start") ? "▶" : entry.action.includes("pause") ? "⏸" : entry.action.includes("add") ? "+" : "•"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{entry.descripcion}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
            <span>{formatTime(entry.timestamp)}</span>
            <span className="font-medium" style={{ color }}>{label}</span>
            <span>{entry.userId}</span>
          </div>
          {entry.ruta && (
            <p className="mt-1 text-[11px] text-muted/70">
              {entry.ruta}
            </p>
          )}
          {entry.detalle && (
            <div className="mt-1.5 rounded-md border border-border/60 bg-surface/30 px-3 py-2">
              <p className="whitespace-pre-wrap text-xs text-foreground/80">{entry.detalle}</p>
              {entry.action === "add_nota" && onDifundirNota && entry.detalle.trim() && (
                <button
                  type="button"
                  onClick={() => onDifundirNota(entry.detalle!)}
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-accent-soft hover:text-accent"
                  title="Añadir esta nota a otro entregable"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                  Añadir a otro entregable
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
