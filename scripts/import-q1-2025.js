/**
 * Importa Q1 2025 (enero/febrero/marzo) al árbol del usuario.
 *
 * Uso:
 *   1. Abre la app (https://laguna-time-app.vercel.app) autenticado.
 *   2. Abre la consola del navegador (DevTools → Console).
 *   3. Pega TODO este archivo y pulsa Enter.
 *
 * Qué hace:
 *   - Crea (o reutiliza) el árbol 2025: raíz + 4 ramas (Aula, Colaboración,
 *     Individual, Plan de Salud) + las hojas del CSV bajo la rama que toque.
 *   - UPSERT de un registro por fila con `periodoTipo: "mes"`,
 *     `periodoKey: "2025-MM"`, `valor: €` y `unidades: uds`.
 *   - Es idempotente: puedes ejecutarlo varias veces sin duplicar nodos ni
 *     registros (se matchean por nombre/anio/parent y por nodoId+periodo).
 *   - Guarda en localStorage y recarga la página. Al recargar, la app funde
 *     con la nube y sube todo (tardará unos segundos).
 *
 * Qué NO hace:
 *   - No toca el árbol 2026.
 *   - No toca los valores «Año pasado (cargar)» que ya hayas metido en 2026.
 *   - No borra hojas/ramas existentes en 2025 (solo añade y actualiza).
 */
(function importQ1_2025() {
  const STORAGE_KEY = "laguna-time-app";
  const YEAR = 2025;

  /** Filas del CSV: [rama, hoja, mes(1-12), unidades, euros]. */
  const CSV = [
    ["Aula", "Acidez", 1, 1, 60],
    ["Aula", "Acidez", 3, 39, 977],
    ["Aula", "Anticáncer", 2, 3, 150],
    ["Aula", "Antiestrés", 1, 4, 240],
    ["Aula", "Antiestrés", 2, 1, 60],
    ["Aula", "Cabello", 1, 3, 180],
    ["Aula", "Cabello", 2, 3, 180],
    ["Aula", "Cabello", 3, 4, 240],
    ["Aula", "Diarrea", 1, 1, 60],
    ["Aula", "Diarrea", 2, 1, 60],
    ["Aula", "Diarrea", 3, 22, 550],
    ["Aula", "Eje", 1, 1, 90],
    ["Aula", "Eje", 2, 2, 180],
    ["Aula", "Estreñimiento", 1, 1, 60],
    ["Aula", "Estreñimiento", 2, 40, 1035],
    ["Aula", "Estreñimiento", 3, 43, 1103.74],
    ["Aula", "Gases", 1, 1, 60],
    ["Aula", "Gases", 2, 2, 120],
    ["Aula", "Gases", 3, 76, 1925],
    ["Aula", "Helicobacter", 2, 3, 180],
    ["Aula", "Insomnio", 2, 85, 2200],
    ["Aula", "Insomnio", 3, 4, 200],
    ["Aula", "Mujer", 1, 4, 285.6],
    ["Aula", "Mujer", 2, 4, 280],
    ["Aula", "Psicoanálisis", 1, 70, 1927.63],
    ["Aula", "Psicoanálisis", 2, 67, 1942.36],
    ["Aula", "Psicoanálisis", 3, 43, 1232.36],
    ["Aula", "Sobrepeso", 1, 1, 80],
    ["Aula", "Sobrepeso", 2, 4, 320],
    ["Aula", "Zrt (Pruebas de Laboratorio)", 2, 1, 205],
    ["Colaboración", "Coach", 3, 1, 689.7],
    ["Colaboración", "El Sendero", 2, 1, 6767],
    ["Colaboración", "El Sendero", 3, 1, 644.93],
    ["Colaboración", "Prompter", 1, 1, 1140],
    ["Colaboración", "Teletest", 1, 1, 2180.94],
    ["Colaboración", "YouTube", 1, 1, 77.62],
    ["Colaboración", "YouTube", 2, 1, 478.05],
    ["Individual", "Medicina", 1, 3, 880],
    ["Individual", "Medicina", 2, 4, 730],
    ["Individual", "Medicina", 3, 3, 900],
    ["Individual", "Música", 1, 1, 230],
    ["Individual", "Psicoanálisis", 1, 19, 2685],
    ["Individual", "Psicoanálisis", 2, 7, 995],
    ["Individual", "Psicoanálisis", 3, 6, 900],
    ["Plan de Salud", "Fase Clínica", 1, 63, 36095],
    ["Plan de Salud", "Fase Clínica", 2, 70, 40735],
    ["Plan de Salud", "Fase Clínica", 3, 34, 20448],
  ];

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    alert("No encuentro el estado en localStorage. Asegúrate de estar en la URL de la app y haber cargado algo antes.");
    return;
  }
  const state = JSON.parse(raw);
  if (!state.arbol) state.arbol = { nodos: [], registros: [], configs: [], reflexiones: [] };
  if (!Array.isArray(state.arbol.nodos)) state.arbol.nodos = [];
  if (!Array.isArray(state.arbol.registros)) state.arbol.registros = [];
  if (!Array.isArray(state.arbol.configs)) state.arbol.configs = [];

  const genId = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function findOrCreateNodo({ anio, parentId, nombre, tipo, cadencia, relacionConPadre, metaValor, metaUnidad }) {
    const found = state.arbol.nodos.find(
      (n) =>
        n.anio === anio &&
        (n.parentId ?? null) === (parentId ?? null) &&
        n.nombre === nombre,
    );
    if (found) return { nodo: found, created: false };
    const orden =
      state.arbol.nodos
        .filter((n) => n.anio === anio && (n.parentId ?? null) === (parentId ?? null))
        .reduce((mx, n) => Math.max(mx, n.orden), -1) + 1;
    const now = new Date().toISOString();
    const nodo = {
      id: genId(),
      anio,
      parentId,
      orden,
      nombre,
      tipo: tipo ?? "palanca",
      cadencia: cadencia ?? "anual",
      relacionConPadre: relacionConPadre ?? "suma",
      contadorModo: "manual",
      creado: now,
    };
    if (metaValor !== undefined) nodo.metaValor = metaValor;
    if (metaUnidad) nodo.metaUnidad = metaUnidad;
    state.arbol.nodos.push(nodo);
    return { nodo, created: true };
  }

  const raiz2026 = state.arbol.nodos.find(
    (n) => n.anio === 2026 && !n.parentId && n.cadencia === "anual",
  );
  const metaUnidad = raiz2026?.metaUnidad ?? "€";
  const nombreRaiz = raiz2026?.nombre ?? "Facturación";

  const { nodo: raiz } = findOrCreateNodo({
    anio: YEAR,
    parentId: undefined,
    nombre: nombreRaiz,
    tipo: "resultado",
    cadencia: "anual",
    relacionConPadre: "explica",
    metaValor: 0,
    metaUnidad,
  });

  const ensureConfig = () => {
    if (!state.arbol.configs.some((c) => c.anio === YEAR)) {
      state.arbol.configs.push({ anio: YEAR, semanasNoActivas: [] });
    }
  };
  ensureConfig();

  const ramasSet = new Set(CSV.map((r) => r[0]));
  const ramasMap = new Map();
  let ramasCreadas = 0;
  for (const nr of ramasSet) {
    const { nodo, created } = findOrCreateNodo({
      anio: YEAR,
      parentId: raiz.id,
      nombre: nr,
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      metaValor: 0,
      metaUnidad,
    });
    ramasMap.set(nr, nodo);
    if (created) ramasCreadas += 1;
  }

  const hojasMap = new Map();
  let hojasCreadas = 0;
  for (const [rama, hoja] of CSV) {
    const k = `${rama}|${hoja}`;
    if (hojasMap.has(k)) continue;
    const parent = ramasMap.get(rama);
    const { nodo, created } = findOrCreateNodo({
      anio: YEAR,
      parentId: parent.id,
      nombre: hoja,
      tipo: "palanca",
      cadencia: "anual",
      relacionConPadre: "suma",
      metaUnidad,
    });
    hojasMap.set(k, nodo);
    if (created) hojasCreadas += 1;
  }

  let regsNuevos = 0;
  let regsActualizados = 0;
  const ahora = new Date().toISOString();
  for (const [rama, hoja, mes, uds, eur] of CSV) {
    const nodo = hojasMap.get(`${rama}|${hoja}`);
    const periodoKey = `${YEAR}-${String(mes).padStart(2, "0")}`;
    const existing = state.arbol.registros.find(
      (r) =>
        r.nodoId === nodo.id &&
        r.periodoTipo === "mes" &&
        r.periodoKey === periodoKey,
    );
    if (existing) {
      existing.valor = eur;
      existing.unidades = uds;
      existing.actualizado = ahora;
      regsActualizados += 1;
    } else {
      state.arbol.registros.push({
        id: genId(),
        nodoId: nodo.id,
        periodoTipo: "mes",
        periodoKey,
        valor: eur,
        unidades: uds,
        creado: ahora,
        actualizado: ahora,
      });
      regsNuevos += 1;
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const msg =
    `Importación Q1 ${YEAR} lista:\n` +
    `  • Ramas creadas: ${ramasCreadas}\n` +
    `  • Hojas creadas: ${hojasCreadas}\n` +
    `  • Registros nuevos: ${regsNuevos}\n` +
    `  • Registros actualizados: ${regsActualizados}\n\n` +
    `Recargo la página para que la app funda con la nube y lo suba.`;
  console.log(msg);
  alert(msg);
  location.reload();
})();
