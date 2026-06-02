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

export type TipoEntregable = "raw" | "sop" | "a-sop" | "rutina";

/** Snapshot ligero de lo archivado de una rutina al cerrar un mes.
 *  Permite consultar el histórico sin que el contexto vivo crezca infinito. */
export interface HistoricoRutinaMes {
  /** Mes archivado en formato "YYYY-MM". */
  mes: string;
  /** ISO del momento en que se cerró el mes. */
  cerradoTs: string;
  notas: Nota[];
  urls: UrlRef[];
  pasos: { nombre: string }[];
}

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
  /**
   * Pizarra personal de cada miembro, mapeada por nombre de usuario. Sirve para que
   * Gabi y Beltrán tomen notas en paralelo sobre el mismo entregable sin pisarse.
   * El contexto común (`contexto.notas`, URLs, apps) sigue siendo el "Compartido".
   */
  pizarraByUser?: Record<string, string>;
  /** Si `tipo === "rutina"`: mes ("YYYY-MM") para el que la rutina está abierta.
   *  Mientras coincide con el mes de la fecha, la rutina aparece sola cada día
   *  laborable en HOY sin rellenar `diasPlanificadosByUser`. */
  mesActivoRutina?: string;
  /** Días de la semana (1=lunes .. 7=domingo) en los que aparece la rutina.
   *  Por defecto L-V (`[1,2,3,4,5]`). */
  diasSemanaRutina?: number[];
  /** Meses anteriores archivados de la rutina (notas, URLs y pasos en sólo lectura). */
  historicoRutina?: HistoricoRutinaMes[];
}

/** Sesión de trabajo sobre un entregable: cronómetro + pausas. */
export interface SesionEntregable {
  /** Identidad estable de la sesión para merge/edición entre clientes. */
  id?: string;
  inicioTs: string;          // ISO
  finTs: string | null;      // null mientras la sesión está en curso
  pausas?: PausaEntry[];     // pausas dentro de la sesión
  /** Miembro del equipo que abrió esta sesión. Varias personas pueden tener
   *  sesiones abiertas a la vez en el mismo entregable. Si falta (`legacy`),
   *  se trata como sesión atribuida al `responsable` del entregable para
   *  filtros y cronómetro (migración v28 rellena `autor` cuando hay responsable). */
  autor?: string;
  /** Último heartbeat ISO que emite el cliente dueño de la sesión mientras
   *  la tiene abierta. Se usa para cerrar automáticamente sesiones huérfanas
   *  (p. ej. pestaña cerrada sin pulsar "Cerrar"). */
  heartbeatTs?: string;
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
  /** Si es true, fue añadido automáticamente por asignar a este miembro como
   *  responsable de algún paso. Se usa para pintar un badge "auto" y para que
   *  borrarlo manualmente se considere una decisión consciente del usuario. */
  auto?: boolean;
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

/**
 * Mensaje de chat asociado a un entregable. Los miembros del workspace pueden
 * hablar del entregable sin perder el hilo ni pisarse las notas.
 */
/** Estado de un mensaje dentro del hilo de un entregable.
 *  - `abierto`: pendiente de respuesta/lectura (típicamente al crearlo).
 *  - `resuelto`: alguien lo ha dado por zanjado (acuerdo, respuesta, etc.).
 *  - `duda`: la autora deja explícitamente marcado que espera aclaración.
 *  Se diseñó este conjunto mínimo para que el flujo "alguien te pregunta,
 *  alguien responde y cierra" sea visible sin crear una app de tickets. */
export type EstadoMensaje = "abierto" | "resuelto" | "duda";

export interface MensajeEntregable {
  id: string;
  entregableId: string;
  autor: string;
  texto: string;
  creado: string;
  editado?: string;
  /** Nombres de miembros que ya han visto el mensaje. El autor siempre está. */
  leidoPor?: string[];
  /** Miembros a los que va dirigido el mensaje (subset del equipo). Si está
   *  vacío o undefined el mensaje se considera "para todos" (broadcast). */
  paraQuien?: string[];
  /** Estado del mensaje. Si no se informa se asume "abierto". */
  estado?: EstadoMensaje;
  /** Miembro que marcó el mensaje como resuelto. */
  resueltoPor?: string;
  /** ISO del momento en que se marcó como resuelto. Se usa además para
   *  decidir el ganador en merges concurrentes (last-write-wins local). */
  resueltoTs?: string;
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

export type TrimestreKey = "Q1" | "Q2" | "Q3" | "Q4";

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
  /** true = el % de este nodo es fijo y NO se reajusta automáticamente cuando cambian sus hermanos. La usuaria lo marca con un pin/candado en el bloque ANUAL. */
  metaPctFijo?: boolean;
  metaUnidad?: string;
  /**
   * Meta por trimestre (opcional). Se edita a nivel de hoja (producto concreto) para capturar
   * estacionalidad. Si hay al menos un trimestre definido, la meta anual efectiva del nodo se
   * calcula como la suma de los trimestres definidos + el prorrateo del residuo de `metaValor`
   * entre los no definidos. Cuando no hay ninguno, la meta anual queda en `metaValor` puro y
   * el plan por periodo se prorratea por días laborables.
   */
  metaPorTrimestre?: Partial<Record<TrimestreKey, number>>;
  /**
   * Trimestre(s) en los que cae el plan de esta hoja (opcional). Vacío o
   * ausente = repartido lineal por días laborables en todo el año. Si hay
   * 1–3 trimestres, el importe anual (`metaValor`) se reparte solo entre
   * esos trimestres (por días laborables entre ellos). Tiene precedencia
   * sobre `metaPorTrimestre` (legacy).
   */
  trimestresPlan?: TrimestreKey[];
  proyectoIds?: string[];
  entregableIds?: string[];
  contadorModo: "manual" | "derivado";
  creado: string;
  /**
   * ISO timestamp de la última modificación de cualquier campo del nodo
   * (nombre, metaValor, metaPorTrimestre, entregableIds, etc). Lo rellena
   * el reducer en TODAS las acciones que mutan o crean un nodo, y lo usa
   * `preferNodoLWW` (ver `merge.ts`) como criterio Last-Write-Wins entre
   * dos copias del mismo nodo viniendo de clientes distintos. Sin este
   * campo el merge degrada a una unión campo-a-campo conservadora que
   * intenta NO sobrescribir valores definidos con `undefined`.
   */
  actualizado?: string;
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
  /**
   * @deprecated Usar `semanasNoActivasTs`. Se mantiene como fallback de
   *  lectura para datos anteriores a la migración 25. La migración la
   *  promueve a `semanasNoActivasTs` con ts epoch para que cualquier
   *  toggle posterior gane en LWW.
   */
  semanasNoActivas?: string[];
  /**
   * Lunes ISO (YYYY-MM-DD) de semanas no activas (ej. vacaciones), con
   * timestamp de la última operación de marcado. Misma semántica LWW que
   * `mesesCerradosTs`: gana el ts más reciente por mondayKey, así
   * desmarcar un descanso desde un cliente sobrevive a un push antiguo
   * de la nube que lo seguía marcando.
   */
  semanasNoActivasTs?: Record<string, string>;
  /**
   * Tombstones LWW de "esta semana ya NO está en descanso":
   * `mondayKey` -> ts ISO del momento en que se desmarcó. Necesario para
   * que la unión de strings antigua no resucite un descanso que la
   * usuaria acaba de quitar.
   */
  semanasActivasTs?: Record<string, string>;
  /**
   * Código CCAA para festivos (date-holidays / ES), ej. MD, CT.
   * Omitido o vacío: solo se aplican festivos del conjunto nacional estándar del dataset.
   */
  comunidadAutonoma?: string;
  /**
   * @deprecated Usar `mesesCerradosTs`. Se mantiene como fallback de
   *  lectura para datos anteriores a la migración 22. La migración la
   *  vacía: una vez migrado el cliente, `mesesCerrados` deja de ser
   *  consultado; lectores nuevos hacen fallback aquí solo si llega un
   *  estado pre-migración (p. ej. push antiguo del backend).
   */
  mesesCerrados?: string[];
  /**
   * Meses (`YYYY-MM`) cerrados con timestamp de la última operación
   * (cierre/reapertura). Se usa para LWW en el merge:
   *  - Si la entrada existe → mes cerrado.
   *  - Si la entrada no existe → mes abierto.
   *  - Al mergear configs entre clientes, gana el ts más reciente por
   *    mesKey, lo que permite que reabrir desde un cliente se propague
   *    al otro aunque la nube todavía tenga el cierre antiguo.
   *
   * Semántica del cálculo de Replan:
   *  - Cerrado: cuenta el real (incluso si es 0) en el acumulado previo.
   *  - Abierto: se asume que cumple plan lineal en el acumulado previo,
   *    para que un mes sin apunte aún no penalice el replan de los
   *    siguientes.
   */
  mesesCerradosTs?: Record<string, string>;
  /**
   * Tombstones LWW de reaperturas: `YYYY-MM` -> ts ISO del momento en
   * que se reabrió. Necesario para que un cierre antiguo en la nube no
   * resucite tras un pull (la unión simple no podía expresar
   * eliminaciones). Si para un `mesKey` el ts de apertura es mayor que
   * el de cierre, el mes queda abierto en el merge.
   */
  mesesAbiertosTs?: Record<string, string>;
  /**
   * Piso mensual de plan en € por mesKey (`YYYY-MM`). Caso de uso: meses
   * sin días laborables (ej. agosto entero como descanso) que en realidad
   * sí facturan ingresos pasivos. El piso se descuenta de la meta anual y
   * el resto se prorratea entre los meses sin piso por días laborables.
   * No se aplica a vista semanal (la semana no "sabe" del piso del mes).
   */
  pisoMensual?: Record<string, number>;
  /**
   * Cómo se distribuye el plan anual entre los meses del año.
   *  - "diasLaborables" (default cuando ausente): reparto proporcional a
   *    los días laborables del mes, respetando `pisoMensual` y los
   *    descansos. Es el comportamiento histórico.
   *  - "patronAnioAnterior": el reparto sigue las proporciones del REAL
   *    del mismo nodo (o del equivalente por nombre/path) en el año
   *    anterior. Si no hay datos AY suficientes para un nodo concreto,
   *    cae al método por días laborables como fallback. Útil para
   *    "programar 2026 con la estacionalidad real de 2025".
   *
   * Nota: el reparto semanal dentro de un mes sigue siendo siempre por
   * días laborables (la granularidad AY es mensual, no semanal).
   */
  distribucionMensual?: "diasLaborables" | "patronAnioAnterior";
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
  /** IDs de mensajes del chat de entregable borrados. */
  mensajes?: string[];
  /** Implicados eliminados a mano del entregable. Clave canónica
   *  `"${entregableId}::${nombre}"` (nombre case-sensitive tal cual se guarda
   *  en `implicados[].nombre`). Evita que el merge con otro cliente —que
   *  todavía tiene al implicado en su copia— lo resucite. */
  implicados?: string[];
  /**
   * Tombstones LWW para vínculos MAPA→Árbol (relación entregable ↔ hoja
   * del árbol). La clave es `"${hojaId}::${entregableId}"` y el valor es
   * el ts ISO del momento en que se rompió la relación. Sin esto, una
   * vez `entregableIds` deja de ser autoritativo (porque el merge unifica
   * IDs) un cliente que aún no había sincronizado el borrado resucitaba
   * el vínculo. El merge usa estos tombstones para filtrar relaciones
   * con marca posterior al `actualizado` del nodo. */
  entregableHojaLinks?: Record<string, string>;
}

/** Franja fija de time blocking del día. Igual todos los días (editable).
 *  Se pinta como banda de color de fondo en el grid 24h de Hoy y en las
 *  columnas de día de Semana. `inicio`/`fin` en formato "HH:MM" (hora local). */
export interface FranjaDia {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
  color: string;
  descripcion?: string;
}

/** Puntuación 1..5 de una franja en un día concreto. La PRODUCTIVIDAD no se
 *  almacena: se deriva como media de energía + foco + ánimo (solo es posible
 *  cuando los tres están presentes). */
export interface RegistroProductividad {
  id: string;
  /** Día evaluado en formato "YYYY-MM-DD" (hora local). */
  fecha: string;
  franjaId: string;
  /** Puntuaciones 1..5. El valor 0 significa "sin puntuar" todavía. */
  energia: number;
  foco: number;
  animo: number;
  nota?: string;
  autor: string;
  /** ISO de la última edición. Lo usa el merge para LWW por id. */
  actualizado?: string;
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
  /** Hilos de chat por entregable. */
  mensajes?: MensajeEntregable[];
  arbol: PlanArbolState;
  deleted?: DeletedTombstones;
  planConfig?: PlanConfig;
  /** Franjas de time blocking del día (bandas de color en Hoy y Semana). */
  franjas?: FranjaDia[];
  /** Registros de productividad (energía/foco/ánimo) por franja y día. */
  productividadFranjas?: RegistroProductividad[];
  mtp?: string;
  _migrationVersion?: number;
}
