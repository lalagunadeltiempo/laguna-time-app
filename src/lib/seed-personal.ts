import type { Proyecto, Resultado, Entregable, TipoEntregable, Area } from "./types";

let _counter = 0;
function sid() {
  _counter++;
  return `seed${Date.now().toString(36)}${_counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

interface EntDef { nombre: string; tipo: TipoEntregable }
interface ResDef { nombre: string; entregables: EntDef[] }
interface ProjDef { nombre: string; area: Area; resultados: ResDef[] }

function e(nombre: string, tipo: TipoEntregable = "raw"): EntDef { return { nombre, tipo }; }
function sop(nombre: string): EntDef { return { nombre, tipo: "a-sop" }; }

const PROYECTOS: ProjDef[] = [
  // ====== ÁREA FÍSICO ======
  {
    nombre: "Cuerpo", area: "fisico",
    resultados: [
      { nombre: "Yoga", entregables: [sop("Sesión de Bikram")] },
      { nombre: "Ritual nocturno", entregables: [sop("Cierre de día")] },
      { nombre: "Comida y bebida", entregables: [e("Caldo de Huesos"), e("Agua con Gas"), e("Kombucha")] },
    ],
  },
  {
    nombre: "Casa", area: "fisico",
    resultados: [
      { nombre: "Casina", entregables: [e("Obra")] },
    ],
  },
  {
    nombre: "Dinero", area: "fisico",
    resultados: [
      { nombre: "Efectivo", entregables: [sop("Euros")] },
      { nombre: "Oro", entregables: [e("Joyas familiares")] },
      { nombre: "Ahorro", entregables: [sop("Viajes"), sop("Imprevistos")] },
    ],
  },

  // ====== ÁREA EMOCIONAL ======
  {
    nombre: "Familia", area: "emocional",
    resultados: [
      { nombre: "Mamay", entregables: [e("Fans de El Corte Inglés"), sop("Cumpleaños")] },
      { nombre: "Pa", entregables: [sop("Cumpleaños")] },
      { nombre: "Goosen", entregables: [sop("Cumpleaños")] },
      { nombre: "Claudia", entregables: [sop("Cumpleaños")] },
      { nombre: "Dana", entregables: [sop("Cumpleaños")] },
      { nombre: "Mateo", entregables: [sop("Cumpleaños")] },
      { nombre: "Toni", entregables: [sop("Cumpleaños")] },
      { nombre: "Primos", entregables: [sop("Cumpleaños")] },
    ],
  },
  {
    nombre: "Beltrán", area: "emocional",
    resultados: [
      { nombre: "Miércoles de cine", entregables: [sop("Sesión de cine")] },
      { nombre: "Sábados de ajedrez", entregables: [sop("Sesión de ajedrez")] },
      { nombre: "Celebraciones", entregables: [e("Aniversario"), sop("Cumpleaños")] },
    ],
  },
  {
    nombre: "Equipo", area: "emocional",
    resultados: [
      { nombre: "Ester", entregables: [sop("Cumpleaños")] },
      { nombre: "Patri", entregables: [sop("Cumpleaños")] },
      { nombre: "Helen", entregables: [sop("Cumpleaños")] },
    ],
  },
  {
    nombre: "Amigos", area: "emocional",
    resultados: [
      { nombre: "Martita y Martas", entregables: [sop("Cumpleaños")] },
      { nombre: "Fer", entregables: [sop("Cumpleaños")] },
      { nombre: "Luis", entregables: [sop("Cumpleaños")] },
      { nombre: "Tania", entregables: [sop("Cumpleaños")] },
      { nombre: "Rut", entregables: [sop("Cumpleaños")] },
      { nombre: "Marian", entregables: [sop("Cumpleaños")] },
      { nombre: "Ana V", entregables: [sop("Cumpleaños")] },
      { nombre: "Bea", entregables: [sop("Cumpleaños")] },
      { nombre: "Tere", entregables: [sop("Cumpleaños")] },
      { nombre: "Rubén", entregables: [sop("Cumpleaños")] },
      { nombre: "Magos", entregables: [sop("Reuniones online"), sop("Escapadas")] },
    ],
  },

  // ====== ÁREA MENTAL ======
  {
    nombre: "Aprendizaje", area: "mental",
    resultados: [
      { nombre: "Libros", entregables: [sop("Libro")] },
      { nombre: "Cuadernos", entregables: [sop("Cuaderno")] },
    ],
  },

  // ====== ÁREA ESPIRITUAL ======
  {
    nombre: "Práctica", area: "espiritual",
    resultados: [
      { nombre: "Dados", entregables: [sop("Mensaje Recibido")] },
      { nombre: "Experiencias", entregables: [sop("Experiencia")] },
    ],
  },
];

export function buildPersonalSeedData(): {
  proyectos: Proyecto[];
  resultados: Resultado[];
  entregables: Entregable[];
} {
  const now = new Date().toISOString();
  const proyectos: Proyecto[] = [];
  const resultados: Resultado[] = [];
  const entregables: Entregable[] = [];

  for (const proj of PROYECTOS) {
    const proyectoId = sid();
    proyectos.push({
      id: proyectoId,
      nombre: proj.nombre,
      descripcion: null,
      area: proj.area,
      creado: now,
      fechaInicio: null,
    });

    for (const res of proj.resultados) {
      const resultadoId = sid();
      resultados.push({
        id: resultadoId,
        nombre: res.nombre,
        descripcion: null,
        proyectoId,
        creado: now,
        semana: null,
        fechaLimite: null,
        fechaInicio: null,
        diasEstimados: null,
      });

      for (const ent of res.entregables) {
        entregables.push({
          id: sid(),
          nombre: ent.nombre,
          resultadoId,
          tipo: ent.tipo,
          plantillaId: null,
          diasEstimados: 0,
          diasHechos: 0,
          esDiaria: false,
          responsable: "Gabi",
          estado: "a_futuro",
          creado: now,
          semana: null,
          fechaLimite: null,
          fechaInicio: null,
        });
      }
    }
  }

  return { proyectos, resultados, entregables };
}
