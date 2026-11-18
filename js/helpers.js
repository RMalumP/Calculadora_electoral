/**
 * helpers.js
 * Funciones auxiliares reutilizables para DOM, parsing y formateo.
 */

/* ── DOM Utilities ── */

function selectAll(selector) {
  return [...document.querySelectorAll(selector)];
}

function select(selector) {
  return document.querySelector(selector);
}

function setDisplay(el, show) {
  if (el) el.style.display = show ? '' : 'none';
}

function toggleClass(el, className, force) {
  if (el) el.classList.toggle(className, force);
}

function updateText(el, text) {
  if (el) el.textContent = text;
}

function updateHTML(el, html) {
  if (el) el.innerHTML = html;
}

/** Escapa texto de usuario antes de meterlo en un innerHTML o en un atributo. */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── Parse & Format ── */

function parseVoteValue(val) {
  return parseInt(String(val || '').replace(/[^\d]/g, ''), 10) || 0;
}

function formatVotes(n) {
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatVotesInput(input) {
  if (input.type === 'number') return;
  const num = parseVoteValue(input.value);
  input.value = num > 0 ? formatVotes(Math.min(num, 9000000000)) : '';
}

function getVoteValue(input) {
  return parseVoteValue(input?.value);
}

/* ── String Utils ── */

function toRoman(num) {
  const vals = [
    [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],
    [100,'C'],[90,'XC'],[50,'L'],[40,'XL'],
    [10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']
  ];
  let result = '';
  for (const [v, s] of vals) {
    while (num >= v) { result += s; num -= v; }
  }
  return result;
}

function extractSiglasFromName(name) {
  const match = name.match(/^Partido\s+([A-Za-z0-9]+)$/);
  return match ? match[1].toUpperCase() : '';
}

/* ── Siglas & Names Visibility ── */

function updateSiglasElements(selector, visible, names) {
  selectAll(selector).forEach(el => {
    setDisplay(el, visible && (names?.has(el.dataset.siglas) ?? true));
  });
}

function updateNameElements(selector, hidden) {
  selectAll(selector).forEach(el => {
    toggleClass(el, 'names-hidden-mode', hidden);
    toggleClass(el, 'names-has-value', hidden && el.value?.trim());
  });
}

function updateNameSpans(selector, hidden) {
  selectAll(selector).forEach(el => {
    toggleClass(el, 'names-hidden-mode', hidden);
    toggleClass(el, 'names-has-value', hidden && el.textContent?.trim());
  });
}

/* ── Button Styling ── */

function styleButton(btn, active, activeColor, inactiveBg, inactiveColor) {
  if (btn) {
    btn.style.background = active ? activeColor : inactiveBg;
    btn.style.color = active ? 'white' : inactiveColor;
  }
}

/* ── Desplazamiento ── */

/** ¿Tiene el sistema activado «reducir el movimiento»? */
function movimientoReducido() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
}

/**
 * Lleva un elemento a la vista. Respeta «reducir el movimiento» y, si el
 * elemento ya se ve entero, no mueve nada: en escritorio no tiene sentido dar
 * un salto cuando los resultados están delante.
 */
function desplazarA(el, opciones = {}) {
  if (!el || el.offsetParent === null) return;
  const { forzar = false, block = 'nearest' } = opciones;
  if (!forzar) {
    const r = el.getBoundingClientRect();
    const alto = window.innerHeight || document.documentElement.clientHeight;
    if (r.top >= 0 && r.top < alto * 0.6) return;
  }
  el.scrollIntoView({ behavior: movimientoReducido() ? 'auto' : 'smooth', block });
}
