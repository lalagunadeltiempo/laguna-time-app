"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { generateId } from "@/lib/store";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import {
  ambitoDeArea,
  AREA_COLORS,
  AREAS_EMPRESA,
  AREAS_PERSONAL,
  type Area,
  type Entregable,
  type Resultado,
  type Proyecto,
  type Objetivo,
} from "@/lib/types";
import { AmbitoToggle, ResponsableToggle, matchesResponsable, type AmbitoFilter, type ResponsableFilter } from "./PlanMes";
import { mesKey, etiquetaMesCorta, mesesDeTrimestre, primerLunesDeMes } from "@/lib/semana-utils";
import { InlineNombre, ResponsableSelect } from "./InlineEditors";
import type { MiembroInfo } from "@/lib/types";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const AREA_ORDER: Area[] = [
  ...AREAS_EMPRESA.map((a) => a.id),
  ...AREAS_PERSONAL.map((a) => a.id),
] as Area[];

const AREA_LABELS: Record<Area, string> = {
  ...Object.fromEntries(AREAS_EMPRESA.map((a) => [a.id, a.label])),
  ...Object.fromEntries(AREAS_PERSONAL.map((a) => [a.id, a.label])),
} as Record<Area, string>;

function groupProjectsByArea(nodes: ProjNode[]): { area: Area; label: string; items: ProjNode[] }[] {
  const byArea = new Map<Area, ProjNode[]>();
  for (const n of nodes) {
    const a = n.proyecto.area as Area;
    if (!byArea.has(a)) byArea.set(a, []);
    byArea.get(a)!.push(n);
  }
  return AREA_ORDER
    .filter((a) => byArea.has(a))
    .map((a) => ({ area: a, label: AREA_LABELS[a] ?? a, items: byArea.get(a)! }));
}

function quarterLabel(q: number, y: number) { return `Q${q + 1} ${y}`; }
function quarterMonths(q: number) { return [q * 3, q * 3 + 1, q * 3 + 2]; }
function periodoQ(q: number, y: number) { return `${y}-Q${q + 1}`; }

interface ProjNode {
  proyecto: Proyecto;
  resultados: Resultado[];
  entregables: Entregable[];
  done: number;
  total: number;
  percent: number;
  hex: string;
}

interface Props { selectedDate: Date }

export function PlanTrimestre({ selectedDate }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const { nombre: currentUser } = useUsuario();
  const [filtro, setFiltro] = useState<AmbitoFilter>("empresa");
  const [respFilter, setRespFilter] = useState<ResponsableFilter>("todo");
  const [showDone, setShowDone] = useState(true);
  const [newObjText, setNewObjText] = useState("");
  const [newObjArea, setNewObjArea] = useState<Area | "">("");

  const year = selectedDate.getFullYear();
  const currentQ = Math.floor(selectedDate.getMonth() / 3);
  const qMonths = useMemo(() => quarterMonths(currentQ), [currentQ]);
  const qPeriodo = periodoQ(currentQ, year);
  const qMonthKeys = useMemo(() => mesesDeTrimestre(qPeriodo), [qPeriodo]);

  /**
   * Un proyecto aparece en el mes `m` si `m ∈ proyecto.mesesActivos`.
   * (Al marcar trimestre, el reducer ya añade los 3 meses y la migración v17
   * sincroniza retroactivamente.)
   */
  function proyectoEnMes(p: Proyecto, mes: string): boolean {
    return (p.mesesActivos ?? []).includes(mes);
  }

  function buildProjNode(p: Proyecto): ProjNode {
    const hex = AREA_COLORS[p.area]?.hex ?? "#888";
    const trimestreSet = new Set(qMonthKeys);
    const allResultados = state.resultados.filter((r) => r.proyectoId === p.id);
    const resIds = new Set(allResultados.map((r) => r.id));
    const allEntregables = state.entregables.filter((e) => resIds.has(e.resultadoId));

    // Entregables del trimestre: tienen semana cuyo mes ∈ trimestre, O son hijos de un
    // resultado cuyo mesesActivos intersecta el trimestre.
    const resultadosEnTrim = new Set(
      allResultados
        .filter((r) => (r.mesesActivos ?? []).some((m) => trimestreSet.has(m)))
        .map((r) => r.id),
    );
    const entregables = allEntregables.filter((e) => {
      const m = e.semana ? mesKey(e.semana) : null;
      if (m && trimestreSet.has(m)) return true;
      // Si no tiene mes propio pero su resultado está en el trimestre, cuenta.
      if (!m && resultadosEnTrim.has(e.resultadoId)) return true;
      return false;
    });
    const entIds = new Set(entregables.map((e) => e.id));

    // Resultados visibles: en el trimestre o con al menos un entregable del trimestre.
    const resultados = allResultados.filter(
      (r) =>
        resultadosEnTrim.has(r.id) ||
        entregables.some((e) => e.resultadoId === r.id) ||
        // Mantén también los resultados que tengan algún entregable visible (defensivo).
        allEntregables.some((e) => e.resultadoId === r.id && entIds.has(e.id)),
    );

    const done = entregables.filter((e) => e.estado === "hecho").length;
    const total = entregables.length;
    return {
      proyecto: p,
      resultados,
      entregables,
      done,
      total,
      percent: total ? Math.round((done / total) * 100) : 0,
      hex,
    };
  }

  const { monthProjects, backlogProjects } = useMemo(() => {
    const byMonth = new Map<number, ProjNode[]>();
    for (const m of qMonths) byMonth.set(m, []);
    const backlog: ProjNode[] = [];

    for (const p of state.proyectos) {
      if (p.estado === "completado" || p.estado === "pausado") continue;
      if (filtro !== "todo" && ambitoDeArea(p.area) !== filtro) continue;

      const node = buildProjNode(p);
      const resultadosVisibles = respFilter === "todo"
        ? node.resultados
        : node.resultados.filter((r) => matchesResponsable(r.responsable, respFilter, currentUser));
      if (!showDone && node.total > 0 && node.done === node.total) continue;
      if (resultadosVisibles.length === 0 && node.total > 0) continue;

      let placedAny = false;
      for (let i = 0; i < qMonths.length; i++) {
        const m = qMonths[i];
        const mesK = qMonthKeys[i];
        if (proyectoEnMes(p, mesK)) {
          byMonth.get(m)!.push(node);
          placedAny = true;
        }
      }

      if (!placedAny && (p.trimestresActivos ?? []).includes(qPeriodo)) {
        backlog.push(node);
      }
    }

    return { monthProjects: byMonth, backlogProjects: backlog };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, filtro, respFilter, currentUser, showDone, qMonths, qMonthKeys, qPeriodo, year]);

  const objetivos = useMemo(() => {
    return (state.objetivos ?? []).filter(
      (o) => o.nivel === "trimestre" && o.periodo === qPeriodo,
    );
  }, [state.objetivos, qPeriodo]);

  const allAreas = [...AREAS_EMPRESA, ...AREAS_PERSONAL].filter((a) => filtro === "todo" || ambitoDeArea(a.id) === filtro);

  function addObjetivo() {
    if (!newObjText.trim()) return;
    dispatch({
      type: "ADD_OBJETIVO",
      payload: {
        id: generateId(),
        texto: newObjText.trim(),
        nivel: "trimestre",
        periodo: qPeriodo,
        area: newObjArea || undefined,
        completado: false,
        creado: new Date().toISOString(),
      },
    });
    setNewObjText("");
    setNewObjArea("");
  }

  return (
    <div className="flex-1 space-y-6 overflow-x-auto">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{quarterLabel(currentQ, year)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-accent" />
            Hechos
          </label>
          {!isMentor && <ResponsableToggle value={respFilter} onChange={setRespFilter} miembros={state.miembros} />}
          {!isMentor && <AmbitoToggle value={filtro} onChange={setFiltro} />}
        </div>
      </div>

      {/* Objetivos */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Objetivos {quarterLabel(currentQ, year)}</h3>
        <div className="space-y-1">
          {objetivos.map((obj) => (
            <ObjetivoRow key={obj.id} obj={obj} isMentor={isMentor} />
          ))}
        </div>
        {!isMentor && (
          <div className="mt-2 flex gap-2">
            <input value={newObjText} onChange={(e) => setNewObjText(e.target.value)}
              placeholder="Nuevo objetivo..."
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && addObjetivo()} />
            <select value={newObjArea} onChange={(e) => setNewObjArea(e.target.value as Area | "")}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground">
              <option value="">Sin área</option>
              {allAreas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <button onClick={addObjetivo} className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/80">+</button>
          </div>
        )}
      </section>

      {/* Roadmap por mes */}
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Roadmap</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {qMonths.map((m, idx) => {
            const projects = monthProjects.get(m) ?? [];
            const mesK = qMonthKeys[idx];
            return (
              <MonthColumn key={m} month={m} year={year} mesKey={mesK} projects={projects}
                qMonthKeys={qMonthKeys} isMentor={isMentor} />
            );
          })}
        </div>
      </section>

      {/* Backlog */}
      {backlogProjects.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
            Sin asignar a mes
            <span className="ml-2 text-[10px] font-normal text-muted">
              ({backlogProjects.length} proyecto{backlogProjects.length !== 1 ? "s" : ""} con trimestre marcado pero sin mes)
            </span>
          </h3>
          <div className="space-y-2">
            {backlogProjects.map((pn) => (
              <ProjectCard key={pn.proyecto.id} node={pn} qMonthKeys={qMonthKeys}
                currentMesKey={null} isMentor={isMentor} backlogStyle />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ================================================================
   MonthColumn
   ================================================================ */

function MonthColumn({ month, year, mesKey: mesK, projects, qMonthKeys, isMentor }: {
  month: number; year: number; mesKey: string;
  projects: ProjNode[]; qMonthKeys: string[];
  isMentor: boolean;
}) {
  const now = new Date();
  const isCurrent = now.getFullYear() === year && now.getMonth() === month;
  const count = projects.length;

  return (
    <div className={`rounded-xl border p-3 ${isCurrent ? "border-accent/40 bg-accent/5" : "border-border bg-background"}`}>
      <div className="mb-2 flex items-center justify-center gap-2">
        <h4 className={`text-center text-xs font-bold uppercase ${isCurrent ? "text-accent" : "text-muted"}`}>{MONTHS_ES[month]}</h4>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">{count}</span>
      </div>

      {projects.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">—</p>
      ) : (
        <div className="space-y-3">
          {groupProjectsByArea(projects).map(({ area, label, items }) => (
            <div key={area}>
              <div className="mb-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: AREA_COLORS[area]?.hex ?? "#888" }} />
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted">{label}</span>
              </div>
              <div className="space-y-1.5">
                {items.map((pn) => (
                  <ProjectCard key={pn.proyecto.id} node={pn} qMonthKeys={qMonthKeys}
                    currentMesKey={mesK} isMentor={isMentor} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   ProjectCard: proyecto con chips de meses + resultados
   ================================================================ */

function ProjectCard({ node, qMonthKeys, currentMesKey, isMentor, backlogStyle }: {
  node: ProjNode; qMonthKeys: string[]; currentMesKey: string | null;
  isMentor: boolean; backlogStyle?: boolean;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const [open, setOpen] = useState(false);
  const [newResName, setNewResName] = useState("");
  const [adding, setAdding] = useState(false);

  const mesesProj = node.proyecto.mesesActivos ?? [];

  function toggleMes(mes: string) {
    dispatch({ type: "TOGGLE_PROYECTO_MES", id: node.proyecto.id, mes });
  }

  function addResultado() {
    const nombre = newResName.trim();
    if (!nombre) return;
    const id = generateId();
    const mesesNuevoRes = currentMesKey ? [currentMesKey] : [];
    dispatch({
      type: "ADD_RESULTADO",
      payload: {
        id,
        nombre,
        descripcion: null,
        proyectoId: node.proyecto.id,
        creado: new Date().toISOString(),
        semana: null,
        fechaLimite: null,
        fechaInicio: null,
        diasEstimados: null,
        responsable: currentUser,
        mesesActivos: mesesNuevoRes,
      },
    });
    setNewResName("");
    setAdding(false);
  }

  return (
    <div className={backlogStyle
      ? "rounded-xl border border-dashed border-border bg-surface/20"
      : "rounded-lg border-2 bg-background"
    } style={backlogStyle ? undefined : { borderColor: node.hex + "50" }}>
      <div className="flex w-full items-center gap-1.5 p-2">
        <button onClick={() => setOpen(!open)} className="flex shrink-0 items-center gap-1.5" title={open ? "Contraer" : "Expandir"}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: node.hex }} />
        </button>
        <div className="min-w-0 flex-1">
          <InlineNombre
            value={node.proyecto.nombre}
            onSave={(nombre) => dispatch({ type: "UPDATE_PROYECTO", id: node.proyecto.id, changes: { nombre } })}
            disabled={isMentor}
            className="truncate text-xs font-semibold text-foreground"
            inputClassName="text-xs font-semibold text-foreground"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full transition-all" style={{ width: `${node.percent}%`, backgroundColor: node.hex }} />
          </div>
          <span className="text-[9px] font-bold text-muted">{node.done}/{node.total}</span>
        </div>
      </div>

      {open && (
        <div className="space-y-2 px-2 pb-2">
          {/* Chips meses del proyecto */}
          {!isMentor && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[9px] uppercase tracking-wider text-muted">Meses:</span>
              {qMonthKeys.map((mk) => {
                const active = mesesProj.includes(mk);
                return (
                  <button
                    key={mk}
                    onClick={() => toggleMes(mk)}
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                      active
                        ? "bg-accent text-white"
                        : "border border-border text-muted hover:border-accent hover:text-accent"
                    }`}
                  >
                    {etiquetaMesCorta(mk)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Resultados */}
          {node.resultados.length === 0 ? (
            <p className="pl-2 text-[10px] italic text-muted/70">Sin resultados</p>
          ) : (
            <div className="space-y-1">
              {node.resultados.map((r) => (
                <ResultadoRow key={r.id} resultado={r} entregables={node.entregables.filter((e) => e.resultadoId === r.id)}
                  qMonthKeys={qMonthKeys} isMentor={isMentor} hex={node.hex} miembros={state.miembros} />
              ))}
            </div>
          )}

          {!isMentor && (
            adding ? (
              <div className="flex items-center gap-1">
                <input
                  value={newResName}
                  onChange={(e) => setNewResName(e.target.value)}
                  placeholder="Nombre del resultado..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addResultado(); }
                    if (e.key === "Escape") { setNewResName(""); setAdding(false); }
                  }}
                  className="flex-1 rounded border border-accent/40 bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-accent"
                />
                <button onClick={addResultado} disabled={!newResName.trim()}
                  className="rounded bg-accent px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40">+</button>
                <button onClick={() => { setAdding(false); setNewResName(""); }}
                  className="rounded border border-border px-2 py-1 text-[10px] text-muted">✕</button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)}
                className="w-full rounded border border-dashed border-border py-1 text-[10px] font-medium text-muted hover:border-accent hover:text-accent">
                + Añadir resultado
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   ResultadoRow: nombre + chips ABR/MAY/JUN + entregables informativos
   ================================================================ */

function ResultadoRow({ resultado, entregables, qMonthKeys, isMentor, hex, miembros }: {
  resultado: Resultado; entregables: Entregable[]; qMonthKeys: string[]; isMentor: boolean; hex: string;
  miembros: MiembroInfo[];
}) {
  const dispatch = useAppDispatch();
  const mesesRes = resultado.mesesActivos ?? [];

  function toggleMes(mes: string) {
    dispatch({ type: "TOGGLE_RESULTADO_MES", id: resultado.id, mes });
  }

  return (
    <div className="rounded border border-border/60 bg-surface/40 p-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
        <div className="min-w-0 flex-1">
          <InlineNombre
            value={resultado.nombre}
            onSave={(nombre) => dispatch({ type: "UPDATE_RESULTADO", id: resultado.id, changes: { nombre } })}
            disabled={isMentor}
            className="truncate text-[11px] font-semibold text-foreground"
            inputClassName="text-[11px] font-semibold text-foreground"
          />
        </div>
        {!isMentor && (
          <ResponsableSelect
            value={resultado.responsable}
            miembros={miembros}
            onChange={(v) => dispatch({ type: "UPDATE_RESULTADO", id: resultado.id, changes: { responsable: v || undefined } })}
          />
        )}
        {!isMentor && (
          <div className="flex items-center gap-0.5">
            {qMonthKeys.map((mk) => {
              const active = mesesRes.includes(mk);
              return (
                <button
                  key={mk}
                  onClick={() => toggleMes(mk)}
                  className={`rounded px-1 py-0.5 text-[9px] font-semibold transition-colors ${
                    active ? "bg-accent text-white" : "border border-border text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {etiquetaMesCorta(mk)}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {entregables.length > 0 && (
        <div className="mt-1 space-y-0.5 pl-3">
          {entregables.map((ent) => (
            <EntregableRowTrimestre key={ent.id} ent={ent} qMonthKeys={qMonthKeys} isMentor={isMentor} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   EntregableRowTrimestre: nombre editable + chips de mes (single-toggle)
   ================================================================ */

function EntregableRowTrimestre({ ent, qMonthKeys, isMentor }: {
  ent: Entregable; qMonthKeys: string[]; isMentor: boolean;
}) {
  const dispatch = useAppDispatch();
  const mesEnt = ent.semana ? mesKey(ent.semana) : null;

  function toggleMes(mes: string) {
    if (mesEnt === mes) {
      // Deseleccionar el mes actual → entregable sin semana asignada
      dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { semana: null } });
    } else {
      const nuevoLunes = primerLunesDeMes(mes);
      if (nuevoLunes) {
        dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { semana: nuevoLunes } });
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 text-[10px]">
      <span className={`h-1 w-1 shrink-0 rounded-full ${
        ent.estado === "hecho" ? "bg-emerald-500"
        : ent.estado === "en_proceso" ? "bg-amber-500"
        : "bg-gray-300"
      }`} />
      <div className="min-w-0 flex-1">
        <InlineNombre
          value={ent.nombre}
          onSave={(nombre) => dispatch({ type: "UPDATE_ENTREGABLE", id: ent.id, changes: { nombre } })}
          disabled={isMentor}
          className={`truncate text-[10px] ${ent.estado === "hecho" ? "text-muted line-through" : "text-muted"}`}
          inputClassName="text-[10px] text-foreground"
        />
      </div>
      {!isMentor ? (
        <div className="flex shrink-0 items-center gap-0.5">
          {qMonthKeys.map((mk) => {
            const active = mesEnt === mk;
            return (
              <button
                key={mk}
                onClick={() => toggleMes(mk)}
                title={`Asignar a ${etiquetaMesCorta(mk)}${active ? " (clic para quitar)" : ""}`}
                className={`rounded px-1 py-0.5 text-[8px] font-semibold transition-colors ${
                  active ? "bg-accent text-white" : "border border-border text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {etiquetaMesCorta(mk)}
              </button>
            );
          })}
        </div>
      ) : (
        ent.semana && (
          <span className="shrink-0 rounded bg-background px-1 py-0.5 text-[8px] text-muted">
            {mesEnt ? etiquetaMesCorta(mesEnt) : ""}
          </span>
        )
      )}
    </div>
  );
}

/* ================================================================
   ObjetivoRow
   ================================================================ */

function ObjetivoRow({ obj, isMentor }: { obj: Objetivo; isMentor: boolean }) {
  const dispatch = useAppDispatch();
  const hex = obj.area ? (AREA_COLORS[obj.area]?.hex ?? "#888") : "#888";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-1.5">
      {!isMentor && (
        <input type="checkbox" checked={obj.completado}
          onChange={() => dispatch({ type: "UPDATE_OBJETIVO", id: obj.id, changes: { completado: !obj.completado } })}
          className="h-4 w-4 shrink-0 rounded accent-accent" />
      )}
      {obj.area && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />}
      <span className={`flex-1 text-sm ${obj.completado ? "text-muted line-through" : "text-foreground"}`}>{obj.texto}</span>
      {!isMentor && (
        <button onClick={() => dispatch({ type: "DELETE_OBJETIVO", id: obj.id })}
          className="text-xs text-muted hover:text-red-500">✕</button>
      )}
    </div>
  );
}
