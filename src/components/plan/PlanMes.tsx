"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useIsMentor } from "@/lib/usuario";
import { ambitoDeArea, AREA_COLORS, type Entregable, type Proyecto, type Ambito } from "@/lib/types";

type AmbitoFilter = "todo" | Ambito;
type RAG = "green" | "amber" | "red";

const RAG_HEX: Record<RAG, string> = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" };

interface WeekDef {
  index: number;
  label: string;
  monday: string;
  mondayMs: number;
  sundayMs: number;
}

interface EntCard {
  entregable: Entregable;
  proyecto: Proyecto;
  areaHex: string;
  rag: RAG;
}

function getWeeksOfMonth(date: Date): WeekDef[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const dayOfWeek = firstDay.getDay() || 7;
  const firstMonday = new Date(firstDay);
  firstMonday.setDate(firstDay.getDate() - dayOfWeek + 1);

  const weeks: WeekDef[] = [];
  const current = new Date(firstMonday);
  let idx = 1;

  while (current.getTime() <= lastDay.getTime()) {
    const mon = new Date(current);
    const sun = new Date(current);
    sun.setDate(sun.getDate() + 6);

    const monStr = mon.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const sunStr = sun.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

    const mondayKey = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;

    weeks.push({
      index: idx,
      label: `S${idx} · ${monStr} – ${sunStr}`,
      monday: mondayKey,
      mondayMs: mon.getTime(),
      sundayMs: sun.getTime() + 86400000 - 1,
    });

    current.setDate(current.getDate() + 7);
    idx++;
  }
  return weeks;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeRAG(ent: Entregable, nowMs: number): RAG {
  if (ent.estado === "hecho") return "green";
  if (ent.estado === "cancelada") return "green";
  if (ent.fechaLimite) {
    const dl = new Date(ent.fechaLimite + "T23:59:59").getTime();
    if (dl < nowMs) return "red";
    const daysLeft = Math.ceil((dl - nowMs) / 86400000);
    if (daysLeft <= 7) return "amber";
  }
  if (ent.estado === "en_proceso") return "green";
  if (ent.estado === "a_futuro") return "amber";
  return "green";
}

interface Props {
  selectedDate: Date;
}

export function PlanMes({ selectedDate }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const [filtro, setFiltro] = useState<AmbitoFilter>("todo");

  const mesLabel = useMemo(() =>
    selectedDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
  [selectedDate]);

  const weeks = useMemo(() => getWeeksOfMonth(selectedDate), [selectedDate]);
  const nowMs = useMemo(() => Date.now(), []);

  const { weekEntregables, unassigned } = useMemo(() => {
    const selYear = selectedDate.getFullYear();
    const selMonth = selectedDate.getMonth();
    const monthStart = new Date(selYear, selMonth, 1).getTime();
    const monthEnd = new Date(selYear, selMonth + 1, 0, 23, 59, 59).getTime();

    const relevant: EntCard[] = [];

    for (const ent of state.entregables) {
      if (ent.estado === "hecho" || ent.estado === "cancelada") continue;

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      if (!proj) continue;
      if (filtro !== "todo" && ambitoDeArea(proj.area) !== filtro) continue;

      const areaHex = AREA_COLORS[proj.area]?.hex ?? "#888";

      let inMonth = false;

      if (ent.fechaInicio) {
        const d = new Date(ent.fechaInicio + "T12:00:00");
        if (!isNaN(d.getTime()) && d.getTime() >= monthStart && d.getTime() <= monthEnd) inMonth = true;
      }
      if (!inMonth && ent.fechaLimite) {
        const dl = new Date(ent.fechaLimite + "T12:00:00");
        if (!isNaN(dl.getTime()) && dl.getTime() >= monthStart && dl.getTime() <= monthEnd) inMonth = true;
      }
      if (!inMonth && ent.estado === "en_proceso") inMonth = true;

      if (!inMonth) continue;

      relevant.push({ entregable: ent, proyecto: proj, areaHex, rag: computeRAG(ent, nowMs) });
    }

    const byWeek = new Map<number, EntCard[]>();
    const noWeek: EntCard[] = [];

    for (const card of relevant) {
      if (!card.entregable.fechaInicio) {
        noWeek.push(card);
        continue;
      }
      const fMs = new Date(card.entregable.fechaInicio + "T12:00:00").getTime();
      let placed = false;
      for (const w of weeks) {
        if (fMs >= w.mondayMs && fMs <= w.sundayMs) {
          if (!byWeek.has(w.index)) byWeek.set(w.index, []);
          byWeek.get(w.index)!.push(card);
          placed = true;
          break;
        }
      }
      if (!placed) noWeek.push(card);
    }

    return { weekEntregables: byWeek, unassigned: noWeek };
  }, [state, selectedDate, filtro, weeks, nowMs]);

  function assignToWeek(entId: string, monday: string) {
    dispatch({ type: "UPDATE_ENTREGABLE", id: entId, changes: { fechaInicio: monday, estado: "en_proceso" } });
  }

  const totalCount = Array.from(weekEntregables.values()).reduce((s, arr) => s + arr.length, 0) + unassigned.length;

  return (
    <div className="flex-1">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium capitalize text-muted">{mesLabel}</p>
          <p className="text-xs text-muted">{totalCount} entregable{totalCount !== 1 ? "s" : ""} este mes</p>
        </div>
        <AmbitoToggle value={filtro} onChange={setFiltro} />
      </div>

      {totalCount === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted">No hay entregables activos este mes.</p>
          <p className="mt-1 text-xs text-muted">Asigna entregables desde el Mapa con el icono de calendario.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Week columns */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {weeks.map((w) => {
              const cards = weekEntregables.get(w.index) ?? [];
              return (
                <WeekColumn key={w.index} week={w} cards={cards} weeks={weeks}
                  onAssign={isMentor ? undefined : assignToWeek} />
              );
            })}
          </div>

          {/* Unassigned */}
          {unassigned.length > 0 && (
            <div className="rounded-xl border border-dashed border-border bg-surface/30 p-4">
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
                Sin asignar a semana ({unassigned.length})
              </h4>
              <div className="space-y-2">
                {unassigned.map((card) => (
                  <EntregableCard key={card.entregable.id} card={card} weeks={weeks}
                    onAssign={isMentor ? undefined : assignToWeek} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WeekColumn({ week, cards, weeks, onAssign }: {
  week: WeekDef;
  cards: EntCard[];
  weeks: WeekDef[];
  onAssign?: (entId: string, monday: string) => void;
}) {
  const isCurrentWeek = useMemo(() => {
    const now = Date.now();
    return now >= week.mondayMs && now <= week.sundayMs;
  }, [week]);

  return (
    <div className={`rounded-xl border p-4 ${isCurrentWeek ? "border-accent bg-accent/5" : "border-border bg-background"}`}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className={`text-xs font-bold uppercase tracking-wider ${isCurrentWeek ? "text-accent" : "text-muted"}`}>
          {week.label}
        </h4>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isCurrentWeek ? "bg-accent/15 text-accent" : "bg-surface text-muted"}`}>
          {cards.length}
        </span>
      </div>
      {cards.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted/50">Vacía</p>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => (
            <EntregableCard key={card.entregable.id} card={card} weeks={weeks}
              onAssign={onAssign} currentWeek={week.index} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntregableCard({ card, weeks, onAssign, currentWeek }: {
  card: EntCard;
  weeks: WeekDef[];
  onAssign?: (entId: string, monday: string) => void;
  currentWeek?: number;
}) {
  const { entregable, proyecto, areaHex, rag } = card;
  const [showWeeks, setShowWeeks] = useState(false);

  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: areaHex + "30", borderLeftWidth: "3px", borderLeftColor: areaHex }}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: RAG_HEX[rag] }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{entregable.nombre}</p>
          <p className="truncate text-[11px] text-muted">{proyecto.nombre}</p>
        </div>
        {onAssign && (
          <button onClick={() => setShowWeeks(!showWeeks)}
            className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold text-muted transition-colors hover:bg-surface hover:text-foreground"
            title="Asignar a semana">
            {currentWeek ? `S${currentWeek}` : "···"}
          </button>
        )}
      </div>

      {showWeeks && onAssign && (
        <div className="mt-2 flex flex-wrap gap-1">
          {weeks.map((w) => (
            <button key={w.index}
              onClick={() => { onAssign(entregable.id, w.monday); setShowWeeks(false); }}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                w.index === currentWeek
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-foreground hover:border-accent hover:bg-accent-soft"
              }`}>
              S{w.index}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AmbitoToggle({ value, onChange }: { value: AmbitoFilter; onChange: (v: AmbitoFilter) => void }) {
  const opts: { id: AmbitoFilter; label: string }[] = [
    { id: "todo", label: "Todo" },
    { id: "empresa", label: "Empresa" },
    { id: "personal", label: "Personal" },
  ];
  return (
    <div className="flex gap-1 rounded-lg bg-surface p-0.5">
      {opts.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === o.id ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
