/**
 * carga-diferida.js
 * Descarga a demanda de lo que no hace falta para arrancar.
 *
 * Al arrancar, la página pedía 54 archivos y 624 KB, de los que 208 KB eran el
 * mapa (doce guiones y su hoja de estilos) y la teoría: dos pestañas que mucha
 * gente no abre nunca. Aquí quedan fuera del arranque, igual que ya estaba la
 * calculadora avanzada (carga-avanzada.js).
 *
 * Para que nada se note, lo aplazado se pide igualmente en cuanto el navegador
 * está ocioso: a los pocos segundos de abrir la página está todo, pero ya
 * fuera del camino crítico del primer pintado.
 *
 * Los guiones se insertan con async = false: se descargan a la vez pero se
 * ejecutan en este orden, que es el de sus dependencias.
 */

/* ── Utilidades ──────────────────────────────────────────────── */

const _cePedidos = new Map();

/** Inserta un <script> una sola vez y avisa cuando se ha ejecutado. */
function ceCargarScript(src) {
  if (_cePedidos.has(src)) return _cePedidos.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = resolve;
    s.onerror = () => { s.remove(); _cePedidos.delete(src); reject(new Error(`No se ha podido cargar ${src}`)); };
    document.head.appendChild(s);
  });
  _cePedidos.set(src, p);
  return p;
}

/** Inserta una hoja de estilos una sola vez. */
function ceCargarCSS(href) {
  if (_cePedidos.has(href)) return _cePedidos.get(href);
  const p = new Promise((resolve) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    // Si la hoja falla, la pestaña se ve fea pero funciona: no se rechaza.
    l.onload = resolve;
    l.onerror = resolve;
    document.head.appendChild(l);
  });
  _cePedidos.set(href, p);
  return p;
}

/** Lanza algo cuando el navegador esté ocioso, o al poco rato. */
function ceCuandoOcioso(fn, espera = 3000) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: espera });
  else setTimeout(fn, espera);
}

/* ── Mapa ────────────────────────────────────────────────────── */

const MAPA_MODULOS = [
  'tabs/mapa.js',
  'js/mapa.js',
  'js/mapa-datos.js',
  'js/mapa-ui.js',
  'js/mapa-modos.js',
  'js/mapa-compara.js',
  'js/mapa-puntos.js',
  'js/mapa-senado.js',
  'js/mapa-cartograma.js',
  'js/mapa-exportar.js',
  'js/mapa-zoom.js',
  'js/mapa-simulacion.js',
  'js/mapa-comparador.js'
];

let _mapaModulosPromesa = null;

/**
 * Descarga los módulos del mapa y su hoja de estilos (una sola vez). No
 * descarga la geometría: de eso sigue encargándose mapaCargar(), en mapa.js.
 */
function mapaCargarModulos() {
  if (_mapaModulosPromesa) return _mapaModulosPromesa;
  _mapaModulosPromesa = Promise.all([
    ceCargarCSS('css/mapa.css'),
    ...MAPA_MODULOS.map(ceCargarScript)
  ]).catch(err => { _mapaModulosPromesa = null; throw err; });
  return _mapaModulosPromesa;
}

/* ── Teoría ──────────────────────────────────────────────────── */

let _teoriaPromesa = null;

/** El marcado de la pestaña «Teoría» son 36 KB que sólo hacen falta al abrirla. */
function teoriaCargarModulos() {
  if (_teoriaPromesa) return _teoriaPromesa;
  _teoriaPromesa = ceCargarScript('tabs/teoria.js')
    .catch(err => { _teoriaPromesa = null; throw err; });
  return _teoriaPromesa;
}

/* ── Pestañas que se descargan solas ─────────────────────────── */

/**
 * Lo que carga cada pestaña aplazada antes de poder mostrarse. Al cargarse,
 * su archivo de tabs/ llama a registerTab() y la sección se vuelca sola.
 */
const TABS_DIFERIDAS = {
  map:    mapaCargarModulos,
  theory: teoriaCargarModulos
};

/** ¿Esta pestaña está todavía sin descargar? */
function tabDiferidaPendiente(tabName) {
  return !!TABS_DIFERIDAS[tabName] && !document.getElementById(`${tabName}-tab`);
}

/* ── Prelectura ──────────────────────────────────────────────── */

// En cuanto el navegador respira, se trae lo aplazado: así «Ver en el mapa»
// del comparador y la ventana del mapa de la avanzada tienen sus módulos sin
// que nadie haya abierto la pestaña, y cambiar de pestaña es instantáneo.
window.addEventListener('load', () => {
  ceCuandoOcioso(() => {
    mapaCargarModulos().catch(() => {});
    teoriaCargarModulos().catch(() => {});
  });
});
