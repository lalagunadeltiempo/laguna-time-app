export type Ambito = "personal" | "empresa";

export type AreaPersonal = "fisico" | "emocional" | "mental" | "espiritual";
export type AreaEmpresa = "financiera" | "operativa" | "comercial" | "administrativa";
export type Area = AreaPersonal | AreaEmpresa;

export const AREAS_PERSONAL: { id: AreaPersonal; label: string }[] = [
  { id: "fisico", label: "Físico" },
  { id: "emocional", label: "Emocional" },
  { id: "mental", label: "Mental" },
  { id: "espiritual", label: "Espiritual" },
];

export const AREAS_EMPRESA: { id: AreaEmpresa; label: string }[] = [
  { id: "financiera", label: "Financiera" },
  { id: "operativa", label: "Operativa" },
  { id: "comercial", label: "Comercial" },
  { id: "administrativa", label: "Administrativa" },
];

export function ambitoDeArea(area: Area): Ambito {
  return (["fisico", "emocional", "mental", "espiritual"] as string[]).includes(area)
    ? "personal"
    : "empresa";
}

export interface MiembroInfo {
  id: string;
  nombre: string;
  rol?: string;
  color: string;
  capacidadDiaria: number;
  diasLaborables: number[];
}

export type MiembroEquipo = string;

const MEMBER_COLORS = ["#F59E0B", "#3B82F6", "#10B981", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

export const EQUIPO_DEFAULT: MiembroInfo[] = [
  "Gabi", "Beltrán", "Goosen", "Claudia", "Ester", "Patri", "Helen", "Marcos",
].map((nombre, i) => ({ id: nombre.toLowerCase(), nombre, color: MEMBER_COLORS[i % MEMBER_COLORS.length], capacidadDiaria: 1, diasLaborables: [1, 2, 3, 4, 5] }));

/* ---- Jerarquía: Paso → Entregable → Resultado → Proyecto → Área → Ámbito ---- */

export interface Proyecto {
  id: string;
  nombre: string;
  descripcion: string | null;
  area: Area;
  creado: string;
  fechaInicio: string | null;
}

export interface Resultado {
  id: string;
  nombre: string;
  descripcion: string | null;
  proyectoId: string;
  creado: string;
  semana: string | null;
  fechaLimite: string | null;
  fechaInicio: string | null;
  diasEstimados: number | null;
}

export type TipoEntregable = "raw" | "sop" | "a-sop";

export interface Entregable {
  id: string;
  nombre: string;
  resultadoId: string;
  tipo: TipoEntregable;
  plantillaId: string | null;
  diasEstimados: number;
  diasHechos: number;
  esDiaria: boolean;
  responsable: MiembroEquipo;
  estado: "a_futuro" | "en_proceso" | "en_espera" | "hecho" | "cancelada";
  creado: string;
  semana: string | null;
  fechaLimite: string | null;
  fechaInicio: string | null;
}

export interface UrlRef {
  nombre: string;
  descripcion: string;
  url: string;
}

export interface Contexto {
  urls: UrlRef[];
  apps: string[];
  notas: string;
}

export interface Implicado {
  tipo: "equipo" | "externo";
  nombre: string;
  contactoId?: string;
}

export interface PausaEntry {
  pauseTs: string;
  resumeTs: string | null;
}

export interface DependeDe {
  tipo: "equipo" | "externo";
  nombre: string;
}

export interface Paso {
  id: string;
  entregableId: string;
  nombre: string;
  inicioTs: string | null;
  finTs: string | null;
  estado: string;
  contexto: Contexto;
  implicados: Implicado[];
  pausas: PausaEntry[];
  siguientePaso: {
    tipo: "fin" | "continuar";
    nombre?: string;
    cuando?: string;
    fechaProgramada?: string;
    dependeDe?: DependeDe[];
  } | null;
}

export interface ContactoExterno {
  id: string;
  nombre: string;
  email?: string;
  telefono?: string;
  notas?: string;
}

export interface InboxItem {
  id: string;
  texto: string;
  creado: string;
  procesado: boolean;
}

/* ---- SOP (Procedimiento Operativo Estándar = Fábrica de Entregable) ---- */

export interface Programacion {
  tipo: "diario" | "semanal" | "mensual" | "trimestral" | "demanda";
  diaSemana?: number;
  diaMes?: number;
  semanaMes?: "primera" | "ultima" | null;
  mesesTrimestre?: number[];
}

export interface PasoPlantilla {
  id: string;
  orden: number;
  nombre: string;
  descripcion: string;
  herramientas: string[];
  tipo: "accion" | "condicional" | "advertencia" | "nota";
  minutosEstimados: number | null;
  programacion?: Programacion | null;
  condicion?: string;
  advertencia?: string;
  notas?: string;
}

export interface PlantillaProceso {
  id: string;
  nombre: string;
  area: Area;
  objetivo: string;
  disparador: string;
  programacion: Programacion | null;
  proyectoId: string | null;
  responsableDefault: MiembroEquipo;
  pasos: PasoPlantilla[];
  herramientas: string[];
  excepciones: string;
  dependeDeIds: string[];
  creado: string;
}

export interface EjecucionSOP {
  id: string;
  plantillaId: string;
  fecha: string;
  pasosCompletados: string[];
  estado: "pendiente" | "en_curso" | "completado";
  entregableId?: string | null;
  pasosLanzados?: Record<string, string>;
}

export const AREA_COLORS: Record<string, { border: string; bg: string; text: string; dot: string; initial: string; hex: string }> = {
  fisico:         { border: "border-pink-300",    bg: "bg-pink-50",    text: "text-pink-700",    dot: "bg-pink-600",    initial: "F", hex: "#db2777" },
  emocional:      { border: "border-orange-300",  bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-600",  initial: "E", hex: "#ea580c" },
  mental:         { border: "border-teal-300",    bg: "bg-teal-50",    text: "text-teal-700",    dot: "bg-teal-600",    initial: "M", hex: "#0d9488" },
  espiritual:     { border: "border-violet-300",  bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-600",  initial: "S", hex: "#7c3aed" },
  financiera:     { border: "border-red-300",     bg: "bg-red-50",     text: "text-red-800",     dot: "bg-red-800",     initial: "F", hex: "#b91c1c" },
  operativa:      { border: "border-amber-300",   bg: "bg-amber-50",   text: "text-amber-800",   dot: "bg-amber-700",   initial: "O", hex: "#b45309" },
  comercial:      { border: "border-green-300",   bg: "bg-green-50",   text: "text-green-800",   dot: "bg-green-800",   initial: "C", hex: "#166534" },
  administrativa: { border: "border-blue-300",    bg: "bg-blue-50",    text: "text-blue-800",    dot: "bg-blue-900",    initial: "A", hex: "#1e3a8a" },
};

export interface AmbitoLabels {
  personal: string;
  empresa: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  entregableId?: string;
  pasoId?: string;
  proyectoId?: string;
  descripcion: string;
}

export interface AppState {
  ambitoLabels: AmbitoLabels;
  proyectos: Proyecto[];
  resultados: Resultado[];
  entregables: Entregable[];
  pasos: Paso[];
  contactos: ContactoExterno[];
  inbox: InboxItem[];
  plantillas: PlantillaProceso[];
  ejecuciones: EjecucionSOP[];
  pasosActivos: string[];
  miembros: MiembroInfo[];
  activityLog: ActivityEntry[];
  _migrationVersion?: number;
}
