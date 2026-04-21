import { generateId } from "./store";
import type { PlantillaProceso, PasoPlantilla } from "./types";

const TOOL_PATTERNS: [RegExp, string][] = [
  [/\bPipe\b/i, "Pipe"],
  [/\bTOTÓ\b/i, "TOTÓ"],
  [/\bChatGPT\b/i, "ChatGPT"],
  [/\bTFK\b|\bThinkific\b/i, "TFK"],
  [/\bNotion\b/i, "Notion"],
  [/\bJotform\b/i, "Jotform"],
  [/\b[Ee]xcel\b/, "Excel"],
  [/\bSuper\.so\b/i, "Super.so"],
  [/\bSlack\b/i, "Slack"],
  [/\bWhatsApp\b|\bWhatsapp\b/i, "WhatsApp"],
  [/\bMotor\b/i, "Motor"],
  [/\bFlaticon\b/i, "Flaticon"],
  [/\bPDF\b/, "PDF"],
];

function detectTools(text: string): string[] {
  const found = new Set<string>();
  for (const [re, name] of TOOL_PATTERNS) {
    if (re.test(text)) found.add(name);
  }
  return [...found];
}

function detectTipo(line: string): PasoPlantilla["tipo"] {
  if (/^(si |en caso|en el caso|cuando no|si no )/i.test(line.trim())) return "condicional";
  if (/\b(atenci[oó]n|importante|cuidado|ojo)\b/i.test(line.toLowerCase())) return "advertencia";
  if (/^(\(|nota:|tip:|a veces|habitualmente|debido a|no suele)/i.test(line.trim())) return "nota";
  return "accion";
}

const SOP_SECTION_KEYS: Record<string, "objetivo" | "disparador" | "herramientas" | "excepciones"> = {
  objetivo: "objetivo", para: "objetivo", "para qué": "objetivo",
  disparador: "disparador", frecuencia: "disparador", cuándo: "disparador", cuando: "disparador",
  herramientas: "herramientas", "herramientas necesarias": "herramientas", software: "herramientas",
  excepciones: "excepciones", "manejo de excepciones": "excepciones", errores: "excepciones", "si falla": "excepciones",
};

export function parseMarkdownProcesos(
  markdown: string,
  responsable = "Gabi",
  proyectoId: string | null = null,
): PlantillaProceso[] {
  const plantillas: PlantillaProceso[] = [];
  const sections = markdown.split(/^### /gm).filter(Boolean);

  for (const section of sections) {
    const lines = section.split("\n");
    const nombre = lines[0].trim();
    if (!nombre) continue;

    const pasos: PasoPlantilla[] = [];
    let orden = 1;
    const allTools = new Set<string>();
    let objetivo = "";
    let disparador = "";
    let herramientasTxt = "";
    let excepciones = "";

    for (let i = 1; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line || line.startsWith("---")) continue;

      const sectionMatch = line.match(/^\*\*([^*]+)\*\*\s*:\s*(.*)$/);
      if (sectionMatch) {
        const key = sectionMatch[1].toLowerCase().trim();
        const value = sectionMatch[2].trim();
        const mapped = SOP_SECTION_KEYS[key];
        if (mapped === "objetivo") { objetivo = value; continue; }
        if (mapped === "disparador") { disparador = value; continue; }
        if (mapped === "herramientas") { herramientasTxt = value; continue; }
        if (mapped === "excepciones") { excepciones = value; continue; }
      }

      line = line.replace(/^\d+\.\s+/, "");
      const isSubItem = /^[-•]\s+/.test(lines[i].trim());
      line = line.replace(/^[-•]\s+/, "");
      if (!line) continue;

      const tools = detectTools(line);
      tools.forEach((t) => allTools.add(t));
      const tipo = detectTipo(line);

      let minutosEstimados: number | null = null;
      const minMatch = line.match(/\[(\d+)\s*min\]\s*$/);
      if (minMatch) { minutosEstimados = parseInt(minMatch[1]); line = line.replace(/\s*\[\d+\s*min\]\s*$/, ""); }

      const paso: PasoPlantilla = {
        id: generateId(), orden: orden++,
        nombre: line.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"),
        descripcion: "", herramientas: tools, tipo, minutosEstimados,
      };

      if (tipo === "condicional") paso.condicion = line.replace(/\*\*/g, "");
      if (tipo === "advertencia") paso.advertencia = line.replace(/\*\*/g, "");
      if (tipo === "nota") paso.notas = line.replace(/\*\*/g, "");

      if (isSubItem && pasos.length > 0) {
        const parent = pasos[pasos.length - 1];
        parent.descripcion = parent.descripcion ? `${parent.descripcion}\n${line}` : line;
        continue;
      }

      pasos.push(paso);
    }

    if (pasos.length === 0) continue;

    const herramientasFromText = herramientasTxt ? herramientasTxt.split(",").map((h) => h.trim()).filter(Boolean) : [];
    const allHerramientas = [...new Set([...allTools, ...herramientasFromText])];

    plantillas.push({
      id: generateId(), nombre, area: "operativa",
      objetivo, disparador,
      programacion: null,
      proyectoId, resultadoId: null, responsableDefault: responsable,
      pasos, herramientas: allHerramientas,
      excepciones, dependeDeIds: [],
      creado: new Date().toISOString(),
    });
  }

  return plantillas;
}
