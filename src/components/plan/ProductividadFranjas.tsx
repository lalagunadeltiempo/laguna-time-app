"use client";

import { useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/lib/context";
import { useUsuario } from "@/lib/usuario";
import type { RegistroProductividad } from "@/lib/types";
import {
  matrizFranjaPorDia,
  productividadDeRegistro,
  promedioPorFranja,
  registroCompleto,
  registroDe,
} from "@/lib/productividad";

const DIMENSIONES = [
  { campo: "energia" as const, label: "Energía" },
  { campo: "foco" as const, label: "Foco" },
  { campo: "animo" as const, label: "Ánimo" },
];

const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

/** Color de una media de productividad (1..5) en una escala rojo→verde. */
function colorProductividad(media: number | null): string {
  if (media === null) return "transparent";
  const t = Math.min(1, Math.max(0, (media - 1) / 4));
  const hue = Math.round(t * 130);
  return `hsl(${hue} 65% 55%)`;
}

function regId(autor: string, fecha: string, franjaId: string): string {
  return `prod-${autor}-${fecha}-${franjaId}`;
}

function Estrellas({
  valor,
  onPick,
  color,
}: {
  valor: number;
  onPick: (n: number) => void;
  color: string;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const activo = valor >= n && valor > 0;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onPick(valor === n ? 0 : n)}
            aria-label={`${n} de 5`}
            className="h-5 w-5 rounded-full border transition-transform hover:scale-110"
            style={{
              backgroundColor: activo ? color : "transparent",
              borderColor: activo ? color : "var(--color-border, #cbd5e1)",
            }}
          />
        );
      })}
    </div>
  );
}

export function ProductividadFranjas({ dateKey, readOnly }: { dateKey: string; readOnly?: boolean }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { nombre: currentUser } = useUsuario();
  const [verAnalitica, setVerAnalitica] = useState(false);

  const franjas = useMemo(() => state.franjas ?? [], [state.franjas]);
  const registros = useMemo(() => state.productividadFranjas ?? [], [state.productividadFranjas]);

  function puntuar(franjaId: string, campo: "energia" | "foco" | "animo", valor: number) {
    if (readOnly) return;
    const previo = registroDe(registros, dateKey, franjaId, currentUser);
    const payload: RegistroProductividad = {
      id: previo?.id ?? regId(currentUser, dateKey, franjaId),
      fecha: dateKey,
      franjaId,
      energia: previo?.energia ?? 0,
      foco: previo?.foco ?? 0,
      animo: previo?.animo ?? 0,
      autor: currentUser,
      [campo]: valor,
    };
    dispatch({ type: "UPSERT_REGISTRO_PRODUCTIVIDAD", payload });
  }

  if (franjas.length === 0) return null;

  const matriz = matrizFranjaPorDia(registros, franjas, currentUser);
  const promedios = promedioPorFranja(registros, franjas, currentUser);

  return (
    <div className="mt-4 rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Productividad por franja</h3>
        <button
          type="button"
          onClick={() => setVerAnalitica((v) => !v)}
          className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          {verAnalitica ? "Ver evaluación del día" : "Ver analítica"}
        </button>
      </div>

      {!verAnalitica && (
        <div className="divide-y divide-border/60">
          {franjas.map((f) => {
            const reg = registroDe(registros, dateKey, f.id, currentUser);
            const completo = reg ? registroCompleto(reg) : false;
            const prod = reg && completo ? productividadDeRegistro(reg) : null;
            return (
              <div key={f.id} className="px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                  <span className="text-sm font-medium text-foreground">{f.nombre}</span>
                  <span className="text-[11px] text-muted">{f.inicio}–{f.fin}</span>
                  {prod !== null && (
                    <span className="ml-auto rounded-md px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: colorProductividad(prod) }}>
                      {prod.toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                  {DIMENSIONES.map((d) => (
                    <div key={d.campo} className="flex items-center gap-2">
                      <span className="w-14 text-[11px] text-muted">{d.label}</span>
                      <Estrellas valor={reg?.[d.campo] ?? 0} onPick={(n) => puntuar(f.id, d.campo, n)} color={f.color} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {verAnalitica && (
        <div className="px-4 py-3">
          <p className="mb-2 text-[11px] text-muted">
            Media de productividad por franja y día de la semana. Cuanto más verde, mejor manejas tu energía en esa franja.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th className="text-left text-[10px] font-semibold uppercase text-muted">Franja</th>
                  {DIAS_SEMANA.map((d) => (
                    <th key={d} className="w-9 text-center text-[10px] font-semibold text-muted">{d}</th>
                  ))}
                  <th className="w-12 text-center text-[10px] font-semibold uppercase text-muted">Med.</th>
                </tr>
              </thead>
              <tbody>
                {franjas.map((f, fi) => {
                  const fila = matriz[fi];
                  const prom = promedios[fi];
                  return (
                    <tr key={f.id}>
                      <td className="max-w-[120px] truncate pr-2 text-[11px] text-foreground">
                        <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: f.color }} />
                        {f.nombre}
                      </td>
                      {fila.map((celda) => (
                        <td key={celda.diaSemana} className="h-7 text-center align-middle">
                          <div
                            className="mx-auto flex h-7 w-8 items-center justify-center rounded text-[10px] font-bold text-white"
                            style={{ backgroundColor: colorProductividad(celda.media) }}
                            title={celda.media !== null ? `${celda.media.toFixed(1)} (${celda.n} registros)` : "Sin datos"}
                          >
                            {celda.media !== null ? celda.media.toFixed(1) : ""}
                          </div>
                        </td>
                      ))}
                      <td className="text-center">
                        <span className="text-[11px] font-bold text-foreground">
                          {prom.media !== null ? prom.media.toFixed(1) : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
