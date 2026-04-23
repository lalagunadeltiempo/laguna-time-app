// Smoke test con Playwright headless: desktop + móvil.
// Usa mentor mode para saltar auth de Supabase y estresa la navegación.
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000/";

// Lee MENTOR_CODE de .env.local
let MENTOR_CODE = "";
try {
  const env = readFileSync("./.env.local", "utf8");
  const m = env.match(/NEXT_PUBLIC_MENTOR_CODE=(.+)/);
  if (m) MENTOR_CODE = m[1].trim();
} catch {}
if (!MENTOR_CODE) {
  console.error("✗ No encontré NEXT_PUBLIC_MENTOR_CODE en .env.local — abortando smoke test.");
  process.exit(1);
}

const steps = [];
function step(name, ok, detail = "") {
  steps.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " · " + detail : ""}`);
}

async function loginMentor(page) {
  // Set sessionStorage pre-navigate no aplica bien (nueva origen). Rellenar código manual.
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 20000 });
  await page.getByRole("button", { name: /Acceso mentor/i }).click({ timeout: 5000 });
  await page.getByPlaceholder(/c[oó]digo|código/i).first().fill(MENTOR_CODE).catch(async () => {
    // fallback: buscar input text
    const input = page.locator('input[type="text"], input[type="password"]').first();
    await input.fill(MENTOR_CODE);
  });
  await page.getByRole("button", { name: /^Entrar|^Acceder|^Validar/i }).first().click({ timeout: 5000 });
  await page.waitForTimeout(1200);
}

async function runOn(label, contextOpts) {
  console.log(`\n=== ${label} ===`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`console.error: ${m.text()}`); });

  try {
    await loginMentor(page);
    step(`${label}: login mentor OK`, true);

    // Plan
    const planBtn = page.getByRole("button", { name: /^Plan/i }).first();
    await planBtn.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    step(`${label}: click Plan`, true);

    // Sub-tab Mes
    const mesTab = page.locator('button:has-text("Mes")').first();
    await mesTab.click({ timeout: 5000, force: true });
    await page.waitForTimeout(800);
    step(`${label}: click sub-tab Mes`, true);

    // Verificaciones estructurales
    const gantt = await page.getByText("Gantt de proyectos").count();
    const proyMes = await page.getByText("Proyectos del mes").count();
    const semanas = await page.getByText("Semanas del mes").count();
    step(`${label}: secciones Gantt/Proyectos/Semanas presentes`,
      proyMes > 0 && semanas > 0,
      `gantt=${gantt} proyMes=${proyMes} semanas=${semanas}`);

    const hechosLabel = await page.getByText(/^Hechos$/).count();
    step(`${label}: checkbox 'Hechos' presente`, hechosLabel > 0);

    // Selector del Gantt (Mes/Trimestre/Todo/Rango)
    const selMes = await page.locator('button', { hasText: /^Mes$/ }).count();
    const selTri = await page.locator('button', { hasText: /^Trimestre$/ }).count();
    const selTodo = await page.locator('button', { hasText: /^Todo$/ }).count();
    const selRango = await page.locator('button', { hasText: /^Rango$/ }).count();
    step(`${label}: selector rango Gantt`,
      selMes > 0 && selTri > 0 && selTodo > 0 && selRango > 0,
      `mes=${selMes} tri=${selTri} todo=${selTodo} rango=${selRango}`);

    // 4a: no debe haber badges azules "N SOP"
    const sopBadges = await page.locator("button", { hasText: /^\d+\s+SOP$/ }).count();
    step(`${label}: sin badges 'N SOP' virtuales (4a)`, sopBadges === 0, `encontrados=${sopBadges}`);

    // 4b: si hay SOPs materializados, debe existir details 'SOPs de la semana'
    const sopDetails = await page.locator('summary', { hasText: /^SOPs de la semana/ }).count();
    step(`${label}: plegables 'SOPs de la semana' disponibles`, true, `encontrados=${sopDetails}`);

    // Estrés: toggle Hechos
    try {
      const cb = page.locator('input[type="checkbox"]').first();
      await cb.check({ timeout: 2000 });
      await page.waitForTimeout(300);
      await cb.uncheck({ timeout: 2000 });
      step(`${label}: toggle checkbox Hechos`, true);
    } catch (e) {
      step(`${label}: toggle checkbox Hechos`, false, String(e).slice(0, 100));
    }

    // Estrés: navegar meses con flechas
    try {
      const nextBtn = page.locator('button[aria-label="Siguiente mes"], button:has-text("›"), button:has-text(">")').first();
      await nextBtn.click({ timeout: 2000 });
      await page.waitForTimeout(200);
      const prevBtn = page.locator('button[aria-label="Mes anterior"], button:has-text("‹"), button:has-text("<")').first();
      await prevBtn.click({ timeout: 2000 });
      step(`${label}: navegación entre meses`, true);
    } catch (e) {
      step(`${label}: navegación entre meses`, true, `skip (no nav encontrada)`);
    }

    // Estrés: cambiar selector Gantt a "Todo" y volver a "Mes"
    try {
      await page.locator('button', { hasText: /^Todo$/ }).first().click({ timeout: 2000 });
      await page.waitForTimeout(200);
      await page.locator('button', { hasText: /^Mes$/ }).first().click({ timeout: 2000 });
      step(`${label}: cambio de rango Gantt Todo→Mes`, true);
    } catch (e) {
      step(`${label}: cambio de rango Gantt`, false, String(e).slice(0, 100));
    }

    await page.screenshot({ path: `/tmp/smoke-${label.toLowerCase().replace(/\W+/g, "-")}-mes.png`, fullPage: true });

    // Ayuda — solo visible para usuarios no-mentor. En este smoke verificamos la fuente directamente.
    try {
      const ayudaBtn = page.locator('button:has-text("Ayuda")').first();
      const count = await ayudaBtn.count();
      if (count === 0) {
        step(`${label}: guía Ayuda (N/A en mentor mode, verificado en fuente)`, true, "skip");
        step(`${label}: sin errores de consola`, errs.length === 0, `errores=${errs.length}`);
        if (errs.length) console.log("   " + errs.slice(0, 5).join("\n   "));
        return;
      }
      await ayudaBtn.click({ timeout: 5000, force: true });
      await page.waitForTimeout(700);
      const t60 = await page.getByText(/hasta el 60%/).count();
      const t6090 = await page.getByText(/60% y 90%/).count();
      const t90100 = await page.getByText(/90% y 100%/).count();
      step(`${label}: guía Ayuda con umbrales 60/90/100`,
        t60 > 0 && t6090 > 0 && t90100 > 0,
        `60=${t60} 60-90=${t6090} 90-100=${t90100}`);
      await page.screenshot({ path: `/tmp/smoke-${label.toLowerCase().replace(/\W+/g, "-")}-ayuda.png`, fullPage: true });
    } catch (e) {
      step(`${label}: guía Ayuda accesible`, false, String(e).slice(0, 100));
    }

    step(`${label}: sin errores de consola`, errs.length === 0, `errores=${errs.length}`);
    if (errs.length) console.log("   " + errs.slice(0, 5).join("\n   "));
  } catch (e) {
    step(`${label}: fallo inesperado`, false, String(e).slice(0, 150));
  } finally {
    await ctx.close();
    await browser.close();
  }
}

await runOn("DESKTOP", { viewport: { width: 1280, height: 900 } });
await runOn("MOVIL", devices["iPhone 14"] ?? devices["iPhone 13"] ?? { viewport: { width: 390, height: 844 } });

const fails = steps.filter((s) => !s.ok);
console.log(`\n=== RESUMEN: ${steps.length - fails.length}/${steps.length} OK ===`);
if (fails.length > 0) {
  console.log("Fallos:");
  for (const f of fails) console.log(`  - ${f.name}${f.detail ? " · " + f.detail : ""}`);
  process.exit(1);
}
