"use client";

import { useEffect, useState } from "react";
import { AREA_COLORS, type Area, type MiembroInfo } from "@/lib/types";
import MoveInlinePanel from "../shared/MoveInlinePanel";
import { useAppState, useAppDispatch } from "@/lib/context";
import { WeekDayChips } from "./WeekDayChips";

const DAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export type BlockOrigen = "ent" | "paso-next" | "paso";

export interface WeekBlockInfo {
  id: string;
  title: string;
  subtitle: string;
  area: Area;
  responsable: string;
  dateKey: string;
  origen: BlockOrigen;
  entregableId?: string;
  pasoId?: string;
  proyectoId?: string;
  tieneActivePaso?: boolean;
  weekDates: Date[];
  miembros: MiembroInfo[];
}

interface Props {
  block: WeekBlockInfo;
  onClose: () => void;
  onMove: (newDate: string) => void;
  onUnschedule: () => void;
  onSetResponsable: (nombre: string) => void;
  onMarkDone: () => void;
  onOpenProject: () => void;
}

type SubView = "main" | "move" | "responsable" | "moveParent";

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WeekBlockSheet({
  block, onClose, onMove, onUnschedule, onSetResponsable, onMarkDone, onOpenProject,
}: Props) {
  const [view, setView] = useState<SubView>("main");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const canMove = block.origen === "ent" || block.origen === "paso-next";
  const canUnschedule = canMove;
  const canChangeResp = block.origen === "ent" && !!block.entregableId;
  const canMarkDone = block.origen === "ent" && !!block.entregableId && !block.tieneActivePaso;
  const canOpenProject = !!block.proyectoId;
  const canMoveParent = block.origen === "ent" && !!block.entregableId;
  const hex = AREA_COLORS[block.area]?.hex ?? "#888";
  const appState = useAppState();
  const dispatch = useAppDispatch();
  const currentEntregable = block.entregableId ? appState.entregables.find((e) => e.id === block.entregableId) : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 px-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="mb-0 w-full max-w-md rounded-t-2xl border border-border bg-background shadow-2xl sm:mb-0 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border p-4">
          <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold text-foreground">{block.title}</h3>
            {block.subtitle && <p className="truncate text-xs text-muted">{block.subtitle}</p>}
            {block.responsable && <p className="text-[10px] font-semibold" style={{ color: hex }}>{block.responsable}</p>}
          </div>
          <button onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground" aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Días planificados (solo entregables con id, en vista principal) */}
        {view === "main" && block.origen === "ent" && currentEntregable && (
          <div className="border-b border-border px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Días planificados</p>
            <WeekDayChips
              weekDates={block.weekDates}
              selectedKeys={currentEntregable.diasPlanificados ?? []}
              onToggle={(k) => dispatch({ type: "TOGGLE_ENTREGABLE_DIA", id: currentEntregable.id, dateKey: k })}
              size="md"
            />
            <p className="mt-1.5 text-[10px] text-muted/70">Toca un día para añadirlo o quitarlo.</p>
          </div>
        )}

        {/* Body */}
        <div className="p-2">
          {view === "main" && (
            <MainMenu
              canMove={canMove} canUnschedule={canUnschedule}
              canChangeResp={canChangeResp} canMarkDone={canMarkDone}
              canOpenProject={canOpenProject}
              canMoveParent={canMoveParent}
              tieneActivePaso={block.tieneActivePaso}
              onMoveClick={() => setView("move")}
              onUnschedule={onUnschedule}
              onRespClick={() => setView("responsable")}
              onMarkDone={onMarkDone}
              onOpenProject={onOpenProject}
              onMoveParentClick={() => setView("moveParent")}
            />
          )}
          {view === "move" && (
            <MoveDayPicker
              weekDates={block.weekDates}
              currentDateKey={block.dateKey}
              onPick={onMove}
              onBack={() => setView("main")}
            />
          )}
          {view === "responsable" && (
            <ResponsablePicker
              miembros={block.miembros}
              current={block.responsable}
              onPick={onSetResponsable}
              onBack={() => setView("main")}
            />
          )}
          {view === "moveParent" && currentEntregable && (
            <div>
              <button onClick={() => setView("main")} className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-muted transition-colors hover:text-foreground">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                Volver
              </button>
              <p className="mb-2 px-1 text-xs font-semibold text-muted">Mover a otro resultado:</p>
              <MoveInlinePanel
                target={{ kind: "entregable", id: currentEntregable.id, currentResultadoId: currentEntregable.resultadoId }}
                onDone={() => { setView("main"); onClose(); }}
                className=""
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- MainMenu ---------- */
function MainMenu({
  canMove, canUnschedule, canChangeResp, canMarkDone, canOpenProject, canMoveParent,
  tieneActivePaso,
  onMoveClick, onUnschedule, onRespClick, onMarkDone, onOpenProject, onMoveParentClick,
}: {
  canMove: boolean; canUnschedule: boolean; canChangeResp: boolean;
  canMarkDone: boolean; canOpenProject: boolean; canMoveParent: boolean;
  tieneActivePaso?: boolean;
  onMoveClick: () => void; onUnschedule: () => void; onRespClick: () => void;
  onMarkDone: () => void; onOpenProject: () => void; onMoveParentClick: () => void;
}) {
  return (
    <div className="space-y-0.5">
      {canMove && (
        <ActionRow icon={<CalendarIcon />} label="Mover a otro día" chevron onClick={onMoveClick} />
      )}
      {canUnschedule && (
        <ActionRow icon={<RemoveIcon />} label="Desprogramar" onClick={onUnschedule} />
      )}
      {canChangeResp && (
        <ActionRow icon={<PersonIcon />} label="Cambiar responsable" chevron onClick={onRespClick} />
      )}
      {canMarkDone && (
        <ActionRow icon={<CheckIcon />} label="Marcar hecho" onClick={onMarkDone} />
      )}
      {!canMarkDone && tieneActivePaso && (
        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 opacity-40" title="Cierra primero el paso en Hoy">
          <CheckIcon />
          <span className="text-sm text-muted">Marcar hecho</span>
          <span className="ml-auto text-[10px] italic text-muted">Cierra el paso activo primero</span>
        </div>
      )}
      {canMoveParent && (
        <ActionRow icon={<MoveIcon />} label="Mover a otro resultado" chevron onClick={onMoveParentClick} />
      )}
      {canOpenProject && (
        <ActionRow icon={<FolderIcon />} label="Abrir en proyecto" onClick={onOpenProject} />
      )}
    </div>
  );
}

function MoveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function ActionRow({ icon, label, chevron, onClick }: { icon: React.ReactNode; label: string; chevron?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface">
      <span className="shrink-0 text-muted">{icon}</span>
      <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
      {chevron && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      )}
    </button>
  );
}

/* ---------- MoveDayPicker ---------- */
function MoveDayPicker({ weekDates, currentDateKey, onPick, onBack }: {
  weekDates: Date[];
  currentDateKey: string;
  onPick: (dateKey: string) => void;
  onBack: () => void;
}) {
  const [todayKey] = useState(() => toDateKey(new Date()));

  return (
    <div>
      <button onClick={onBack} className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-muted transition-colors hover:text-foreground">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        Volver
      </button>
      <p className="mb-3 px-1 text-xs font-semibold text-muted">Mover a:</p>
      <div className="mb-3 grid grid-cols-7 gap-1.5">
        {weekDates.map((d, i) => {
          const key = toDateKey(d);
          const isCurrent = key === currentDateKey;
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          return (
            <button key={key}
              onClick={() => onPick(key)}
              disabled={isCurrent}
              aria-current={isCurrent ? "date" : undefined}
              className={`flex flex-col items-center rounded-lg py-2 text-xs font-medium transition-colors
                ${isCurrent ? "border-2 border-accent bg-accent/10 text-accent" : isPast ? "text-muted/50 hover:bg-surface" : "text-foreground hover:bg-surface"}
                ${isToday && !isCurrent ? "ring-1 ring-accent/40" : ""}
              `}>
              <span className="text-[10px]">{DAYS_SHORT[i]}</span>
              <span className="text-sm font-bold">{d.getDate()}</span>
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 px-1 text-xs text-muted">
        <span className="font-medium">Otra fecha:</span>
        <input type="date"
          onChange={(e) => { if (e.target.value) onPick(e.target.value); }}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" />
      </label>
    </div>
  );
}

/* ---------- ResponsablePicker ---------- */
function ResponsablePicker({ miembros, current, onPick, onBack }: {
  miembros: MiembroInfo[];
  current: string;
  onPick: (nombre: string) => void;
  onBack: () => void;
}) {
  return (
    <div>
      <button onClick={onBack} className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-muted transition-colors hover:text-foreground">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        Volver
      </button>
      <p className="mb-2 px-1 text-xs font-semibold text-muted">Asignar a:</p>
      <div className="space-y-0.5">
        <button onClick={() => onPick("")}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface ${!current ? "bg-accent/10" : ""}`}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gray-300" />
          <span className="text-sm text-foreground">Sin responsable</span>
        </button>
        {miembros.map((m) => (
          <button key={m.id} onClick={() => onPick(m.nombre)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface ${current === m.nombre ? "bg-accent/10" : ""}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
            <span className="text-sm font-medium text-foreground">{m.nombre}</span>
            {current === m.nombre && <span className="ml-auto text-xs text-accent">actual</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Icons ---------- */
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function RemoveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
