/**
 * Paleta de colores para unidades temporales (trimestre, mes, semana).
 *
 * Convención:
 *  - 4 trimestres: 4 colores base (azul→verde→ámbar→rojo).
 *  - 12 meses: 12 colores que recorren el año fluyendo entre los Qs.
 *  - Semanas heredan el color del mes que contiene su jueves (regla ISO).
 *
 * Todos los colores se devuelven como hex sin alpha; la UI puede aplicar
 * transparencia "+40", "+20", etc. al pintar fondos.
 */

import { mesPrincipalDeSemana } from "./semana-utils";

export const COLOR_TRIMESTRE: Record<1 | 2 | 3 | 4, string> = {
  1: "#3b82f6", // Q1 azul
  2: "#10b981", // Q2 verde
  3: "#f59e0b", // Q3 ámbar
  4: "#ef4444", // Q4 rojo
};

/** 12 colores para meses (1..12). Derivados del cromático estacional. */
export const COLOR_MES: Record<number, string> = {
  1: "#1d4ed8",   // ene · azul profundo
  2: "#3b82f6",   // feb · azul
  3: "#06b6d4",   // mar · cian
  4: "#10b981",   // abr · esmeralda
  5: "#22c55e",   // may · verde
  6: "#84cc16",   // jun · lima
  7: "#eab308",   // jul · amarillo
  8: "#f59e0b",   // ago · ámbar
  9: "#f97316",   // sep · naranja
  10: "#ef4444",  // oct · rojo
  11: "#dc2626",  // nov · rojo intenso
  12: "#7c3aed",  // dic · violeta (cierre de año)
};

export function colorTrimestre(qKey: string): string {
  const m = /^\d{4}-Q([1-4])$/.exec(qKey);
  if (!m) return "#94a3b8";
  return COLOR_TRIMESTRE[Number(m[1]) as 1 | 2 | 3 | 4] ?? "#94a3b8";
}

export function colorMes(mesKey: string): string {
  const m = /^\d{4}-(\d{2})$/.exec(mesKey);
  if (!m) return "#94a3b8";
  const idx = Number(m[1]);
  return COLOR_MES[idx] ?? "#94a3b8";
}

/** Hereda del mes principal (regla ISO: mes del jueves). */
export function colorSemana(monday: string): string {
  const mes = mesPrincipalDeSemana(monday);
  return mes ? colorMes(mes) : "#94a3b8";
}

/** Devuelve estilos inline {bg, border, text} a partir de un hex. */
export function chipStylesFromHex(hex: string, active: boolean): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} {
  if (active) {
    return { backgroundColor: hex + "22", borderColor: hex, color: hex };
  }
  return { backgroundColor: "transparent", borderColor: hex + "55", color: hex + "cc" };
}
