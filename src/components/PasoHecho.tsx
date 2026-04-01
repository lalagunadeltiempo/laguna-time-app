"use client";

import type { Paso } from "@/lib/types";
import { MenuAcciones } from "./MenuAcciones";

interface Props {
  paso: Paso;
  onEdit: () => void;
  onDelete: () => void;
}

export function PasoHecho({ paso, onEdit, onDelete }: Props) {
  const dur = paso.finTs && paso.inicioTs
    ? Math.round(
        (new Date(paso.finTs).getTime() - new Date(paso.inicioTs).getTime()) / 60000,
      )
    : 0;
  const label = dur >= 60 ? `${Math.floor(dur / 60)}h ${dur % 60}m` : `${dur}m`;

  return (
    <div className="flex items-center gap-1">
      <div className="flex flex-1 items-center justify-between rounded-xl border border-zinc-100 bg-white px-3.5 py-2.5 shadow-sm">
        <p className="text-sm text-zinc-700">{paso.nombre}</p>
        <span className="shrink-0 text-xs font-medium text-zinc-400">{label}</span>
      </div>
      <MenuAcciones
        acciones={[
          { label: "Editar", onClick: onEdit },
          { label: "Eliminar", destructive: true, onClick: onDelete },
        ]}
      />
    </div>
  );
}
