import type { PlantillaProceso } from "./types";
import { AREAS_EMPRESA } from "./types";
import { progLabel } from "./sop-scheduler";
import { jsPDF } from "jspdf";

const AREA_LABELS: Record<string, string> = Object.fromEntries(AREAS_EMPRESA.map((a) => [a.id, a.label]));

export function sopToPDF(plantillas: PlantillaProceso[], filename: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const maxW = pageW - margin * 2;
  let y = margin;

  function checkPage(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function heading(text: string, size: number, color: [number, number, number] = [30, 30, 30]) {
    checkPage(size + 4);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont("helvetica", "bold");
    doc.text(text, margin, y);
    y += size * 0.5 + 2;
  }

  function body(text: string, opts?: { bold?: boolean; color?: [number, number, number]; indent?: number }) {
    const indent = opts?.indent ?? 0;
    doc.setFontSize(9);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setTextColor(...(opts?.color ?? [60, 60, 60]));
    const lines = doc.splitTextToSize(text, maxW - indent);
    checkPage(lines.length * 4 + 2);
    doc.text(lines, margin + indent, y);
    y += lines.length * 4;
  }

  function separator() {
    checkPage(6);
    y += 2;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  }

  // Title page
  heading("Laguna Time App", 20, [217, 119, 6]);
  heading("Manual de Procesos (SOPs)", 14);
  body(`${plantillas.length} procedimientos operativos estándar`);
  body(`Generado el ${new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}`);
  y += 6;

  // Group by area
  const byArea = new Map<string, PlantillaProceso[]>();
  for (const pl of plantillas) {
    const key = pl.area;
    if (!byArea.has(key)) byArea.set(key, []);
    byArea.get(key)!.push(pl);
  }

  for (const [areaId, sops] of byArea) {
    separator();
    heading(`${AREA_LABELS[areaId] ?? areaId} (${sops.length})`, 13, [120, 80, 200]);
    y += 2;

    for (const pl of sops) {
      checkPage(20);
      heading(pl.nombre, 11);

      if (pl.objetivo) body(`Objetivo: ${pl.objetivo}`, { bold: true });

      const meta: string[] = [`Responsable: ${pl.responsableDefault}`];
      if (pl.programacion) meta.push(`Frecuencia: ${progLabel(pl.programacion)}`);
      if (pl.disparador) meta.push(`Disparador: ${pl.disparador}`);
      if (pl.herramientas.length > 0) meta.push(`Herramientas: ${pl.herramientas.join(", ")}`);
      body(meta.join("  ·  "), { color: [100, 100, 100] });
      y += 2;

      for (let i = 0; i < pl.pasos.length; i++) {
        const p = pl.pasos[i];
        const prefix = p.tipo === "condicional" ? "⚡ " : p.tipo === "advertencia" ? "⚠ " : p.tipo === "nota" ? "ℹ " : "";
        const min = p.minutosEstimados !== null ? ` [${p.minutosEstimados} min]` : "";
        body(`${i + 1}. ${prefix}${p.nombre}${min}`, { indent: 4 });
      }

      if (pl.excepciones) {
        y += 2;
        body(`Excepciones: ${pl.excepciones}`, { color: [180, 60, 60], indent: 4 });
      }

      y += 4;
    }
  }

  doc.save(filename);
}

export function downloadPDF(plantillas: PlantillaProceso[], filename = "SOPs-Laguna-Time-App.pdf") {
  sopToPDF(plantillas, filename);
}
