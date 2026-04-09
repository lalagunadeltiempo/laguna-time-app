import type { Proyecto, Area } from "./types";

let _counter = 0;
function sid() {
  _counter++;
  return `seedemp${Date.now().toString(36)}${_counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

interface ProjDef { nombre: string; area: Area }

const PROYECTOS_EMPRESA: ProjDef[] = [
  // ====== COMERCIAL ======
  { nombre: "Aumentar Ventas en el Sendero", area: "comercial" },
  { nombre: "Aula Miedo", area: "comercial" },
  { nombre: "Aula Tiroides", area: "comercial" },
  { nombre: "Aula Antiestrés", area: "comercial" },
  { nombre: "Aula Colesterol", area: "comercial" },
  { nombre: "Aula Diarrea", area: "comercial" },
  { nombre: "Aula Estreñimiento", area: "comercial" },
  { nombre: "Aula Gases", area: "comercial" },
  { nombre: "Aula Mujer", area: "comercial" },
  { nombre: "Aula Pareja", area: "comercial" },
  { nombre: "Aula Insomnio", area: "comercial" },
  { nombre: "Aula Acidez", area: "comercial" },
  { nombre: "Aula Helicobacter", area: "comercial" },
  { nombre: "Aula Sobrepeso", area: "comercial" },
  { nombre: "Aula Alergias", area: "comercial" },
  { nombre: "Aula Eje", area: "comercial" },
  { nombre: "Aula Libertad", area: "comercial" },
  { nombre: "Aula Mapas", area: "comercial" },
  { nombre: "Aula Hambre", area: "comercial" },
  { nombre: "Aula Cabello", area: "comercial" },
  { nombre: "Aula Tensión", area: "comercial" },
  { nombre: "Aula Anticáncer", area: "comercial" },
  { nombre: "Aula Psicoanálisis", area: "comercial" },
  { nombre: "Aula Culpa", area: "comercial" },
  { nombre: "Aula Duelo", area: "comercial" },
  { nombre: "Aula Fase Cero con Protocolo Antiparasitario", area: "comercial" },
  { nombre: "Definir temas de contenido para el mes", area: "comercial" },
  { nombre: 'Automatizar el "Recycling" de contenido (IA) - clips de cursos', area: "comercial" },
  { nombre: "Programar publicaciones del mes (Metricool)", area: "comercial" },
  { nombre: "Configurar más respuestas automáticas en Instagram", area: "comercial" },
  { nombre: "Crear Kit de Prensa y Landing Pages para Podcasts", area: "comercial" },
  { nombre: "Implementar Sistema de Afiliados", area: "comercial" },
  { nombre: "Montar Sistema de Repositorio de Contenidos", area: "comercial" },

  // ====== OPERATIVA ======
  { nombre: "Diseñar propuesta de formación para el Laboratorio", area: "operativa" },
  { nombre: "Contactar con Universidades para crear un Máster", area: "operativa" },
  { nombre: "Mejorar el banco de respuestas tipo para síntomas", area: "operativa" },
  { nombre: "Clonar voz con IA para consultas", area: "operativa" },
  { nombre: "Inventariar con transcripción todos los vídeos y audios existentes", area: "operativa" },
  { nombre: 'Mejorar el "Cerebro Digital" (IA) con vídeos del aula', area: "operativa" },
  { nombre: "Evento anual [RETIRO]", area: "operativa" },
  { nombre: "Mapa Microbiológico", area: "operativa" },
  { nombre: "IND Atención a pacientes [medicina, psicoanálisis]", area: "operativa" },
  { nombre: "Libro de Medicina", area: "operativa" },
  { nombre: "Libro de Psicoanálisis", area: "operativa" },

  // ====== ADMINISTRATIVA ======
  { nombre: "Crear BOT de Atención al Cliente para el equipo", area: "administrativa" },
  { nombre: "Crear procesos por cada puesto", area: "administrativa" },
  { nombre: "Escribir manual de funciones para el gestor de redes", area: "administrativa" },
  { nombre: "Redactar el Manual de Cultura y Operaciones", area: "administrativa" },
  { nombre: "Redactar protocolo de actuación ante crisis o emergencias", area: "administrativa" },
  { nombre: "Mejorar la Gestión de Proyectos con responsables", area: "administrativa" },
  { nombre: "Centralizar accesos del equipo (Gestor de Apps y Contraseñas)", area: "administrativa" },
  { nombre: "Escribir manual de funciones para facturación", area: "administrativa" },
  { nombre: "Mapa Cero", area: "administrativa" },
  { nombre: "Mapa Diagnóstico", area: "administrativa" },
  { nombre: "Mapa Sintomático", area: "administrativa" },
  { nombre: "Mapa Bioquímico", area: "administrativa" },
  { nombre: "Mapa SANA", area: "administrativa" },
  { nombre: "Gestión de tickets", area: "administrativa" },
  { nombre: "Laguna Time App", area: "administrativa" },

  // ====== FINANCIERA ======
  { nombre: "Presupuesto anual", area: "financiera" },
  { nombre: "Web de Suplementos", area: "financiera" },
];

export function buildEmpresaSeedProyectos(): Proyecto[] {
  const now = new Date().toISOString();
  return PROYECTOS_EMPRESA.map((p) => ({
    id: sid(),
    nombre: p.nombre,
    descripcion: null,
    area: p.area,
    creado: now,
    fechaInicio: null,
  }));
}
