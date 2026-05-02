"use client";

import { useMemo, useState } from "react";
import { useAppDispatch, useAppState } from "@/lib/context";
import { useUsuario, useIsMentor } from "@/lib/usuario";
import { MarkdownView } from "./MarkdownView";
import { ChipMiembro } from "../plan/InlineEditors";

interface Props {
  entregableId: string;
}

/**
 * Pizarra personal por miembro dentro de la ficha del entregable.
 * - "Mi espacio": textarea editable; solo el usuario actual puede escribir.
 * - "Espacio de X": solo-lectura. Aparece una pestaña por cada miembro con texto.
 *
 * Complementa al contexto compartido (`contexto.notas`) y permite que dos
 * usuarios trabajen a la vez en el mismo entregable sin pisarse.
 */
export function PizarraPersonal({ entregableId }: Props) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const isMentor = useIsMentor();

  const entregable = state.entregables.find((e) => e.id === entregableId);
  const pizarras = useMemo(() => entregable?.pizarraByUser ?? {}, [entregable?.pizarraByUser]);
  const otros = useMemo(
    () => Object.keys(pizarras).filter((u) => u !== currentUser && (pizarras[u] ?? "").trim().length > 0),
    [pizarras, currentUser],
  );

  // Pestaña activa: "mi" (solo si hay currentUser no-mentor) o nombre de otro miembro.
  type Tab = "mi" | string;
  const defaultTab: Tab = currentUser && !isMentor ? "mi" : (otros[0] ?? "mi");
  const [tab, setTab] = useState<Tab>(defaultTab);

  if (!entregable) return null;
  // Sin otros miembros con pizarra y sin usuario editor → no tiene sentido mostrar nada.
  if (!currentUser && otros.length === 0) return null;

  const textoMio = currentUser ? pizarras[currentUser] ?? "" : "";
  const textoOtro = typeof tab === "string" && tab !== "mi" ? pizarras[tab] ?? "" : "";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Pizarra personal
        </p>
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          {currentUser && !isMentor && (
            <button
              type="button"
              onClick={() => setTab("mi")}
              className={`rounded-full px-2 py-0.5 font-medium transition-colors ${
                tab === "mi"
                  ? "bg-accent text-white"
                  : "border border-border text-muted hover:bg-surface"
              }`}
              title={`Tu espacio personal para este entregable (${currentUser})`}
            >
              Mi espacio
            </button>
          )}
          {otros.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setTab(u)}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors ${
                tab === u
                  ? "bg-accent text-white"
                  : "border border-border text-muted hover:bg-surface"
              }`}
              title={`Pizarra personal de ${u} (solo lectura)`}
            >
              <ChipMiembro nombre={u} miembros={state.miembros} compact />
              <span>Espacio de {u}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "mi" && currentUser && !isMentor && (
        <div className="space-y-1">
          <textarea
            value={textoMio}
            onChange={(e) =>
              dispatch({
                type: "SET_ENTREGABLE_PIZARRA_USUARIO",
                id: entregable.id,
                usuario: currentUser,
                texto: e.target.value,
              })
            }
            placeholder="Notas privadas para ti (URLs, ideas, TODOs). Solo tú escribes aquí; el resto lo ve en pestaña aparte."
            className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-accent"
            rows={4}
          />
          <p className="text-[10px] text-muted">
            Este espacio es solo tuyo. El resto del equipo lo ve en pestaña aparte y no puede editarlo.
          </p>
        </div>
      )}

      {tab !== "mi" && textoOtro && (
        <div className="rounded border border-border bg-surface/40 px-2 py-1.5">
          <MarkdownView text={textoOtro} />
          <p className="mt-1 text-[10px] italic text-muted">Solo lectura. Escrito por {tab}.</p>
        </div>
      )}

      {tab !== "mi" && !textoOtro && (
        <p className="rounded border border-dashed border-border px-2 py-1.5 text-[11px] text-muted">
          {tab} todavía no ha escrito nada en su pizarra personal para este entregable.
        </p>
      )}
    </div>
  );
}
