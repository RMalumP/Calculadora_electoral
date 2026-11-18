/**
 * basica-exportar.js
 * Sacar y compartir lo de la calculadora básica y el pactómetro.
 *
 * La calculadora avanzada ya tenía CSV, imagen y enlace compartible
 * (advanced-exportar.js); la básica sólo sabía guardar una copia autónoma de
 * la página, que es un archivo grande y malo de pegar en ningún sitio. Aquí
 * tiene lo mismo, sin depender de los módulos de la avanzada, que se descargan
 * aparte y puede que no estén.
 *
 * El enlace lleva la sesión entera (partidos, votos, colores, parámetros y
 * pactómetro) dentro del propio fragmento, así que no hace falta servidor.
 */

/* ── Utilidades ───────────────────────────────────────────────── */

function basExpNombre(ext) {
  const f = new Date().toISOString().slice(0, 10);
  return `calculadora_${f}.${ext}`;
}

function basExpDescargar(contenido, nombre, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Una celda de CSV: comillas si lleva ; " o saltos de línea. */
function basCsvCelda(v) {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con ; y BOM, que es lo que entiende Excel en español. */
function basCsvTexto(filas) {
  return '﻿' + filas.map(f => f.map(basCsvCelda).join(';')).join('\r\n');
}

/** Número con separador de miles español. */
function basNum(n) {
  return Math.round(n || 0).toLocaleString('es-ES');
}

/* ── CSV ──────────────────────────────────────────────────────── */

function basExportarCSV() {
  const r = window.lastBasicResult;
  if (!r) { alert('Calcula primero un reparto.'); return; }
  const seatWord = typeof currentSeatName === 'string' ? currentSeatName : 'escaños';
  const filas = [['Candidatura', 'Siglas', 'Votos', '% votos', seatWord, '% ' + seatWord, 'Diferencia (puntos)']];
  r.allocated.forEach(p => {
    const votePct = r.totalValid > 0 ? p.votes / r.totalValid * 100 : 0;
    const seatPct = r.totalSeats > 0 ? p.seats / r.totalSeats * 100 : 0;
    filas.push([
      p.name, p.siglas || '', p.votes,
      votePct.toFixed(2).replace('.', ','),
      p.seats,
      seatPct.toFixed(2).replace('.', ','),
      (seatPct - votePct).toFixed(2).replace('.', ',')
    ]);
  });
  const formula = FORMULAS.find(f => f.id === r.formula)?.name || r.formula;
  filas.push([]);
  filas.push(['Fórmula', formula]);
  filas.push(['Total de votos válidos', r.totalValid]);
  filas.push([`Total de ${seatWord}`, r.totalSeats]);
  basExpDescargar(basCsvTexto(filas), basExpNombre('csv'), 'text/csv;charset=utf-8');
}

/* ── Imagen ───────────────────────────────────────────────────── */

function basExportarPNG() {
  const r = window.lastBasicResult;
  if (!r) { alert('Calcula primero un reparto.'); return; }
  const css = getComputedStyle(document.documentElement);
  const v = (n, f) => css.getPropertyValue(n).trim() || f;
  const col = {
    bg: v('--surface', '#fff'), text: v('--text', '#18181a'), muted: v('--text-muted', '#6e6860'),
    line: v('--border', '#d6d0c8'), head: v('--header-bg', '#211c18'), headText: v('--header-text', '#ede7e0')
  };

  const seatWord = typeof currentSeatName === 'string' ? currentSeatName : 'escaños';
  const filas = r.allocated.filter(p => p.seats > 0).slice(0, 24);
  const resto = r.allocated.filter(p => p.seats === 0 && p.votes > 0).length;
  const W = 900, filaH = 34, cab = 86, pie = 40;
  const H = cab + 34 + filas.length * filaH + (resto ? 30 : 0) + pie;
  const k = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * k; canvas.height = H * k;
  const g = canvas.getContext('2d');
  g.scale(k, k);

  g.fillStyle = col.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = col.head; g.fillRect(0, 0, W, cab - 2);
  g.fillStyle = col.headText;
  g.font = '700 22px "Libre Baskerville", Georgia, serif'; g.textBaseline = 'alphabetic';
  g.fillText('Reparto de ' + seatWord, 24, 38);
  const formula = FORMULAS.find(f => f.id === r.formula)?.name || r.formula;
  g.font = '400 14px "Source Sans 3", Arial, sans-serif'; g.globalAlpha = 0.85;
  g.fillText(`${formula} · ${basNum(r.totalSeats)} ${seatWord} · ${basNum(r.totalValid)} votos válidos`, 24, 62);
  g.globalAlpha = 1;

  const x = { name: 24, votes: 440, pct: 530, bar: 590, seats: 840 };
  let y = cab + 20;
  g.font = '700 11px "Source Sans 3", Arial, sans-serif'; g.fillStyle = col.muted;
  g.fillText('CANDIDATURA', x.name, y);
  g.textAlign = 'right';
  g.fillText('VOTOS', x.votes, y); g.fillText('% VOTOS', x.pct, y);
  g.fillText(seatWord.toUpperCase(), x.seats + 36, y);
  g.textAlign = 'left';
  y += 8;

  const max = Math.max(1, ...filas.map(p => p.seats));
  filas.forEach(p => {
    const c = p.color || '#888888';
    g.strokeStyle = col.line; g.beginPath(); g.moveTo(24, y); g.lineTo(W - 24, y); g.stroke();
    const cy = y + filaH / 2;
    g.fillStyle = c; g.fillRect(x.name, cy - 6, 12, 12);
    g.fillStyle = col.text; g.font = '600 14px "Source Sans 3", Arial, sans-serif';
    const completo = p.siglas && p.siglas !== p.name ? `${p.siglas} · ${p.name}` : p.name;
    let nombre = completo;
    while (g.measureText(nombre).width > 380 && nombre.length > 4) nombre = nombre.slice(0, -2);
    g.textBaseline = 'middle';
    g.fillText(nombre === completo ? nombre : nombre + '…', x.name + 20, cy);
    g.font = '400 14px "Source Sans 3", Arial, sans-serif'; g.textAlign = 'right';
    g.fillText(basNum(p.votes), x.votes, cy);
    g.fillText((r.totalValid > 0 ? p.votes / r.totalValid * 100 : 0).toFixed(2).replace('.', ',') + ' %', x.pct, cy);
    g.globalAlpha = 0.75; g.fillStyle = c;
    g.fillRect(x.bar, cy - 6, Math.max(2, (p.seats / max) * (x.seats - x.bar - 60)), 12);
    g.globalAlpha = 1;
    g.fillStyle = col.text; g.font = '700 16px "Source Sans 3", Arial, sans-serif';
    g.fillText(String(p.seats), x.seats + 36, cy);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    y += filaH;
  });

  if (resto) {
    g.fillStyle = col.muted; g.font = 'italic 12px "Source Sans 3", Arial, sans-serif';
    g.fillText(`${resto} candidatura${resto === 1 ? '' : 's'} más sin ${seatWord.replace(/s$/, '')}`, x.name, y + 20);
  }
  g.fillStyle = col.muted; g.font = '400 11px "Source Sans 3", Arial, sans-serif';
  g.fillText('Calculadora electoral', 24, H - 14);

  canvas.toBlob(b => b && basExpDescargar(b, basExpNombre('png'), 'image/png'), 'image/png');
}

/* ── Enlace compartible ───────────────────────────────────────── */

/** Más allá de esto el enlace empieza a no caber en algunos clientes de mensajería. */
const BAS_ENLACE_MAX = 12000;

function basSesionAToken(sesion) {
  const json = JSON.stringify(sesion);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function basSesionDeToken(token) {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

function basEnlaceSesion() {
  if (typeof sesionAnotar !== 'function') return;
  let token;
  try { token = basSesionAToken(sesionAnotar()); }
  catch (e) { alert('No se ha podido preparar el enlace.'); return; }

  if (token.length > BAS_ENLACE_MAX) {
    alert('La sesión es demasiado grande para caber en un enlace.\n\n' +
          'Usa el botón 💾 de la cabecera, que guarda una copia de la página que ' +
          'funciona por sí sola.');
    return;
  }

  const url = `${location.origin}${location.pathname}#calculadora&c=${token}`;
  const avisar = ok => alert(ok
    ? 'Enlace copiado. Al abrirlo se recupera esta calculadora tal cual.'
    : `Copia este enlace:\n\n${url}`);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(() => avisar(true)).catch(() => avisar(false));
  } else {
    avisar(false);
  }
}

/**
 * Sesión compartida en la URL. Se lee al evaluar este archivo, antes de que
 * ui.js reconstruya las filas, por el mismo camino que usan las copias
 * guardadas y el autoguardado (window.CE_SESION).
 */
(function basLeerSesionDeUrl() {
  if (typeof window === 'undefined') return;
  const m = /[&?]c=([^&]+)/.exec(location.hash || '');
  if (!m) return;
  try {
    const s = basSesionDeToken(m[1]);
    if (s && s.app === 'calculadora-electoral') window.CE_SESION = s;
  } catch (e) { /* enlace estropeado: se arranca en blanco */ }
})();

/* ── Traer una elección real a la calculadora básica ──────────── */

/**
 * Vuelca el recuento de la calculadora avanzada en la básica: candidaturas,
 * votos, colores, total de escaños, fórmula y barrera. Así se puede jugar con
 * datos reales sin montar la avanzada entera.
 */
function basDesdeAvanzada() {
  const r = typeof _advResult !== 'undefined' ? _advResult : null;
  if (!r || !r.national?.length) { alert('Todavía no hay un recuento que llevarse.'); return; }

  const conVotos = r.national.filter(p => p.votes > 0)
    .sort((a, b) => b.seats - a.seats || b.votes - a.votes)
    .slice(0, 40);

  const tbody = select('#votes-body');
  if (!tbody || typeof addRow !== 'function') return;
  // Fuera lo que hubiera, incluido «Otros»: se está sustituyendo el escenario.
  [...tbody.querySelectorAll('tr')].forEach(tr => tr.remove());
  if (typeof otrosAbsorbedParties !== 'undefined') otrosAbsorbedParties.length = 0;

  conVotos.forEach(p => {
    const tr = addRow(p.name || p.siglas || '', String(p.votes),
                      typeof advPartyColor === 'function' ? advPartyColor(p) : '#888888');
    const sig = tr?.querySelector('.siglas-input');
    if (sig && p.siglas) sig.value = p.siglas;
  });
  addRow('Otros partidos', '', '#474747', true);

  const blanco = select('#blank-votes');
  if (blanco) blanco.value = formatVotes(r.summary?.totalBlanco || 0);

  const escanos = select('#seats');
  if (escanos) escanos.value = r.summary?.totalSeats || 350;

  const barrera = select('#barrier');
  if (barrera) barrera.value = r.config?.barrera1?.activa ? (r.config.barrera1.valor || 0) : 0;

  const formula = select('#formula-select');
  if (formula && [...formula.options].some(o => o.value === r.config?.formula)) {
    formula.value = r.config.formula;
    if (typeof updateFormulaDesc === 'function') updateFormulaDesc();
  }

  switchTab('calculator');
  updateTotals();
  calculate();
}

/* ── Pie de la hoja impresa ───────────────────────────────────── */

/**
 * El papel sale sin contexto: al cabo de una semana nadie recuerda con qué
 * fórmula ni sobre qué datos salió ese reparto. Esto rellena el pie justo
 * antes de imprimir, con lo que se esté mirando en ese momento.
 */
function basPieImpresion() {
  const pie = document.getElementById('print-pie');
  if (!pie) return;
  const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const partes = ['Calculadora electoral'];

  const activa = document.querySelector('.tab.active')?.dataset.tab;
  if (activa === 'advanced') {
    const eleccion = select('#adv-election');
    const nombre = eleccion?.options[eleccion.selectedIndex]?.textContent?.trim();
    if (nombre) partes.push(nombre);
    const f = typeof _advConfig !== 'undefined' && _advConfig
      ? FORMULAS.find(x => x.id === _advConfig.formula)?.name
      : null;
    if (f) partes.push(f);
  } else {
    const r = window.lastBasicResult;
    if (r) {
      const f = FORMULAS.find(x => x.id === r.formula)?.name || r.formula;
      const seatWord = typeof currentSeatName === 'string' ? currentSeatName : 'escaños';
      partes.push(f, `${basNum(r.totalSeats)} ${seatWord}`, `${basNum(r.totalValid)} votos válidos`);
    }
  }

  partes.push(fecha);
  pie.textContent = partes.join(' · ');
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', basPieImpresion);
  // Algunos navegadores sólo avisan por el media query, no por beforeprint.
  const mq = window.matchMedia?.('print');
  if (mq?.addEventListener) mq.addEventListener('change', e => { if (e.matches) basPieImpresion(); });
}
