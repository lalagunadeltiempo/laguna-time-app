"use client";

import { useState, useMemo } from "react";
import { useAppState } from "@/lib/context";
import type { ActivityEntry } from "@/lib/types";

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
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  const todayKey = toDateKey(new Date());

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
            <DaySection key={dateKey} dateKey={dateKey} entries={dayEntries} isToday={dateKey === todayKey} />
          ))}
        </div>
      )}
    </div>
  );
}

function DaySection({ dateKey, entries, isToday }: { dateKey: string; entries: ActivityEntry[]; isToday: boolean }) {
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
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryRow({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color = ACTION_COLORS[entry.action] ?? "#888";
  const label = ACTION_LABELS[entry.action] ?? entry.action;
  const hasDetail = !!(entry.detalle || entry.ruta);

  return (
    <div className="px-4 py-2.5">
      <button
        type="button"
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={`flex w-full items-start gap-3 text-left ${hasDetail ? "cursor-pointer" : "cursor-default"}`}
      >
        <span
          className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {entry.action === "close_paso" ? "✓" : entry.action === "add_nota" ? "N" : entry.action.includes("start") ? "▶" : entry.action.includes("pause") ? "⏸" : entry.action.includes("add") ? "+" : "•"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{entry.descripcion}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
            <span>{formatTime(entry.timestamp)}</span>
            <span className="font-medium" style={{ color }}>{label}</span>
            <span>{entry.userId}</span>
          </div>
        </div>
        {hasDetail && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            className={`mt-1.5 shrink-0 text-muted/40 transition-transform ${expanded ? "rotate-90" : ""}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </button>

      {expanded && hasDetail && (
        <div className="ml-9 mt-2 space-y-1.5 rounded-lg bg-surface/50 px-3 py-2">
          {entry.ruta && (
            <p className="text-[11px] text-muted">
              <span className="font-medium text-foreground/60">Ruta:</span> {entry.ruta}
            </p>
          )}
          {entry.detalle && (
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="whitespace-pre-wrap text-xs text-foreground">{entry.detalle}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
