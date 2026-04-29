"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { useIsMentor } from "@/lib/usuario";
import { generateId } from "@/lib/store";
import { defaultSemanasNoActivas, ensureConfigAnio, type VistaPeriodoArbol } from "@/lib/arbol-tiempo";
import { EMPTY_ARBOL, type NodoArbol, type RegistroNodo } from "@/lib/types";
import { ArbolHeader, initMesTrimFromDate } from "@/components/arbol/ArbolHeader";
import { NodoRow } from "@/components/arbol/NodoRow";
import { NodoEditor } from "@/components/arbol/NodoEditor";
import { VacacionesEditor } from "@/components/arbol/VacacionesEditor";
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

export function PantallaArbolObjetivos() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const isMentor = useIsMentor();
  const arbol = state.arbol ?? EMPTY_ARBOL;

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [vista, setVista] = useState<VistaPeriodoArbol>("semana");
  const [weekMonday, setWeekMonday] = useState(() => initMesTrimFromDate(new Date().getFullYear()).weekMonday);
  const [mesKey, setMesKey] = useState(() => initMesTrimFromDate(new Date().getFullYear()).mesKey);
  const [trimestreKey, setTrimestreKey] = useState(() => initMesTrimFromDate(new Date().getFullYear()).trimestreKey);
  const [vacOpen, setVacOpen] = useState(false);
  const [editor, setEditor] = useState<Partial<NodoArbol> & { id?: string } | null>(null);
  const [expandedIds, setExpanded] = useState<Set<string>>(new Set());

  const configsEffective = useMemo(() => ensureConfigAnio(arbol.configs, year), [arbol.configs, year]);
  const config = useMemo(() => configsEffective.find((c) => c.anio === year), [configsEffective, year]);
  const semanasNoActivas = useMemo(() => new Set(config?.semanasNoActivas ?? defaultSemanasNoActivas(year)), [config, year]);

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
  const roots = useMemo(() => nodosYear.filter((n) => !n.parentId).sort((a, b) => a.orden - b.orden), [nodosYear]);

  useEffect(() => {
    if (roots.length > 0 && expandedIds.size === 0) {
      setExpanded(new Set(roots.map((r) => r.id)));
    }
  }, [roots, expandedIds.size]);

  const { periodoTipo, periodoKey } = periodoForVista(vista, year, weekMonday, mesKey, trimestreKey);
  const vacacionDisabled = vista === "semana" && semanasNoActivas.has(weekMonday);

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
        <p className="text-muted">Vista de solo lectura (mentor): el árbol de drivers no es editable en este perfil.</p>
        <pre className="mt-4 max-h-96 overflow-auto rounded border border-border p-2 text-xs">{JSON.stringify({ nodos: nodosYear, registros: arbol.registros }, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="w-full px-3 py-8 sm:px-6 md:px-10">
      <ArbolHeader
        year={year}
        onYearChange={setYear}
        vista={vista}
        onVista={setVista}
        weekMonday={weekMonday}
        onWeekMondayChange={setWeekMonday}
        mesKey={mesKey}
        onMesKeyChange={setMesKey}
        trimestreKey={trimestreKey}
        onTrimestreKeyChange={setTrimestreKey}
        semanasNoActivas={semanasNoActivas}
        onOpenVacaciones={() => setVacOpen(true)}
      />

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

      {editor && (
        <NodoEditor
          key={editor.id ?? "new"}
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
                  tipo: changes.tipo ?? "resultado",
                  cadencia: changes.cadencia ?? "semanal",
                  relacionConPadre: changes.relacionConPadre ?? "explica",
                  metaValor: changes.metaValor,
                  metaUnidad: changes.metaUnidad,
                  contadorModo: "manual",
                  creado: new Date().toISOString(),
                },
              });
            }
            setEditor(null);
          }}
        />
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {nodosYear.length === 0
            ? `Nada escrito todavía en ${year}`
            : `${nodosYear.length} meta${nodosYear.length !== 1 ? "s" : ""} en ${year}`}
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
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          + Meta principal
        </button>
      </div>

      {roots.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted">
          Pulsa «Meta principal» y escribe solo lo que quieres conseguir; el resto puede esperar.
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
              vista={vista}
              year={year}
              periodoTipo={periodoTipo}
              periodoKey={periodoKey}
              vacacionDisabled={!!vacacionDisabled}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
              onEdit={(n) => setEditor(n)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
