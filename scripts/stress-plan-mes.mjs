// Stress test para los cambios de Plan Mes / Gantt / umbrales de ritmo.
// Reimplementa las 3 funciones puras tal como quedaron en el código,
// con muchos casos border.

/* ============================================================
   1) Umbrales de ritmo
   ============================================================ */
function clasificar(ratio) {
  if (ratio > 1) return "imposible";
  if (ratio > 0.9) return "rojo";
  if (ratio > 0.6) return "amarillo";
  return "verde";
}

const casosRitmo = [
  { ratio: 0.0, esperado: "verde", desc: "ratio 0" },
  { ratio: 0.30, esperado: "verde", desc: "ratio 30% (antes amarillo)" },
  { ratio: 0.6, esperado: "verde", desc: "ratio 60% exacto (borde verde)" },
  { ratio: 0.60001, esperado: "amarillo", desc: "ratio justo por encima de 60" },
  { ratio: 0.72, esperado: "amarillo", desc: "NutriWebinars 72%" },
  { ratio: 0.9, esperado: "amarillo", desc: "ratio 90% exacto (borde amarillo)" },
  { ratio: 0.9001, esperado: "rojo", desc: "ratio justo por encima de 90" },
  { ratio: 0.95, esperado: "rojo", desc: "ratio 95%" },
  { ratio: 1.0, esperado: "rojo", desc: "ratio 100% exacto (aún rojo)" },
  { ratio: 1.0001, esperado: "imposible", desc: "ratio justo por encima de 100" },
  { ratio: 2, esperado: "imposible", desc: "ratio 200%" },
  { ratio: 0.7, esperado: "amarillo", desc: "70% (antes era borde rojo, ahora amarillo)" },
];

let pass = 0, fail = 0;
console.log("\n=== 1) Umbrales de ritmo ===");
for (const c of casosRitmo) {
  const got = clasificar(c.ratio);
  const ok = got === c.esperado;
  console.log(`${ok ? "✓" : "✗"} ${c.desc}: ratio=${c.ratio} → ${got} (esperado ${c.esperado})`);
  ok ? pass++ : fail++;
}

/* ============================================================
   2) rangesOverlap (Gantt)
   ============================================================ */
function rangesOverlap(aStart, aEnd, rangeStart, rangeEnd) {
  if (!rangeStart || !rangeEnd) return true;
  const s = aStart ?? aEnd ?? null;
  const e = aEnd ?? aStart ?? null;
  if (!s && !e) return false;
  const itemStart = s ?? rangeStart;
  const itemEnd = e ?? rangeEnd;
  return itemStart <= rangeEnd && itemEnd >= rangeStart;
}

// Abril 2026 = 2026-04-01 a 2026-04-30
const R = { start: "2026-04-01", end: "2026-04-30" };

const casosOverlap = [
  { a: ["2026-04-10", "2026-04-20"], r: R, esperado: true,  desc: "completamente dentro" },
  { a: ["2026-03-15", "2026-04-05"], r: R, esperado: true,  desc: "atraviesa borde inicio" },
  { a: ["2026-04-25", "2026-05-05"], r: R, esperado: true,  desc: "atraviesa borde fin" },
  { a: ["2026-02-01", "2026-02-28"], r: R, esperado: false, desc: "completamente antes" },
  { a: ["2026-06-01", "2026-06-30"], r: R, esperado: false, desc: "completamente después" },
  { a: ["2026-04-01", "2026-04-01"], r: R, esperado: true,  desc: "un solo día en borde inicio" },
  { a: ["2026-04-30", "2026-04-30"], r: R, esperado: true,  desc: "un solo día en borde fin" },
  { a: [null, "2026-04-15"],         r: R, esperado: true,  desc: "solo fin dentro" },
  { a: ["2026-04-15", null],         r: R, esperado: true,  desc: "solo inicio dentro" },
  { a: [null, null],                 r: R, esperado: false, desc: "sin fechas (out)" },
  { a: ["2026-04-10", "2026-04-05"], r: R, esperado: true,  desc: "fechas invertidas (Metodología)" },
  { a: ["2026-04-10", "2026-04-20"], r: { start: undefined, end: undefined }, esperado: true, desc: "rango 'Todo' no filtra" },
  { a: ["2026-02-01", "2026-06-30"], r: R, esperado: true,  desc: "rango padre que engloba el mes" },
];

console.log("\n=== 2) rangesOverlap (Gantt filter) ===");
for (const c of casosOverlap) {
  const [s, e] = c.a;
  const got = rangesOverlap(s, e, c.r.start, c.r.end);
  const ok = got === c.esperado;
  console.log(`${ok ? "✓" : "✗"} ${c.desc}: [${s}..${e}] vs [${c.r.start}..${c.r.end}] → ${got} (esperado ${c.esperado})`);
  ok ? pass++ : fail++;
}

/* ============================================================
   3) Week placement (ancla fin > inicio) — simula logica PlanMes
   ============================================================ */
function getWeeksOfMonth(year, month0) {
  const firstDay = new Date(year, month0, 1);
  const lastDay = new Date(year, month0 + 1, 0);
  const dow = firstDay.getDay() || 7;
  const firstMonday = new Date(firstDay);
  firstMonday.setDate(firstDay.getDate() - dow + 1);
  const weeks = [];
  const cur = new Date(firstMonday);
  let idx = 1;
  while (cur.getTime() <= lastDay.getTime()) {
    const mon = new Date(cur);
    const sun = new Date(cur);
    sun.setDate(sun.getDate() + 6);
    weeks.push({
      index: idx,
      mondayMs: mon.getTime(),
      sundayMs: sun.getTime() + 86400000 - 1,
      mondayIso: mon.toISOString().slice(0, 10),
      sundayIso: new Date(sun.getTime()).toISOString().slice(0, 10),
    });
    cur.setDate(cur.getDate() + 7);
    idx++;
  }
  return weeks;
}

function toMs(dStr) {
  if (!dStr) return null;
  const d = new Date(dStr + "T12:00:00").getTime();
  return Number.isFinite(d) ? d : null;
}

function placeEntregable(ent, weeks, monthStart, monthEnd, nowMsForEstado) {
  // Simula fechaEfectivaEntregable (solo "propia", ignora herencia en este test)
  const finMs = toMs(ent.fechaLimite);
  const iniMs = toMs(ent.fechaInicio);
  const anclaMs = finMs ?? iniMs;

  let inMonth = false;
  if (anclaMs != null && anclaMs >= monthStart && anclaMs <= monthEnd) inMonth = true;
  if (!inMonth && iniMs != null && finMs != null) {
    if (iniMs <= monthEnd && finMs >= monthStart) inMonth = true;
  }
  if (!inMonth && ent.estado === "en_proceso" && iniMs != null && iniMs < monthStart) {
    inMonth = true;
  }
  if (!inMonth && (ent.estado === "en_proceso" || ent.estado === "planificado") && anclaMs == null) {
    inMonth = true;
  }
  if (!inMonth) return { semana: "fuera" };

  const nivel = ent.planNivel;
  if (nivel === "mes" || nivel === "trimestre") return { semana: "sin-asignar-por-nivel" };
  if (anclaMs == null) return { semana: "sin-asignar-sin-fecha" };

  for (const w of weeks) {
    if (anclaMs >= w.mondayMs && anclaMs <= w.sundayMs) {
      return { semana: w.index, wEntry: w };
    }
  }
  return { semana: "sin-asignar-fuera-semanas" };
}

// Abril 2026
const Y = 2026, M = 3; // April (0-indexed)
const weeks = getWeeksOfMonth(Y, M);
const monthStart = new Date(Y, M, 1).getTime();
const monthEnd = new Date(Y, M + 1, 0, 23, 59, 59).getTime();

console.log("\n=== 3) Week placement (ancla fin > inicio) — Abril 2026 ===");
console.log(`Semanas: ${weeks.map(w => `S${w.index}[${w.mondayIso}..${w.sundayIso}]`).join(" | ")}`);

const casosPlace = [
  // Caso real del bug
  {
    desc: "Metodología de Estudio (inicio=08/05, fin=25/04) → S4 de Abril (20-26)",
    ent: { fechaInicio: "2026-05-08", fechaLimite: "2026-04-25", estado: "planificado" },
    esperadoIdx: 4,
  },
  {
    desc: "Solo fin en el mes → cae en su semana",
    ent: { fechaInicio: null, fechaLimite: "2026-04-10", estado: "planificado" },
    esperadoIdx: 2,
  },
  {
    desc: "Solo inicio en el mes → cae en su semana (fallback)",
    ent: { fechaInicio: "2026-04-10", fechaLimite: null, estado: "planificado" },
    esperadoIdx: 2,
  },
  {
    desc: "Fin en lunes (borde inclusivo)",
    ent: { fechaInicio: null, fechaLimite: "2026-04-20", estado: "planificado" },
    esperadoIdx: 4,
  },
  {
    desc: "Fin en domingo (borde inclusivo)",
    ent: { fechaInicio: null, fechaLimite: "2026-04-26", estado: "planificado" },
    esperadoIdx: 4,
  },
  {
    desc: "Fin en mayo (fuera del mes, pero inicio en abril) → inMonth por rango que atraviesa; ancla (fin=mayo) no cae en ninguna semana de abril → sin asignar",
    ent: { fechaInicio: "2026-04-10", fechaLimite: "2026-05-15", estado: "planificado" },
    esperado: "sin-asignar-fuera-semanas",
  },
  {
    desc: "Sin fechas + en_proceso → sin asignar",
    ent: { fechaInicio: null, fechaLimite: null, estado: "en_proceso" },
    esperado: "sin-asignar-sin-fecha",
  },
  {
    desc: "Sin fechas + a_futuro → fuera del mes",
    ent: { fechaInicio: null, fechaLimite: null, estado: "a_futuro" },
    esperado: "fuera",
  },
  {
    desc: "Fin en febrero (fuera, no atraviesa abril) → fuera",
    ent: { fechaInicio: null, fechaLimite: "2026-02-10", estado: "planificado" },
    esperado: "fuera",
  },
  {
    desc: "Arrastrado: en_proceso con inicio anterior → se considera en mes, ancla=fin vuelve a febrero → sin asignar fuera semanas",
    ent: { fechaInicio: "2026-02-01", fechaLimite: "2026-02-10", estado: "en_proceso" },
    esperado: "sin-asignar-fuera-semanas",
  },
  {
    desc: "planNivel=mes → sin asignar (aunque tenga fecha)",
    ent: { fechaInicio: null, fechaLimite: "2026-04-10", estado: "planificado", planNivel: "mes" },
    esperado: "sin-asignar-por-nivel",
  },
];

for (const c of casosPlace) {
  const res = placeEntregable(c.ent, weeks, monthStart, monthEnd);
  let ok;
  if (c.esperadoIdx != null) ok = res.semana === c.esperadoIdx;
  else ok = res.semana === c.esperado;
  const resumen = typeof res.semana === "number"
    ? `S${res.semana} (${res.wEntry.mondayIso}..${res.wEntry.sundayIso})`
    : res.semana;
  console.log(`${ok ? "✓" : "✗"} ${c.desc} → ${resumen}`);
  ok ? pass++ : fail++;
}

/* ============================================================
   Resumen
   ============================================================ */
console.log(`\n=== RESUMEN: ${pass} ok, ${fail} fallos ===`);
process.exit(fail > 0 ? 1 : 0);
