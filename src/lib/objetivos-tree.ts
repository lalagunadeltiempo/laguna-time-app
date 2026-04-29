import type { Area, Objetivo } from "@/lib/types";

export interface ObjetivosAreaAnio {
  anuales: Objetivo[];
  trimestrales: Objetivo[];
  mensuales: Objetivo[];
}

export function qPeriodoFromMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map((s) => parseInt(s, 10));
  const q = Math.floor(((m || 1) - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

export function monthKeysOfQuarter(periodoQ: string): string[] {
  const [yRaw, qRaw] = periodoQ.split("-Q");
  const y = parseInt(yRaw, 10);
  const q = parseInt(qRaw, 10);
  const start = (Number.isFinite(q) ? q : 1) * 3 - 2;
  return [0, 1, 2].map((i) => `${y}-${String(start + i).padStart(2, "0")}`);
}

export function childrenOf(objetivos: Objetivo[], parentId: string): Objetivo[] {
  return objetivos.filter((o) => o.parentId === parentId);
}

export function objetivosPorAreaAnio(objetivos: Objetivo[], area: Area, year: number): ObjetivosAreaAnio {
  const y = String(year);
  const yPrefix = `${year}-`;
  const areaMatch = (o: Objetivo) => !o.area || o.area === area;
  return {
    anuales: objetivos
      .filter((o) => o.nivel === "anio" && o.periodo === y && areaMatch(o))
      .sort((a, b) => a.creado.localeCompare(b.creado)),
    trimestrales: objetivos
      .filter((o) => o.nivel === "trimestre" && o.periodo.startsWith(yPrefix) && areaMatch(o))
      .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.creado.localeCompare(b.creado)),
    mensuales: objetivos
      .filter((o) => o.nivel === "mes" && o.periodo.startsWith(yPrefix) && areaMatch(o))
      .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.creado.localeCompare(b.creado)),
  };
}

export function orphansOf(
  objetivos: Objetivo[],
  level: "trimestre" | "mes",
  validParentIds: Set<string>,
): Objetivo[] {
  return objetivos.filter((o) => o.nivel === level && (!o.parentId || !validParentIds.has(o.parentId)));
}

export function objetivoPath(objetivos: Objetivo[], objetivo: Objetivo): Objetivo[] {
  const byId = new Map(objetivos.map((o) => [o.id, o]));
  const path: Objetivo[] = [];
  let cur: Objetivo | undefined = objetivo;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    path.unshift(cur);
    guard.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}
