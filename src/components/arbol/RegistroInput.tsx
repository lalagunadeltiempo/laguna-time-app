"use client";

import { useEffect, useState } from "react";
import type { EstadoRealidadRegistro, RegistroNodo } from "@/lib/types";
import { REALIDAD_REGISTRO_LABELS } from "@/lib/types";
import { cadenciaMatchesVista, type VistaPeriodoArbol } from "@/lib/arbol-tiempo";
import type { NodoCadencia } from "@/lib/types";

export function RegistroInput({
  nodoId,
  cadencia,
  vista,
  periodoTipo,
  periodoKey,
  existing,
  disabled,
  onCommit,
}: {
  nodoId: string;
  cadencia: NodoCadencia;
  vista: VistaPeriodoArbol;
  periodoTipo: RegistroNodo["periodoTipo"];
  periodoKey: string;
  existing: RegistroNodo | undefined;
  disabled?: boolean;
  onCommit: (patch: { valor: number; nota?: string; estadoRealidad?: EstadoRealidadRegistro; realidadPorQue?: string }) => void;
}) {
  const editable = cadenciaMatchesVista(cadencia, vista) && !disabled;
  const [valor, setValor] = useState(existing ? String(existing.valor) : "");
  const [nota, setNota] = useState(existing?.nota ?? "");
  const [estado, setEstado] = useState<EstadoRealidadRegistro | "">(existing?.estadoRealidad ?? "");
  const [porQue, setPorQue] = useState(existing?.realidadPorQue ?? "");

  useEffect(() => {
    setValor(existing ? String(existing.valor) : "");
    setNota(existing?.nota ?? "");
    setEstado(existing?.estadoRealidad ?? "");
    setPorQue(existing?.realidadPorQue ?? "");
  }, [existing, periodoKey, nodoId]);

  function parseValor(): number | null {
    const v = parseFloat(valor.replace(",", "."));
    return Number.isFinite(v) ? v : null;
  }

  function push() {
    const v = parseValor();
    if (v === null) return;
    onCommit({
      valor: v,
      nota: nota.trim() || undefined,
      estadoRealidad: estado === "" ? undefined : estado,
      realidadPorQue: porQue.trim() || undefined,
    });
  }

  if (!editable) {
    return (
      <span
        className="text-[10px] text-muted"
        title="Para escribir aquí, arriba elige la vista que coincida con cada cuánto apuntas esta meta (ej. vista Semana si la apuntas cada semana)."
      >
        —
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={push}
          disabled={disabled}
          placeholder="0"
          className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] tabular-nums"
        />
        <button
          type="button"
          onClick={push}
          disabled={disabled}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
        >
          OK
        </button>
      </div>
      <input
        type="text"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        onBlur={push}
        placeholder="Nota"
        className="max-w-[140px] rounded border border-border/60 bg-transparent px-1 py-0.5 text-[10px] text-muted"
      />
      <details className="text-[10px]">
        <summary className="cursor-pointer text-muted">Cómo te fue</summary>
        <div className="mt-1 space-y-1">
          <select
            value={estado}
            onChange={(e) => {
              const x = e.target.value as EstadoRealidadRegistro | "";
              setEstado(x);
              const v = parseValor();
              if (v === null) return;
              onCommit({
                valor: v,
                nota: nota.trim() || undefined,
                estadoRealidad: x === "" ? undefined : x,
                realidadPorQue: porQue.trim() || undefined,
              });
            }}
            className="w-full rounded border border-border bg-background px-1 py-0.5 text-[10px]"
          >
            <option value="">—</option>
            {(Object.keys(REALIDAD_REGISTRO_LABELS) as EstadoRealidadRegistro[]).map((k) => (
              <option key={k} value={k}>
                {REALIDAD_REGISTRO_LABELS[k]}
              </option>
            ))}
          </select>
          <textarea
            value={porQue}
            onChange={(e) => setPorQue(e.target.value)}
            onBlur={push}
            placeholder="¿Por qué?"
            rows={2}
            className="w-full rounded border border-border/60 bg-background px-1 py-0.5 text-[10px]"
          />
        </div>
      </details>
    </div>
  );
}
