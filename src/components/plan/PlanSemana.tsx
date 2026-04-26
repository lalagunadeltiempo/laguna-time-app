"use client";

import { useMemo, useState, useEffect } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { ambitoDeArea, AREA_COLORS, type Area, type Entregable } from "@/lib/types";
import type { ProjectedSOP } from "@/lib/sop-projector";
import SOPLaunchDialog from "@/components/shared/SOPLaunchDialog";
import { AmbitoToggle, type AmbitoFilter } from "./PlanMes";
import { WeekBlockSheet, type WeekBlockInfo } from "./WeekBlockSheet";
import { fechaEfectivaEntregable } from "@/lib/fechas-efectivas";
import { subtituloEntregable } from "@/lib/display";
import { WeekDayChips } from "./WeekDayChips";

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekDates(ref: Date): Date[] {
  const dayOfWeek = ref.getDay() || 7;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

interface WeekBlock {
  id: string;
  area: Area;
  title: string;
  subtitle: string;
  responsable: string;
  dateKey: string;
  type: "done" | "active" | "programado" | "sop" | "sesion-hecha";
  origen: "ent" | "paso-next" | "paso";
  entregableId?: string;
  pasoId?: string;
  proyectoId?: string;
  tieneActivePaso?: boolean;
}

interface Props {
  selectedDate: Date;
  onOpenInMapa?: (proyectoId: string) => void;
}

export function PlanSemana({ selectedDate, onOpenInMapa }: Props) {
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [viewMode, setViewMode] = useState<"yo" | "equipo">("yo");
  const [filtro, setFiltro] = useState<AmbitoFilter>("empresa");
  const [showDone, setShowDone] = useState(true);
  const [pickDay, setPickDay] = useState<string | null>(null);
  const [confirmSOP, setConfirmSOP] = useState<{ sop: ProjectedSOP; dateKey: string } | null>(null);
  const [carryOverDismissed, setCarryOverDismissed] = useState<string | null>(null);
  useEffect(() => {
    try { setCarryOverDismissed(localStorage.getItem("laguna-carryover-dismissed")); }
    catch { /* noop */ }
  }, []);

  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  useEffect(() => {
    const id = setInterval(() => {
      const k = toDateKey(new Date());
      setTodayKey((prev) => (prev !== k ? k : prev));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const blocks = useMemo(() => {
    const result: WeekBlock[] = [];
    const weekKeys = new Set(weekDates.map((d) => toDateKey(d)));

    // NOTA: en la vista Semana trabajamos sólo a nivel de ENTREGABLE.
    // Antes pintábamos un bloque por cada paso ejecutado (inicioTs en la
    // semana) y por cada "siguientePaso" programado (legacy), pero eso
    // apilaba decenas de bloques por día. La unidad de planificación ahora
    // es el entregable: un entregable = un bloque por día que lo tocas.
    // El trabajo real hecho se refleja con bloques `sesion-hecha` más abajo.

    const mondayKeyStr = weekDates[0] ? toDateKey(weekDates[0]) : null;
    const entregablesEnSemana: { ent: typeof state.entregables[number]; diasUsados: Set<string> }[] = [];

    for (const ent of state.entregables) {
      if (ent.estado === "cancelada") continue;
      if (ent.estado === "hecho" && !showDone) continue;
      if (viewMode === "yo" && ent.responsable && ent.responsable !== currentUser) continue;

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      if (filtro !== "todo" && proj && ambitoDeArea(proj.area) !== filtro) continue;

      // Filtros de pertenencia a la semana
      const resHasWeek = !!res && (
        res.semana === mondayKeyStr ||
        (Array.isArray(res.semanasActivas) && !!mondayKeyStr && res.semanasActivas.includes(mondayKeyStr))
      );
      const diasEnEstaSemana = (ent.diasPlanificados ?? []).filter((k) => weekKeys.has(k));
      const pertenecePorSemana = ent.semana === mondayKeyStr;
      const pertenecePorHerencia = !ent.semana && resHasWeek;
      const pertenecePorDias = diasEnEstaSemana.length > 0;

      if (!pertenecePorSemana && !pertenecePorHerencia && !pertenecePorDias) continue;
      // Si el entregable tiene semana propia en OTRA semana y no tiene días aquí, excluir
      if (ent.semana && ent.semana !== mondayKeyStr && !pertenecePorDias) continue;

      // Conjunto de días para los que emitir un bloque planificado:
      //   1) diasPlanificados que caen en esta semana
      //   2) fallback legacy: fechaInicio si cae en esta semana
      //   3) si no hay nada anterior → NO se emite bloque (irá al listado "sin día")
      const diasEnSemana = new Set<string>(diasEnEstaSemana);
      if (diasEnSemana.size === 0) {
        const efectiva = fechaEfectivaEntregable(ent, res ?? null, proj ?? null);
        if (efectiva.inicio && weekKeys.has(efectiva.inicio)) diasEnSemana.add(efectiva.inicio);
        else if (efectiva.fin && weekKeys.has(efectiva.fin)) diasEnSemana.add(efectiva.fin);
      }

      const hasActive = state.pasos.some((p) => p.entregableId === ent.id && state.pasosActivos.includes(p.id));

      // Días en los que YA hay una sesión cerrada del entregable: se marcan
      // como trabajados (estilo "sesion-hecha") aunque estuvieran planificados.
      // Así un entregable trabajado se ve igual esté planificado o no.
      const diasConSesionCerrada = new Set<string>();
      if (Array.isArray(ent.sesiones)) {
        for (const s of ent.sesiones) {
          if (!s.finTs) continue;
          const k = (s.inicioTs ?? "").slice(0, 10);
          if (k) diasConSesionCerrada.add(k);
        }
      }

      for (const dateKey of diasEnSemana) {
        const trabajadoEseDia = diasConSesionCerrada.has(dateKey);
        result.push({
          id: `ent-${ent.id}-${dateKey}`,
          area: proj?.area ?? "operativa",
          title: ent.nombre,
          subtitle: subtituloEntregable(ent, state),
          responsable: ent.responsable ?? "",
          dateKey,
          type: ent.estado === "hecho" ? "done" : trabajadoEseDia ? "sesion-hecha" : "programado",
          origen: "ent",
          entregableId: ent.id,
          proyectoId: proj?.id,
          tieneActivePaso: hasActive,
        });
      }

      entregablesEnSemana.push({ ent, diasUsados: diasEnSemana });
    }

    // Bloques de "sesión trabajada". Aplicamos a cualquier entregable que
    // haya sido trabajado en algún día de esta semana, aunque no estuviera
    // marcado como "de la semana" (esto antes lo cubrían los bloques de paso,
    // que hemos retirado). Para los entregables que sí estaban planificados
    // esta semana, evitamos duplicar en días que ya tengan su bloque.
    const diasUsadosPorEnt = new Map<string, Set<string>>();
    for (const { ent, diasUsados } of entregablesEnSemana) diasUsadosPorEnt.set(ent.id, diasUsados);

    for (const ent of state.entregables) {
      if (ent.estado === "cancelada") continue;
      if (ent.estado === "hecho" && !showDone) continue;
      if (viewMode === "yo" && ent.responsable && ent.responsable !== currentUser) continue;
      if (!Array.isArray(ent.sesiones) || ent.sesiones.length === 0) continue;

      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      if (filtro !== "todo" && proj && ambitoDeArea(proj.area) !== filtro) continue;

      const diasUsados = diasUsadosPorEnt.get(ent.id) ?? new Set<string>();
      const diasConSesion = new Set<string>();
      for (const s of ent.sesiones) {
        const k = (s.inicioTs ?? "").slice(0, 10);
        if (k) diasConSesion.add(k);
      }
      for (const k of diasConSesion) {
        if (!weekKeys.has(k)) continue;
        if (diasUsados.has(k)) continue;
        result.push({
          id: `sesion-${ent.id}-${k}`,
          area: proj?.area ?? "operativa",
          title: ent.nombre,
          subtitle: subtituloEntregable(ent, state),
          responsable: ent.responsable ?? "",
          dateKey: k,
          type: "sesion-hecha",
          origen: "ent",
          entregableId: ent.id,
          proyectoId: proj?.id,
        });
      }
    }

    return result;
  }, [state, weekDates, viewMode, currentUser, filtro, showDone]);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, WeekBlock[]>();
    for (const d of weekDates) map.set(toDateKey(d), []);
    for (const b of blocks) {
      const arr = map.get(b.dateKey);
      if (arr) arr.push(b);
    }
    return map;
  }, [blocks, weekDates]);

  const sopsByDay = useMemo(() => new Map<string, ProjectedSOP[]>(), []);

  // Entregables que pertenecen a esta semana pero no tienen NINGÚN día asignado en diasPlanificados.
  // Útil para mostrar un listado "sin día" donde el usuario puede marcar los días rápidamente.
  const pendientesSinDias = useMemo(() => {
    const mondayKeyStr = weekDates[0] ? toDateKey(weekDates[0]) : null;
    const weekKeys = new Set(weekDates.map((d) => toDateKey(d)));
    // IDs de entregables que ya están representados en el calendario por CUALQUIER vía
    // (paso, paso-next, ent o sesión trabajada). Si ya se ven en el calendario, no
    // tienen sentido en el panel "sin día".
    const entregablesYaEnCalendario = new Set<string>();
    for (const b of blocks) {
      if (b.entregableId) entregablesYaEnCalendario.add(b.entregableId);
    }
    const out: { ent: Entregable; hex: string; subtitulo: string; proyectoId?: string }[] = [];
    for (const ent of state.entregables) {
      if (ent.estado === "cancelada" || ent.estado === "hecho") continue;
      if (viewMode === "yo" && ent.responsable && ent.responsable !== currentUser) continue;
      if (entregablesYaEnCalendario.has(ent.id)) continue;
      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      if (!proj) continue;
      if ((proj.estado ?? "plan") === "completado" || (proj.estado ?? "plan") === "pausado") continue;
      if (filtro !== "todo" && ambitoDeArea(proj.area) !== filtro) continue;

      const resHasWeek = !!res && (
        res.semana === mondayKeyStr ||
        (Array.isArray(res.semanasActivas) && !!mondayKeyStr && res.semanasActivas.includes(mondayKeyStr))
      );
      const pertenece = ent.semana === mondayKeyStr
        || (!ent.semana && resHasWeek);
      if (!pertenece) continue;

      const diasEnEstaSemana = (ent.diasPlanificados ?? []).filter((k) => weekKeys.has(k));
      if (diasEnEstaSemana.length > 0) continue;

      // Fallback legacy: si fechaInicio/fechaEfectiva cae en esta semana, ya tiene día de facto.
      const efectiva = fechaEfectivaEntregable(ent, res ?? null, proj ?? null);
      const inicioEnSemana = !!efectiva.inicio && weekKeys.has(efectiva.inicio);
      const finEnSemana = !!efectiva.fin && weekKeys.has(efectiva.fin);
      if (inicioEnSemana || finEnSemana) continue;

      out.push({
        ent,
        hex: AREA_COLORS[proj.area]?.hex ?? "#888",
        subtitulo: subtituloEntregable(ent, state),
        proyectoId: proj.id,
      });
    }
    // Ordenar por área y luego por nombre
    out.sort((a, b) => {
      const aArea = state.resultados.find((r) => r.id === a.ent.resultadoId);
      const bArea = state.resultados.find((r) => r.id === b.ent.resultadoId);
      const aProj = aArea ? state.proyectos.find((p) => p.id === aArea.proyectoId) : undefined;
      const bProj = bArea ? state.proyectos.find((p) => p.id === bArea.proyectoId) : undefined;
      const aAreaStr = aProj?.area ?? "zzz";
      const bAreaStr = bProj?.area ?? "zzz";
      if (aAreaStr !== bAreaStr) return aAreaStr.localeCompare(bAreaStr);
      return a.ent.nombre.localeCompare(b.ent.nombre);
    });
    return out;
  }, [state, weekDates, viewMode, currentUser, filtro, blocks]);

  // Pendientes de la semana anterior (no completados ni cancelados) que
  // todavía no tienen presencia en la semana actual.
  const carryOverCandidates = useMemo(() => {
    const monday = weekDates[0];
    if (!monday) return [] as { ent: Entregable; subtitulo: string; hex: string }[];
    const prev = new Date(monday);
    prev.setDate(monday.getDate() - 7);
    const prevMondayKey = toDateKey(prev);
    const prevWeekKeys = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(prev);
      d.setDate(prev.getDate() + i);
      prevWeekKeys.add(toDateKey(d));
    }
    const currMondayKey = toDateKey(monday);
    const currWeekKeys = new Set(weekDates.map((d) => toDateKey(d)));
    const out: { ent: Entregable; subtitulo: string; hex: string }[] = [];
    for (const ent of state.entregables) {
      if (ent.estado === "cancelada" || ent.estado === "hecho") continue;
      if (viewMode === "yo" && ent.responsable && ent.responsable !== currentUser) continue;
      const res = state.resultados.find((r) => r.id === ent.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      if (!proj) continue;
      if ((proj.estado ?? "plan") === "completado" || (proj.estado ?? "plan") === "pausado") continue;
      if (filtro !== "todo" && ambitoDeArea(proj.area) !== filtro) continue;

      // Pertenecía a la semana anterior (por semana explícita o por días planificados)
      const teniaSemanaAnterior = ent.semana === prevMondayKey
        || (Array.isArray(ent.diasPlanificados) && ent.diasPlanificados.some((k) => prevWeekKeys.has(k)));
      if (!teniaSemanaAnterior) continue;

      // Ya está presente en la actual: ignorar
      const yaEnActual = ent.semana === currMondayKey
        || (Array.isArray(ent.diasPlanificados) && ent.diasPlanificados.some((k) => currWeekKeys.has(k)));
      if (yaEnActual) continue;

      out.push({
        ent,
        hex: AREA_COLORS[proj.area]?.hex ?? "#888",
        subtitulo: subtituloEntregable(ent, state),
      });
    }
    return out;
  }, [state, weekDates, viewMode, currentUser, filtro]);

  const carryOverKey = weekDates[0] ? toDateKey(weekDates[0]) : "";
  const carryOverHidden = carryOverDismissed === carryOverKey;

  function dismissCarryOver() {
    setCarryOverDismissed(carryOverKey);
    try { localStorage.setItem("laguna-carryover-dismissed", carryOverKey); }
    catch { /* noop */ }
  }

  function carryAll() {
    const monday = weekDates[0];
    if (!monday) return;
    const newSemana = toDateKey(monday);
    for (const c of carryOverCandidates) {
      // Activar la semana actual en el entregable (la cascada propaga al resultado/proyecto).
      const yaActiva = (c.ent.semanasActivas ?? []).includes(newSemana);
      if (!yaActiva) {
        dispatch({ type: "TOGGLE_ENTREGABLE_SEMANA", id: c.ent.id, semana: newSemana });
      }
    }
    dismissCarryOver();
  }

  const pendientesByProject = useMemo(() => {
    const items = state.entregables.filter((e) =>
      e.estado !== "hecho" && e.estado !== "cancelada" &&
      (e.responsable === currentUser || !e.responsable)
    ).map((e) => {
      const res = state.resultados.find((r) => r.id === e.resultadoId);
      const proj = res ? state.proyectos.find((p) => p.id === res.proyectoId) : undefined;
      return { entregable: e, proj };
    }).filter(({ proj }) => {
      if (!proj) return false;
      if ((proj.estado ?? "plan") === "completado" || (proj.estado ?? "plan") === "pausado") return false;
      return filtro === "todo" || ambitoDeArea(proj.area) === filtro;
    });

    const grouped = new Map<string, { proj: typeof items[0]["proj"]; ents: typeof items }>();
    for (const item of items) {
      const pid = item.proj?.id ?? "_none";
      if (!grouped.has(pid)) grouped.set(pid, { proj: item.proj, ents: [] });
      grouped.get(pid)!.ents.push(item);
    }
    return grouped;
  }, [state, currentUser, filtro]);

  function assignToPlan(ent: Entregable) {
    if (!pickDay) return;
    const newEstado = (ent.estado === "a_futuro" || ent.estado === "planificado") ? "en_proceso" : ent.estado;
    // Toggle del día (cascada hacia arriba activa la semana, mes y trimestre).
    const yaActivo = (ent.diasPlanificados ?? []).includes(pickDay);
    if (!yaActivo) {
      dispatch({ type: "TOGGLE_ENTREGABLE_DIA", id: ent.id, dateKey: pickDay });
    }
    if (ent.estado !== newEstado) {
      dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { estado: newEstado } });
    }
    setPickDay(null);
  }

  const totalHoursAvailable = 8;

  const [selectedBlock, setSelectedBlock] = useState<WeekBlock | null>(null);

  function handleBlockClick(block: WeekBlock) {
    if (isMentor) return;
    setSelectedBlock(block);
  }

  function handleMove(b: WeekBlock, newDate: string) {
    if (b.origen === "ent" && b.entregableId) {
      const ent = state.entregables.find((e) => e.id === b.entregableId);
      if (ent) {
        // Quitar el día anterior y activar el nuevo (cascada hacia arriba).
        const oldDay = b.dateKey;
        if (oldDay && (ent.diasPlanificados ?? []).includes(oldDay)) {
          dispatch({ type: "TOGGLE_ENTREGABLE_DIA", id: ent.id, dateKey: oldDay });
        }
        if (!(ent.diasPlanificados ?? []).includes(newDate)) {
          dispatch({ type: "TOGGLE_ENTREGABLE_DIA", id: ent.id, dateKey: newDate });
        }
        const isPastOrToday = newDate <= todayKey;
        const newEstado = isPastOrToday ? "en_proceso" : "planificado";
        if (ent.estado !== newEstado && ent.estado !== "hecho") {
          dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { estado: newEstado } });
        }
      }
    } else if (b.origen === "paso-next" && b.pasoId) {
      dispatch({ type: "RESCHEDULE_NEXT_PASO", pasoId: b.pasoId, newDate });
    }
    setSelectedBlock(null);
  }

  function handleUnschedule(b: WeekBlock) {
    if (b.origen === "ent" && b.entregableId) {
      const ent = state.entregables.find((e) => e.id === b.entregableId);
      if (ent && b.dateKey && (ent.diasPlanificados ?? []).includes(b.dateKey)) {
        dispatch({ type: "TOGGLE_ENTREGABLE_DIA", id: ent.id, dateKey: b.dateKey });
      }
      if (b.type === "done") {
        dispatch({ type: "UPDATE_ENTREGABLE", id: b.entregableId, changes: { estado: "hecho" } });
      } else if (ent && ent.estado !== "a_futuro") {
        dispatch({ type: "UPDATE_ENTREGABLE", id: b.entregableId, changes: { estado: "a_futuro" } });
      }
    } else if (b.origen === "paso-next" && b.pasoId) {
      dispatch({ type: "RESCHEDULE_NEXT_PASO", pasoId: b.pasoId, newDate: null });
    }
    setSelectedBlock(null);
  }

  function handleSetResp(b: WeekBlock, nombre: string) {
    if (b.entregableId) {
      dispatch({ type: "UPDATE_ENTREGABLE", id: b.entregableId, changes: { responsable: nombre || undefined } });
    }
  }

  function handleMarkDone(b: WeekBlock) {
    if (b.entregableId) {
      dispatch({ type: "UPDATE_ENTREGABLE", id: b.entregableId, changes: { estado: "hecho" } });
    }
    setSelectedBlock(null);
  }

  function buildBlockInfo(b: WeekBlock): WeekBlockInfo {
    return {
      id: b.id, title: b.title, subtitle: b.subtitle, area: b.area,
      responsable: b.responsable, dateKey: b.dateKey, origen: b.origen,
      entregableId: b.entregableId, pasoId: b.pasoId, proyectoId: b.proyectoId,
      tieneActivePaso: b.tieneActivePaso, weekDates, miembros: state.miembros,
    };
  }

  return (
    <div className="flex-1">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setViewMode("yo")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "yo" ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"}`}>
          Mi semana
        </button>
        <button onClick={() => setViewMode("equipo")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "equipo" ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"}`}>
          Equipo
        </button>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-accent" />
            Hechos
          </label>
          {!isMentor && <AmbitoToggle value={filtro} onChange={setFiltro} />}
        </div>
      </div>

      {/* Banner: pendientes de la semana anterior */}
      {!isMentor && !carryOverHidden && carryOverCandidates.length > 0 && (
        <div className="mb-3 rounded-xl border border-accent/30 bg-accent/10 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Pendientes de la semana anterior ({carryOverCandidates.length})
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={carryAll}
                className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90"
              >
                Llevar a esta semana
              </button>
              <button
                type="button"
                onClick={dismissCarryOver}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted hover:text-foreground"
              >
                Ignorar
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {carryOverCandidates.slice(0, 5).map(({ ent, hex, subtitulo }) => (
              <div key={`carry-${ent.id}`} className="flex items-center gap-2 rounded-md border-l-[3px] bg-background/60 px-2 py-1"
                style={{ borderLeftColor: hex }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{ent.nombre}</p>
                  <p className="truncate text-[10px]" style={{ color: hex + "c0" }}>{subtitulo}</p>
                </div>
              </div>
            ))}
            {carryOverCandidates.length > 5 && (
              <p className="pl-2 text-[10px] text-muted">y {carryOverCandidates.length - 5} más…</p>
            )}
          </div>
        </div>
      )}

      {/* Listado de entregables de la semana SIN días asignados */}
      {!isMentor && pendientesSinDias.length > 0 && (
        <div className="mb-3 rounded-xl border border-border bg-surface/30 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Entregables de la semana sin día ({pendientesSinDias.length})
          </p>
          <div className="space-y-1.5">
            {pendientesSinDias.map(({ ent, hex, subtitulo }) => (
              <div key={`pend-${ent.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border-l-[3px] bg-background px-2 py-1.5"
                style={{ borderLeftColor: hex }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{ent.nombre}</p>
                  <p className="truncate text-[10px]" style={{ color: hex + "c0" }}>{subtitulo}</p>
                </div>
                <WeekDayChips
                  weekDates={weekDates}
                  selectedKeys={ent.diasPlanificados ?? []}
                  onToggle={(k) => dispatch({ type: "TOGGLE_ENTREGABLE_DIA", id: ent.id, dateKey: k })}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
        {weekDates.map((date, i) => {
          const key = toDateKey(date);
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          const dayBlocks = blocksByDay.get(key) ?? [];
          const loadPercent = Math.min(100, (dayBlocks.length / totalHoursAvailable) * 100);

          // Agrupar por área manteniendo orden estable.
          const areaOrder: Area[] = [];
          const byArea = new Map<Area, WeekBlock[]>();
          for (const b of dayBlocks) {
            if (!byArea.has(b.area)) { byArea.set(b.area, []); areaOrder.push(b.area); }
            byArea.get(b.area)!.push(b);
          }

          return (
            <div key={key} className="flex flex-col">
              <div className={`mb-2 rounded-lg px-2 py-2 text-center ${isToday ? "bg-accent text-white" : "bg-surface"}`}>
                <div className={`text-xs font-bold ${isToday ? "text-white" : "text-foreground"}`}>{DAYS[i]}</div>
                <div className={`text-lg font-bold ${isToday ? "text-white" : "text-foreground"}`}>{date.getDate()}</div>
              </div>

              <div className="mb-2 h-1 rounded-full bg-surface">
                <div className={`h-1 rounded-full transition-all ${loadPercent > 80 ? "bg-red-500" : loadPercent > 50 ? "bg-amber-500" : "bg-green-500"}`}
                  style={{ width: `${loadPercent}%` }} />
              </div>

              <div className="flex flex-1 flex-col gap-1">
                {areaOrder.map((area) => {
                  const groupBlocks = byArea.get(area) ?? [];
                  const areaInfo = AREA_COLORS[area];
                  const areaHex = areaInfo?.hex ?? "#888";
                  const initial = areaInfo?.initial ?? "";
                  return (
                    <div key={area} className="space-y-1">
                      <div className="flex items-center gap-1 pt-0.5">
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
                          style={{ backgroundColor: areaHex }}>{initial}</span>
                        <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: areaHex }}>
                          {area}
                        </span>
                      </div>
                      {groupBlocks.map((block) => {
                  const hex = AREA_COLORS[block.area]?.hex ?? "#888";
                  const isSesion = block.type === "sesion-hecha";
                  return (
                    <button key={block.id} type="button"
                      onClick={() => handleBlockClick(block)}
                      className={`w-full rounded-lg border-l-[3px] px-2 py-1.5 text-left transition-colors hover:brightness-95 ${isSesion ? "opacity-60" : ""}`}
                      style={{ borderLeftColor: hex, backgroundColor: hex + "0c", borderLeftStyle: isSesion ? "dashed" : "solid" }}>
                      <div className="flex items-center gap-1">
                        {block.type === "active" && (
                          <span className="relative flex h-1.5 w-1.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: "#4ade80" }} />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#22c55e" }} />
                          </span>
                        )}
                        {block.type === "done" && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                        )}
                        {isSesion && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={hex} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        )}
                        <p className={`text-xs font-medium leading-tight ${block.type === "done" ? "text-muted line-through" : "text-foreground"}`}>
                          {block.title}
                        </p>
                      </div>
                      <p className="text-[10px] font-medium" style={{ color: hex + "b0" }}>
                        {isSesion ? "· trabajado aquí ·" : block.subtitle}
                      </p>
                      {viewMode === "equipo" && block.responsable && (
                        <p className="text-[10px] font-semibold text-muted">{block.responsable}</p>
                      )}
                    </button>
                  );
                      })}
                    </div>
                  );
                })}
                {(sopsByDay.get(key) ?? []).map((sop) => {
                  const sopHex = AREA_COLORS[sop.area]?.hex ?? "#888";
                  return (
                    <button key={`sop-${sop.plantillaId}`} type="button"
                      onClick={() => !isPast && !isMentor && setConfirmSOP({ sop, dateKey: key })}
                      disabled={isPast}
                      className="w-full rounded-lg border border-dashed px-2 py-1.5 text-left transition-all hover:brightness-95"
                      style={{ borderColor: sopHex + "50", backgroundColor: sopHex + "10" }}>
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: sopHex }} />
                        <p className="text-xs font-medium leading-tight truncate" style={{ color: sopHex }}>{sop.nombre}</p>
                      </div>
                      <p className="text-[10px]" style={{ color: sopHex + "90" }}>{sop.pasosTotal}p · SOP · {sop.responsable}</p>
                    </button>
                  );
                })}
                {dayBlocks.length === 0 && (
                  <button
                    onClick={() => !isPast && !isMentor && setPickDay(key)}
                    disabled={isPast || isMentor}
                    className={`flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-4 transition-colors ${!isPast ? "cursor-pointer hover:border-accent/50 hover:bg-surface/50" : ""}`}>
                    <span className="text-xs text-muted/50">{isPast ? "—" : "+"}</span>
                  </button>
                )}
                {dayBlocks.length > 0 && !isPast && !isMentor && (
                  <button onClick={() => setPickDay(key)}
                    className="mt-1 flex items-center justify-center rounded-lg py-1.5 text-xs text-muted/40 transition-colors hover:bg-surface/50 hover:text-muted">
                    +
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Picker modal */}
      {pickDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
          role="dialog" aria-modal="true" tabIndex={-1}
          onClick={(e) => { if (e.target === e.currentTarget) setPickDay(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") setPickDay(null); }}>
          <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Planificar para {new Date(pickDay + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</h3>
            <p className="mb-4 text-xs text-muted">Elige un entregable pendiente (solo proyectos activos):</p>
            <div className="max-h-72 space-y-3 overflow-y-auto">
              {pendientesByProject.size === 0 && <p className="py-4 text-center text-xs text-muted">No hay entregables pendientes</p>}
              {Array.from(pendientesByProject.entries()).map(([pid, { proj, ents }]) => (
                <div key={pid}>
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: AREA_COLORS[proj?.area ?? "operativa"]?.hex ?? "#888" }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: AREA_COLORS[proj?.area ?? "operativa"]?.hex ?? "#888" }} />
                    {proj?.nombre ?? "Sin proyecto"}
                  </p>
                  <div className="space-y-0.5">
                    {ents.map(({ entregable }) => (
                      <button key={entregable.id} onClick={() => assignToPlan(entregable)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                        <p className="truncate text-sm text-foreground">{entregable.nombre}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setPickDay(null)} className="mt-3 w-full rounded-lg border border-border py-2 text-xs font-medium text-muted hover:bg-surface">Cancelar</button>
          </div>
        </div>
      )}

      {confirmSOP && (
        <SOPLaunchDialog
          plantillaId={confirmSOP.sop.plantillaId}
          plantillaNombre={confirmSOP.sop.nombre}
          area={confirmSOP.sop.area}
          responsable={confirmSOP.sop.responsable}
          dateKey={confirmSOP.dateKey}
          onClose={() => setConfirmSOP(null)}
        />
      )}

      {selectedBlock && (
        <WeekBlockSheet
          block={buildBlockInfo(selectedBlock)}
          onClose={() => setSelectedBlock(null)}
          onMove={(d) => handleMove(selectedBlock, d)}
          onUnschedule={() => handleUnschedule(selectedBlock)}
          onSetResponsable={(n) => handleSetResp(selectedBlock, n)}
          onMarkDone={() => handleMarkDone(selectedBlock)}
          onOpenProject={() => {
            if (selectedBlock.proyectoId && onOpenInMapa) onOpenInMapa(selectedBlock.proyectoId);
            setSelectedBlock(null);
          }}
        />
      )}
    </div>
  );
}

