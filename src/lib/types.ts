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

export type RolUsuario = "admin" | "miembro" | "mentor";

export interface DiaNoDisponible {
  desde: string;
  hasta: string;
  motivo?: string;
}

export interface MiembroInfo {
  id: string;
  nombre: string;
  rol?: RolUsuario;
  color: string;
  capacidadDiaria: number;
  diasLaborables: number[];
  diasNoDisponibles?: DiaNoDisponible[];
}

export interface PlanConfig {
  entregablesPorSemana: number;
  pasosPorSesion: number;
}

export const PLAN_CONFIG_DEFAULT: PlanConfig = {
  entregablesPorSemana: 3,
  pasosPorSesion: 5,
};

export type MiembroEquipo = string;

const MEMBER_COLORS = ["#F59E0B", "#3B82F6", "#10B981", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

export const EQUIPO_DEFAULT: MiembroInfo[] = [
  "Gabi", "Beltrán", "Goosen", "Claudia", "Ester", "Patri", "Helen", "Marcos",
].map((nombre, i) => ({ id: nombre.toLowerCase(), nombre, color: MEMBER_COLORS[i % MEMBER_COLORS.length], capacidadDiaria: 1, diasLaborables: [1, 2, 3, 4, 5] }));

/* ---- Jerarquía: Paso → Entregable → Resultado → Proyecto → Área → Ámbito ---- */

export interface Nota {
  id: string;
  /** Título opcional. Cuando está, se muestra como cabecera de la nota colapsada. */
  titulo?: string;
  /** Cuerpo de la nota. Markdown ligero: **bold**, *italic*, # H1, ## H2, ### H3,
   *  listas con "- ", links [texto](url). El render se hace en MarkdownView. */
  texto: string;
  autor: string;
  creadoTs: string;
}

export type PlanNivel = "dia" | "semana" | "mes" | "trimestre" | null;

export type EstadoEntregable = "a_futuro" | "planificado" | "en_proceso" | "en_espera" | "hecho" | "cancelada";

export type ReviewStatus = "pendiente" | "revisado" | "sugerencia" | "aprobado";

export interface ReviewMark {
  status: ReviewStatus;
  autor: string;
  fecha: string;
}

export type TipoProyecto = "proyecto" | "operacion";
export type EstadoProyecto = "plan" | "en_marcha" | "pausado" | "completado";

export interface Proyecto {
  id: string;
  nombre: string;
  descripcion: string | null;
  area: Area;
  creado: string;
  fechaInicio: string | null;
  fechaLimite?: string | null;
  planNivel?: PlanNivel;
  tipo?: TipoProyecto;
  estado?: EstadoProyecto;
  responsable?: string;
  notas?: Nota[];
  review?: ReviewMark;
  /** Claves tipo "2026-Q2" de los trimestres en los que el proyecto está activo. */
  trimestresActivos?: string[];
  /** Claves tipo "2026-04" de los meses en los que el proyecto está activo. Fuente de verdad en Plan Trimestre. */
  mesesActivos?: string[];
  /** Claves de lunes ISO ("YYYY-MM-DD") de semanas marcadas explícitamente aunque no haya entregables con fecha. */
  semanasExplicitas?: string[];
  /** Objetivo anual al que contribuye este proyecto (opcional). */
  objetivoId?: string;
}

export interface Resultado {
  id: string;
  nombre: string;
  descripcion: string | null;
  proyectoId: string;
  creado: string;
  /** @deprecated Se mantiene por compatibilidad. Usar `semanasActivas`. */
  semana: string | null;
  /** @deprecated Se mantiene como compromiso informativo solamente. */
  fechaLimite: string | null;
  /** @deprecated Se mantiene por compatibilidad. Usar `semanasActivas` / `mesesActivos`. */
  fechaInicio: string | null;
  diasEstimados: number | null;
  /** @deprecated Se calcula a partir de `semanasActivas`/`mesesActivos`. */
  planNivel?: PlanNivel;
  responsable?: string;
  notas?: Nota[];
  review?: ReviewMark;
  /** Claves tipo "2026-04" de los meses en los que el resultado está activo. */
  mesesActivos?: string[];
  /** Claves de lunes ISO ("YYYY-MM-DD") de semanas en las que el resultado está activo (plural; fuente de verdad). */
  semanasActivas?: string[];
  /** Claves de lunes ISO ("YYYY-MM-DD") de semanas marcadas explícitamente aunque no haya entregables con fecha. DEPRECATED. */
  semanasExplicitas?: string[];
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
  estado: EstadoEntregable;
  creado: string;
  /** @deprecated Compatibilidad. Usar `semanasActivas` (lista de lunes ISO). */
  semana: string | null;
  /** @deprecated No condiciona la programación. Usar `fechaCompromiso` para fecha-evento. */
  fechaLimite: string | null;
  /** @deprecated Usar `diasPlanificados` (días) o `semanasActivas` (semanas). */
  fechaInicio: string | null;
  /** @deprecated Se calcula a partir de `semanasActivas`/`diasPlanificados`. */
  planNivel?: PlanNivel;
  notas?: Nota[];
  review?: ReviewMark;
  /** Claves de lunes ISO ("YYYY-MM-DD") de semanas en las que el entregable está activo
   *  (plural; fuente de verdad para programación semanal). */
  semanasActivas?: string[];
  /** Fecha-evento informativa (taller, reunión, entrega) en formato "YYYY-MM-DD".
   *  NO condiciona la programación; sólo es un dato visible para el equipo. */
  fechaCompromiso?: string | null;
  /** Si está definido, el entregable se oculta de HOY operativo hasta que `dateKey` actual > este valor.
   *  Formato "YYYY-MM-DD". Permite "Cerrar por hoy" (setea dateKey de hoy) sin marcar el entregable como en_espera. */
  ocultoHasta?: string | null;
  /** Historial de sesiones de trabajo sobre el entregable. Cada sesión ≈ "empezar... cerrar por hoy".
   *  Una sesión con `finTs=null` indica que está en curso ahora mismo. */
  sesiones?: SesionEntregable[];
  /** Contexto de trabajo del entregable: URLs, apps, notas de contexto. Antes vivía a nivel Paso. */
  contexto?: Contexto;
  /** Personas implicadas en el entregable. Antes vivía a nivel Paso. */
  implicados?: Implicado[];
  /** @deprecated Usar `planInicioTsByUser`. Se mantiene como fallback de lectura para datos
   *  anteriores a la migración 20. La migración lo vacía. */
  planInicioTs?: string | null;
  /** @deprecated Usar `diasPlanificadosByUser`. Se mantiene como fallback de lectura para
   *  datos anteriores a la migración 20. La migración lo vacía. */
  diasPlanificados?: string[];
  /** Días concretos (dateKey YYYY-MM-DD) en los que cada miembro planifica trabajar este
   *  entregable. La planificación es PERSONAL: dos personas pueden compartir el entregable
   *  pero elegir días distintos sin pisarse. La clave del Record es el nombre del miembro
   *  (`MiembroInfo.nombre`), igual que `responsable`. */
  diasPlanificadosByUser?: Record<string, string[]>;
  /** Hora planificada para empezar HOY (ISO) por miembro. Igual que `diasPlanificadosByUser`,
   *  cada miembro fija su propia hora sin pisar la del resto. */
  planInicioTsByUser?: Record<string, string | null>;
  /** Persona/entidad de la que se espera respuesta para reabrir el entregable.
   *  Si es `tipo: "equipo"`, ese miembro verá el entregable en su panel
   *  "En espera de…" en Plan Semana (alguien le está esperando). Si es
   *  `tipo: "externo"`, queda como recordatorio para el responsable.
   *  Combinado con `estado: "en_espera"`. Al programar un día (chips L/M/X/J/V/S/D)
   *  o una semana en el entregable, se considera reabierto automáticamente:
   *  el reducer pasa el estado a `planificado` y limpia este campo. */
  enEsperaDe?: { tipo: "equipo" | "externo"; nombre: string } | null;
  /** ISO timestamp de cuándo se marcó "en espera". Informativo. */
  enEsperaDesde?: string | null;
}

/** Sesión de trabajo sobre un entregable: cronómetro + pausas. */
export interface SesionEntregable {
  inicioTs: string;          // ISO
  finTs: string | null;      // null mientras la sesión está en curso
  pausas?: PausaEntry[];     // pausas dentro de la sesión
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
  orden?: number;
  inicioTs: string | null;
  finTs: string | null;
  estado: string;
  contexto: Contexto;
  implicados: Implicado[];
  pausas: PausaEntry[];
  notas?: Nota[];
  siguientePaso: {
    tipo: "fin" | "continuar";
    nombre?: string;
    cuando?: string;
    fechaProgramada?: string;
    dependeDe?: DependeDe[];
  } | null;
  /** Hora planificada para empezar (ISO). Se fija desde Plan Hoy y se limpia al empezar de verdad. */
  planInicioTs?: string | null;
  /** Responsable de este paso. Si vacío, en displays se hereda del entregable. */
  responsable?: string;
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
  tipo: "diario" | "semanal" | "mensual" | "trimestral" | "anual" | "demanda";
  diaSemana?: number;
  diaMes?: number;
  semanaMes?: "primera" | "ultima" | null;
  mesesTrimestre?: number[];
  mesAnual?: number;
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
  urls?: UrlRef[];
}

export interface PlantillaProceso {
  id: string;
  nombre: string;
  area: Area;
  objetivo: string;
  disparador: string;
  programacion: Programacion | null;
  proyectoId: string | null;
  resultadoId: string | null;
  responsableDefault: MiembroEquipo;
  pasos: PasoPlantilla[];
  herramientas: string[];
  excepciones: string;
  dependeDeIds: string[];
  creado: string;
  notas?: Nota[];
  review?: ReviewMark;
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
  fisico:         { border: "border-pink-300",    bg: "bg-pink-50",    text: "text-pink-700",    dot: "bg-pink-600",    initial: "Q", hex: "#db2777" },
  emocional:      { border: "border-orange-300",  bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-600",  initial: "E", hex: "#ea580c" },
  mental:         { border: "border-teal-300",    bg: "bg-teal-50",    text: "text-teal-700",    dot: "bg-teal-600",    initial: "M", hex: "#0d9488" },
  espiritual:     { border: "border-violet-300",  bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-600",  initial: "S", hex: "#7c3aed" },
  financiera:     { border: "border-red-300",     bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-700",     initial: "F", hex: "#b91c1c" },
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
  detalle?: string;
  ruta?: string;
}

/** Resultado real frente al registro en el árbol de drivers. */
export type EstadoRealidadRegistro = "cumplido" | "superado" | "por_debajo";

export const REALIDAD_REGISTRO_LABELS: Record<EstadoRealidadRegistro, string> = {
  cumplido: "Cumplido",
  superado: "Superado",
  por_debajo: "Por debajo",
};

export type NodoTipo = "resultado" | "palanca" | "accion";
export type NodoCadencia = "anual" | "trimestral" | "mensual" | "semanal" | "puntual";
export type NodoRelacion = "suma" | "explica";

export interface NodoArbol {
  id: string;
  anio: number;
  parentId?: string;
  orden: number;
  nombre: string;
  descripcion?: string;
  /** Texto libre opcional con lo que pasó el año pasado en este eje. */
  notaAnioAnterior?: string;
  tipo: NodoTipo;
  cadencia: NodoCadencia;
  relacionConPadre: NodoRelacion;
  metaValor?: number;
  metaUnidad?: string;
  proyectoIds?: string[];
  entregableIds?: string[];
  contadorModo: "manual" | "derivado";
  creado: string;
}

export interface RegistroNodo {
  id: string;
  nodoId: string;
  periodoTipo: "semana" | "mes" | "trimestre" | "anio";
  periodoKey: string;
  /** Valor principal en la unidad del nodo (habitualmente €). */
  valor: number;
  /** Unidades vendidas/realizadas (opcional): p. ej. número de aulas o sesiones. */
  unidades?: number;
  nota?: string;
  estadoRealidad?: EstadoRealidadRegistro;
  realidadPorQue?: string;
  creado: string;
  actualizado: string;
}

export interface PlanArbolConfigAnio {
  anio: number;
  /** Lunes ISO (YYYY-MM-DD) de semanas no activas (ej. vacaciones). */
  semanasNoActivas: string[];
  /**
   * Código CCAA para festivos (date-holidays / ES), ej. MD, CT.
   * Omitido o vacío: solo se aplican festivos del conjunto nacional estándar del dataset.
   */
  comunidadAutonoma?: string;
}

/** Reflexión guardada al cierre de un trimestre. */
export interface ReflexionTrimestre {
  anio: number;
  trimestreKey: string; // "2026-Q1"
  funciono?: string;
  noFunciono?: string;
  cambios?: string;
  actualizado: string;
}

export interface PlanArbolState {
  nodos: NodoArbol[];
  registros: RegistroNodo[];
  configs: PlanArbolConfigAnio[];
  reflexiones?: ReflexionTrimestre[];
}

export const EMPTY_ARBOL: PlanArbolState = { nodos: [], registros: [], configs: [], reflexiones: [] };

export interface DeletedTombstones {
  proyectos: string[];
  resultados: string[];
  entregables: string[];
  pasos: string[];
  plantillas: string[];
  /** IDs de notas borradas explícitamente; evita que la fusión con la nube las resucite. */
  notas?: string[];
  arbolNodos?: string[];
  arbolRegistros?: string[];
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
  arbol: PlanArbolState;
  deleted?: DeletedTombstones;
  planConfig?: PlanConfig;
  mtp?: string;
  _migrationVersion?: number;
}
