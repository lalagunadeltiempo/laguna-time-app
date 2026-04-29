import type { NodoCadencia, NodoRelacion, NodoTipo } from "@/lib/types";

/** Etiquetas visibles en español cotidiano (el modelo interno sigue siendo técnico). */
export const TIPO_UI: Record<NodoTipo, string> = {
  resultado: "Meta grande",
  palanca: "Hábito o palanca",
  accion: "Paso concreto",
};

export const CADENCIA_UI: Record<NodoCadencia, string> = {
  anual: "Una vez al año",
  trimestral: "Cada trimestre",
  mensual: "Cada mes",
  semanal: "Cada semana",
  puntual: "Solo una vez",
};

export const RELACION_UI: Record<NodoRelacion, { label: string; hint: string }> = {
  suma: {
    label: "Suma con lo de arriba (números deben cuadrar)",
    hint: "Los hijos suman hacia el padre",
  },
  explica: {
    label: "Va relacionado (no suma números)",
    hint: "Explica o detalla sin sumar metas",
  },
};
