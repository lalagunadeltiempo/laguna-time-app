"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { useIsMentor, usePuedeVerArbol } from "@/lib/usuario";
import { generateId } from "@/lib/store";
import { defaultSemanasNoActivas, ensureConfigAnio } from "@/lib/arbol-tiempo";
import { EMPTY_ARBOL, type NodoArbol } from "@/lib/types";
import { VacacionesEditor } from "@/components/arbol/VacacionesEditor";

const VistaBloques = dynamic(
  () => import("@/components/arbol/VistaBloques").then((m) => ({ default: m.VistaBloques })),
  {
    loading: () => (
      <div className="rounded-xl border border-border/60 bg-background p-8 text-center text-sm text-muted">
        Cargando vista del árbol…
      </div>
    ),
  },
);

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
      <h2 className="text-lg font-semibold text-foreground">Este año {year} quiero facturar…</h2>
      <p className="text-sm text-muted">
        Pon cuánto quieres sumar y en qué unidad. Las ramas y hojas (lo que sumas para llegar) las añades después en el
        bloque Anual.
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
  const veArbol = usePuedeVerArbol();
  const arbol = state.arbol ?? EMPTY_ARBOL;

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [vacOpen, setVacOpen] = useState(false);

  const configsEffective = useMemo(() => ensureConfigAnio(arbol.configs, year), [arbol.configs, year]);
  const config = useMemo(() => configsEffective.find((c) => c.anio === year), [configsEffective, year]);

  useEffect(() => {
    if (!arbol.configs.some((c) => c.anio === year)) {
      dispatch({
        type: "SET_ARBOL_CONFIG_ANIO",
        config: { anio: year, semanasNoActivas: defaultSemanasNoActivas(year) },
      });
    }
  }, [year, arbol.configs, dispatch]);

  const nodosYear = useMemo(() => arbol.nodos.filter((n) => n.anio === year), [arbol.nodos, year]);
  const roots = useMemo(
    () => nodosYear.filter((n) => !n.parentId).sort((a, b) => a.orden - b.orden),
    [nodosYear],
  );
  const raizPrincipal = useMemo(
    () => roots.find((r) => r.cadencia === "anual" && r.metaValor !== undefined) ?? roots[0],
    [roots],
  );

  if (!veArbol) {
    return (
      <div className="w-full px-3 py-8 sm:px-6 md:px-10">
        <p className="text-muted">Esta sección está restringida.</p>
      </div>
    );
  }

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
            Marcas el objetivo del año y vas apuntando lo real cada semana. Cuando haces de más o de menos, los meses y semanas que te quedan se ajustan solos para llegar al total.
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
        <VistaBloques raiz={raizPrincipal} year={year} />
      )}

      {vacOpen && (
        <VacacionesEditor
          anio={year}
          semanasNoActivas={config?.semanasNoActivas ?? defaultSemanasNoActivas(year)}
          comunidadAutonoma={config?.comunidadAutonoma}
          onSave={(payload) => {
            dispatch({
              type: "SET_ARBOL_CONFIG_ANIO",
              config: {
                anio: year,
                semanasNoActivas: payload.semanasNoActivas,
                comunidadAutonoma: payload.comunidadAutonoma,
              },
            });
          }}
          onClose={() => setVacOpen(false)}
        />
      )}
    </div>
  );
}
