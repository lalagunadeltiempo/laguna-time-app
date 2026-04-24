"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppDispatch } from "@/lib/context";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalDateTimeStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Construye los valores por defecto de inicio/fin.
 * - Si defaultDateKey es hoy (o no se pasa): inicio = ahora - 30min, fin = ahora.
 * - Si es otro día: inicio = defaultDateKey 09:00, fin = defaultDateKey 10:00.
 */
function buildDefaults(defaultDateKey?: string): { inicio: string; fin: string } {
  const now = new Date();
  const todayKey = toDateKey(now);
  if (!defaultDateKey || defaultDateKey === todayKey) {
    const inicio = new Date(now);
    inicio.setMinutes(inicio.getMinutes() - 30);
    return { inicio: toLocalDateTimeStr(inicio), fin: toLocalDateTimeStr(now) };
  }
  const [y, m, d] = defaultDateKey.split("-").map(Number);
  const base = new Date(y, (m ?? 1) - 1, d ?? 1, 9, 0, 0, 0);
  const end = new Date(base);
  end.setHours(10, 0, 0, 0);
  return { inicio: toLocalDateTimeStr(base), fin: toLocalDateTimeStr(end) };
}

interface PopoverProps {
  entregableId: string;
  defaultDateKey?: string;
  onClose: () => void;
}

/**
 * Modal pequeño para registrar una sesión ya cerrada sobre un entregable fijado.
 * No incluye buscador: el entregableId viene del contexto donde se invoca.
 */
export function RegistrarSesionPopover({ entregableId, defaultDateKey, onClose }: PopoverProps) {
  const dispatch = useAppDispatch();
  const [fechaInicio, setFechaInicio] = useState(() => buildDefaults(defaultDateKey).inicio);
  const [fechaFin, setFechaFin] = useState(() => buildDefaults(defaultDateKey).fin);
  const [marcarHecho, setMarcarHecho] = useState(false);

  const duracionMin = useMemo(() => {
    try {
      const ms = new Date(fechaFin).getTime() - new Date(fechaInicio).getTime();
      if (!Number.isFinite(ms) || ms <= 0) return 0;
      return Math.round(ms / 60000);
    } catch {
      return 0;
    }
  }, [fechaInicio, fechaFin]);

  const canSubmit = !!entregableId && duracionMin > 0;

  function submit() {
    if (!canSubmit) return;
    const inicioTs = new Date(fechaInicio).toISOString();
    const finTs = new Date(fechaFin).toISOString();
    if (new Date(finTs) <= new Date(inicioTs)) return;
    dispatch({ type: "APPEND_SESION_ENTREGABLE", id: entregableId, inicioTs, finTs });
    if (marcarHecho) {
      dispatch({ type: "FINISH_ENTREGABLE", id: entregableId, ts: finTs });
    }
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-2xl">
        <h3 className="mb-1 text-base font-bold text-foreground">Registrar sesión</h3>
        <p className="mb-4 text-[11px] text-muted">
          ¿Se te olvidó cronometrar? Añade aquí la sesión de trabajo que ya hiciste.
        </p>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">Inicio</label>
            <input
              type="datetime-local"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted">Fin</label>
            <input
              type="datetime-local"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
        </div>

        <p className="mb-3 text-[11px] text-muted">
          {duracionMin > 0
            ? `Duración: ${duracionMin >= 60 ? `${Math.floor(duracionMin / 60)}h ${duracionMin % 60}m` : `${duracionMin}m`}`
            : "La hora de fin debe ser posterior al inicio."}
        </p>

        <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={marcarHecho}
            onChange={(e) => setMarcarHecho(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Marcar entregable como hecho
        </label>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-xs font-medium text-muted hover:bg-surface"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-accent py-2.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-accent/90"
          >
            Registrar
          </button>
        </div>
      </div>
    </div>
  );
}

interface IconButtonProps {
  entregableId: string;
  defaultDateKey?: string;
  title?: string;
  variant?: "icon" | "chip" | "ghost";
  className?: string;
  /** Si se proporciona, se usa para renderizar contenido a medida en lugar del icono por defecto. */
  children?: React.ReactNode;
}

/**
 * Botón reutilizable que abre el popover de registrar sesión.
 * - "icon": solo icono reloj+ (para filas compactas).
 * - "chip": icono + texto pequeño ("Ya lo hice").
 * - "ghost": como un link discreto.
 */
export function RegistrarSesionIconButton({
  entregableId,
  defaultDateKey,
  title = "Ya lo hice · registrar sesión",
  variant = "icon",
  className,
  children,
}: IconButtonProps) {
  const [open, setOpen] = useState(false);

  const baseIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
      <path d="M19 4v4M17 6h4" />
    </svg>
  );

  const cls =
    className ??
    (variant === "chip"
      ? "flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted transition-colors hover:border-accent hover:text-accent"
      : variant === "ghost"
      ? "inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-accent"
      : "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-accent hover:text-accent");

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={title}
        aria-label={title}
        className={cls}
      >
        {children ?? (
          <>
            {baseIcon}
            {variant === "chip" && <span>Ya lo hice</span>}
            {variant === "ghost" && <span>Registrar sesión</span>}
          </>
        )}
      </button>
      {open && (
        <RegistrarSesionPopover
          entregableId={entregableId}
          defaultDateKey={defaultDateKey}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface EditarSesionPopoverProps {
  entregableId: string;
  sesionIdx: number;
  inicioTsActual: string;
  /** null → la sesión está en curso. */
  finTsActual: string | null;
  onClose: () => void;
}

/**
 * Popover para editar los timestamps de una sesión existente.
 * Si la sesión estaba en curso (`finTsActual === null`), se ofrece un toggle
 * "Sigue en curso" para mantenerla abierta o cerrarla ahora.
 */
export function EditarSesionPopover({
  entregableId,
  sesionIdx,
  inicioTsActual,
  finTsActual,
  onClose,
}: EditarSesionPopoverProps) {
  const dispatch = useAppDispatch();
  const [inicio, setInicio] = useState(() => toLocalDateTimeStr(new Date(inicioTsActual)));
  const abiertaInicial = finTsActual === null;
  const [sigueEnCurso, setSigueEnCurso] = useState<boolean>(abiertaInicial);
  const [fin, setFin] = useState(() =>
    finTsActual ? toLocalDateTimeStr(new Date(finTsActual)) : toLocalDateTimeStr(new Date()),
  );

  const duracionMin = useMemo(() => {
    try {
      if (sigueEnCurso) {
        const ms = Date.now() - new Date(inicio).getTime();
        if (!Number.isFinite(ms) || ms <= 0) return 0;
        return Math.round(ms / 60000);
      }
      const ms = new Date(fin).getTime() - new Date(inicio).getTime();
      if (!Number.isFinite(ms) || ms <= 0) return 0;
      return Math.round(ms / 60000);
    } catch {
      return 0;
    }
  }, [inicio, fin, sigueEnCurso]);

  const canSubmit = !!inicio && duracionMin > 0;

  function submit() {
    if (!canSubmit) return;
    const inicioTs = new Date(inicio).toISOString();
    const finTs = sigueEnCurso ? null : new Date(fin).toISOString();
    if (finTs !== null && new Date(finTs) <= new Date(inicioTs)) return;
    dispatch({
      type: "UPDATE_SESION_ENTREGABLE_TIMES",
      id: entregableId,
      sesionIdx,
      inicioTs,
      finTs,
    });
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-background p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-base font-bold text-foreground">Editar sesión</h3>
        <p className="mb-4 text-[11px] text-muted">
          {abiertaInicial
            ? "Ajusta la hora de inicio si empezaste antes de darle al play."
            : "Corrige los horarios de esta sesión."}
        </p>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className={sigueEnCurso ? "col-span-2" : ""}>
            <label className="mb-1 block text-[11px] font-medium text-muted">Inicio</label>
            <input
              type="datetime-local"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
          {!sigueEnCurso && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted">Fin</label>
              <input
                type="datetime-local"
                value={fin}
                onChange={(e) => setFin(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
          )}
        </div>

        <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface/40 px-3 py-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={sigueEnCurso}
            onChange={(e) => setSigueEnCurso(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          {abiertaInicial ? "Sigue en curso (no cerrarla aún)" : "Dejarla como en curso"}
        </label>

        <p className="mb-3 text-[11px] text-muted">
          {duracionMin > 0
            ? `Duración${sigueEnCurso ? " (hasta ahora)" : ""}: ${duracionMin >= 60 ? `${Math.floor(duracionMin / 60)}h ${duracionMin % 60}m` : `${duracionMin}m`}`
            : "El fin debe ser posterior al inicio."}
        </p>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-xs font-medium text-muted hover:bg-surface"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-accent py-2.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-accent/90"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
