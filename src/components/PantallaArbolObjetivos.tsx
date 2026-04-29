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
import { monthKeysOfQuarter, objetivosPorAreaAnio, orphansOf, qPeriodoFromMonth } from "@/lib/objetivos-tree";

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

export function PantallaArbolObjetivos() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const [filtro, setFiltro] = useState<AmbitoFilter>("empresa");
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const areas = useMemo(() => {
    const all = [...AREAS_EMPRESA, ...AREAS_PERSONAL].map((a) => a.id as Area);
    return all.filter((a) => filtro === "todo" || ambitoDeArea(a) === filtro);
  }, [filtro]);

  const objetivosYear = useMemo(() => {
    const y = String(year);
    const yPrefix = `${year}-`;
    return (state.objetivos ?? []).filter((o) => o.periodo === y || o.periodo.startsWith(yPrefix));
  }, [state.objetivos, year]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Árbol de objetivos</h1>
          <p className="mt-1 text-sm text-muted">Rellena y conecta objetivos por área: anual → trimestre → mes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm text-muted hover:bg-surface"
            title="Año anterior"
          >
            ◀
          </button>
          <span className="w-16 text-center text-lg font-semibold text-foreground">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm text-muted hover:bg-surface"
            title="Año siguiente"
          >
            ▶
          </button>
          {!isMentor && <AmbitoToggle value={filtro} onChange={setFiltro} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {areas.map((area) => (
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
  onUpdate: (id: string, changes: Partial<Pick<Objetivo, "texto" | "completado" | "area" | "parentId">>) => void;
  onDelete: (id: string) => void;
}) {
  const hex = AREA_COLORS[area]?.hex ?? "#888";
  const { anuales, trimestrales, mensuales } = objetivosPorAreaAnio(objetivosYear, area, year);
  const anualIds = new Set(anuales.map((o) => o.id));
  const triIds = new Set(trimestrales.map((o) => o.id));
  const trimestralesOrphan = orphansOf(trimestrales, "trimestre", anualIds);
  const mensualesOrphan = orphansOf(mensuales, "mes", triIds);

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

  return (
    <section className="rounded-xl border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hex }} />
        <h3 className="text-sm font-semibold text-foreground">{AREA_LABELS[area]}</h3>
      </div>

      <div className="space-y-3">
        {anuales.map((anual) => (
          <div key={anual.id} className="rounded-lg border border-border/50 bg-surface/20 p-2">
            <EditableGoalRow obj={anual} isMentor={isMentor} onUpdate={onUpdate} onDelete={onDelete} />

            {[1, 2, 3, 4].map((q) => {
              const qPeriodo = `${year}-Q${q}`;
              const triRows = trimestrales.filter((t) => t.periodo === qPeriodo && t.parentId === anual.id);
              return (
                <div key={qPeriodo} className="mt-2 rounded border border-border/40 bg-background p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Q{q}</p>
                    {!isMentor && (
                      <button
                        onClick={() => addObjetivo("trimestre", qPeriodo, anual.id)}
                        className="rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
                      >
                        + objetivo trimestral
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {triRows.map((tri) => (
                      <div key={tri.id} className="rounded border border-border/40 p-1.5">
                        <EditableGoalRow obj={tri} isMentor={isMentor} onUpdate={onUpdate} onDelete={onDelete} />
                        <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-3">
                          {monthKeysOfQuarter(qPeriodo).map((mk) => {
                            const mesRows = mensuales.filter((m) => m.periodo === mk && m.parentId === tri.id);
                            return (
                              <div key={mk} className="rounded border border-border/40 bg-surface/20 p-1.5">
                                <div className="mb-1 flex items-center justify-between">
                                  <p className="text-[10px] font-semibold text-muted">{monthLabel(mk)}</p>
                                  {!isMentor && (
                                    <button
                                      onClick={() => addObjetivo("mes", mk, tri.id)}
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
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {!isMentor && (
          <button
            onClick={() => addObjetivo("anio", String(year))}
            className="w-full rounded-lg border border-dashed border-border py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
          >
            + Objetivo anual
          </button>
        )}
      </div>

      {(trimestralesOrphan.length > 0 || mensualesOrphan.length > 0) && (
        <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50/40 p-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700">Sin conectar</p>
          <div className="space-y-1.5">
            {trimestralesOrphan.map((t) => (
              <div key={t.id} className="rounded border border-amber-300/60 bg-background p-1.5">
                <EditableGoalRow obj={t} isMentor={isMentor} onUpdate={onUpdate} onDelete={onDelete} compact />
                {!isMentor && (
                  <div className="mt-1 flex items-center gap-1">
                    <select
                      value={t.parentId ?? ""}
                      onChange={(e) => onUpdate(t.id, { parentId: e.target.value || undefined })}
                      className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                    >
                      <option value="">Sin anual padre</option>
                      {anuales.map((a) => <option key={a.id} value={a.id}>{a.texto || "(sin texto)"}</option>)}
                    </select>
                    <button
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
                <div key={m.id} className="rounded border border-amber-300/60 bg-background p-1.5">
                  <EditableGoalRow obj={m} isMentor={isMentor} onUpdate={onUpdate} onDelete={onDelete} compact />
                  {!isMentor && (
                    <div className="mt-1 flex items-center gap-1">
                      <select
                        value={m.parentId ?? ""}
                        onChange={(e) => onUpdate(m.id, { parentId: e.target.value || undefined })}
                        className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                      >
                        <option value="">Sin trimestral padre</option>
                        {trimestresMismoQ.map((t) => <option key={t.id} value={t.id}>{t.texto || "(sin texto)"}</option>)}
                      </select>
                      <button
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
        </div>
      )}
    </section>
  );
}

function EditableGoalRow({
  obj,
  isMentor,
  onUpdate,
  onDelete,
  compact = false,
}: {
  obj: Objetivo;
  isMentor: boolean;
  onUpdate: (id: string, changes: Partial<Pick<Objetivo, "texto" | "completado" | "area" | "parentId">>) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}) {
  const hex = obj.area ? (AREA_COLORS[obj.area]?.hex ?? "#888") : "#888";
  const textClass = compact ? "text-[11px]" : "text-sm";
  return (
    <div className="flex items-center gap-1.5">
      {!isMentor && (
        <input
          type="checkbox"
          checked={obj.completado}
          onChange={() => onUpdate(obj.id, { completado: !obj.completado })}
          className="h-3.5 w-3.5 rounded accent-accent"
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
          onClick={() => onDelete(obj.id)}
          className="text-[10px] text-muted hover:text-red-500"
          title="Eliminar objetivo"
        >
          ✕
        </button>
      )}
    </div>
  );
}
