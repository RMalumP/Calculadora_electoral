/**
 * accesibilidad.js
 * Accesibilidad y tema de la interfaz, sin tocar el marcado de cada pestaña:
 *
 *  · roles ARIA y teclado (flechas, Inicio, Fin) de la barra de pestañas;
 *  · nombre accesible para todos los campos que no lo tienen, también los de
 *    las filas que se crean al vuelo;
 *  · botón de tema (automático / claro / oscuro), guardado en localStorage.
 *
 * Se carga el último, cuando ya existe el DOM de todas las pestañas.
 */

/* ── Nombres accesibles ───────────────────────────────────────── */

const A11Y_NOMBRES = [
  ['.siglas-input, .pact-siglas-input', 'Siglas del partido'],
  ['.name-input, .pact-name-input', 'Nombre del partido'],
  ['.sr-name-input', 'Nombre del candidato'],
  ['.votes-input', 'Votos'],
  ['input[type=color]', 'Color del partido'],
  ['#pactometer-body input[type=number]', 'Escaños'],
  ['#second-round-body input[type=number]', 'Votos del candidato']
];

function a11yNombreDe(el) {
  if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return true;
  if (el.labels && el.labels.length) return true;
  return false;
}

/** <label> sin enlazar que acompaña a un campo: se busca subiendo hasta 3 niveles. */
function a11yEtiquetaVecina(el) {
  let cont = el.parentElement;
  for (let nivel = 0; cont && nivel < 3; nivel++, cont = cont.parentElement) {
    const lab = [...cont.querySelectorAll(':scope > label:not([for])')].find(l => !l.contains(el));
    if (lab) {
      if (!lab.id) lab.id = `lbl-${el.id || Math.random().toString(36).slice(2, 8)}`;
      return lab.id;
    }
  }
  return null;
}

function a11yEtiquetar(root) {
  const base = root || document;
  base.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea').forEach(el => {
    if (a11yNombreDe(el)) return;
    const porMapa = A11Y_NOMBRES.find(([sel]) => el.matches(sel));
    if (porMapa) { el.setAttribute('aria-label', porMapa[1]); return; }
    const lab = a11yEtiquetaVecina(el);
    if (lab) { el.setAttribute('aria-labelledby', lab); return; }
    const txt = el.getAttribute('placeholder') || el.title;
    if (txt) el.setAttribute('aria-label', txt);
  });
  // Botones que sólo llevan un símbolo: su título es el nombre.
  base.querySelectorAll('button:not([aria-label])').forEach(b => {
    if (!b.textContent.trim().replace(/[✕→⠿▲▼🔒🔓+×]/g, '') && b.title) b.setAttribute('aria-label', b.title);
  });
}

/* ── Barra de pestañas ────────────────────────────────────────── */

function a11yPestanas() {
  const barra = document.querySelector('.tabs-container');
  if (!barra) return;
  barra.setAttribute('role', 'tablist');
  barra.setAttribute('aria-label', 'Secciones de la aplicación');
  barra.querySelectorAll('.tab').forEach(b => {
    const id = b.dataset.tab;
    const activa = b.classList.contains('active');
    b.setAttribute('role', 'tab');
    b.id = `tab-btn-${id}`;
    b.setAttribute('aria-controls', `${id}-tab`);
    b.setAttribute('aria-selected', activa ? 'true' : 'false');
    b.tabIndex = activa ? 0 : -1;
    const panel = document.getElementById(`${id}-tab`);
    if (panel) { panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', b.id); }
  });
}

function a11yTeclasPestanas(ev) {
  const tabs = [...document.querySelectorAll('.tabs-container .tab')];
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  let j = null;
  if (ev.key === 'ArrowRight') j = (i + 1) % tabs.length;
  else if (ev.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
  else if (ev.key === 'Home') j = 0;
  else if (ev.key === 'End') j = tabs.length - 1;
  if (j === null) return;
  ev.preventDefault();
  tabs[j].focus();
  switchTab(tabs[j].dataset.tab);
}

/* ── Tema ─────────────────────────────────────────────────────── */

const TEMA_CLAVE = 'ce-tema';
const TEMA_ETIQUETAS = { auto: 'automático (el del sistema)', light: 'claro', dark: 'oscuro' };

function temaActual() {
  try {
    const t = localStorage.getItem(TEMA_CLAVE);
    return t === 'dark' || t === 'light' ? t : 'auto';
  } catch (e) { return 'auto'; }
}

function temaAplicar(t) {
  const raiz = document.documentElement;
  if (t === 'auto') raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', t);
  try { if (t === 'auto') localStorage.removeItem(TEMA_CLAVE); else localStorage.setItem(TEMA_CLAVE, t); } catch (e) { /* sin almacenamiento */ }
  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.title = `Tema: ${TEMA_ETIQUETAS[t]}. Pulsa para cambiarlo.`;
    btn.setAttribute('aria-label', btn.title);
  }
}

function temaSiguiente() {
  const orden = ['auto', 'dark', 'light'];
  temaAplicar(orden[(orden.indexOf(temaActual()) + 1) % orden.length]);
}

/* ── Arranque ─────────────────────────────────────────────────── */

(function iniciarAccesibilidad() {
  // Pestañas: tras cada cambio de pestaña se actualizan roles y estado.
  if (typeof switchTab === 'function') {
    const original = switchTab;
    window.switchTab = function (...args) {
      const r = original.apply(this, args);
      a11yPestanas();
      return r;
    };
  }
  a11yPestanas();
  document.querySelector('.tabs-container')?.addEventListener('keydown', a11yTeclasPestanas);

  // Campos: ahora y cada vez que se añadan filas o se pinten tablas.
  a11yEtiquetar();
  let pendiente = false;
  new MutationObserver(() => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => { pendiente = false; a11yEtiquetar(); });
  }).observe(document.querySelector('.main') || document.body, { childList: true, subtree: true });

  document.getElementById('theme-btn')?.addEventListener('click', temaSiguiente);
  temaAplicar(temaActual());
})();
