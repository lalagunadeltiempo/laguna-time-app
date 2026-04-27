"use client";

/**
 * Render de markdown ligero usado en las notas (NotasSection).
 *
 * Subset soportado:
 *  - **negrita** y *cursiva* / _cursiva_
 *  - # H1, ## H2, ### H3 (al inicio de línea)
 *  - listas con "- " o "* " al inicio de línea (consecutivas se agrupan en <ul>)
 *  - enlaces [texto](https://…)
 *  - párrafos separados por línea en blanco; saltos simples se respetan con <br />
 *
 * No soporta: tablas, code blocks, imágenes, blockquote, etc. La idea es ofrecer
 * "edición mínima" sin meter una dependencia de markdown completa.
 */

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);
}

function renderInline(line: string): string {
  let out = escapeHtml(line);
  // Links [texto](url) — tras el escape, los corchetes/paréntesis siguen literales.
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent underline hover:opacity-80">$1</a>',
  );
  // **negrita** (greedy mínimo)
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // *cursiva* — simple, no anidada con **; al haber procesado bold antes, los
  // asteriscos restantes son cursivas.
  out = out.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  // _cursiva_ — sólo si está delimitada por non-word
  out = out.replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1<em>$2</em>");
  return out;
}

function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      closeList();
      out.push("<div class=\"h-2\"></div>");
      continue;
    }
    if (trimmed.startsWith("### ")) {
      closeList();
      out.push(`<h3 class="mt-1 text-sm font-semibold text-foreground">${renderInline(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      closeList();
      out.push(`<h2 class="mt-1 text-base font-semibold text-foreground">${renderInline(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith("# ")) {
      closeList();
      out.push(`<h1 class="mt-1 text-lg font-bold text-foreground">${renderInline(trimmed.slice(2))}</h1>`);
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        out.push("<ul class=\"ml-4 list-disc space-y-0.5\">");
        inList = true;
      }
      out.push(`<li>${renderInline(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    closeList();
    out.push(`<p class="leading-relaxed">${renderInline(raw)}</p>`);
  }
  closeList();
  return out.join("");
}

export function MarkdownView({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={`text-sm text-foreground sm:text-xs ${className ?? ""}`}
      // El HTML está escapado en escapeHtml() y sólo se inyectan etiquetas
      // generadas por nosotros. Las regex no toleran HTML del usuario.
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}

/**
 * Devuelve la primera línea no vacía del texto, sin marcas markdown,
 * truncada a `max` chars. Útil para previews colapsadas cuando no hay título.
 */
export function previewFromMarkdown(text: string, max = 80): string {
  for (const raw of text.split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    const cleaned = t
      .replace(/^#{1,6}\s+/, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^[-*]\s+/, "");
    if (cleaned.length <= max) return cleaned;
    return cleaned.slice(0, max).trimEnd() + "…";
  }
  return "";
}
