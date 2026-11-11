/**
 * advanced-exportar.js
 * Sacar los resultados de la calculadora avanzada y compartir un escenario:
 *
 *  · CSV del recuento final (y del desglose territorial), pensado para Excel en español;
 *  · imagen PNG del recuento, dibujada en un canvas (sin librerías);
 *  · enlace con la configuración en la propia URL (#avanzada&s=…), que al abrirse
 *    carga el mismo ámbito, convocatoria y opciones.
 *
 * El enlace lleva la configuración, no las ediciones manuales de votos.
 */

/* ── Utilidades ───────────────────────────────────────────────── */

function advExpNombre(ext) {
  const base = (select('#adv-election')?.value || 'resultados').replace(/^local:/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-');
  const fecha = _advParties?.eleccion?.anio ? `_${_advParties.eleccion.anio}` : '';
  return `calculadora_${base}${fecha}.${ext}`;
}

function advExpDescargar(contenido, nombre, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Una celda de CSV: comillas si lleva ; " o saltos de línea. */
function advCsvCelda(v) {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const advCsvNum = (n, dec = 2) => (Number.isFinite(n) ? n.toFixed(dec).replace('.', ',') : '');

function advCsvTexto(filas) {
  // BOM para que Excel abra bien los acentos; ; y coma decimal, como en un Excel en español.
  return '﻿' + filas.map(f => f.map(advCsvCelda).join(';')).join('\r\n') + '\r\n';
}

/* ── CSV ──────────────────────────────────────────────────────── */

function advExportarCSV() {
  if (!_advResult) return;
  const r = _advResult;
  const comp = !!r.compensation;
  const reales = r.config.seatsMode === 'sheet' && r.national.some(p => p.realSeats > 0);
  const filas = [[
    'Candidatura', 'Siglas', 'Votos', '% votos', 'Escaños', '% escaños', 'Dif. %',
    ...(comp ? ['Directos', 'Compensatorios'] : []), ...(reales ? ['Reales'] : [])
  ]];
  r.national.forEach(p => filas.push([
    p.name, p.siglas || '', p.votes, advCsvNum(p.votePct), p.seats, advCsvNum(p.seatPct), advCsvNum(p.diff),
    ...(comp ? [p.directSeats ?? '', p.compSeats ?? ''] : []), ...(reales ? [p.realSeats ?? ''] : [])
  ]));
  advExpDescargar(advCsvTexto(filas), advExpNombre('csv'), 'text/csv;charset=utf-8');
}

function advExportarCSVTerritorial() {
  if (typeof advTerritorialData !== 'function' || !_advResult) return;
  const by = _advTerr.by;
  const terr = advTerritorialData(by);
  const parties = _advResult.national.filter(p => p.votes > 0);
  const filas = [[by === 'ccaa' ? 'Comunidad' : 'Provincia', by === 'ccaa' ? '' : 'Comunidad', 'Total',
    ...parties.map(p => `${p.siglas || p.name} (votos)`), ...parties.map(p => `${p.siglas || p.name} (%)`)]];
  terr.forEach(t => filas.push([t.name, t.group || '', t.total,
    ...parties.map(p => t.votes.get(p.key) || 0),
    ...parties.map(p => advCsvNum(t.total > 0 ? (t.votes.get(p.key) || 0) / t.total * 100 : 0))]));
  advExpDescargar(advCsvTexto(filas), advExpNombre('csv').replace('.csv', `_por-${by === 'ccaa' ? 'comunidad' : 'provincia'}.csv`), 'text/csv;charset=utf-8');
}

/* ── Imagen ───────────────────────────────────────────────────── */

function advExportarPNG() {
  if (!_advResult) return;
  const r = _advResult;
  const css = getComputedStyle(document.documentElement);
  const v = (n, f) => css.getPropertyValue(n).trim() || f;
  const col = { bg: v('--surface', '#fff'), text: v('--text', '#18181a'), muted: v('--text-muted', '#6e6860'),
                line: v('--border', '#d6d0c8'), accent: v('--accent', '#8b1f1f'), head: v('--header-bg', '#211c18'), headText: v('--header-text', '#ede7e0') };

  const filas = r.national.filter(p => p.seats > 0).slice(0, 24);
  const resto = r.national.filter(p => p.seats === 0 && p.votes > 0).length;
  const W = 960, filaH = 34, cab = 96, pie = 40;
  const H = cab + 34 + filas.length * filaH + (resto ? 30 : 0) + pie;
  const k = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * k; canvas.height = H * k;
  const g = canvas.getContext('2d');
  g.scale(k, k);

  g.fillStyle = col.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = col.head; g.fillRect(0, 0, W, cab - 2);
  g.fillStyle = col.headText; g.font = '700 22px "Libre Baskerville", Georgia, serif'; g.textBaseline = 'alphabetic';
  const ambito = r.config.circunscripcion === 'nacional' ? 'circunscripción estatal'
    : r.config.circunscripcion === 'ccaa' ? 'circunscripciones autonómicas' : 'circunscripciones provinciales';
  g.fillText(`Recuento final · ${ambito}`, 24, 38);
  g.font = '400 14px "Source Sans 3", Arial, sans-serif'; g.globalAlpha = 0.85;
  const formula = FORMULAS.find(f => f.id === r.config.formula)?.name || r.config.formula;
  g.fillText(`${select('#adv-subtitle')?.textContent.split(' · ').slice(0, 4).join(' · ') || ''}`, 24, 60);
  g.fillText(`${formula} · ${advNum(r.summary.totalSeats)} escaños · Gallagher ${r.summary.gallagher.toFixed(2)}`, 24, 80);
  g.globalAlpha = 1;

  const x = { name: 24, votes: 470, pct: 560, bar: 620, seats: 900 };
  let y = cab + 20;
  g.font = '700 11px "Source Sans 3", Arial, sans-serif'; g.fillStyle = col.muted;
  g.fillText('CANDIDATURA', x.name, y); g.textAlign = 'right';
  g.fillText('VOTOS', x.votes, y); g.fillText('% VOTOS', x.pct, y); g.fillText('ESCAÑOS', x.seats + 36, y);
  g.textAlign = 'left';
  y += 8;
  const max = Math.max(1, ...filas.map(p => p.seats));
  filas.forEach(p => {
    const c = advPartyColor(p);
    g.strokeStyle = col.line; g.beginPath(); g.moveTo(24, y); g.lineTo(W - 24, y); g.stroke();
    const cy = y + filaH / 2;
    g.fillStyle = c; g.fillRect(x.name, cy - 6, 12, 12);
    g.fillStyle = col.text; g.font = '600 14px "Source Sans 3", Arial, sans-serif';
    const completo = p.siglas && p.siglas !== p.name ? `${p.siglas} · ${p.name}` : p.name;
    let nombre = completo;
    while (g.measureText(nombre).width > 400 && nombre.length > 4) nombre = nombre.slice(0, -2);
    g.textBaseline = 'middle';
    g.fillText(nombre === completo ? nombre : nombre + '…', x.name + 20, cy);
    g.font = '400 14px "Source Sans 3", Arial, sans-serif'; g.textAlign = 'right';
    g.fillText(advNum(p.votes), x.votes, cy); g.fillText(advPct(p.votePct), x.pct, cy);
    g.globalAlpha = 0.75; g.fillStyle = c;
    g.fillRect(x.bar, cy - 6, Math.max(2, (p.seats / max) * (x.seats - x.bar - 60)), 12); g.globalAlpha = 1;
    g.fillStyle = col.text; g.font = '700 16px "Source Sans 3", Arial, sans-serif';
    g.fillText(String(p.seats), x.seats + 36, cy);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    y += filaH;
  });
  if (resto) {
    g.fillStyle = col.muted; g.font = 'italic 12px "Source Sans 3", Arial, sans-serif';
    g.fillText(`${resto} candidatura${resto === 1 ? '' : 's'} más sin escaño`, x.name, y + 20);
  }
  g.fillStyle = col.muted; g.font = '400 11px "Source Sans 3", Arial, sans-serif';
  g.fillText('Calculadora electoral', 24, H - 14);

  canvas.toBlob(b => b && advExpDescargar(b, advExpNombre('png'), 'image/png'), 'image/png');
}

/* ── Enlace con la configuración ──────────────────────────────── */

const ADV_ESC_MAX = 20000;

function advEscenarioAToken() {
  const json = JSON.stringify({ e: select('#adv-election')?.value || '', c: _advConfig });
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function advEscenarioDeToken(token) {
  try {
    if (!token || token.length > ADV_ESC_MAX) return null;
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const o = JSON.parse(decodeURIComponent(escape(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)))));
    if (!o || typeof o.e !== 'string' || !o.c || typeof o.c !== 'object') return null;
    return { app: 'calculadora-electoral', parte: 'avanzada', version: 1, eleccion: o.e, config: o.c };
  } catch (err) { return null; }
}

/** Escenario compartido en la URL actual, si lo hay. */
function advLeerEscenarioDeUrl() {
  const m = /[&?]s=([^&]+)/.exec(location.hash);
  return m ? advEscenarioDeToken(m[1]) : null;
}

function advEnlaceEscenario() {
  return `${location.origin === 'null' ? location.href.split('#')[0] : location.origin + location.pathname}#avanzada&s=${advEscenarioAToken()}`;
}

async function advCopiarEnlace() {
  if (!_advLoaded || !_advConfig) return;
  const enlace = advEnlaceEscenario();
  let copiado = false;
  try { await navigator.clipboard.writeText(enlace); copiado = true; } catch (e) { /* sin permiso: se prueba otra vía */ }
  if (!copiado) {
    const t = document.createElement('textarea');
    t.value = enlace; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { copiado = document.execCommand('copy'); } catch (e) { copiado = false; }
    t.remove();
  }
  if (typeof autoToast === 'function') autoToast(copiado ? 'Enlace copiado: lleva la configuración actual' : 'No se ha podido copiar el enlace');
  if (!copiado) window.prompt('Copia este enlace:', enlace);
}

/** Aplica el escenario de la URL (si lo trae) sobre lo que haya cargado. */
async function advAplicarEscenarioDeUrl() {
  const s = advLeerEscenarioDeUrl();
  if (!s) return false;
  window.CE_ADV_PENDIENTE = null;   // manda el enlace sobre la sesión guardada
  try {
    await advApplySession(s);
    if (typeof autoToast === 'function') autoToast('Escenario del enlace cargado');
  } catch (err) {
    if (typeof autoToast === 'function') autoToast('No se ha podido cargar el escenario del enlace');
  }
  return true;
}

/* ── Arranque ─────────────────────────────────────────────────── */

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-adv-export], #adv-share-btn');
  if (!b) return;
  if (b.id === 'adv-share-btn') return advCopiarEnlace();
  const tipo = b.dataset.advExport;
  if (tipo === 'csv') advExportarCSV();
  else if (tipo === 'png') advExportarPNG();
  else if (tipo === 'csv-terr') advExportarCSVTerritorial();
});

window.addEventListener('hashchange', () => { if (_advLoaded && advLeerEscenarioDeUrl()) advAplicarEscenarioDeUrl(); });
