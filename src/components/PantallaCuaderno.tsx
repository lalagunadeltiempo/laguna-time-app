"use client";

import { useState, useMemo } from "react";
import { useAppState } from "@/lib/context";
import { useUsuario } from "@/lib/usuario";
import type { ActivityEntry } from "@/lib/types";

function groupByDate(entries: ActivityEntry[]): Map<string, ActivityEntry[]> {
  const map = new Map<string, ActivityEntry[]>();
  for (const e of entries) {
    const key = e.timestamp.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
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

const ACTION_ICONS: Record<string, string> = {
  start_paso: "▶",
  close_paso: "✓",
  add_url: "🔗",
  add_nota: "📝",
  add_entregable: "+",
  add_resultado: "+",
  add_proyecto: "+",
  convert_to_sop: "⚙",
  start_sop: "⚙",
  pause_paso: "⏸",
  resume_paso: "▶",
};

export function PantallaCuaderno() {
  const state = useAppState();
  const { nombre: currentUser } = useUsuario();
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  const entries = useMemo(() => {
    let list = [...(state.activityLog ?? [])].sort(
      (a, b) => b.timestamp.localeCompare(a.timestamp),
    );

    if (filterUser !== "all") {
      list = list.filter((e) => e.userId === filterUser);
    }
    if (filterAction !== "all") {
      list = list.filter((e) => e.action === filterAction);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter((e) => e.descripcion.toLowerCase().includes(q));
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
      <h1 className="mb-1 text-2xl font-bold text-foreground">Cuaderno de Actividad</h1>
      <p className="mb-6 text-sm text-muted">Registro de todo lo que sucede en la app</p>

      {/* Filters */}
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
          <option value="all">Todos los usuarios</option>
          {uniqueUsers.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="all">Todas las acciones</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
          ))}
        </select>
        {(filterUser !== "all" || filterAction !== "all" || searchText) && (
          <button
            onClick={() => { setFilterUser("all"); setFilterAction("all"); setSearchText(""); }}
            className="text-xs text-accent hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted">Sin actividad registrada</p>
          <p className="mt-2 text-sm text-muted">
            Las acciones que realices (iniciar pasos, cerrar pasos, añadir URLs, etc.) aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([dateKey, dayEntries]) => (
            <div key={dateKey}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
                {formatDate(dateKey)}
              </h2>
              <div className="space-y-1">
                {dayEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs">
                      {ACTION_ICONS[entry.action] ?? "•"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{entry.descripcion}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                        <span>{formatTime(entry.timestamp)}</span>
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">
                          {entry.userId}
                        </span>
                        <span className="rounded-md bg-surface px-1.5 py-0.5">
                          {entry.action.replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
