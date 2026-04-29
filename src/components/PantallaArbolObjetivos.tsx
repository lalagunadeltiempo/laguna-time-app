"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { useIsMentor } from "@/lib/usuario";
import { generateId } from "@/lib/store";
import {
  defaultSemanasNoActivas,
  ensureConfigAnio,
  type VistaPeriodoArbol,
} from "@/lib/arbol-tiempo";
import { EMPTY_ARBOL, type NodoArbol, type RegistroNodo } from "@/lib/types";
import { ArbolHeader, initMesTrimFromDate } from "@/components/arbol/ArbolHeader";
import { NodoRow } from "@/components/arbol/NodoRow";
import { NodoEditor } from "@/components/arbol/NodoEditor";
import { VacacionesEditor } from "@/components/arbol/VacacionesEditor";
import { CierreTrimestre } from "@/components/arbol/CierreTrimestre";
import { VistaBloques } from "@/components/arbol/VistaBloques";

function periodoForVista(
  vista: VistaPeriodoArbol,
  year: number,
  weekMonday: string,
  mesKey: string,
  trimestreKey: string,
): { periodoTipo: RegistroNodo["periodoTipo"]; periodoKey: string } {
  if (vista === "semana") return { periodoTipo: "semana", periodoKey: weekMonday };
  if (vista === "mes") return { periodoTipo: "mes", periodoKey: mesKey };
  if (vista === "trimestre") return { periodoTipo: "trimestre", periodoKey: trimestreKey };
  return { periodoTipo: "anio", periodoKey: String(year) };
}

/** Tarjeta inicial cuando todavía no hay objetivo anual: solo nombre y cifra. */
function CrearObjetivoAnualForm({ year }: { year: number }) {
  const dispatch = useAppDispatch();
  const [nombre, setNombre] = useState("Facturación");
  const [meta, setMeta] = useState("");
  const [unidad, setUnidad] = useState("€");
  return (
    <form
      className="space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const v = parseFloat(meta.replace(",", "."));
        const payload: NodoArbol = {
          id: generateId(),
          anio: year,
          orden: 0,
          nombre: nombre.trim() || "Objetivo del año",
          tipo: "resultado",
          cadencia: "anual",
          relacionConPadre: "explica",
          metaValor: Number.isFinite(v) ? v : undefined,
          metaUnidad: unidad.trim() || undefined,
          contadorModo: "manual",
          creado: new Date().toISOString(),
        };
        dispatch({ type: "ADD_NODO_ARBOL", payload });
      }}
    >
      <h2 className="text-lg font-semibold text-foreground">Pon tu objetivo del año {year}</h2>
      <p className="text-sm text-muted">
        Solo dos cosas: cómo lo llamas y cuánto. Las ramas (lo que sumas para llegar) las añades luego.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          Cuánto
          <input
            value={meta}
            onChange={(e) => setMeta(e.target.value)}
            inputMode="decimal"
            placeholder="624000"
            className="rounded border border-border bg-background px-3 py-2 text-sm tabular-nums"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          En qué (€, horas, ventas…)
          <input
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            className="rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>
      <button
        type="submit"
        className="min-h-[40px] rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
      >
        Crear objetivo
      </button>
    </form>
  );
}

export function PantallaArbolObjetivos() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const arbol = state.arbol ?? EMPTY_ARBOL;

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [vistaArbol, setVistaArbol] = useState<VistaPeriodoArbol>("semana");
  const [weekMonday, setWeekMonday] = useState(() => initMesTrimFromDate(new Date().getFullYear()).weekMonday);
  const [mesKey, setMesKey] = useState(() => initMesTrimFromDate(new Date().getFullYear()).mesKey);
  const [trimestreKey, setTrimestreKey] = useState(() => initMesTrimFromDate(new Date().getFullYear()).trimestreKey);
  const [vacOpen, setVacOpen] = useState(false);
  const [editor, setEditor] = useState<Partial<NodoArbol> & { id?: string } | null>(null);
  const [expandedIds, setExpanded] = useState<Set<string>>(new Set());
  const [arbolAbierto, setArbolAbierto] = useState(false);

  const configsEffective = useMemo(() => ensureConfigAnio(arbol.configs, year), [arbol.configs, year]);
  const config = useMemo(() => configsEffective.find((c) => c.anio === year), [configsEffective, year]);
  const semanasNoActivas = useMemo(
    () => new Set(config?.semanasNoActivas ?? defaultSemanasNoActivas(year)),
    [config, year],
  );

  useEffect(() => {
    if (!arbol.configs.some((c) => c.anio === year)) {
      dispatch({
        type: "SET_ARBOL_CONFIG_ANIO",
        config: { anio: year, semanasNoActivas: defaultSemanasNoActivas(year) },
      });
    }
  }, [year, arbol.configs, dispatch]);

  useEffect(() => {
    const t = initMesTrimFromDate(year);
    setWeekMonday(t.weekMonday);
    setMesKey(t.mesKey);
    setTrimestreKey(t.trimestreKey);
  }, [year]);

  const nodosYear = useMemo(() => arbol.nodos.filter((n) => n.anio === year), [arbol.nodos, year]);
  const roots = useMemo(
    () => nodosYear.filter((n) => !n.parentId).sort((a, b) => a.orden - b.orden),
    [nodosYear],
  );
  const raizPrincipal = useMemo(
    () => roots.find((r) => r.cadencia === "anual" && r.metaValor !== undefined) ?? roots[0],
    [roots],
  );

  const { periodoTipo, periodoKey } = periodoForVista(vistaArbol, year, weekMonday, mesKey, trimestreKey);
  const vacacionDisabled = vistaArbol === "semana" && semanasNoActivas.has(weekMonday);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  if (isMentor) {
    return (
      <div className="w-full px-3 py-8 sm:px-6 md:px-10">
        <p className="text-muted">
          Vista de solo lectura (mentor): el árbol de objetivos no es editable en este perfil.
        </p>
        <pre className="mt-4 max-h-96 overflow-auto rounded border border-border p-2 text-xs">
          {JSON.stringify({ nodos: nodosYear, registros: arbol.registros }, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="w-full px-3 py-6 sm:px-6 sm:py-8 md:px-10">
      <header className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Árbol de objetivos</h1>
          <p className="mt-1 text-sm text-muted">
            Pones tu objetivo del año y abajo ves cómo va por trimestre, mes y semana, comparando con el plan y con el año pasado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setYear(year - 1)}
            className="min-h-[40px] min-w-[40px] rounded-lg border border-border px-2 py-1.5 text-sm text-muted hover:bg-surface"
            aria-label="Año anterior"
          >
            ◀
          </button>
          <span className="min-w-[4rem] text-center text-lg font-semibold">{year}</span>
          <button
            type="button"
            onClick={() => setYear(year + 1)}
            className="min-h-[40px] min-w-[40px] rounded-lg border border-border px-2 py-1.5 text-sm text-muted hover:bg-surface"
            aria-label="Año siguiente"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={() => setVacOpen(true)}
            className="min-h-[40px] rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-100 hover:bg-amber-500/20"
          >
            Semanas de descanso
          </button>
        </div>
      </header>

      {!raizPrincipal ? (
        <CrearObjetivoAnualForm year={year} />
      ) : (
        <>
          <CierreTrimestre key={`${year}-${trimestreKey}`} anio={year} trimestreKey={trimestreKey} />
          <VistaBloques raiz={raizPrincipal} year={year} />
        </>
      )}

      {vacOpen && (
        <VacacionesEditor
          anio={year}
          semanasNoActivas={config?.semanasNoActivas ?? defaultSemanasNoActivas(year)}
          onSave={(semanas) => {
            dispatch({ type: "SET_ARBOL_CONFIG_ANIO", config: { anio: year, semanasNoActivas: semanas } });
          }}
          onClose={() => setVacOpen(false)}
        />
      )}

      {raizPrincipal && (
        <details
          open={arbolAbierto}
          onToggle={(e) => setArbolAbierto((e.currentTarget as HTMLDetailsElement).open)}
          className="mt-8 rounded-xl border border-border bg-surface/40"
        >
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            Ver árbol completo (avanzado)
            <span className="ml-2 text-xs font-normal text-muted">— vista jerárquica para casos complejos</span>
          </summary>
          <div className="space-y-4 border-t border-border/60 p-4">
            <ArbolHeader
              year={year}
              onYearChange={setYear}
              vista={vistaArbol}
              onVista={setVistaArbol}
              weekMonday={weekMonday}
              onWeekMondayChange={setWeekMonday}
              mesKey={mesKey}
              onMesKeyChange={setMesKey}
              trimestreKey={trimestreKey}
              onTrimestreKeyChange={setTrimestreKey}
              semanasNoActivas={semanasNoActivas}
              onOpenVacaciones={() => setVacOpen(true)}
            />

            {editor && (
              <NodoEditor
                key={editor.id ?? "new"}
                isRoot={editor.parentId === undefined || editor.parentId === ""}
                initial={editor as Partial<NodoArbol> & { nombre: string; anio: number }}
                onCancel={() => setEditor(null)}
                onSave={(changes) => {
                  if (editor.id) {
                    dispatch({ type: "UPDATE_NODO_ARBOL", id: editor.id, changes });
                  } else {
                    const siblings = nodosYear.filter((n) => (n.parentId ?? "") === (editor.parentId ?? ""));
                    const orden = siblings.length > 0 ? Math.max(...siblings.map((s) => s.orden)) + 1 : 0;
                    dispatch({
                      type: "ADD_NODO_ARBOL",
                      payload: {
                        id: generateId(),
                        anio: year,
                        parentId: editor.parentId,
                        orden,
                        nombre: changes.nombre ?? "Nuevo",
                        descripcion: changes.descripcion,
                        notaAnioAnterior: changes.notaAnioAnterior,
                        tipo: changes.tipo ?? "resultado",
                        cadencia: changes.cadencia ?? "semanal",
                        relacionConPadre: changes.relacionConPadre ?? "explica",
                        metaValor: changes.metaValor,
                        metaUnidad: changes.metaUnidad,
                        proyectoIds: changes.proyectoIds,
                        contadorModo: "manual",
                        creado: new Date().toISOString(),
                      },
                    });
                  }
                  setEditor(null);
                }}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {nodosYear.length === 0
                  ? `Nada escrito todavía en ${year}`
                  : `${nodosYear.length} objetivo${nodosYear.length !== 1 ? "s" : ""} en ${year}`}
                {vacacionDisabled && " · Semana de descanso (no hace falta apuntar)."}
              </p>
              <button
                type="button"
                onClick={() =>
                  setEditor({
                    nombre: "",
                    anio: year,
                    tipo: "resultado",
                    cadencia: "anual",
                    relacionConPadre: "explica",
                    contadorModo: "manual",
                  })
                }
                className="min-h-[40px] shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:border-accent hover:text-accent"
              >
                + Objetivo raíz
              </button>
            </div>

            {roots.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted">
                Pulsa «Objetivo raíz» y escribe la meta del año; puedes ampliar el árbol después con «+ Aquí» en cada fila.
              </p>
            ) : (
              <div className="rounded-xl border border-border bg-background">
                {roots.map((r) => (
                  <NodoRow
                    key={r.id}
                    node={r}
                    depth={0}
                    allNodes={nodosYear}
                    registros={arbol.registros}
                    vista={vistaArbol}
                    year={year}
                    periodoTipo={periodoTipo}
                    periodoKey={periodoKey}
                    vacacionDisabled={!!vacacionDisabled}
                    expandedIds={expandedIds}
                    toggleExpanded={toggleExpanded}
                    onEdit={(n) => setEditor(n)}
                    config={config}
                  />
                ))}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
