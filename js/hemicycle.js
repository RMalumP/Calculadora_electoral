/**
 * hemicycle.js – Representación visual usando técnica de rotación de bordes
 */

let _hemicycleDragStart = null;
let _hemicycleOffset = { x: 0, y: 0 };

function toggleHemicycleVisual() {
  const win = document.getElementById('hemicycle-window');
  const btn = document.getElementById('hemicycle-toggle');
  if (win.style.display === 'none') {
    win.style.display = 'block';
    btn.textContent = '▲ Representación visual';
    drawHemicycle();
  } else {
    win.style.display = 'none';
    btn.textContent = '▼ Representación visual';
  }
}

function closeHemicycleWindow() {
  document.getElementById('hemicycle-window').style.display = 'none';
  document.getElementById('hemicycle-toggle').textContent = '▼ Representación visual';
}

function makeHemicycleDraggable() {
  const win    = document.getElementById('hemicycle-window');
  const header = document.getElementById('hemicycle-header');
  if (!win || !header) return;

  header.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    const rect = win.getBoundingClientRect();
    _hemicycleOffset = { x: rect.left - e.clientX, y: rect.top - e.clientY };
    _hemicycleDragStart = true;
    document.addEventListener('mousemove', _onHemicycleMove);
    document.addEventListener('mouseup',   _onHemicycleUp);
  });
}

function _onHemicycleMove(e) {
  if (!_hemicycleDragStart) return;
  const win = document.getElementById('hemicycle-window');
  win.style.left  = (e.clientX + _hemicycleOffset.x) + 'px';
  win.style.top   = (e.clientY + _hemicycleOffset.y) + 'px';
  win.style.right = 'auto';
}

function _onHemicycleUp() {
  _hemicycleDragStart = false;
  document.removeEventListener('mousemove', _onHemicycleMove);
  document.removeEventListener('mouseup',   _onHemicycleUp);
}

/* ── DIBUJO DEL HEMICICLO ──────────────────────────────────────── */

/**
 * Dibuja el hemiciclo. Sin argumentos lee la tabla de la calculadora básica;
 * la avanzada le pasa sus propios resultados y el contenedor de su ventana.
 */
function drawHemicycle(resultsArg, chartEl) {
  const results = resultsArg || getResults();
  const chart   = chartEl || document.getElementById('hemicycle-chart');
  chart.innerHTML = '';

  const totalSeats = results.reduce((s, r) => s + r.seats, 0);
  if (!results.length || totalSeats === 0) {
    chart.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center">Sin datos</p>';
    return;
  }

  /* Calcular ángulos acumulativos */
  let cumDeg = 0;
  const segments = results.map(r => {
    const deg      = (r.seats / totalSeats) * 180;
    const startDeg = cumDeg;
    const endDeg   = cumDeg + deg;
    cumDeg = endDeg;
    return { ...r, startDeg, endDeg, deg };
  });

  /* Inyectar @keyframes dinámicos */
  let css = '';
  segments.forEach((seg, i) => {
    css += `
      @keyframes hemi-rot-${i} {
        0%   { transform: rotate(${seg.startDeg}deg); }
        100% { transform: rotate(${seg.endDeg}deg); }
      }`;
  });

  let styleEl = document.getElementById('hemicycle-keyframes');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'hemicycle-keyframes';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;

  /* Crear <ul class="hemicycle-donut"> */
  const ul = document.createElement('ul');
  ul.className = 'hemicycle-donut';

  segments.forEach((seg, i) => {
    const li = document.createElement('li');
    li.style.cssText = `
      z-index: ${segments.length - i};
      border-color: ${seg.color};
      animation-name: hemi-rot-${i};
      animation-delay: ${i * 0.3}s;
    `;

    const span = document.createElement('span');
    span.textContent = seg.name;
    span.style.cssText = `
      transform: rotate(-${seg.endDeg}deg);
      animation-delay: ${i * 0.3}s;
    `;
    li.appendChild(span);
    ul.appendChild(li);
  });

  /* Leyenda debajo */
  const legend = document.createElement('div');
  legend.style.cssText = `
    display:flex; flex-wrap:wrap; gap:8px 14px; justify-content:center;
    margin-top:14px; font-size:0.78rem;
  `;
  segments.forEach(seg => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:5px';
    item.innerHTML = `
      <span style="display:inline-block;width:12px;height:12px;background:${seg.color};border-radius:2px;border:1px solid rgba(0,0,0,.15)"></span>
      <span style="color:var(--text)">${seg.name} <strong>${seg.seats}</strong></span>`;
    legend.appendChild(item);
  });

  chart.appendChild(ul);
  chart.appendChild(legend);
}

/* ── LECTURA DE RESULTADOS ─────────────────────────────────────── */

function getResults() {
  const tbody = document.getElementById('results-body');
  if (!tbody) return [];
  const results = [];
  tbody.querySelectorAll('tr').forEach(tr => {
    const badge  = tr.querySelector('.result-badge');
    const swatch = tr.querySelector('.color-swatch');
    const nameEl = tr.querySelector('.result-party-name');
    const seats  = badge  ? parseInt(badge.textContent) || 0 : 0;
    if (!seats) return;
    const color = swatch
      ? (swatch.style.background || swatch.style.backgroundColor || '#888')
      : '#888';
    const name = nameEl ? nameEl.textContent.trim() : (tr.querySelector('td')?.textContent.trim() || '?');
    results.push({ name, seats, color });
  });
  return results;
}

/* ── SHOW / HIDE TOGGLE ────────────────────────────────────────── */

function showHemicycleToggle() {
  document.getElementById('hemicycle-toggle-container').style.display = 'block';
}

function hideHemicycleToggle() {
  document.getElementById('hemicycle-toggle-container').style.display = 'none';
  closeHemicycleWindow();
}

function updateHemicycleIfVisible() {
  const win = document.getElementById('hemicycle-window');
  if (win && win.style.display !== 'none') drawHemicycle();
}

document.addEventListener('DOMContentLoaded', makeHemicycleDraggable);
