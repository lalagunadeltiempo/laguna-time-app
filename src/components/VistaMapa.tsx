"use client";

import { useState, useMemo } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import {
  AREAS_PERSONAL,
  AREAS_EMPRESA,
  AREA_COLORS,
  type Area,
  type PlantillaProceso,
} from "@/lib/types";

const AREAS_MAPA: { id: Area; label: string }[] = [
  ...AREAS_PERSONAL,
  ...AREAS_EMPRESA,
];
import { VistaProcesos } from "./VistaProcesos";
import { VistaProyectos } from "./VistaProyectos";
import { VistaEquipo } from "./VistaEquipo";

type SubView = null | "procesos" | "proyectos" | "equipo";

interface Props {
  onBack: () => void;
  onOpenDetalle: (resultadoId: string) => void;
}

export function VistaMapa({ onBack, onOpenDetalle }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [subView, setSubView] = useState<SubView>(null);
  const [filterArea, setFilterArea] = useState<Area | null>(null);
  const [filterPersona, setFilterPersona] = useState<string | null>(null);

  const dataByArea = useMemo(() => {
    return AREAS_MAPA.map((area) => {
      let proyectos = state.proyectos.filter((p) => p.area === area.id);
      let procesos = state.plantillas.filter((pl) => pl.area === area.id);

      if (filterPersona) {
        const personProyectoIds = new Set<string>();
        const personEntregables = state.entregables.filter(
          (e) => e.responsable === filterPersona,
        );
        for (const e of personEntregables) {
          const res = state.resultados.find((r) => r.id === e.resultadoId);
          if (res) personProyectoIds.add(res.proyectoId);
        }
        proyectos = proyectos.filter((p) => personProyectoIds.has(p.id));
        procesos = procesos.filter(
          (pl) => pl.responsableDefault === filterPersona,
        );
      }

      const proyectosData = proyectos.map((p) => {
        const resultados = state.resultados.filter(
          (r) => r.proyectoId === p.id,
        );
        const resultadosData = resultados.map((r) => {
          let entregables = state.entregables.filter(
            (e) => e.resultadoId === r.id,
          );
          if (filterPersona) {
            entregables = entregables.filter(
              (e) => e.responsable === filterPersona,
            );
          }
          return { ...r, entregables };
        });
        return { ...p, resultados: resultadosData };
      });

      const memberNames = new Set<string>();
      for (const p of proyectos) {
        const ress = state.resultados.filter((r) => r.proyectoId === p.id);
        for (const r of ress) {
          const ents = state.entregables.filter(
            (e) => e.resultadoId === r.id,
          );
          for (const e of ents) memberNames.add(e.responsable);
        }
      }
      for (const pl of procesos) memberNames.add(pl.responsableDefault);

      const miembros = state.miembros.filter((m) =>
        memberNames.has(m.nombre),
      );

      return {
        area,
        proyectos: proyectosData,
        procesos,
        miembros,
      };
    }).filter((d) => !filterArea || d.area.id === filterArea);
  }, [state, filterArea, filterPersona]);

  function clearFilters() {
    setFilterArea(null);
    setFilterPersona(null);
  }

  const isFiltering = filterArea !== null || filterPersona !== null;

  if (subView === "procesos") return <VistaProcesos onBack={() => setSubView(null)} />;
  if (subView === "proyectos") return <VistaProyectos onBack={() => setSubView(null)} onOpenDetalle={onOpenDetalle} />;
  if (subView === "equipo") return <VistaEquipo onBack={() => setSubView(null)} />;

  return (
    <div className="flex flex-1 flex-col px-5 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-600">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="flex-1 text-2xl font-bold text-zinc-900">Mapa</h1>
        <div className="flex gap-1">
          <SubViewBtn label="Procesos" onClick={() => setSubView("procesos")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          </SubViewBtn>
          <SubViewBtn label="Proyectos" onClick={() => setSubView("proyectos")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
          </SubViewBtn>
          <SubViewBtn label="Equipo" onClick={() => setSubView("equipo")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </SubViewBtn>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <button
          onClick={clearFilters}
          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
            !isFiltering
              ? "border-zinc-800 bg-zinc-800 text-white"
              : "border-zinc-200 text-zinc-500 hover:border-zinc-400"
          }`}
        >
          Todos
        </button>

        {AREAS_MAPA.map((a) => {
          const c = AREA_COLORS[a.id];
          const active = filterArea === a.id;
          return (
            <button
              key={a.id}
              onClick={() => {
                setFilterArea(active ? null : a.id);
              }}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                active
                  ? `${c.border} ${c.bg} ${c.text}`
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-400"
              }`}
            >
              <span
                className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded text-[8px] font-bold text-white ${c.dot}`}
              >
                {c.initial}
              </span>
              {a.label}
            </button>
          );
        })}

        <span className="mx-1 h-4 w-px bg-zinc-200" />

        {state.miembros.map((m) => {
          const active = filterPersona === m.nombre;
          return (
            <button
              key={m.id}
              onClick={() => {
                setFilterPersona(active ? null : m.nombre);
              }}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${
                active
                  ? "border-zinc-700 bg-zinc-700 text-white"
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-400"
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: m.color }}
              />
              {m.nombre}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {dataByArea.map((data) => {
          const colors = AREA_COLORS[data.area.id];
          const hasContent =
            data.proyectos.length > 0 || data.procesos.length > 0;
          if (!hasContent && !filterArea) return null;

          return (
            <section key={data.area.id} className="mb-6">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white ${colors.dot}`}
                >
                  {colors.initial}
                </span>
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">
                  {data.area.label}
                </h2>
              </div>

              {data.proyectos.length > 0 && (
                <div className="mb-3 ml-2">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Proyectos
                  </p>
                  {data.proyectos.map((p) => (
                    <MapaProyecto
                      key={p.id}
                      proyecto={p}
                      onOpenDetalle={onOpenDetalle}
                    />
                  ))}
                </div>
              )}

              {data.procesos.length > 0 && (
                <div className="mb-3 ml-2">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Procesos
                  </p>
                  {data.procesos.map((pl) => (
                    <MapaProceso key={pl.id} proceso={pl} />
                  ))}
                </div>
              )}

              {data.miembros.length > 0 && (
                <div className="ml-2">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Equipo
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.miembros.map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-[10px]"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: m.color }}
                        />
                        <span className="text-zinc-600">{m.nombre}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!hasContent && filterArea && (
                <p className="ml-2 text-[11px] text-zinc-400">
                  Sin proyectos ni procesos en esta área.
                </p>
              )}
            </section>
          );
        })}

        {dataByArea.every(
          (d) => d.proyectos.length === 0 && d.procesos.length === 0,
        ) && (
          <p className="mt-8 text-center text-sm text-zinc-400">
            {isFiltering
              ? "No hay resultados para los filtros seleccionados."
              : "No hay datos aún. Crea proyectos para verlos aquí."}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-componentes internos                                           */
/* ------------------------------------------------------------------ */

type ProyectoData = {
  id: string;
  nombre: string;
  descripcion: string | null;
  resultados: ResultadoData[];
};

type ResultadoData = {
  id: string;
  nombre: string;
  diasEstimados: number | null;
  entregables: { id: string; nombre: string; estado: string; responsable: string }[];
};

function MapaProyecto({
  proyecto,
  onOpenDetalle,
}: {
  proyecto: ProyectoData;
  onOpenDetalle: (id: string) => void;
}) {
  const dispatch = useAppDispatch();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(proyecto.nombre);
  const [descVal, setDescVal] = useState(proyecto.descripcion ?? "");
  const [open, setOpen] = useState(false);

  function saveName() {
    if (nameVal.trim() && nameVal.trim() !== proyecto.nombre) {
      dispatch({
        type: "RENAME_PROYECTO",
        id: proyecto.id,
        nombre: nameVal.trim(),
      });
    }
    setEditingName(false);
  }

  function saveDesc() {
    const trimmed = descVal.trim();
    if (trimmed !== (proyecto.descripcion ?? "")) {
      dispatch({
        type: "UPDATE_PROYECTO",
        id: proyecto.id,
        changes: { descripcion: trimmed || null },
      });
    }
  }

  return (
    <div className="mb-2 border-l-2 border-zinc-100 pl-3">
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen(!open)} className="shrink-0">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className={`text-zinc-300 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        {editingName ? (
          <input
            type="text"
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            autoFocus
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setNameVal(proyecto.nombre);
                setEditingName(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-zinc-900 focus:outline-none"
          />
        ) : (
          <span
            className="min-w-0 flex-1 cursor-text truncate text-xs font-semibold text-zinc-800"
            onDoubleClick={() => setEditingName(true)}
          >
            {proyecto.nombre}
          </span>
        )}
        <span className="text-[9px] text-zinc-400">
          {proyecto.resultados.length}r
        </span>
      </div>

      <input
        type="text"
        value={descVal}
        onChange={(e) => setDescVal(e.target.value)}
        onBlur={saveDesc}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            saveDesc();
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Descripción..."
        className="ml-4 mt-0.5 w-[calc(100%-1rem)] border-0 bg-transparent px-0 py-0 text-[10px] text-zinc-400 placeholder:text-zinc-300 focus:text-zinc-600 focus:outline-none"
      />

      {open && (
        <div className="ml-4 mt-1 space-y-0.5">
          {proyecto.resultados.map((r) => (
            <MapaResultado
              key={r.id}
              resultado={r}
              onOpenDetalle={() => onOpenDetalle(r.id)}
            />
          ))}
          {proyecto.resultados.length === 0 && (
            <p className="text-[10px] text-zinc-300">Sin resultados</p>
          )}
        </div>
      )}
    </div>
  );
}

function MapaResultado({
  resultado,
  onOpenDetalle,
}: {
  resultado: ResultadoData;
  onOpenDetalle: () => void;
}) {
  const dispatch = useAppDispatch();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(resultado.nombre);

  function saveName() {
    if (nameVal.trim() && nameVal.trim() !== resultado.nombre) {
      dispatch({
        type: "RENAME_RESULTADO",
        id: resultado.id,
        nombre: nameVal.trim(),
      });
    }
    setEditingName(false);
  }

  const hechos = resultado.entregables.filter(
    (e) => e.estado === "hecho",
  ).length;
  const total = resultado.entregables.length;
  const durLabel =
    resultado.diasEstimados !== null && resultado.diasEstimados > 0
      ? `${resultado.diasEstimados}d`
      : null;

  return (
    <div className="flex items-center gap-1 py-0.5">
      <span className="text-[10px] text-zinc-300">└</span>
      {editingName ? (
        <input
          type="text"
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          autoFocus
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveName();
            if (e.key === "Escape") {
              setNameVal(resultado.nombre);
              setEditingName(false);
            }
          }}
          className="min-w-0 flex-1 rounded border border-amber-300 bg-amber-50 px-1 py-0 text-[10px] text-zinc-700 focus:outline-none"
        />
      ) : (
        <button
          onClick={onOpenDetalle}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingName(true);
          }}
          className="min-w-0 flex-1 truncate text-left text-[10px] text-zinc-600 hover:text-amber-600"
          title="Clic: ver detalle · Doble clic: renombrar"
        >
          {resultado.nombre}
        </button>
      )}
      {durLabel && (
        <span className="shrink-0 rounded bg-zinc-100 px-1 py-0 text-[9px] text-zinc-400">
          {durLabel}
        </span>
      )}
      {total > 0 && (
        <span className="shrink-0 text-[9px] text-zinc-400">
          {hechos}/{total}
        </span>
      )}
    </div>
  );
}

function SubViewBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label}
      className="flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700">
      {children}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function MapaProceso({ proceso }: { proceso: PlantillaProceso }) {
  const dispatch = useAppDispatch();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(proceso.nombre);

  function saveName() {
    if (nameVal.trim() && nameVal.trim() !== proceso.nombre) {
      dispatch({
        type: "UPDATE_PLANTILLA",
        id: proceso.id,
        changes: { nombre: nameVal.trim() },
      });
    }
    setEditingName(false);
  }

  return (
    <div className="flex items-center gap-2 py-0.5 pl-3">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
      {editingName ? (
        <input
          type="text"
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          autoFocus
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveName();
            if (e.key === "Escape") {
              setNameVal(proceso.nombre);
              setEditingName(false);
            }
          }}
          className="min-w-0 flex-1 rounded border border-amber-300 bg-amber-50 px-1 py-0 text-[10px] text-zinc-700 focus:outline-none"
        />
      ) : (
        <span
          className="min-w-0 flex-1 cursor-text truncate text-[10px] text-zinc-600"
          onDoubleClick={() => setEditingName(true)}
        >
          {proceso.nombre}
        </span>
      )}
      <span className="shrink-0 text-[9px] text-zinc-400">
        {proceso.responsableDefault}
      </span>
      {proceso.pasos.length > 0 && (
        <span className="shrink-0 rounded bg-zinc-100 px-1 py-0 text-[9px] text-zinc-400">
          {proceso.pasos.length}p
        </span>
      )}
    </div>
  );
}
