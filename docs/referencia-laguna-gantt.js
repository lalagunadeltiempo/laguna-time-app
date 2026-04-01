// ==========================================
// CONFIGURACIÓN GLOBAL (¡No borrar!)
// ==========================================
const MI_NOMBRE = "Gabi"; 

const HOJA_PRINCIPAL = "Plan";
const HOJA_GANTT_ACTUAL = "Gantt Actual";
const HOJA_GANTT_TOTAL = "Gantt Total";
const HOJA_AGENDA = "Agenda Hoy";
const HOJA_EQUIPO = "Equipo";
const HOJA_HISTORICO = "Histórico";
const HOJA_VACACIONES = "Vacaciones";

const FECHA_HOY = new Date(); 
FECHA_HOY.setHours(12,0,0,0); // Truco Anti-Zonas horarias

// === PALETA DE COLORES ===
const COLOR_A_FUTURO = "#ffffff";   
const COLOR_EN_PROCESO = "#fdf3e8"; 
const COLOR_EN_ESPERA = "#fbe5e5";  
const COLOR_HECHO = "#e6f2fa";      

const COLOR_MADRE_PLAN = "#d9ead3"; 
const COLOR_MADRE_ACTIVA = "#d9ead3"; 
const COLOR_MADRE_INACTIVA = "#f4f9f1"; 

const COLOR_FUTURO_GANTT = "#f5f5f5"; 

const COLOR_ZEBRA_1 = "#ffffff";    
const COLOR_ZEBRA_2 = "#f8f9fa";    
const COLOR_FIN_SEMANA = "#eceff1"; // Gris azulado suave

const COLOR_TEXTO_CANCELADO = "#b7b7b7"; // Gris claro para tareas con 0 bloques

const mesesNom = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DIAS_SIN_TILDE = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];

// --- TRADUCTORES Y AYUDANTES ---
function parseNumeroLocal(val) {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === 'number') return val;
  let str = val.toString().replace(',', '.').trim();
  let num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Solo usamos fNum para textos visuales (Gantt y etiquetas), NUNCA para bases de datos
function fNum(num) {
  if (num === 0 || !num) return "0";
  return num.toString().replace('.', ',');
}

function parseDateLocal(val) {
  if (!val || val === "") return null;
  if (val instanceof Date) { val.setHours(12,0,0,0); return val; }
  let str = val.toString().trim();
  let parts = str.replace(/-/g, '/').split('/');
  if (parts.length >= 2) {
      let d = parseInt(parts[0], 10);
      let m = parseInt(parts[1], 10) - 1;
      let y = parts.length === 3 ? parseInt(parts[2], 10) : new Date().getFullYear();
      if (y < 100) y += 2000;
      let dt = new Date(y, m, d, 12, 0, 0, 0);
      if (!isNaN(dt)) return dt;
  }
  return null;
}

function obtenerColorEstado(estado) {
  let e = (estado || "").toString().trim();
  if (e === "Hecho") return COLOR_HECHO;
  if (e === "En Espera") return COLOR_EN_ESPERA;
  if (e === "En Proceso") return COLOR_EN_PROCESO;
  return COLOR_A_FUTURO; 
}

function extractIdNumber(idStr) {
  let match = (idStr || "").toString().match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function formatearFechaGantt(fecha) {
  return DIAS_SIN_TILDE[fecha.getDay()] + " " + fecha.getDate() + " " + mesesNom[fecha.getMonth()];
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠️ Laguna Gantt')
    .addItem('1. Ordenar y Sincronizar (Sala de Máquinas)', 'fase1_ordenarYSincronizar')
    .addItem('2. Calcular y Dibujar TODOS los Gantts', 'fase2_calcularYDibujarGantts')
    .addSeparator()
    .addItem('3. 📅 Extraer Semana (Crear hoja nueva)', 'fase4_extraerSemana')
    .addItem('4. 🎨 Dibujar Semana (Hoja actual)', 'fase5_dibujarSemana')
    .addSeparator()
    .addItem('5. ☕ Generar Agenda de Hoy', 'fase6_generarAgendaHoy')
    .addItem('6. 🌙 Cierre de Día (Volcar Hoy y Notas)', 'fase3_cierreDeDia')
    .addSeparator()
    .addItem('7. 🗓️ Dibujar Master Calendar', 'fase7_dibujarCalendarioHoy')
    .addToUi();
}

function obtenerIndices(encabezados) {
  const indices = {};
  encabezados.forEach((n, i) => { if (n) indices[n.toString().trim()] = i; });
  return indices;
}

function getMonday(d) {
  let date = new Date(d); date.setHours(12,0,0,0);
  var day = date.getDay(), diff = date.getDate() - day + (day == 0 ? -6 : 1); 
  return new Date(date.setDate(diff));
}

function buildGanttRichText(txt, colorBase, isOverload = false) {
  if (!txt) return SpreadsheetApp.newRichTextValue().setText("").build();
  let rtv = SpreadsheetApp.newRichTextValue().setText(txt);
  
  let fontCol = isOverload ? "red" : colorBase;
  let normalStyle = SpreadsheetApp.newTextStyle().setForegroundColor(fontCol).setBold(isOverload).build();
  rtv.setTextStyle(normalStyle); 
  
  let partes = txt.split(" | ");
  if (partes.length === 2) {
     let boldStyle = SpreadsheetApp.newTextStyle().setForegroundColor(fontCol).setBold(true).build();
     let startIdx = txt.indexOf(" | ") + 3;
     rtv.setTextStyle(startIdx, txt.length, boldStyle);
  }
  return rtv.build();
}

// ==========================================
// FASE 1: ORDENAR, SINCRONIZAR Y AUTOCALCULAR ESTADOS
// ==========================================
function fase1_ordenarYSincronizar(silent = false) {
  let isSilent = silent === true;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetPlan = ss.getSheetByName(HOJA_PRINCIPAL);
  const sheetHist = ss.getSheetByName(HOJA_HISTORICO);
  if (!sheetPlan) return;
  
  const encabezados = sheetPlan.getRange(1, 1, 1, sheetPlan.getLastColumn()).getValues()[0];
  const col = obtenerIndices(encabezados);
  const ultimaColReal = col["Notas"] + 1; 
  const ultimaFila = sheetPlan.getLastRow();
  const maxCols = sheetPlan.getMaxColumns();
  if (ultimaFila < 2) return;

  let dataParaOrdenar = sheetPlan.getRange(2, 1, ultimaFila - 1, maxCols).getValues();
  dataParaOrdenar.sort((a, b) => {
    let nA = extractIdNumber(a[col["PRI"]]);
    let nB = extractIdNumber(b[col["PRI"]]);
    if (nA !== nB) return nA - nB;
    return parseNumeroLocal(a[col["SEC"]]) - parseNumeroLocal(b[col["SEC"]]);
  });
  sheetPlan.getRange(2, 1, ultimaFila - 1, maxCols).setValues(dataParaOrdenar);
  
  let rangoDatos = sheetPlan.getRange(2, 1, ultimaFila - 1, ultimaColReal);
  let datos = rangoDatos.getValues();

  let minHistDatePorTarea = {};
  if (sheetHist && sheetHist.getLastRow() > 1) {
      const encHist = sheetHist.getRange(1, 1, 1, sheetHist.getLastColumn()).getValues()[0];
      const colHist = obtenerIndices(encHist);
      let datosHist = sheetHist.getDataRange().getValues();
      for (let i = 1; i < datosHist.length; i++) {
          let colFecha = colHist["Fecha"] !== undefined ? colHist["Fecha"] : 0;
          let f = new Date(datosHist[i][colFecha]);
          if (!isNaN(f)) {
              f.setHours(12,0,0,0);
              let idu = colHist["IDU"] !== undefined ? datosHist[i][colHist["IDU"]].toString().trim() : "";
              if (idu && (!minHistDatePorTarea[idu] || f < minHistDatePorTarea[idu])) minHistDatePorTarea[idu] = f;
          }
      }
  }

  let famStats = {};
  datos.forEach(f => {
    let pri = f[col["PRI"]].toString().trim(); 
    let sec = parseNumeroLocal(f[col["SEC"]]);
    if (sec > 0) {
      if (!famStats[pri]) famStats[pri] = { b: 0, d: 0, numActive: 0, endCountActive: 0, minStart: null, maxEnd: null };
      
      let blq = parseNumeroLocal(f[col["Bloques"]]);
      let done = parseNumeroLocal(f[col["Done"]]);
      famStats[pri].b += blq;
      famStats[pri].d += done;
      
      let isActive = blq > 0; 
      if (isActive) {
          famStats[pri].numActive += 1;
          let s = parseDateLocal(f[col["Start"]]);
          if (s && (!famStats[pri].minStart || s < famStats[pri].minStart)) famStats[pri].minStart = s;
          let e = parseDateLocal(f[col["End"]]);
          if (e) { famStats[pri].endCountActive += 1; if (!famStats[pri].maxEnd || e > famStats[pri].maxEnd) famStats[pri].maxEnd = e; }
      }
    }
  });
  
  datos.forEach(f => {
    let pri = f[col["PRI"]].toString().trim(); 
    let sec = parseNumeroLocal(f[col["SEC"]]);
    let blq = parseNumeroLocal(f[col["Bloques"]]);
    let done = parseNumeroLocal(f[col["Done"]]);

    if (sec === 0) {
      if (famStats[pri]) {
        f[col["Bloques"]] = famStats[pri].b > 0 ? famStats[pri].b : ""; 
        f[col["Done"]] = famStats[pri].d > 0 ? famStats[pri].d : "";
        if (famStats[pri].minStart) f[col["Start"]] = Utilities.formatDate(famStats[pri].minStart, Session.getScriptTimeZone(), "dd/MM/yyyy");
        if (famStats[pri].numActive > 0 && famStats[pri].endCountActive === famStats[pri].numActive) {
            f[col["End"]] = Utilities.formatDate(famStats[pri].maxEnd, Session.getScriptTimeZone(), "dd/MM/yyyy");
        } else {
            f[col["End"]] = "";
        }
      } else {
        if((f[col["Bloques"]] || "").toString().trim() === "") f[col["Bloques"]] = 10;
        if (blq > done && f[col["End"]] !== "") f[col["End"]] = "";
      }
    } else {
      if (blq > done && f[col["End"]] !== "") f[col["End"]] = "";
    }
    
    let currEstado = (f[col["Estado"]] || "").toString().trim();
    if (currEstado !== "En Espera") {
       let hasStart = (f[col["Start"]] && f[col["Start"]].toString().trim() !== "");
       let hasEnd = (f[col["End"]] && f[col["End"]].toString().trim() !== "");
       let marcaHoy = (f[col["Hoy"]] || "").toString().trim().toUpperCase();
       if (hasEnd) f[col["Estado"]] = "Hecho";
       else if (hasStart || marcaHoy === "HOY" || parseNumeroLocal(marcaHoy) > 0) f[col["Estado"]] = "En Proceso";
       else f[col["Estado"]] = "A Futuro";
    }
  });
  
  rangoDatos.setValues(datos);
  let newBg = []; let newFw = []; let newFc = []; let toggleZebra = false; 
  
  for (let i = 0; i < datos.length; i++) {
    let idu = datos[i][col["IDU"]].toString().trim();
    let isMadre = parseNumeroLocal(datos[i][col["SEC"]]) === 0;
    
    let rawBloques = (datos[i][col["Bloques"]] !== undefined && datos[i][col["Bloques"]] !== null) ? datos[i][col["Bloques"]].toString().trim() : "";
    let isCancelada = (!isMadre && rawBloques === "0");
    
    if (isCancelada) datos[i][col["Estado"]] = "Cancelada";
    
    let estado = datos[i][col["Estado"]];
    let rowBg = new Array(ultimaColReal).fill("#ffffff");
    let rowFw = new Array(ultimaColReal).fill("normal");
    let rowFc = new Array(ultimaColReal).fill(isCancelada ? COLOR_TEXTO_CANCELADO : "black"); 
    
    if (isMadre) {
        rowBg.fill(COLOR_MADRE_PLAN); rowFw.fill("bold"); toggleZebra = false; 
    } else {
        toggleZebra = !toggleZebra;
        let zebraColor = toggleZebra ? COLOR_ZEBRA_2 : COLOR_ZEBRA_1;
        rowBg.fill(zebraColor);
        if (estado === "Hecho") {
            ["Tarea", "Done", "Ritmo", "Hoy", "Semana", "Start", "Inicio", "Fin", "End", "Estado"].forEach(c => {
                if (col[c] !== undefined) rowBg[col[c]] = COLOR_HECHO;
            });
        } else if (!isCancelada) { 
            if (col["Tarea"] !== undefined) rowBg[col["Tarea"]] = obtenerColorEstado(estado);
            if (col["Estado"] !== undefined) rowBg[col["Estado"]] = obtenerColorEstado(estado);
        }
    }
    
    if (minHistDatePorTarea[idu] && parseDateLocal(datos[i][col["Start"]]) && minHistDatePorTarea[idu] < parseDateLocal(datos[i][col["Start"]])) {
        rowBg[col["Start"]] = "#fce8e6"; 
    }
    
    if (isMadre && rawBloques === "0") {
        rowFc.fill(COLOR_TEXTO_CANCELADO);
        datos[i][col["Estado"]] = "Cancelada";
    }

    newBg.push(rowBg); newFw.push(rowFw); newFc.push(rowFc);
  }
  
  rangoDatos.setValues(datos); 
  sheetPlan.getRange(2, 1, datos.length, ultimaColReal).setBackgrounds(newBg).setFontWeights(newFw).setFontColors(newFc);
}

// ==========================================
// FASE 2: SIMULADOR Y GENERADOR DE HOJAS GANTT
// ==========================================
function fase2_calcularYDibujarGantts(silent = false) {
  let isSilent = silent === true;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetPlan = ss.getSheetByName(HOJA_PRINCIPAL);
  const sheetActual = ss.getSheetByName(HOJA_GANTT_ACTUAL);
  const sheetTotal = ss.getSheetByName(HOJA_GANTT_TOTAL);
  const sheetAgenda = ss.getSheetByName(HOJA_AGENDA);
  const sheetEquipo = ss.getSheetByName(HOJA_EQUIPO);
  const sheetHistorico = ss.getSheetByName(HOJA_HISTORICO);
  const sheetVacaciones = ss.getSheetByName(HOJA_VACACIONES);
  
  if (!sheetPlan || !sheetActual || !sheetTotal || !sheetAgenda || !sheetEquipo || !sheetHistorico) return;

  const datosEquipo = sheetEquipo.getDataRange().getValues();
  let equipo = {}; let ordenEquipo = {}; 
  for (let i = 1; i < datosEquipo.length; i++) {
    let p = datosEquipo[i][0];
    if (p) {
      let n = p.toString().trim(); ordenEquipo[n] = i; 
      let dStr = datosEquipo[i][2] || ""; let laborables = [1,2,3,4,5]; 
      if (dStr.includes("S")) laborables.push(6); if (dStr.includes("D")) laborables.push(0); 
      equipo[n] = { max: parseNumeroLocal(datosEquipo[i][1]), dias: laborables };
    }
  }

  let vacaciones = {};
  if (sheetVacaciones) {
    let dataVac = sheetVacaciones.getDataRange().getValues();
    for (let i = 1; i < dataVac.length; i++) {
      let p = dataVac[i][0] ? dataVac[i][0].toString().trim().toUpperCase() : "", dD = new Date(dataVac[i][1]), dH = new Date(dataVac[i][2]);
      if (p && !isNaN(dD.getTime())) {
        if (!vacaciones[p]) vacaciones[p] = [];
        vacaciones[p].push({desde: dD.setHours(12,0,0,0), hasta: dH.setHours(12,0,0,0)});
      }
    }
  }
  
  function isEnVacaciones(persona, ts) {
    let perMayus = persona.toString().trim().toUpperCase();
    let vacs = (vacaciones[perMayus] || []).concat(vacaciones["TODOS"] || []);
    for (let v of vacs) if (ts >= v.desde && ts <= v.hasta) return true;
    return false;
  }

  let historico = {};
  const encHist = sheetHistorico.getRange(1, 1, 1, sheetHistorico.getLastColumn()).getValues()[0];
  const colH = obtenerIndices(encHist);
  const datosHist = sheetHistorico.getDataRange().getValues();
  
  for (let i = 1; i < datosHist.length; i++) {
    let colFecha = colH["Fecha"] !== undefined ? colH["Fecha"] : 0;
    let f = new Date(datosHist[i][colFecha]);
    if (!isNaN(f.getTime())) {
      f.setHours(12,0,0,0);
      let fS = f.getDate() + "-" + (f.getMonth() + 1) + "-" + f.getFullYear();
      let idu = colH["IDU"] !== undefined ? datosHist[i][colH["IDU"]].toString().trim() : "";
      let r = colH["Responsable"] !== undefined ? datosHist[i][colH["Responsable"]] : "";
      let dH = colH["Done"] !== undefined ? parseNumeroLocal(datosHist[i][colH["Done"]]) : 0;
      
      if (dH > 0 && idu !== "") {
        if (!historico[fS]) historico[fS] = {};
        let c = idu + "_" + r;
        if (!historico[fS][c]) historico[fS][c] = { idu: idu, resp: r, blq: 0 };
        historico[fS][c].blq += dH; 
      }
    }
  }

  const col = obtenerIndices(sheetPlan.getRange(1, 1, 1, sheetPlan.getLastColumn()).getValues()[0]);
  const ultimaColPlan = col["Notas"] + 1;
  const datosCompleto = sheetPlan.getRange(2, 1, sheetPlan.getLastRow() - 1, ultimaColPlan).getValues();
  
  let numFilas = 0; let minGlobalStart = null; let hijasPorMadre = {};
  for (let i = 0; i < datosCompleto.length; i++) {
    if (datosCompleto[i][col["IDU"]] && datosCompleto[i][col["IDU"]].toString().trim() !== "") {
      numFilas++; let sd = parseDateLocal(datosCompleto[i][col["Start"]]);
      if (sd && (!minGlobalStart || sd < minGlobalStart)) minGlobalStart = sd;
      
      let pri = datosCompleto[i][col["PRI"]].toString().trim();
      if (parseNumeroLocal(datosCompleto[i][col["SEC"]]) > 0) hijasPorMadre[pri] = (hijasPorMadre[pri] || 0) + 1;
    } else break;
  }
  if (numFilas === 0) return;
  if (!minGlobalStart) minGlobalStart = FECHA_HOY.getTime();

  function esMadreHuerfana(pri, sec) { return sec === 0 && !hijasPorMadre[pri]; }
  
  let datos = datosCompleto.slice(0, numFilas);
  let remainingBlocks = {}; 
  datos.forEach((f, i) => {
    remainingBlocks[i] = parseNumeroLocal(f[col["Bloques"]]) - parseNumeroLocal(f[col["Done"]]);
    let s = f[col["Start"]]; if (s && !f[col["Inicio"]]) f[col["Inicio"]] = s; 
  });

  const DIAS_DIBUJO = 180; 
  const DIAS_CALCULO = 500; 
  let fechaInicioSim = new Date(minGlobalStart); fechaInicioSim.setHours(12,0,0,0);
  
  let mapGanttTxt = Array.from({length: numFilas}, () => new Array(DIAS_DIBUJO).fill(""));
  let mapGanttBg = Array.from({length: numFilas}, () => new Array(DIAS_DIBUJO).fill("#ffffff"));
  let mapGanttOver = Array.from({length: numFilas}, () => new Array(DIAS_DIBUJO).fill(false)); 
  let mapBloquesSimulados = Array.from({length: numFilas}, () => new Array(DIAS_CALCULO).fill(0)); 
  let cargaDiaria = {}; 

  for (let d = 0; d < DIAS_CALCULO; d++) {
    let fA = new Date(fechaInicioSim.getTime() + (d * 86400000)); fA.setHours(12,0,0,0);
    let fAT = fA.getTime(); let fS = fA.getDate() + "-" + (fA.getMonth() + 1) + "-" + fA.getFullYear();
    let dSem = fA.getDay(); let esHoy = fA.getDate() === FECHA_HOY.getDate() && fA.getMonth() === FECHA_HOY.getMonth() && fA.getFullYear() === FECHA_HOY.getFullYear();
    let esHoyOFut = fAT >= FECHA_HOY.getTime() || esHoy;
    
    if (!cargaDiaria[fS]) cargaDiaria[fS] = {};
    let madresHoy = {}; 
    
    if (historico[fS]) {
      Object.values(historico[fS]).forEach(h => {
        let rIdx = datos.findIndex(f => f[col["IDU"]].toString().trim() === h.idu);
        if (rIdx !== -1) {
          let sec = parseNumeroLocal(datos[rIdx][col["SEC"]]);
          let pri = datos[rIdx][col["PRI"]].toString().trim();
          let isHuer = esMadreHuerfana(pri, sec);
          if (sec > 0 || isHuer) {
              cargaDiaria[fS][h.resp] = (cargaDiaria[fS][h.resp] || 0) + h.blq;
              let isOver = cargaDiaria[fS][h.resp] > (equipo[h.resp] ? equipo[h.resp].max : 999) + 0.01;
              if (d < DIAS_DIBUJO) {
                mapGanttTxt[rIdx][d] = `${h.resp} ${fNum(h.blq)} | ${fNum(cargaDiaria[fS][h.resp])}`;
                mapGanttBg[rIdx][d] = isHuer ? COLOR_MADRE_ACTIVA : obtenerColorEstado(datos[rIdx][col["Estado"]]);
                mapGanttOver[rIdx][d] = isOver;
              }
              mapBloquesSimulados[rIdx][d] = h.blq;
          }
        }
      });
    }

    if (esHoyOFut) {
      if (esHoy) {
         for (let i = 0; i < numFilas; i++) {
            let pri = datos[i][col["PRI"]].toString().trim(), sec = parseNumeroLocal(datos[i][col["SEC"]]);
            let isHuer = esMadreHuerfana(pri, sec);
            if (sec === 0 && !isHuer) continue;
            let mH = (datos[i][col["Hoy"]] || "").toString().trim().toUpperCase();
            let bh = parseNumeroLocal(mH); if (mH === "HOY" && bh === 0) bh = 1;
            let resp = datos[i][col["Responsable"]];
            
            if (bh > 0 && resp) {
               cargaDiaria[fS][resp] = (cargaDiaria[fS][resp] || 0) + bh;
               let isOver = cargaDiaria[fS][resp] > (equipo[resp] ? equipo[resp].max : 999) + 0.01;
               if (remainingBlocks[i] > 0) remainingBlocks[i] = Math.max(0, remainingBlocks[i] - bh);
               if (d < DIAS_DIBUJO) {
                 mapGanttTxt[i][d] = `${resp} ${fNum(bh)} | ${fNum(cargaDiaria[fS][resp])}`;
                 mapGanttBg[i][d] = isHuer ? COLOR_MADRE_ACTIVA : obtenerColorEstado(datos[i][col["Estado"]]);
                 mapGanttOver[i][d] = isOver;
               }
               mapBloquesSimulados[i][d] = bh;
               datos[i][col["Fin"]] = fA; if (!datos[i][col["Inicio"]]) datos[i][col["Inicio"]] = fA;
            }
         }
      }
      for (let i = 0; i < numFilas; i++) {
        let pri = datos[i][col["PRI"]].toString().trim(), sec = parseNumeroLocal(datos[i][col["SEC"]]);
        let isHuer = esMadreHuerfana(pri, sec);
        if (sec === 0 && !isHuer) continue;
        let resp = datos[i][col["Responsable"]], est = datos[i][col["Estado"]];
        let tS = parseDateLocal(datos[i][col["Start"]]);
        
        let dEq = equipo[resp] || { max: 999, dias: [0,1,2,3,4,5,6] }; 
        
        if (est !== "En Espera" && est !== "Hecho" && (!tS || fAT >= tS.getTime()) && remainingBlocks[i] > 0 && resp && dEq.dias.includes(dSem) && !isEnVacaciones(resp, fAT)) {
          let claveM = resp + "_" + pri; if (!madresHoy[claveM]) madresHoy[claveM] = 0;
          let cap = dEq.max - (cargaDiaria[fS][resp] || 0);
          let rNum = parseNumeroLocal(datos[i][col["Ritmo"]]); let bP = rNum > 0 ? rNum : 1;
          let bA = Math.min(bP, remainingBlocks[i], Math.max(0, cap)); 
          
          if (bA > 0 && (madresHoy[claveM] < 1 || rNum > 0)) {
              remainingBlocks[i] -= bA; cargaDiaria[fS][resp] = (cargaDiaria[fS][resp] || 0) + bA; madresHoy[claveM] += bA;
              let isOver = cargaDiaria[fS][resp] > dEq.max + 0.01;
              if (d < DIAS_DIBUJO) {
                mapGanttTxt[i][d] = `${resp} ${fNum(bA)} | ${fNum(cargaDiaria[fS][resp])}`;
                mapGanttBg[i][d] = isHuer ? COLOR_MADRE_ACTIVA : ((fAT > FECHA_HOY.getTime()) ? COLOR_FUTURO_GANTT : obtenerColorEstado(est));
                mapGanttOver[i][d] = isOver;
              }
              mapBloquesSimulados[i][d] = bA;
              datos[i][col["Fin"]] = fA; if (!datos[i][col["Inicio"]]) datos[i][col["Inicio"]] = fA;
          }
        }
      }
    }
    if (d < DIAS_DIBUJO && (dSem === 0 || dSem === 6)) {
      for (let i = 0; i < numFilas; i++) if (mapGanttTxt[i][d] === "") mapGanttBg[i][d] = COLOR_FIN_SEMANA;
    }
  }

  datos.forEach((f, i) => {
    let pri = f[col["PRI"]].toString().trim(), sec = parseNumeroLocal(f[col["SEC"]]);
    let isMadre = sec === 0;
    let isHuer = isMadre && !hijasPorMadre[pri]; 
    
    if (isMadre) {
      let mI = null, mF = null;
      if (!isHuer) {
        datos.forEach(h => {
          if (h[col["PRI"]].toString().trim() === pri && parseNumeroLocal(h[col["SEC"]]) > 0) {
             let hi = parseDateLocal(h[col["Inicio"]]), hf = parseDateLocal(h[col["Fin"]]);
             let hs = parseDateLocal(h[col["Start"]]), he = parseDateLocal(h[col["End"]]);
             let realStart = hs || hi; 
             let realEnd = he || hf;
             if (realStart && (!mI || realStart < mI)) mI = realStart; 
             if (realEnd && (!mF || realEnd > mF)) mF = realEnd;
          }
        });
        f[col["Inicio"]] = mI || ""; 
        f[col["Fin"]] = mF || "";
      } else {
        mI = parseDateLocal(f[col["Start"]]) || parseDateLocal(f[col["Inicio"]]);
        mF = parseDateLocal(f[col["End"]]) || parseDateLocal(f[col["Fin"]]);
      }

      if (mI && mF) {
        for (let d = 0; d < DIAS_DIBUJO; d++) {
          let fA = new Date(fechaInicioSim.getTime() + (d * 86400000)); fA.setHours(12,0,0,0);
          if (fA.getTime() >= mI.getTime() && fA.getTime() <= mF.getTime()) {
            mapGanttBg[i][d] = COLOR_MADRE_ACTIVA;
          } else {
            mapGanttBg[i][d] = COLOR_MADRE_INACTIVA;
          }
        }
      } else {
        for (let d = 0; d < DIAS_DIBUJO; d++) mapGanttBg[i][d] = COLOR_MADRE_INACTIVA;
      }
    }
  });

  sheetPlan.getRange(2, 1, numFilas, ultimaColPlan).setValues(datos);

  const numSemanas = 26; let maxCN = ultimaColPlan + numSemanas;
  if (sheetPlan.getMaxColumns() < maxCN) sheetPlan.insertColumnsAfter(sheetPlan.getMaxColumns(), maxCN - sheetPlan.getMaxColumns());
  sheetPlan.getRange(1, ultimaColPlan + 1, sheetPlan.getMaxRows(), maxCN - ultimaColPlan).clearContent().setNumberFormat("@");
  let hSem = [], lAct = getMonday(FECHA_HOY); 
  for(let w=0; w<numSemanas; w++) {
    let dL = new Date(lAct.getTime() + (w * 7 * 86400000)), dD = new Date(dL.getTime() + (6 * 86400000));
    hSem.push((dL.getMonth() == dD.getMonth()) ? `${mesesNom[dL.getMonth()]} ${dL.getDate()}-${dD.getDate()}` : `${mesesNom[dL.getMonth()]} ${dL.getDate()}-${mesesNom[dD.getMonth()]} ${dD.getDate()}`);
  }
  sheetPlan.getRange(1, ultimaColPlan + 1, 1, numSemanas).setValues([hSem]).setFontWeight("bold").setBackground("#f3f3f3");
  let vSem = [], bSem = [];
  for (let i = 0; i < numFilas; i++) {
    let fV = [], fB = [], isM = parseNumeroLocal(datos[i][col["SEC"]]) === 0 && !esMadreHuerfana(datos[i][col["PRI"]].toString().trim(), 0);
    for(let w=0; w<numSemanas; w++) {
      let wI = new Date(lAct.getTime() + (w * 7 * 86400000)).getTime(), wF = wI + (6 * 86400000), sum = 0;
      for (let d = 0; d < 7; d++) {
        let idx = Math.round((wI + (d * 86400000) - fechaInicioSim.getTime()) / 86400000);
        if (idx >= 0 && idx < DIAS_CALCULO) sum += mapBloquesSimulados[i][idx];
      }
      if (isM) {
        let inM = parseDateLocal(datos[i][col["Inicio"]]), fiM = parseDateLocal(datos[i][col["Fin"]]);
        fV.push(""); fB.push((inM && fiM && wI <= fiM.getTime() && wF >= inM.getTime()) ? COLOR_MADRE_ACTIVA : COLOR_MADRE_INACTIVA);
      } else {
        if (sum > 0) { fV.push(fNum(sum)); fB.push((wI > FECHA_HOY.getTime()) ? COLOR_FUTURO_GANTT : obtenerColorEstado(datos[i][col["Estado"]])); }
        else {
          let inH = parseDateLocal(datos[i][col["Inicio"]]), fiH = parseDateLocal(datos[i][col["Fin"]]);
          if (inH && fiH && wI <= fiH.getTime() && wF >= inH.getTime()) { fV.push(""); fB.push((wI > FECHA_HOY.getTime()) ? COLOR_FUTURO_GANTT : obtenerColorEstado(datos[i][col["Estado"]])); }
          else { fV.push(""); fB.push(null); }
        }
      }
    }
    vSem.push(fV); bSem.push(fB);
  }
  sheetPlan.getRange(2, ultimaColPlan + 1, numFilas, numSemanas).setValues(vSem).setBackgrounds(bSem);

  sheetActual.clear(); sheetTotal.clear();
  let cabA = ["PRI", "SEC", "Responsable", "Tarea"], cabT = ["PRI", "SEC", "Tarea", "Responsable", "Avance"];
  let fStA = new Date(FECHA_HOY); fStA.setDate(fStA.getDate() - 5); fStA.setHours(12,0,0,0);
  let dStIdx = Math.max(0, Math.floor((fStA.getTime() - fechaInicioSim.getTime()) / 86400000));
  for(let c=0; c<DIAS_DIBUJO; c++) {
     let fc = new Date(fechaInicioSim.getTime() + ((dStIdx + c) * 86400000));
     let headerText = formatearFechaGantt(fc);
     cabA.push(headerText); cabT.push(headerText);
  }
  
  let mMA = [], mBgA = [], mMT = [], mBgT = [], rtA = [], rtT = [], tZA = false;
  let mFcA = [], mFcT = []; 
  
  for (let i = 0; i < numFilas; i++) {
    let pri = datos[i][col["PRI"]].toString().trim(), sec = parseNumeroLocal(datos[i][col["SEC"]]), isM = sec === 0, esH = esMadreHuerfana(pri, sec);
    if (isM) tZA = false; else tZA = !tZA;
    let lBg = isM ? COLOR_MADRE_PLAN : (tZA ? COLOR_ZEBRA_2 : COLOR_ZEBRA_1), est = datos[i][col["Estado"]];
    let cTask = (!isM && (est === "Hecho" || est === "En Proceso")) ? obtenerColorEstado(est) : lBg;
    let resp = datos[i][col["Responsable"]];
    
    let fCol = (est === "Cancelada") ? "#b7b7b7" : "black"; 
    
    mMA.push([pri, sec, resp, datos[i][col["Tarea"]]]);
    let fBgA = [lBg, lBg, lBg, cTask], rFA = [];
    let rFcA = [fCol, fCol, fCol, fCol]; 
    
    mMT.push([pri, sec, datos[i][col["Tarea"]], resp, fNum(datos[i][col["Done"]])+"/"+fNum(datos[i][col["Bloques"]])]);
    let fBgT = [lBg, lBg, cTask, lBg, lBg], rFT = [];
    let rFcT = [fCol, fCol, fCol, fCol, fCol]; 
    
    for(let c=0; c<DIAS_DIBUJO; c++) {
       let idx = dStIdx + c;
       if (idx < DIAS_DIBUJO) { 
           rFA.push(buildGanttRichText(mapGanttTxt[i][idx], fCol, mapGanttOver[i][idx])); 
           fBgA.push(mapGanttBg[i][idx]); 
           rFT.push(buildGanttRichText(mapGanttTxt[i][idx], fCol, mapGanttOver[i][idx])); 
           fBgT.push(mapGanttBg[i][idx]); 
       } else { 
           rFA.push(SpreadsheetApp.newRichTextValue().setText("").build()); fBgA.push(isM ? COLOR_MADRE_INACTIVA : "#ffffff"); 
           rFT.push(SpreadsheetApp.newRichTextValue().setText("").build()); fBgT.push(isM ? COLOR_MADRE_INACTIVA : "#ffffff"); 
       }
    }
    rtA.push(rFA); mBgA.push(fBgA);
    rtT.push(rFT); mBgT.push(fBgT);
    mFcA.push(rFcA); mFcT.push(rFcT); 
  }
  
  [sheetActual, sheetTotal].forEach((s, idx) => {
    let cab = idx === 0 ? cabA : cabT; 
    s.getRange(1, 1, 1, cab.length).setNumberFormat("@").setValues([cab]).setFontWeight("bold").setBackground("#f3f3f3");
    
    let meta = idx === 0 ? mMA : mMT; 
    s.getRange(2, 1, meta.length, meta[0].length).setValues(meta);
    
    let fcs = idx === 0 ? mFcA : mFcT; 
    s.getRange(2, 1, fcs.length, fcs[0].length).setFontColors(fcs); 
    
    let rts = idx === 0 ? rtA : rtT; 
    s.getRange(2, meta[0].length + 1, rts.length, DIAS_DIBUJO).setRichTextValues(rts);
    let bgs = idx === 0 ? mBgA : mBgT; 
    s.getRange(2, 1, bgs.length, cab.length).setBackgrounds(bgs);
    
    s.setFrozenRows(1); 
    s.setFrozenColumns(meta[0].length); 
    s.autoResizeColumns(1, cab.length);
  });
}
  
// ==========================================
// FASE 3: CIERRE DE DÍA (Bucle con la Semana)
// ==========================================
function fase3_cierreDeDia() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetPlan = ss.getSheetByName(HOJA_PRINCIPAL);
  const sheetHist = ss.getSheetByName(HOJA_HISTORICO);
  const sheetAg = ss.getSheetByName(HOJA_AGENDA);
  if (!sheetPlan || !sheetHist || !sheetAg) return;
  const ui = SpreadsheetApp.getUi();
  
  let agAct = {}; 
  let sumHoy = 0;
  let hayTareasEnMesa = false;

  if (sheetAg.getLastRow() > 1) {
    const encAg = sheetAg.getRange(1, 1, 1, sheetAg.getLastColumn()).getValues()[0];
    const cAg = obtenerIndices(encAg);
    
    const dAg = sheetAg.getRange(2, 1, sheetAg.getLastRow()-1, sheetAg.getLastColumn()).getValues();
    if (!dAg[0][0].toString().includes("¡Mesa limpia!")) {
      hayTareasEnMesa = true;
      for(let a=0; a<dAg.length; a++){
         let idu = cAg["IDU"] !== undefined ? dAg[a][cAg["IDU"]].toString().trim() : "";
         let hRStr = cAg["Hoy"] !== undefined ? dAg[a][cAg["Hoy"]].toString().trim() : "";
         let hR = 0;
         if (hRStr !== "") { 
             let n = parseNumeroLocal(hRStr); 
             hR = n > 0 ? n : 0; 
         }
         sumHoy += hR;
         if(idu) {
             agAct[idu] = { 
                 hoy: hR, 
                 nota: cAg["Notas"] !== undefined ? dAg[a][cAg["Notas"]] : "",
                 pri: cAg["PRI"] !== undefined ? dAg[a][cAg["PRI"]].toString().trim() : "",
                 sec: cAg["SEC"] !== undefined ? parseNumeroLocal(dAg[a][cAg["SEC"]]) : 0,
                 madre: cAg["Tarea Madre"] !== undefined ? dAg[a][cAg["Tarea Madre"]] : "",
                 resp: cAg["Responsable"] !== undefined ? dAg[a][cAg["Responsable"]] : "",
                 hija: cAg["Tarea Hija"] !== undefined ? dAg[a][cAg["Tarea Hija"]] : "",
                 avance: cAg["Avance"] !== undefined ? dAg[a][cAg["Avance"]] : "",
                 start: cAg["Start"] !== undefined ? dAg[a][cAg["Start"]] : "",
                 hist: cAg["Historial"] !== undefined ? dAg[a][cAg["Historial"]] : ""
             };
         }
      }
    }
  }

  if (!hayTareasEnMesa) {
      return ui.alert("⚠️ Cierre Detenido", "La Agenda está vacía (Mesa limpia). No hay nada que cerrar.", ui.ButtonSet.OK);
  }

  let fSug = Utilities.formatDate(FECHA_HOY, Session.getScriptTimeZone(), "dd/MM/yyyy");
  let res = ui.prompt('🌙 Cierre de Día', `Mesa procesada. Se han detectado ${fNum(sumHoy)} bloques reales.\n¿Para qué fecha guardamos y sobreescribimos la semana? (Formato: DD/MM)`, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  
  let txtF = res.getResponseText().trim().replace(/-/g, '/');
  let fC = new Date(); fC.setHours(12,0,0,0); 
  if (txtF !== "" && txtF !== fSug) {
    let p = txtF.split("/");
    if (p.length >= 2) {
      let d = parseInt(p[0], 10), m = parseInt(p[1], 10)-1, y = p.length === 3 ? parseInt(p[2],10) : FECHA_HOY.getFullYear();
      fC = new Date(y < 100 ? y+2000 : y, m, d, 12, 0, 0, 0);
    }
  }
  let fStr = Utilities.formatDate(fC, Session.getScriptTimeZone(), "yyyy-MM-dd"); // ISO para buen ordenamiento

  // 3. ACTUALIZAR PLAN E HISTÓRICO
  const enc = sheetPlan.getRange(1, 1, 1, sheetPlan.getLastColumn()).getValues()[0];
  const col = obtenerIndices(enc);
  const uCP = col["Notas"] + 1; 
  const dP = sheetPlan.getRange(2, 1, sheetPlan.getLastRow()-1, uCP).getValues();
  let fHist = [];
  
  for (let i=0; i<dP.length; i++) {
    let idu = dP[i][col["IDU"]].toString().trim();
    
    if (agAct[idu]) {
       let dR = agAct[idu]; 
       if (dR.nota !== "") dP[i][col["Notas"]] = dR.nota; 
       if (dR.hoy > 0) {
           if (!dP[i][col["Start"]] || dP[i][col["Start"]]=="") dP[i][col["Start"]] = fStr;
           
           // INYECCIÓN DE NÚMEROS (Anti-envenenamiento)
           let tD = parseNumeroLocal(dP[i][col["Done"]]) + dR.hoy; 
           dP[i][col["Done"]] = tD; 
           
           if (parseNumeroLocal(dP[i][col["Bloques"]]) > 0 && tD >= parseNumeroLocal(dP[i][col["Bloques"]])) {
               if (!dP[i][col["End"]] || dP[i][col["End"]]=="") dP[i][col["End"]] = fStr;
           }
           
           // Se guardan los números crudos en el Histórico
           fHist.push([fStr, idu, dP[i][col["PRI"]], dP[i][col["SEC"]], dP[i][col["Tarea"]], dP[i][col["Responsable"]], parseNumeroLocal(dP[i][col["Bloques"]]), dR.hoy, dR.nota]);
       }
    }
    dP[i][col["Hoy"]] = ""; 
    dP[i][col["Notas"]] = ""; 
  }
  
  if (fHist.length > 0) sheetHist.getRange(sheetHist.getLastRow()+1, 1, fHist.length, 9).setValues(fHist);
  sheetPlan.getRange(2, 1, dP.length, uCP).setValues(dP);

  // 4. BUCLE SEMANA (NÚMEROS CRUDOS)
  const lunesSemana = getMonday(fC);
  const nombreHojaSemana = "Semana " + lunesSemana.getDate() + " " + mesesNom[lunesSemana.getMonth()];
  const sheetSem = ss.getSheetByName(nombreHojaSemana);

  if (sheetSem) {
      let dSem = sheetSem.getDataRange().getValues();
      let idxDia = fC.getDay() === 0 ? 6 : fC.getDay() - 1; // 0=Lun
      let colDiaSemana = 8 + idxDia; // Lun = Index 8
      
      let filasAñadirSemana = [];
      
      Object.keys(agAct).forEach(idu => {
          let dR = agAct[idu];
          
          let found = false;
          for (let i = 1; i < dSem.length; i++) {
              if (dSem[i][0].toString().trim() === idu) {
                  // Inyectar número crudo
                  sheetSem.getRange(i + 1, colDiaSemana + 1).setValue(dR.hoy > 0 ? dR.hoy : 0);
                  found = true;
                  break;
              }
          }
          
          if (!found && dR.hoy > 0) {
              let nuevaFila = [
                  idu, dR.pri, dR.sec, dR.madre, dR.resp, dR.hija, dR.start, dR.avance,
                  "", "", "", "", "", "", "", dR.hist 
              ];
              nuevaFila[colDiaSemana] = dR.hoy; 
              filasAñadirSemana.push(nuevaFila);
          }
      });
      
      if (filasAñadirSemana.length > 0) {
          sheetSem.getRange(sheetSem.getLastRow() + 1, 1, filasAñadirSemana.length, 16).setValues(filasAñadirSemana);
          sheetSem.getRange(sheetSem.getLastRow() - filasAñadirSemana.length + 1, 1, filasAñadirSemana.length, 16).setVerticalAlignment("middle").setBackground("#ffffff");
      }
  }

  sheetAg.getRange(2, 1, Math.max(sheetAg.getLastRow(), 2), sheetAg.getLastColumn()).clearContent().clearFormat();
  sheetAg.getRange(2, 1).setValue("🎉 ¡Mesa limpia! Dale al botón 'Generar Agenda de Hoy' en el menú para organizar tu día.");
  
  fase1_ordenarYSincronizar(true); 
  fase2_calcularYDibujarGantts(true);
  ui.alert("🌙 ¡Cierre completado!\nEl trabajo se ha guardado (Números matemáticos) y tu mesa está limpia.");
}

// ==========================================
// FASE 4: EXTRAER SEMANA (Con Algoritmo Cascada)
// ==========================================
function fase4_extraerSemana() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetPlan = ss.getSheetByName(HOJA_PRINCIPAL);
  const sheetHist = ss.getSheetByName(HOJA_HISTORICO);
  const sheetEquipo = ss.getSheetByName(HOJA_EQUIPO);
  if (!sheetPlan || !sheetEquipo) return;

  const ui = SpreadsheetApp.getUi();
  let lunesBase = getMonday(FECHA_HOY);
  let sug = ("0" + lunesBase.getDate()).slice(-2) + "/" + ("0" + (lunesBase.getMonth() + 1)).slice(-2);
  
  let res = ui.prompt('📅 Extraer Semana', `¿Qué lunes quieres planificar? (Formato DD/MM)\nPor defecto extrae la semana actual: ${sug}`, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  
  let txt = res.getResponseText().trim().replace(/-/g, '/');
  let lunes = new Date(lunesBase);
  if (txt !== "" && txt !== sug) {
    let p = txt.split("/");
    if (p.length >= 2) {
      let d = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1, y = p.length === 3 ? parseInt(p[2], 10) : FECHA_HOY.getFullYear();
      lunes = getMonday(new Date(y < 100 ? y + 2000 : y, m, d, 12, 0, 0, 0)); 
    }
  }
  const nombreHoja = "Semana " + lunes.getDate() + " " + mesesNom[lunes.getMonth()];
  
  let sheetSem = ss.getSheetByName(nombreHoja);
  const esNueva = !sheetSem;
  const cab = ["IDU", "PRI", "SEC", "Tarea Madre", "Responsable", "Tarea Hija", "Start", "Avance", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom", "Historial"];

  if (esNueva) {
    sheetSem = ss.insertSheet(nombreHoja);
    sheetSem.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight("bold").setBackground("#f3f3f3");
  }

  let equipo = {};
  const datosEquipo = sheetEquipo.getDataRange().getValues();
  for (let i = 1; i < datosEquipo.length; i++) {
    let p = datosEquipo[i][0];
    if (p) {
      let n = p.toString().trim();
      let dStr = datosEquipo[i][2] || ""; 
      let laborables = [1, 2, 3, 4, 5]; 
      if (dStr.includes("S")) laborables.push(6); 
      if (dStr.includes("D")) laborables.push(0); 
      equipo[n] = { max: parseNumeroLocal(datosEquipo[i][1]), dias: laborables };
    }
  }

  const col = obtenerIndices(sheetPlan.getRange(1, 1, 1, sheetPlan.getLastColumn()).getValues()[0]);
  const datosPlan = sheetPlan.getRange(2, 1, sheetPlan.getLastRow() - 1, col["Notas"] + 1).getValues();
  
  let notasHist = {};
  if (sheetHist) {
    const encHist = sheetHist.getRange(1, 1, 1, sheetHist.getLastColumn()).getValues()[0];
    const cHist = obtenerIndices(encHist);
    const dHist = sheetHist.getDataRange().getValues();
    for (let i = 1; i < dHist.length; i++) {
      let colFecha = cHist["Fecha"] !== undefined ? cHist["Fecha"] : 0;
      let f = new Date(dHist[i][colFecha]);
      let idu = cHist["IDU"] !== undefined ? dHist[i][cHist["IDU"]].toString().trim() : "";
      let nota = cHist["Notas"] !== undefined ? dHist[i][cHist["Notas"]] : "";
      if (idu && nota && nota !== "") {
        let dNum = ("0" + f.getDate()).slice(-2), mNum = ("0" + (f.getMonth() + 1)).slice(-2);
        if (!notasHist[idu]) notasHist[idu] = [];
        notasHist[idu].push(`[${dNum}/${mNum}] ${nota}`);
      }
    }
  }

  let cargaDiariaResp = {}; 
  let idsYaEnSemana = [];
  if (!esNueva) {
    let datosExistentes = sheetSem.getDataRange().getValues();
    for (let i = 1; i < datosExistentes.length; i++) {
      let idu = datosExistentes[i][0].toString().trim();
      idsYaEnSemana.push(idu);
      let r = datosExistentes[i][4]; // Resp is now at index 4
      if (r && !cargaDiariaResp[r]) cargaDiariaResp[r] = [0,0,0,0,0,0,0];
      if (r) {
        for (let d = 0; d < 7; d++) cargaDiariaResp[r][d] += parseNumeroLocal(datosExistentes[i][8 + d]); // Days start at index 8
      }
    }
  }

  let madresAprobadas = [], madresVetadas = [], nombresMadres = {};
  datosPlan.forEach(f => {
    let pri = f[col["PRI"]].toString().trim(), sec = parseNumeroLocal(f[col["SEC"]]);
    let marcaSem = (f[col["Semana"]] || "").toString().trim().toUpperCase(), estado = f[col["Estado"]];
    if (sec === 0) {
      nombresMadres[pri] = f[col["Tarea"]];
      if (marcaSem === "NO") madresVetadas.push(pri);
      else if (estado === "En Proceso" || marcaSem === "X") madresAprobadas.push(pri);
    }
  });

  let tareasAProcesar = [];
  datosPlan.forEach(f => {
    let idu = f[col["IDU"]].toString().trim();
    let pri = f[col["PRI"]].toString().trim(), sec = parseNumeroLocal(f[col["SEC"]]);
    let estado = f[col["Estado"]], marcaSem = (f[col["Semana"]] || "").toString().trim().toUpperCase();

    if (sec > 0 && madresAprobadas.includes(pri) && !madresVetadas.includes(pri)) {
      if (estado !== "Hecho" && estado !== "Cancelada" && marcaSem !== "NO" && !idsYaEnSemana.includes(idu)) {
        let bTotales = parseNumeroLocal(f[col["Bloques"]]), bDone = parseNumeroLocal(f[col["Done"]]);
        let rem = Math.max(0, bTotales - bDone);
        if (rem > 0) {
          let dStart = parseDateLocal(f[col["Start"]]);
          let startIdx = 0; 
          if (dStart) {
            let diffDays = Math.floor((dStart.getTime() - lunes.getTime()) / 86400000);
            startIdx = Math.max(0, Math.min(6, diffDays)); 
          }
          tareasAProcesar.push({
            idu: idu, pri: pri, sec: sec, madreNombre: nombresMadres[pri] || pri, resp: f[col["Responsable"]],
            tarea: f[col["Tarea"]], startFormat: dStart ? dStart.getDate() + "-" + mesesNom[dStart.getMonth()].toLowerCase() : "",
            avance: fNum(bDone) + " / " + fNum(bTotales), 
            histStr: notasHist[idu] ? notasHist[idu].slice(-4).join(" | ") : "",
            rem: rem, ritmo: parseNumeroLocal(f[col["Ritmo"]]), startIdx: startIdx,
            asignacion: [0,0,0,0,0,0,0]
          });
        }
      }
    }
  });

  let madresConBloque = {}; 
  
  function getMejorDia(tarea, bloquesNecesarios, respetarLimite) {
    let r = tarea.resp;
    if (!equipo[r]) return -1;
    if (!cargaDiariaResp[r]) cargaDiariaResp[r] = [0,0,0,0,0,0,0];
    let maxCap = equipo[r].max;
    let laborables = equipo[r].dias; 
    
    let mejorDia = -1;
    let menorCarga = 9999;

    for (let d = tarea.startIdx; d <= 6; d++) {
      let jsDay = (d + 1) % 7; 
      if (!laborables.includes(jsDay)) continue; 
      
      let cargaActual = cargaDiariaResp[r][d];
      let limitOk = respetarLimite ? (cargaActual + bloquesNecesarios <= maxCap + 0.01) : true;
      let monotoniaOk = !(madresConBloque[tarea.pri] && madresConBloque[tarea.pri][d] >= 1); 

      if (limitOk && monotoniaOk && cargaActual < menorCarga) {
        menorCarga = cargaActual;
        mejorDia = d;
      }
    }
    return mejorDia;
  }

  tareasAProcesar.forEach(t => {
    if (t.ritmo > 0) {
      let r = t.resp;
      if (!cargaDiariaResp[r]) cargaDiariaResp[r] = [0,0,0,0,0,0,0];
      if (!madresConBloque[t.pri]) madresConBloque[t.pri] = [0,0,0,0,0,0,0];
      
      for (let d = t.startIdx; d <= 6 && t.rem > 0; d++) {
        let jsDay = (d + 1) % 7;
        if (equipo[r] && equipo[r].dias.includes(jsDay)) {
          let asignar = Math.min(t.ritmo, t.rem);
          t.asignacion[d] += asignar;
          t.rem -= asignar;
          cargaDiariaResp[r][d] += asignar;
          madresConBloque[t.pri][d] += asignar;
        }
      }
    }
  });

  let madresEmpujadas = [];
  tareasAProcesar.forEach(t => {
    if (t.ritmo === 0 && !madresEmpujadas.includes(t.pri) && t.rem > 0) {
      let asignar = Math.min(1.0, t.rem);
      let dia = getMejorDia(t, asignar, false); 
      if (dia !== -1) {
        if (!madresConBloque[t.pri]) madresConBloque[t.pri] = [0,0,0,0,0,0,0];
        t.asignacion[dia] += asignar;
        t.rem -= asignar;
        cargaDiariaResp[t.resp][dia] += asignar;
        madresConBloque[t.pri][dia] += asignar;
        madresEmpujadas.push(t.pri);
      }
    }
  });

  let huboAsignacion = true;
  while (huboAsignacion) {
    huboAsignacion = false;
    for (let t of tareasAProcesar) {
      if (t.ritmo === 0 && t.rem > 0) {
        let asignar = Math.min(0.5, t.rem);
        let dia = getMejorDia(t, asignar, true); 
        if (dia !== -1) {
          t.asignacion[dia] += asignar;
          t.rem -= asignar;
          cargaDiariaResp[t.resp][dia] += asignar;
          madresConBloque[t.pri][dia] += asignar;
          huboAsignacion = true;
        }
      }
    }
  }

  let filasNuevas = tareasAProcesar.map(t => [
    t.idu, t.pri, t.sec, t.madreNombre, t.resp, t.tarea, t.startFormat, t.avance,
    t.asignacion[0]||0, t.asignacion[1]||0, t.asignacion[2]||0, t.asignacion[3]||0, 
    t.asignacion[4]||0, t.asignacion[5]||0, t.asignacion[6]||0, t.histStr
  ]);

  if (filasNuevas.length > 0) {
    let lastRow = sheetSem.getLastRow();
    sheetSem.getRange(lastRow + 1, 1, filasNuevas.length, cab.length).setValues(filasNuevas);
  }

  let totalFilas = sheetSem.getLastRow();
  if (totalFilas > 1) {
    let dataFormat = sheetSem.getRange(2, 1, totalFilas - 1, cab.length).getValues();
    let bgColors = [];
    let toggleZebra = false;
    let currentMadre = null;

    for (let i = 0; i < dataFormat.length; i++) {
        let pri = dataFormat[i][1].toString().trim();
        if (pri !== currentMadre) {
            toggleZebra = !toggleZebra;
            currentMadre = pri;
        }
        let zebraColor = toggleZebra ? "#eef2f5" : "#ffffff";
        bgColors.push(new Array(cab.length).fill(zebraColor));
    }
    
    sheetSem.getRange(2, 1, totalFilas - 1, cab.length).setBackgrounds(bgColors);
    sheetSem.getRange(2, 1, totalFilas - 1, cab.length).setVerticalAlignment("middle");
    sheetSem.autoResizeColumns(1, cab.length);
    sheetSem.setColumnWidth(4, 99);   // Madre
    sheetSem.setColumnWidth(6, 333);  // Hija
    sheetSem.setColumnWidth(16, 222); // Historial
    sheetSem.getRange(2, 16, totalFilas - 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  }

  if (filasNuevas.length > 0) SpreadsheetApp.getUi().alert("✅ ¡Carga Automática Completada!\nSe han extraído " + filasNuevas.length + " tareas usando el Algoritmo de Cascada.");
  else SpreadsheetApp.getUi().alert("ℹ️ No hay tareas nuevas para extraer.");
}

// ==========================================
// FASE 5: DIBUJAR SEMANA (Panel Visual)
// ==========================================
function fase5_dibujarSemana() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetSem = ss.getActiveSheet();
  
  if (!sheetSem.getName().startsWith("Semana")) {
    SpreadsheetApp.getUi().alert("⚠️ Por favor, colócate en una pestaña de 'Semana' antes de dibujar el calendario.");
    return;
  }

  const sheetPlan = ss.getSheetByName(HOJA_PRINCIPAL);
  const sheetEquipo = ss.getSheetByName(HOJA_EQUIPO);
  if (!sheetPlan || !sheetEquipo) return;

  const encPlan = sheetPlan.getRange(1, 1, 1, sheetPlan.getLastColumn()).getValues()[0];
  const colPlan = obtenerIndices(encPlan);
  const dataPlan = sheetPlan.getDataRange().getValues();
  let mapaAreas = {};
  
  for (let i = 1; i < dataPlan.length; i++) {
    let idu = colPlan["IDU"] !== undefined ? dataPlan[i][colPlan["IDU"]].toString().trim() : "";
    let cArea = colPlan["Área"] !== undefined ? colPlan["Área"] : (colPlan["Area"] !== undefined ? colPlan["Area"] : -1);
    let areaText = cArea !== -1 && dataPlan[i][cArea] ? dataPlan[i][cArea].toString().trim().toLowerCase() : "";
    if (idu) mapaAreas[idu] = areaText;
  }

  function getColorArea(area) {
    if (area.includes("finan")) return "#e6f4ea"; 
    if (area.includes("operat")) return "#fff9c4"; 
    if (area.includes("comerc")) return "#fce8e6"; 
    if (area.includes("admin")) return "#e8f0fe"; 
    return "#f3f3f3"; 
  }

  let equipo = [];
  const dataEq = sheetEquipo.getDataRange().getValues();
  for (let i = 1; i < dataEq.length; i++) {
    let n = dataEq[i][0];
    if (n) equipo.push({ nombre: n.toString().trim(), max: parseNumeroLocal(dataEq[i][1]) });
  }

  let ultFilaSem = sheetSem.getLastRow();
  if (ultFilaSem < 2) return;
  const dataSem = sheetSem.getRange(2, 1, ultFilaSem - 1, 16).getValues();

  const maxCols = sheetSem.getMaxColumns();
  if (maxCols >= 18) {
    sheetSem.getRange(1, 18, Math.max(sheetSem.getMaxRows(), 50), maxCols - 17).clear();
  }

  let dValues = [], dBgs = [], dRichTexts = [];
  const DIAS_CAB = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  let mergeRows = []; 
  let currentRow = 1;

  equipo.forEach(eq => {
    let tareasPorDia = [[], [], [], [], [], [], []];
    let bloquesAcumulados = [0, 0, 0, 0, 0, 0, 0];

    dataSem.forEach(row => {
      let idu = row[0].toString().trim();
      let resp = row[4] ? row[4].toString().trim() : "";
      
      if (resp === eq.nombre) {
        let tareaHija = row[5] ? row[5].toString().trim() : "";
        let area = mapaAreas[idu] || "";
        let bgColor = getColorArea(area);

        for (let d = 0; d < 7; d++) {
          let blq = parseNumeroLocal(row[8 + d]);
          if (blq > 0) {
            bloquesAcumulados[d] += blq;
            let isOver = bloquesAcumulados[d] > eq.max + 0.01;
            
            tareasPorDia[d].push({
              texto: tareaHija + " | " + fNum(blq) + "  [" + fNum(bloquesAcumulados[d]) + "]",
              bg: bgColor,
              over: isOver
            });
          }
        }
      }
    });

    let maxTareasDia = Math.max(...tareasPorDia.map(d => d.length));
    if (maxTareasDia === 0) maxTareasDia = 1; 

    dValues.push([eq.nombre, "", "", "", "", "", ""]);
    dBgs.push(["#424242", "#424242", "#424242", "#424242", "#424242", "#424242", "#424242"]);
    let rtNom = SpreadsheetApp.newRichTextValue().setText(eq.nombre).setTextStyle(SpreadsheetApp.newTextStyle().setForegroundColor("white").setBold(true).build()).build();
    let rtVacio = SpreadsheetApp.newRichTextValue().setText("").build();
    dRichTexts.push([rtNom, rtVacio, rtVacio, rtVacio, rtVacio, rtVacio, rtVacio]);
    mergeRows.push(currentRow);
    currentRow++;

    dValues.push(DIAS_CAB);
    dBgs.push(["#f3f3f3", "#f3f3f3", "#f3f3f3", "#f3f3f3", "#f3f3f3", "#eceff1", "#eceff1"]);
    let rtDias = DIAS_CAB.map(d => SpreadsheetApp.newRichTextValue().setText(d).setTextStyle(SpreadsheetApp.newTextStyle().setForegroundColor("black").setBold(true).build()).build());
    dRichTexts.push(rtDias);
    currentRow++;

    for (let r = 0; r < maxTareasDia; r++) {
      let filaV = [], filaBg = [], filaRt = [];
      for (let d = 0; d < 7; d++) {
        let t = tareasPorDia[d][r];
        if (t) {
          filaV.push(t.texto);
          filaBg.push(t.bg);
          let colorTexto = t.over ? "red" : "black";
          let rtv = SpreadsheetApp.newRichTextValue().setText(t.texto)
            .setTextStyle(SpreadsheetApp.newTextStyle().setForegroundColor(colorTexto).setBold(t.over).build()).build();
          filaRt.push(rtv);
        } else {
          filaV.push("");
          filaBg.push((d === 5 || d === 6) ? "#fafafa" : "#ffffff"); 
          filaRt.push(rtVacio);
        }
      }
      dValues.push(filaV);
      dBgs.push(filaBg);
      dRichTexts.push(filaRt);
      currentRow++;
    }

    dValues.push(["", "", "", "", "", "", ""]);
    dBgs.push(["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff"]);
    dRichTexts.push([rtVacio, rtVacio, rtVacio, rtVacio, rtVacio, rtVacio, rtVacio]);
    currentRow++;
  });

  if (dValues.length > 0) {
    if (sheetSem.getMaxColumns() < 24) {
      sheetSem.insertColumnsAfter(sheetSem.getMaxColumns(), 24 - sheetSem.getMaxColumns());
    }

    let rangoDestino = sheetSem.getRange(1, 18, dValues.length, 7);
    rangoDestino.setValues(dValues);
    rangoDestino.setBackgrounds(dBgs);
    rangoDestino.setRichTextValues(dRichTexts);

    rangoDestino.setVerticalAlignment("middle").setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    rangoDestino.setBorder(true, true, true, true, true, true, "lightgray", SpreadsheetApp.BorderStyle.SOLID);
    
    sheetSem.setColumnWidth(17, 25); // Muro separador desplazado
    for (let c = 18; c <= 24; c++) sheetSem.setColumnWidth(c, 140);

    mergeRows.forEach(r => {
      sheetSem.getRange(r, 18, 1, 7).mergeAcross().setHorizontalAlignment("center").setBorder(true, true, true, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    });
  }

  SpreadsheetApp.getUi().alert("🎨 ¡Agenda Semanal Dibujada!\nRevisa los colores por área y vigila los textos en rojo para evitar sobrecargas.");
}

// ==========================================
// FASE 6: GENERAR AGENDA HOY (Inteligente)
// ==========================================
function fase6_generarAgendaHoy() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetPlan = ss.getSheetByName(HOJA_PRINCIPAL);
  const sheetAgenda = ss.getSheetByName(HOJA_AGENDA);
  const sheetEquipo = ss.getSheetByName(HOJA_EQUIPO);
  const sheetHistorico = ss.getSheetByName(HOJA_HISTORICO);
  
  const ui = SpreadsheetApp.getUi();
  let sug = ("0" + FECHA_HOY.getDate()).slice(-2) + "/" + ("0" + (FECHA_HOY.getMonth() + 1)).slice(-2);
  let res = ui.prompt('☕ Generar Agenda', `¿Para qué fecha quieres preparar la mesa?\n(Por defecto hoy: ${sug})`, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  let txt = res.getResponseText().trim().replace(/-/g, '/');
  let fechaObjetivo = new Date(FECHA_HOY);
  if (txt !== "" && txt !== sug) {
    let p = txt.split("/");
    if (p.length >= 2) {
      let d = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1, y = p.length === 3 ? parseInt(p[2], 10) : FECHA_HOY.getFullYear();
      fechaObjetivo = new Date(y < 100 ? y + 2000 : y, m, d, 12, 0, 0, 0);
    }
  }

  const lunes = getMonday(fechaObjetivo);
  const nombreHojaSemana = "Semana " + lunes.getDate() + " " + mesesNom[lunes.getMonth()];
  const sheetSemana = ss.getSheetByName(nombreHojaSemana);

  if (!sheetPlan || !sheetAgenda || !sheetSemana || !sheetEquipo || !sheetHistorico) {
    SpreadsheetApp.getUi().alert("⚠️ Faltan hojas o la hoja '" + nombreHojaSemana + "' aún no existe.");
    return;
  }

  let infoEquipo = {};
  const dEquipo = sheetEquipo.getDataRange().getValues();
  for (let i = 1; i < dEquipo.length; i++) {
    let nom = dEquipo[i][0] ? dEquipo[i][0].toString().trim() : "";
    if (nom) {
      infoEquipo[nom] = { orden: i, max: parseNumeroLocal(dEquipo[i][1]) };
    }
  }

  let notasHist = {};
  const encHist = sheetHistorico.getRange(1, 1, 1, sheetHistorico.getLastColumn()).getValues()[0];
  const cHist = obtenerIndices(encHist);
  const dHist = sheetHistorico.getDataRange().getValues();
  
  for (let i = 1; i < dHist.length; i++) {
    let colFecha = cHist["Fecha"] !== undefined ? cHist["Fecha"] : 0;
    let f = new Date(dHist[i][colFecha]);
    let idu = cHist["IDU"] !== undefined ? dHist[i][cHist["IDU"]].toString().trim() : "";
    let nota = cHist["Notas"] !== undefined ? dHist[i][cHist["Notas"]] : "";
    
    if (idu && nota && nota !== "") {
      let dNum = ("0" + f.getDate()).slice(-2), mNum = ("0" + (f.getMonth() + 1)).slice(-2);
      if (!notasHist[idu]) notasHist[idu] = [];
      notasHist[idu].push(`[${dNum}/${mNum}] ${nota}`);
    }
  }

  let diaSemanaJS = fechaObjetivo.getDay(); 
  let idxDiaSemana = diaSemanaJS === 0 ? 6 : diaSemanaJS - 1; 
  const labelDiaHoy = DIAS_SIN_TILDE[diaSemanaJS] + " " + ("0" + fechaObjetivo.getDate()).slice(-2) + " " + mesesNom[fechaObjetivo.getMonth()];
  
  let agendaActual = {};
  if (sheetAgenda.getLastRow() > 1) {
    let encAg = sheetAgenda.getRange(1, 1, 1, sheetAgenda.getLastColumn()).getValues()[0];
    let cAg = obtenerIndices(encAg);
    let dAg = sheetAgenda.getRange(2, 1, sheetAgenda.getLastRow() - 1, sheetAgenda.getLastColumn()).getValues();
    if (dAg[0][0].toString().includes("¡Mesa limpia!")) {
      sheetAgenda.getRange(2, 1, sheetAgenda.getLastRow(), sheetAgenda.getLastColumn()).clearContent().clearFormat();
    } else {
      dAg.forEach(r => {
        let idu = cAg["IDU"] !== undefined ? r[cAg["IDU"]].toString().trim() : "";
        if (idu) agendaActual[idu] = true;
      });
    }
  }

  let tareasParaHoy = [];
  const colPlan = obtenerIndices(sheetPlan.getRange(1, 1, 1, sheetPlan.getLastColumn()).getValues()[0]);
  const datosPlan = sheetPlan.getDataRange().getValues();

  let diccPlan = {};
  let nombresMadres = {};
  for (let i = 1; i < datosPlan.length; i++) {
    let idu = colPlan["IDU"] !== undefined ? datosPlan[i][colPlan["IDU"]].toString().trim() : "";
    let pri = colPlan["PRI"] !== undefined ? datosPlan[i][colPlan["PRI"]].toString().trim() : "";
    let sec = colPlan["SEC"] !== undefined ? parseNumeroLocal(datosPlan[i][colPlan["SEC"]]) : 0;
    if (idu) diccPlan[idu] = datosPlan[i];
    if (sec === 0) nombresMadres[pri] = datosPlan[i][colPlan["Tarea"]];
  }

  const dSemana = sheetSemana.getDataRange().getValues();
  let colDiaHoy = 8 + idxDiaSemana; 

  for (let i = 1; i < dSemana.length; i++) {
    let blqHoy = parseNumeroLocal(dSemana[i][colDiaHoy]);
    if (blqHoy > 0) {
      let idu = dSemana[i][0].toString().trim();
      let pri = dSemana[i][1].toString().trim();
      let sec = parseNumeroLocal(dSemana[i][2]);
      
      if (!agendaActual[idu] && diccPlan[idu]) {
        let filaPlan = diccPlan[idu];
        let dStart = parseDateLocal(filaPlan[colPlan["Start"]]);
        let startFmt = dStart ? dStart.getDate() + "-" + mesesNom[dStart.getMonth()] : "";
        let notasFrescas = notasHist[idu] ? notasHist[idu].slice(-4).join(" | ") : "";
        
        tareasParaHoy.push({
          idu: idu, pri: pri, sec: sec, resp: dSemana[i][4], madre: dSemana[i][3],
          hija: dSemana[i][5], blqSemana: blqHoy, 
          avance: fNum(filaPlan[colPlan["Done"]]) + " / " + fNum(filaPlan[colPlan["Bloques"]]),
          startFormat: startFmt, histStr: notasFrescas
        });
        agendaActual[idu] = true; 
      }
    }
  }

  for (let i = 1; i < datosPlan.length; i++) {
    let idu = colPlan["IDU"] !== undefined ? datosPlan[i][colPlan["IDU"]].toString().trim() : "";
    let pri = colPlan["PRI"] !== undefined ? datosPlan[i][colPlan["PRI"]].toString().trim() : "";
    let sec = colPlan["SEC"] !== undefined ? parseNumeroLocal(datosPlan[i][colPlan["SEC"]]) : 0;
    let marcaHoy = (datosPlan[i][colPlan["Hoy"]] || "").toString().trim().toUpperCase();
    
    if (sec > 0 && (marcaHoy === "HOY" || parseNumeroLocal(marcaHoy) > 0)) {
      if (!agendaActual[idu]) {
        let blqUrgencia = parseNumeroLocal(marcaHoy) > 0 ? parseNumeroLocal(marcaHoy) : 1;
        let dStart = parseDateLocal(datosPlan[i][colPlan["Start"]]);
        let startFmt = dStart ? dStart.getDate() + "-" + mesesNom[dStart.getMonth()] : "";
        let nombreMadre = nombresMadres[pri] ? nombresMadres[pri] : pri;
        let notasFrescas = notasHist[idu] ? notasHist[idu].slice(-4).join(" | ") : "";

        tareasParaHoy.push({
          idu: idu, pri: pri, sec: sec, resp: datosPlan[i][colPlan["Responsable"]], 
          madre: nombreMadre, hija: datosPlan[i][colPlan["Tarea"]], blqSemana: blqUrgencia,
          avance: fNum(datosPlan[i][colPlan["Done"]]) + " / " + fNum(datosPlan[i][colPlan["Bloques"]]),
          startFormat: startFmt, histStr: notasFrescas
        });
        agendaActual[idu] = true;
      }
    }
  }

  if (tareasParaHoy.length === 0) {
    SpreadsheetApp.getUi().alert("✅ No hay tareas para añadir a la mesa.");
    return;
  }

  tareasParaHoy.sort((a, b) => {
    let oA = infoEquipo[a.resp] ? infoEquipo[a.resp].orden : 999;
    let oB = infoEquipo[b.resp] ? infoEquipo[b.resp].orden : 999;
    if (oA !== oB) return oA - oB;
    if (a.pri !== b.pri) return a.pri.localeCompare(b.pri);
    return a.sec - b.sec;
  });

  const cabAg = ["IDU", "PRI", "SEC", "Responsable", "Tarea Madre", "Tarea Hija", "Avance", "Start", "Hoy", "Hora", labelDiaHoy, "Historial", "Notas"];
  if (sheetAgenda.getLastRow() < 1) {
    sheetAgenda.getRange(1, 1, 1, cabAg.length).setValues([cabAg]);
  } else {
    sheetAgenda.getRange(1, 11).setValue(labelDiaHoy);
    sheetAgenda.getRange(1, 13).setValue("Notas");
  }
  
  sheetAgenda.getRange(1, 1, 1, cabAg.length).setFontWeight("bold").setBackground("#f3f3f3").setVerticalAlignment("middle");
  sheetAgenda.setFrozenRows(1);

  let acumuladorResp = {};
  let filasV = [];
  let filasRtBloques = [];
  let filasRtHistorial = [];

  tareasParaHoy.forEach(t => {
    let r = t.resp;
    if (!acumuladorResp[r]) acumuladorResp[r] = 0;
    acumuladorResp[r] += t.blqSemana;
    let maxCap = infoEquipo[r] ? infoEquipo[r].max : 999;
    let isOver = acumuladorResp[r] > maxCap + 0.01;
    let txtBloques = `${r} ${fNum(t.blqSemana)} [${fNum(acumuladorResp[r])}]`;
    let rtColor = isOver ? "red" : "black";
    let rtBloque = SpreadsheetApp.newRichTextValue().setText(txtBloques)
      .setTextStyle(SpreadsheetApp.newTextStyle().setForegroundColor(rtColor).setBold(isOver).build()).build();
    
    let txtHist = t.histStr || "";
    let rtHist = SpreadsheetApp.newRichTextValue().setText(txtHist);
    if (txtHist !== "") {
      let urlRegex = /(https?:\/\/[^\s]+)/g;
      let match;
      while ((match = urlRegex.exec(txtHist)) !== null) {
        let linkStyle = SpreadsheetApp.newTextStyle().setForegroundColor("#1155cc").setUnderline(true).build();
        rtHist.setLinkUrl(match.index, match.index + match[0].length, match[0]);
        rtHist.setTextStyle(match.index, match.index + match[0].length, linkStyle);
      }
    }

    filasV.push([
      t.idu, t.pri, t.sec, r, t.madre, t.hija, t.avance, t.startFormat, 
      "", "", txtBloques, txtHist, "" 
    ]);
    filasRtBloques.push([rtBloque]);
    filasRtHistorial.push([rtHist.build()]);
  });

  let lastRow = sheetAgenda.getLastRow();
  let rangoDestino = sheetAgenda.getRange(lastRow + 1, 1, filasV.length, cabAg.length);
  rangoDestino.setValues(filasV);
  
  sheetAgenda.getRange(lastRow + 1, 11, filasRtBloques.length, 1).setRichTextValues(filasRtBloques);
  sheetAgenda.getRange(lastRow + 1, 12, filasRtHistorial.length, 1).setRichTextValues(filasRtHistorial);

  let totalFilas = sheetAgenda.getLastRow();
  if (totalFilas > 1) {
    let dataFormat = sheetAgenda.getRange(2, 1, totalFilas - 1, cabAg.length).getValues();
    let bgColors = [];
    let toggleZebra = false;
    let currentMadre = null;

    for (let i = 0; i < dataFormat.length; i++) {
        let pri = dataFormat[i][1].toString().trim();
        if (pri !== currentMadre) {
            toggleZebra = !toggleZebra;
            currentMadre = pri;
        }
        let zebraColor = toggleZebra ? "#eef2f5" : "#ffffff";
        bgColors.push(new Array(cabAg.length).fill(zebraColor));
    }
    
    sheetAgenda.getRange(2, 1, totalFilas - 1, cabAg.length).setBackgrounds(bgColors);
    sheetAgenda.getRange(2, 1, totalFilas - 1, cabAg.length).setVerticalAlignment("middle");
    
    sheetAgenda.autoResizeColumns(1, cabAg.length);
    sheetAgenda.setColumnWidth(5, 150);  // Madre
    sheetAgenda.setColumnWidth(6, 300);  // Hija
    sheetAgenda.setColumnWidth(11, 110); // LUN 23 Feb
    sheetAgenda.setColumnWidth(12, 222); // Historial
    sheetAgenda.setColumnWidth(13, 150); // Notas
    
    sheetAgenda.getRange(2, 5, totalFilas - 1, 2).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sheetAgenda.getRange(2, 12, totalFilas - 1, 2).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  }

  SpreadsheetApp.getUi().alert("☕ ¡Mesa de trabajo lista!\nDatos en tiempo real sincronizados y enlaces activados.");
}

// ==========================================
// FASE 7: MASTER CALENDAR (Corregido: 1 Bloque=1 Hora y Fusión Dinámica)
// ==========================================
function fase7_dibujarCalendarioHoy() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetAgenda = ss.getSheetByName(HOJA_AGENDA);
  const sheetEquipo = ss.getSheetByName(HOJA_EQUIPO);
  if (!sheetAgenda || !sheetEquipo) return;

  const ui = SpreadsheetApp.getUi();
  
  let resHora = ui.prompt('⏰ Master Calendar', '¿A qué hora arranca la jornada de hoy? (Formato HH:MM, ej: 08:00)', ui.ButtonSet.OK_CANCEL);
  if (resHora.getSelectedButton() !== ui.Button.OK) return;
  let horaTxt = resHora.getResponseText().trim();
  if (!/^\d{1,2}:\d{2}$/.test(horaTxt)) horaTxt = "08:00"; 
  
  let [hInicio, mInicio] = horaTxt.split(':').map(Number);
  let minInicioDia = hInicio * 60 + mInicio;
  
  let dataEq = sheetEquipo.getDataRange().getValues();
  let equipo = [];
  let nomToInicial = {};
  for (let i = 1; i < dataEq.length; i++) {
    let n = dataEq[i][0] ? dataEq[i][0].toString().trim() : "";
    let ini = dataEq[i][3] ? dataEq[i][3].toString().trim().toUpperCase() : ""; 
    if (n) {
      equipo.push(n);
      if (ini) nomToInicial[n] = ini;
    }
  }

  let lr = sheetAgenda.getLastRow();
  if (lr < 2) return;
  const encAg = sheetAgenda.getRange(1, 1, 1, sheetAgenda.getLastColumn()).getValues()[0];
  const colAg = obtenerIndices(encAg);
  let dataAg = sheetAgenda.getRange(2, 1, lr - 1, sheetAgenda.getLastColumn()).getValues();
  
  let sheetPlan = ss.getSheetByName("Plan");
  let areaMap = {};
  if (sheetPlan) {
    const encPlan = sheetPlan.getRange(1, 1, 1, sheetPlan.getLastColumn()).getValues()[0];
    const colPlan = obtenerIndices(encPlan);
    let dataPlan = sheetPlan.getDataRange().getValues();
    for(let i = 1; i < dataPlan.length; i++) {
       let idu = colPlan["IDU"] !== undefined ? dataPlan[i][colPlan["IDU"]].toString().trim() : ""; 
       let cArea = colPlan["Área"] !== undefined ? colPlan["Área"] : (colPlan["Area"] !== undefined ? colPlan["Area"] : -1);
       let areaPlan = cArea !== -1 && dataPlan[i][cArea] ? dataPlan[i][cArea].toString().trim().toLowerCase() : ""; 
       if (idu) areaMap[idu] = areaPlan;
    }
  }

  let tareas = [];
  dataAg.forEach((r, idx) => {
    let idu = colAg["IDU"] !== undefined ? r[colAg["IDU"]].toString().trim() : "";
    let area = areaMap[idu] || ""; 
    let resp = colAg["Responsable"] !== undefined ? r[colAg["Responsable"]].toString().trim() : "";
    let hHija = colAg["Tarea Hija"] !== undefined ? r[colAg["Tarea Hija"]].toString().trim() : "";
    
    let idxHora = colAg["Hora"];
    let textoBloque = (colAg["LUN 02 Mar"] !== undefined && r[colAg["LUN 02 Mar"]]) ? r[colAg["LUN 02 Mar"]].toString().trim() : ""; // Fallback de bloques
    
    let ordenRaw = idxHora !== undefined ? r[idxHora] : "";
    let orden = "";
    if (Object.prototype.toString.call(ordenRaw) === '[object Date]') {
        orden = ordenRaw.getHours() + ":" + ("0" + ordenRaw.getMinutes()).slice(-2);
    } else {
        orden = ordenRaw ? ordenRaw.toString().trim().toUpperCase() : "";
    }
    
    let colorArea = "#fdf3e8"; 
    if (area.includes("finan")) colorArea = "#e6f4ea"; 
    else if (area.includes("operat")) colorArea = "#fff9c4"; 
    else if (area.includes("comerc")) colorArea = "#fce8e6"; 
    else if (area.includes("admin")) colorArea = "#e8f0fe"; 

    let idxHoy = colAg["Hoy"];
    let valHoy = idxHoy !== undefined && r[idxHoy] !== "" ? r[idxHoy].toString().replace(',', '.') : "0";
    let blq = parseFloat(valHoy) || 0;
    
    // CORRECCIÓN 1: 1 Bloque = 1 Hora = 2 slots de 30 mins
    let slots = Math.round(blq * 2); 
    
    if (resp && slots > 0) {
      let isCita = hHija.toUpperCase().includes("CITA");
      let isPausa = hHija.toUpperCase().includes("PAUSA") || hHija.toUpperCase().includes("COMIDA");
      
      let nombreFinal = hHija;
      if (isCita) nombreFinal = "🚗 " + hHija;
      if (isPausa) nombreFinal = "☕ " + hHija;

      tareas.push({ 
          id: idu + "_" + idx, 
          resp: resp, 
          tarea: nombreFinal, 
          orden: orden, 
          slots: slots, 
          isPausa: isPausa,
          isCita: isCita,
          colorArea: colorArea 
      });
    }
  });

  const MAX_SLOTS = 48; // 24 horas x 30 mins
  let grid = {};
  equipo.forEach(e => grid[e] = new Array(MAX_SLOTS).fill(null));
  let mapaInicios = {}; 
  let tareasOmitidas = false; 

  // --- PASO 1: LAS ROCAS (Horas Fijas) ---
  let regexRoca = /^(\d{1,2})(?:[:.](\d{2})\s*H?|\s*H)$/i; 
  tareas.forEach(t => {
    let m = t.orden.match(regexRoca);
    if (m) {
      let hT = parseInt(m[1], 10), mT = m[2] ? parseInt(m[2], 10) : 0;
      let startSlot = Math.round(((hT * 60 + mT) - minInicioDia) / 30);
      if (startSlot >= 0 && startSlot < MAX_SLOTS) {
        let cursor = startSlot, colocados = 0;
        // La Roca se corta si llega al final del día, pero empuja hacia abajo implacablemente
        while (colocados < t.slots && cursor < MAX_SLOTS) {
          grid[t.resp][cursor] = { ...t, type: 'roca' };
          colocados++; cursor++;
        }
        if (colocados < t.slots) tareasOmitidas = true;
        t.procesada = true;
      }
    }
  });

  // --- PASO 2: LAS PIEDRAS (Orden 1, 2, 3) ---
  equipo.forEach(eq => {
    let piedras = tareas.filter(t => !t.procesada && t.resp === eq && /^\d+$/.test(t.orden)).sort((a,b) => parseInt(a.orden) - parseInt(b.orden));
    let cursor = 0;
    piedras.forEach(t => {
      let colocados = 0, startRegistrado = false;
      while (colocados < t.slots && cursor < MAX_SLOTS) {
        // Solo coloca si el hueco está libre
        if (grid[eq][cursor] === null) {
          grid[eq][cursor] = { ...t, type: 'piedra' };
          
          if (!startRegistrado && nomToInicial[eq]) {
             let ancla = `${nomToInicial[eq]}${t.orden}`;
             if (mapaInicios[ancla] === undefined) mapaInicios[ancla] = cursor;
             startRegistrado = true;
          }
          colocados++;
        }
        cursor++; 
      }
      if (colocados < t.slots) tareasOmitidas = true;
      t.procesada = true;
    });
  });

  // --- PASO 3: RECREO UNIVERSAL ---
  let slotsPausa = [];
  equipo.forEach(eq => { for(let s=0; s<MAX_SLOTS; s++) if (grid[eq][s] && grid[eq][s].isPausa) slotsPausa.push(s); });
  slotsPausa = [...new Set(slotsPausa)];
  equipo.forEach(eq => {
     slotsPausa.forEach(s => {
         if (!grid[eq][s] || (grid[eq][s].type !== 'roca')) {
             grid[eq][s] = { id: "PAUSA_UNIV", tarea: "☕ Pausa", type: 'pausa', isPausa: true };
         }
     });
  });

  // --- PASO 4: SATÉLITES ---
  let satelites = tareas.filter(t => !t.procesada && /^[A-Z]+\d+$/.test(t.orden));
  satelites.forEach(t => {
     let startSlot = mapaInicios[t.orden];
     if (startSlot !== undefined) {
         let cursor = startSlot, colocados = 0;
         while (colocados < t.slots && cursor < MAX_SLOTS) {
             if (grid[t.resp][cursor] === null) {
                 grid[t.resp][cursor] = { ...t, type: 'satelite' };
                 if (colocados === 0) grid[t.resp][cursor].tarea = "🤝 " + grid[t.resp][cursor].tarea;
                 colocados++;
             }
             cursor++;
         }
         if (colocados < t.slots) tareasOmitidas = true;
         t.procesada = true;
     }
  });

  // --- PASO 5: ARENA (Sin hora ni orden) ---
  equipo.forEach(eq => {
     let arena = tareas.filter(t => !t.procesada && t.resp === eq);
     let cursor = 0;
     arena.forEach(t => {
         let colocados = 0;
         while (colocados < t.slots && cursor < MAX_SLOTS) {
             if (grid[eq][cursor] === null) {
                 grid[eq][cursor] = { ...t, type: 'arena' };
                 colocados++;
             }
             cursor++;
         }
         if (colocados < t.slots) tareasOmitidas = true;
     });
  });

  // 5. DIBUJAR Y FUSIONAR
  const COL_START = 15; 
  sheetAgenda.getRange(1, COL_START, MAX_SLOTS + 2, equipo.length + 2).breakApart().clear(); 
  
  let dValues = [], dBgs = [], dAligns = [];
  dValues.push(["📅 Master Calendar", ...new Array(equipo.length).fill("")]); 
  dBgs.push(new Array(equipo.length + 1).fill("#424242"));
  dAligns.push(new Array(equipo.length + 1).fill("center"));
  
  dValues.push(["Hora", ...equipo]); 
  dBgs.push(["#f3f3f3", ...equipo.map(e => "#f3f3f3")]);
  dAligns.push(["center", ...equipo.map(e => "center")]);

  let lastRowDrawn = 2; 
  for(let s=0; s<MAX_SLOTS; s++) {
      let minTotal = (hInicio * 60) + mInicio + (s * 30);
      let h = Math.floor(minTotal / 60) % 24, m = minTotal % 60;
      let filaV = [("0" + h).slice(-2) + ":" + ("0" + m).slice(-2)];
      let filaBg = ["#eceff1"];
      let filaAlig = ["center"];
      
      let hasData = false;
      equipo.forEach(eq => {
         let cell = grid[eq][s];
         if (cell) {
             hasData = true;
             
             // Aquí controlamos que el nombre se dibuje si es el primero del bloque continuado
             let esElPrimero = (s === 0 || !grid[eq][s-1] || grid[eq][s-1].id !== cell.id);
             
             filaV.push(esElPrimero ? cell.tarea : ""); 
             filaAlig.push("center");
             
             if (cell.isPausa || cell.isCita) filaBg.push("#e8e8e8"); 
             else filaBg.push(cell.colorArea || "#fdf3e8"); 
             
         } else {
             filaV.push(""); filaBg.push("#ffffff"); filaAlig.push("center");
         }
      });
      dValues.push(filaV); dBgs.push(filaBg); dAligns.push(filaAlig);
      if (hasData) lastRowDrawn = s + 3; 
  }

  let filasPintar = Math.min(MAX_SLOTS + 2, lastRowDrawn + 2);
  let rDestino = sheetAgenda.getRange(1, COL_START, filasPintar, equipo.length + 1);
  rDestino.setValues(dValues.slice(0, filasPintar)).setBackgrounds(dBgs.slice(0, filasPintar)).setHorizontalAlignments(dAligns.slice(0, filasPintar));
  rDestino.setVerticalAlignment("middle").setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  rDestino.setBorder(true, true, true, true, true, true, "lightgray", SpreadsheetApp.BorderStyle.SOLID);
  
  // LA MAGIA: Fusionar solo bloques consecutivos de la misma tarea
  equipo.forEach((eq, colIdx) => {
    let colExcel = COL_START + 1 + colIdx;
    for (let s = 0; s < MAX_SLOTS; s++) {
      let cell = grid[eq][s];
      if (cell) {
        let esElPrimero = (s === 0 || !grid[eq][s-1] || grid[eq][s-1].id !== cell.id);

        if (esElPrimero) { 
          let duracionConsecutiva = 0;
          // Contamos cuántas celdas SEGUDIAS pertenecen a esta tarea sin ser interrumpidas
          for (let i = s; i < MAX_SLOTS && grid[eq][i] && grid[eq][i].id === cell.id; i++) {
            duracionConsecutiva++;
          }
          if (duracionConsecutiva > 1) {
            sheetAgenda.getRange(s + 3, colExcel, duracionConsecutiva, 1).merge();
            s += (duracionConsecutiva - 1); 
          }
        }
      }
    }
  });

  sheetAgenda.getRange(1, COL_START, 1, equipo.length + 1).mergeAcross().setFontWeight("bold").setFontColor("white");
  sheetAgenda.getRange(2, COL_START, 1, equipo.length + 1).setFontWeight("bold");
  sheetAgenda.setColumnWidth(COL_START, 60);
  for (let i = 0; i < equipo.length; i++) sheetAgenda.setColumnWidth(COL_START + 1 + i, 160);

  let msg = "🎨 ¡Master Calendar Dibujado!\n✔ Escala ajustada (1 Bloque = 1 Hora).\n✔ Etiquetas dinámicas corregidas.";
  if (tareasOmitidas) msg += "\n\n⚠️ ALERTA DE COLAPSO: Tienes más tareas programadas que horas físicas en el día. Algunas se han quedado fuera.";
  ui.alert("⏰ Master Calendar", msg, ui.ButtonSet.OK);
}

de momento sólo quiero que me digas si me entiendes y qué entiendes.