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

/**
 * Entero de un campo numérico, admitiendo lo que el navegador admite.
 *
 * `parseInt` corta en el primer carácter que no es cifra, así que un campo
 * `type="number"` con «1e3» —que el navegador acepta y vale mil— se leía como
 * un 1 sin avisar de nada. `Number` lo interpreta como lo que es.
 */
function parseIntField(val, porDefecto = 0) {
  const n = Number(String(val ?? '').trim());
  if (!Number.isFinite(n)) return porDefecto;
  const entero = Math.trunc(n);
  return entero === 0 && porDefecto !== 0 && String(val ?? '').trim() === '' ? porDefecto : entero;
}

/* ── Contraste del texto sobre un color de partido ─────────────── */

function _canalLineal(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa de un color (WCAG 2.1). */
function luminanciaRelativa(r, g, b) {
  return 0.2126 * _canalLineal(r) + 0.7152 * _canalLineal(g) + 0.0722 * _canalLineal(b);
}

function _rgbDeHex(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * El mismo color, oscurecido lo justo para que el texto blanco encima llegue
 * al contraste mínimo de WCAG AA.
 *
 * Las pastillas de escaños llevan el color de la candidatura, que lo elige
 * quien usa la aplicación o viene de los datos: con un azul o un verde medios
 * el blanco encima se quedaba en 2,4 de contraste. Oscurecer mantiene el tono
 * del partido, que es lo que identifica la pastilla.
 */
function colorLegibleParaBlanco(hex, minimo = 4.5) {
  const rgb = _rgbDeHex(hex);
  if (!rgb) return hex;
  let [r, g, b] = rgb;
  for (let i = 0; i < 30; i++) {
    const contraste = 1.05 / (luminanciaRelativa(r, g, b) + 0.05);
    if (contraste >= minimo) break;
    r *= 0.92; g *= 0.92; b *= 0.92;
  }
  const dos = n => Math.round(n).toString(16).padStart(2, '0');
  return '#' + dos(r) + dos(g) + dos(b);
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
