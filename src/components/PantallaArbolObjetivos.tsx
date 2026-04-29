"use client";

import { useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { useIsMentor } from "@/lib/usuario";
import { generateId } from "@/lib/store";
import {
  AREA_COLORS,
  AREAS_EMPRESA,
  AREAS_PERSONAL,
  ambitoDeArea,
  type Area,
  type Objetivo,
} from "@/lib/types";
import { AmbitoToggle, type AmbitoFilter } from "@/components/plan/PlanMes";
import { ObjetivoRealidadBlock } from "@/components/plan/ObjetivoRealidad";
import { monthKeysOfQuarter, objetivosPorAreaAnio, orphansOf, qPeriodoFromMonth } from "@/lib/objetivos-tree";
import { EMPRESA_ORDER, PERSONAL_ORDER } from "@/components/mapa/MapaBlocks";
import { EditableText } from "@/components/shared/EditableText";

const AREA_LABELS: Record<Area, string> = {
  ...Object.fromEntries(AREAS_EMPRESA.map((a) => [a.id, a.label])),
  ...Object.fromEntries(AREAS_PERSONAL.map((a) => [a.id, a.label])),
} as Record<Area, string>;

const MONTH_LABELS: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr", "05": "May", "06": "Jun",
  "07": "Jul", "08": "Ago", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

function monthLabel(monthKey: string): string {
  const mm = monthKey.slice(5, 7);
  return `${MONTH_LABELS[mm] ?? mm} ${monthKey.slice(0, 4)}`;
}

function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={`shrink-0 transition-transform ${open ? "rotate-90" : ""} ${className ?? "text-muted"}`}
      aria-hidden
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function AmbitoTituloEditable({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-8">
      <EditableText value={value} onChange={onChange} tag="h1" className="text-3xl font-bold tracking-tight text-foreground" />
    </div>
  );
}

export function PantallaArbolObjetivos() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const [filtro, setFiltro] = useState<AmbitoFilter>("empresa");
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const empresaAreas = useMemo(() => {
    if (filtro === "personal") return [];
    return EMPRESA_ORDER.filter((a) => filtro === "todo" || ambitoDeArea(a) === "empresa");
  }, [filtro]);

  const personalAreas = useMemo(() => {
    if (filtro === "empresa" || isMentor) return [];
    return PERSONAL_ORDER.filter((a) => filtro === "todo" || ambitoDeArea(a) === "personal");
  }, [filtro, isMentor]);

  const objetivosYear = useMemo(() => {
    const y = String(year);
    const yPrefix = `${year}-`;
    return (state.objetivos ?? []).filter((o) => o.periodo === y || o.periodo.startsWith(yPrefix));
  }, [state.objetivos, year]);

  return (
    <div className="w-full px-3 py-8 sm:px-6 md:px-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Árbol de objetivos</h1>
          <p className="mt-1 text-sm text-muted">Despliega por área y nivel: anual → trimestre → mes (como en Mapa)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm text-muted hover:bg-surface"
            title="Año anterior"
          >
            ◀
          </button>
          <span className="w-16 text-center text-lg font-semibold text-foreground">{year}</span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm text-muted hover:bg-surface"
            title="Año siguiente"
          >
            ▶
          </button>
          {!isMentor && <AmbitoToggle value={filtro} onChange={setFiltro} />}
        </div>
      </div>

      {filtro === "todo" && empresaAreas.length > 0 && (
        <>
          {isMentor ? (
            <h2 className="mb-8 text-3xl font-bold tracking-tight text-foreground">{state.ambitoLabels.empresa}</h2>
          ) : (
            <AmbitoTituloEditable
              value={state.ambitoLabels.empresa}
              onChange={(v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { empresa: v } })}
            />
          )}
        </>
      )}

      {empresaAreas.map((area) => (
        <AreaTreeSection
          key={area}
          area={area}
          year={year}
          objetivosYear={objetivosYear}
          isMentor={isMentor}
          onAdd={(payload) => dispatch({ type: "ADD_OBJETIVO", payload })}
          onUpdate={(id, changes) => dispatch({ type: "UPDATE_OBJETIVO", id, changes })}
          onDelete={(id) => dispatch({ type: "DELETE_OBJETIVO", id })}
        />
      ))}

      {filtro === "todo" && personalAreas.length > 0 && (
        <>
          <div className="my-12 border-t border-border" />
          {isMentor ? (
            <h2 className="mb-8 text-3xl font-bold tracking-tight text-foreground">{state.ambitoLabels.personal}</h2>
          ) : (
            <AmbitoTituloEditable
              value={state.ambitoLabels.personal}
              onChange={(v) => dispatch({ type: "SET_AMBITO_LABELS", labels: { personal: v } })}
            />
          )}
        </>
      )}

      {personalAreas.map((area) => (
        <AreaTreeSection
          key={area}
          area={area}
          year={year}
          objetivosYear={objetivosYear}
          isMentor={isMentor}
          onAdd={(payload) => dispatch({ type: "ADD_OBJETIVO", payload })}
          onUpdate={(id, changes) => dispatch({ type: "UPDATE_OBJETIVO", id, changes })}
          onDelete={(id) => dispatch({ type: "DELETE_OBJETIVO", id })}
        />
      ))}
    </div>
  );
}

function AreaTreeSection({
  area,
  year,
  objetivosYear,
  isMentor,
  onAdd,
  onUpdate,
  onDelete,
}: {
  area: Area;
  year: number;
  objetivosYear: Objetivo[];
  isMentor: boolean;
  onAdd: (payload: Objetivo) => void;
  onUpdate: (
    id: string,
    changes: Partial<Pick<Objetivo, "texto" | "completado" | "area" | "parentId" | "realidadEstado" | "realidadPorQue">>,
  ) => void;
  onDelete: (id: string) => void;
}) {
  const c = AREA_COLORS[area];
  const hex = c?.hex ?? "#888";
  const { anuales, trimestrales, mensuales } = objetivosPorAreaAnio(objetivosYear, area, year);
  const anualIds = new Set(anuales.map((o) => o.id));
  const triIds = new Set(trimestrales.map((o) => o.id));
  const trimestralesOrphan = orphansOf(trimestrales, "trimestre", anualIds);
  const mensualesOrphan = orphansOf(mensuales, "mes", triIds);

  const [openArea, setOpenArea] = useState(false);
  const [openHuérfanos, setOpenHuérfanos] = useState(false);

  function addObjetivo(nivel: Objetivo["nivel"], periodo: string, parentId?: string) {
    onAdd({
      id: generateId(),
      texto: "",
      nivel,
      periodo,
      area,
      parentId: parentId || undefined,
      completado: false,
      creado: new Date().toISOString(),
    });
  }

  function createAnualAndAssign(orphanTri: Objetivo) {
    const texto = window.prompt("Nombre del objetivo anual padre")?.trim();
    if (!texto) return;
    const anualId = generateId();
    onAdd({
      id: anualId,
      texto,
      nivel: "anio",
      periodo: String(year),
      area,
      completado: false,
      creado: new Date().toISOString(),
    });
    onUpdate(orphanTri.id, { parentId: anualId });
  }

  function createTrimestreAndAssign(orphanMes: Objetivo) {
    const texto = window.prompt("Nombre del objetivo trimestral padre")?.trim();
    if (!texto) return;
    const triId = generateId();
    onAdd({
      id: triId,
      texto,
      nivel: "trimestre",
      periodo: qPeriodoFromMonth(orphanMes.periodo),
      area,
      completado: false,
      creado: new Date().toISOString(),
    });
    onUpdate(orphanMes.id, { parentId: triId });
  }

  const nHuérfanos = trimestralesOrphan.length + mensualesOrphan.length;

  return (
    <section id={`arbol-area-${area}`} className="mb-6 scroll-mt-20">
      <button
        type="button"
        onClick={() => setOpenArea(!openArea)}
        className="mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-surface"
      >
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white ${c?.dot ?? "bg-zinc-500"}`}>
          {c?.initial ?? "?"}
        </span>
        <h2 className={`text-xl font-bold uppercase tracking-wide ${c?.text ?? "text-foreground"}`}>{AREA_LABELS[area]}</h2>
        <span className="text-xs font-normal text-muted">({anuales.length})</span>
        <Chevron open={openArea} className="ml-auto" />
      </button>

      {openArea && (
        <div
          className="ml-1 border-l-[3px] pl-2 sm:ml-3 sm:pl-3 md:ml-6 md:pl-6"
          style={{ borderColor: hex }}
        >
          <div className="mb-6 space-y-2">
            {anuales.length > 0 ? (
              anuales.map((anual) => (
                <AnualObjetivoBlock
                  key={anual.id}
                  anual={anual}
                  year={year}
                  trimestrales={trimestrales}
                  mensuales={mensuales}
                  area={area}
                  isMentor={isMentor}
                  onAdd={addObjetivo}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))
            ) : (
              <p className="py-3 text-base italic text-muted">Sin objetivos anuales</p>
            )}

            {!isMentor && (
              <button
                type="button"
                onClick={() => addObjetivo("anio", String(year))}
                className="flex w-full items-center justify-center rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
              >
                + Objetivo anual
              </button>
            )}
          </div>

          {nHuérfanos > 0 && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20">
              <button
                type="button"
                onClick={() => setOpenHuérfanos(!openHuérfanos)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
                  Sin conectar
                </span>
                <span className="text-xs text-amber-700 dark:text-amber-300">({nHuérfanos})</span>
                <Chevron open={openHuérfanos} className="ml-auto text-amber-700/80" />
              </button>
              {openHuérfanos && (
                <div className="space-y-2 border-t border-amber-300/50 px-3 pb-3 pt-2">
                  {trimestralesOrphan.map((t) => (
                    <div key={t.id} className="rounded border border-amber-300/60 bg-background p-2">
                      <EditableGoalRow obj={t} isMentor={isMentor} onUpdate={onUpdate} onDelete={onDelete} compact />
                      {!isMentor && (
                        <div className="mt-1 flex items-center gap-1">
                          <select
                            value={t.parentId ?? ""}
                            onChange={(e) => onUpdate(t.id, { parentId: e.target.value || undefined })}
                            className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                          >
                            <option value="">Sin anual padre</option>
                            {anuales.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.texto || "(sin texto)"}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => createAnualAndAssign(t)}
                            className="rounded border border-border px-1 py-0.5 text-[10px] text-muted hover:text-foreground"
                            title="Crear anual y conectar"
                          >
                            + anual
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {mensualesOrphan.map((m) => {
                    const qPeriodo = qPeriodoFromMonth(m.periodo);
                    const trimestresMismoQ = trimestrales.filter((t) => t.periodo === qPeriodo);
                    return (
                      <div key={m.id} className="rounded border border-amber-300/60 bg-background p-2">
                        <EditableGoalRow obj={m} isMentor={isMentor} onUpdate={onUpdate} onDelete={onDelete} compact />
                        {!isMentor && (
                          <div className="mt-1 flex items-center gap-1">
                            <select
                              value={m.parentId ?? ""}
                              onChange={(e) => onUpdate(m.id, { parentId: e.target.value || undefined })}
                              className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                            >
                              <option value="">Sin trimestral padre</option>
                              {trimestresMismoQ.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.texto || "(sin texto)"}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => createTrimestreAndAssign(m)}
                              className="rounded border border-border px-1 py-0.5 text-[10px] text-muted hover:text-foreground"
                              title="Crear trimestral y conectar"
                            >
                              + tri
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function AnualObjetivoBlock({
  anual,
  year,
  trimestrales,
  mensuales,
  area,
  isMentor,
  onAdd,
  onUpdate,
  onDelete,
}: {
  anual: Objetivo;
  year: number;
  trimestrales: Objetivo[];
  mensuales: Objetivo[];
  area: Area;
  isMentor: boolean;
  onAdd: (nivel: Objetivo["nivel"], periodo: string, parentId?: string) => void;
  onUpdate: (
    id: string,
    changes: Partial<Pick<Objetivo, "texto" | "completado" | "area" | "parentId" | "realidadEstado" | "realidadPorQue">>,
  ) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hex = AREA_COLORS[area]?.hex ?? "#888";

  const qCounts = [1, 2, 3, 4].map((q) => {
    const qPeriodo = `${year}-Q${q}`;
    const n = trimestrales.filter((t) => t.periodo === qPeriodo && t.parentId === anual.id).length;
    return { q, qPeriodo, n };
  });
  const totalTri = qCounts.reduce((s, x) => s + x.n, 0);

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex min-h-[48px] items-center gap-2 border-b border-border/60 px-2 py-2 sm:px-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-foreground"
          aria-expanded={open}
          title={open ? "Contraer" : "Expandir"}
        >
          <Chevron open={open} />
        </button>
        <div className="min-w-0 flex flex-1 flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <EditableGoalRow
            obj={anual}
            isMentor={isMentor}
            onUpdate={onUpdate}
            onDelete={onDelete}
            showRealidad={open}
          />
        </div>
        {!open && (
          <span className="hidden shrink-0 text-[10px] text-muted sm:inline">{totalTri} trim.</span>
        )}
      </div>

      {open && (
        <div className="space-y-2 px-2 pb-4 pt-1 sm:px-4 sm:pl-6 md:pl-10">
          {[1, 2, 3, 4].map((q) => {
            const qPeriodo = `${year}-Q${q}`;
            const triRows = trimestrales.filter((t) => t.periodo === qPeriodo && t.parentId === anual.id);
            return (
              <QuarterObjetivoBlock
                key={qPeriodo}
                q={q}
                qPeriodo={qPeriodo}
                anualId={anual.id}
                triRows={triRows}
                mensuales={mensuales}
                areaHex={hex}
                isMentor={isMentor}
                onAddTrim={(periodo, parentId) => onAdd("trimestre", periodo, parentId)}
                onAddMes={(periodo, parentId) => onAdd("mes", periodo, parentId)}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuarterObjetivoBlock({
  q,
  qPeriodo,
  anualId,
  triRows,
  mensuales,
  areaHex,
  isMentor,
  onAddTrim,
  onAddMes,
  onUpdate,
  onDelete,
}: {
  q: number;
  qPeriodo: string;
  anualId: string;
  triRows: Objetivo[];
  mensuales: Objetivo[];
  areaHex: string;
  isMentor: boolean;
  onAddTrim: (periodo: string, parentId: string) => void;
  onAddMes: (periodo: string, parentId: string) => void;
  onUpdate: (
    id: string,
    changes: Partial<Pick<Objetivo, "texto" | "completado" | "area" | "parentId" | "realidadEstado" | "realidadPorQue">>,
  ) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border/60 bg-surface/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-2 py-2 text-left sm:px-3"
      >
        <Chevron open={open} />
        <span className="text-xs font-bold uppercase tracking-widest text-muted">Q{q}</span>
        <span className="text-xs font-normal text-muted">({triRows.length})</span>
        <span className="ml-auto text-[10px] opacity-70" style={{ color: areaHex }}>
          ●
        </span>
      </button>

      {open && (
        <div className="border-t border-border/50 px-2 pb-3 pt-2 sm:px-3">
          {!isMentor && (
            <button
              type="button"
              onClick={() => onAddTrim(qPeriodo, anualId)}
              className="mb-2 w-full rounded border border-dashed border-border py-1.5 text-[10px] text-muted hover:border-accent hover:text-accent"
            >
              + objetivo trimestral
            </button>
          )}

          <div className="space-y-2">
            {triRows.map((tri) => (
              <TrimestreObjetivoBlock
                key={tri.id}
                tri={tri}
                qPeriodo={qPeriodo}
                mensuales={mensuales}
                isMentor={isMentor}
                onAddMes={onAddMes}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrimestreObjetivoBlock({
  tri,
  qPeriodo,
  mensuales,
  isMentor,
  onAddMes,
  onUpdate,
  onDelete,
}: {
  tri: Objetivo;
  qPeriodo: string;
  mensuales: Objetivo[];
  isMentor: boolean;
  onAddMes: (periodo: string, parentId: string) => void;
  onUpdate: (
    id: string,
    changes: Partial<Pick<Objetivo, "texto" | "completado" | "area" | "parentId" | "realidadEstado" | "realidadPorQue">>,
  ) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const mesKeys = monthKeysOfQuarter(qPeriodo);

  return (
    <div className="rounded-md border border-border/45 bg-background">
      <div className="flex items-start gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-foreground"
          aria-expanded={open}
          title={open ? "Contraer meses" : "Expandir meses"}
        >
          <Chevron open={open} />
        </button>
        <div className="min-w-0 flex-1">
          <EditableGoalRow
            obj={tri}
            isMentor={isMentor}
            onUpdate={onUpdate}
            onDelete={onDelete}
            compact
            showRealidad={open}
          />
        </div>
      </div>

      {open && (
        <div className="border-t border-border/40 px-2 pb-2 pt-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {mesKeys.map((mk) => {
              const mesRows = mensuales.filter((m) => m.periodo === mk && m.parentId === tri.id);
              return (
                <div key={mk} className="rounded border border-border/40 bg-surface/25 p-2">
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <p className="text-[10px] font-semibold text-muted">{monthLabel(mk)}</p>
                    {!isMentor && (
                      <button
                        type="button"
                        onClick={() => onAddMes(mk, tri.id)}
                        className="text-[10px] text-muted hover:text-accent"
                        title="Añadir objetivo mensual"
                      >
                        +
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {mesRows.map((mes) => (
                      <EditableGoalRow key={mes.id} obj={mes} isMentor={isMentor} onUpdate={onUpdate} onDelete={onDelete} compact />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EditableGoalRow({
  obj,
  isMentor,
  onUpdate,
  onDelete,
  compact = false,
  showRealidad = true,
}: {
  obj: Objetivo;
  isMentor: boolean;
  onUpdate: (
    id: string,
    changes: Partial<Pick<Objetivo, "texto" | "completado" | "area" | "parentId" | "realidadEstado" | "realidadPorQue">>,
  ) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
  showRealidad?: boolean;
}) {
  const hex = obj.area ? (AREA_COLORS[obj.area]?.hex ?? "#888") : "#888";
  const textClass = compact ? "text-[11px]" : "text-sm";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {!isMentor && (
          <input
            type="checkbox"
            checked={obj.completado}
            onChange={() => onUpdate(obj.id, { completado: !obj.completado })}
            className="h-3.5 w-3.5 shrink-0 rounded accent-accent"
          />
        )}
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
        <input
          value={obj.texto}
          disabled={isMentor}
          onChange={(e) => onUpdate(obj.id, { texto: e.target.value })}
          placeholder="Rellena este objetivo..."
          className={`min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 ${textClass} ${obj.completado ? "line-through text-muted" : "text-foreground"} ${isMentor ? "" : "focus:border-border focus:bg-background focus:outline-none"}`}
        />
        {!isMentor && (
          <button
            type="button"
            onClick={() => onDelete(obj.id)}
            className="text-[10px] text-muted hover:text-red-500"
            title="Eliminar objetivo"
          >
            ✕
          </button>
        )}
      </div>
      {showRealidad && (
        <ObjetivoRealidadBlock
          obj={obj}
          isMentor={isMentor}
          compact={compact}
          onChanges={(changes) => onUpdate(obj.id, changes)}
        />
      )}
    </div>
  );
}
