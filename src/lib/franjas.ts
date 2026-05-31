import type { FranjaDia } from "./types";

/** Las 8 franjas de time blocking por defecto (06:00 → 24:00). */
export const FRANJAS_DEFAULT: FranjaDia[] = [
  { id: "franja-anclaje", nombre: "Anclaje matinal", inicio: "06:00", fin: "08:00", color: "#F59E0B", descripcion: "Rituales, hidratación, suplementación, desayuno, piano." },
  { id: "franja-interior", nombre: "Trabajo interior", inicio: "08:00", fin: "10:00", color: "#6366F1", descripcion: "Psicoanálisis." },
  { id: "franja-mente", nombre: "Mente fértil", inicio: "10:00", fin: "12:00", color: "#14B8A6", descripcion: "Lectura y meditación." },
  { id: "franja-personas", nombre: "Personas y cuidado", inicio: "12:00", fin: "14:00", color: "#3B82F6", descripcion: "Interesados y pacientes de medicina." },
  { id: "franja-pausa", nombre: "Pausa vital", inicio: "14:00", fin: "16:00", color: "#22C55E", descripcion: "Comida y descanso." },
  { id: "franja-foco", nombre: "Foco creador", inicio: "16:00", fin: "19:00", color: "#F97316", descripcion: "Desarrollo de proyectos." },
  { id: "franja-cuerpo", nombre: "Cuerpo en movimiento", inicio: "19:00", fin: "22:00", color: "#8B5CF6", descripcion: "Yoga." },
  { id: "franja-cierre", nombre: "Cierre del día", inicio: "22:00", fin: "24:00", color: "#64748B", descripcion: "Cena y ritual nocturno." },
];

/** Minutos desde medianoche de una hora "HH:MM". "24:00" → 1440. */
export function minutosDeHHMM(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Franja que cubre la hora `hour` (0-23): aquella cuyo rango [inicio, fin)
 *  contiene el inicio de la hora. `undefined` si ninguna la cubre. */
export function franjaParaHora(franjas: FranjaDia[], hour: number): FranjaDia | undefined {
  const min = hour * 60;
  return franjas.find((f) => minutosDeHHMM(f.inicio) <= min && min < minutosDeHHMM(f.fin));
}
