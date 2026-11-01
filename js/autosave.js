/**
 * autosave.js
 * Guarda la sesión en el navegador y la repone al volver.
 *
 * Como la calculadora es una PWA, lo que se escribe no debería perderse al
 * cerrar la pestaña. Se guarda en localStorage lo mismo que ya describen las
 * demás partes de la sesión:
 *
 *  · calculadora y pactómetro: sesionAnotar() (session.js)
 *  · calculadora avanzada:     advSessionSnapshot() (advanced-ui.js), sin los
 *    datos de la hoja, que se vuelven a descargar al abrir la pestaña
 *
 * La reposición reutiliza el camino de las copias guardadas (CE_SESION), que
 * ui.js ya sigue al arrancar, y para la avanzada espera a que carguen los datos.
 * Todo el acceso al almacenamiento va en try/catch: en una ventana privada o con
 * los datos del sitio bloqueados la aplicación sigue funcionando, sólo que sin
 * recordar nada.
 */

const AUTOSAVE_KEY = 'ce-sesion-v1';
const AUTOSAVE_EVERY_MS = 3000;

/** Sesión de la avanzada pendiente de reponer cuando carguen sus datos. */
window.CE_ADV_PENDIENTE = null;

let _autoLast = '';
let _autoActive = false;
let _autoRestored = false;

function autoRead() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && s.app === 'calculadora-electoral' && s.calc ? s : null;
  } catch (e) { return null; }
}

function autoWrite(s) {
  try {
    const text = JSON.stringify(s);
    localStorage.setItem(AUTOSAVE_KEY, text);
    return text;
  } catch (e) { return null; }
}

/** Recoge el estado actual; la avanzada sólo si ya hay algo suyo que guardar. */
function autoSnapshot(previous) {
  let adv = null;
  try {
    if (typeof _advLoaded !== 'undefined' && _advLoaded && _advConfig) adv = advSessionSnapshot();
  } catch (e) { adv = null; }
  // Mientras la avanzada no ha cargado, se conserva lo guardado antes en vez de borrarlo.
  if (!adv) adv = window.CE_ADV_PENDIENTE || previous?.adv || null;

  return {
    app: 'calculadora-electoral',
    version: 1,
    pestana: select('.tab.active')?.dataset.tab || 'calculator',
    calc: sesionAnotar(),
    adv
  };
}

function autoSaveNow() {
  if (!_autoActive) return;
  const snap = autoSnapshot(autoRead());
  // guardadoEn cambia siempre: se compara sin él para no escribir en vano.
  const key = JSON.stringify({ ...snap, calc: { ...snap.calc, guardadoEn: '' }, adv: snap.adv && { ...snap.adv, guardadoEn: '' } });
  if (key === _autoLast) return;
  if (autoWrite({ ...snap, guardadoEn: new Date().toISOString() }) !== null) _autoLast = key;
}

/** Aviso breve de que se ha repuesto la sesión, con salida a empezar de cero. */
function autoToast(text) {
  const el = document.createElement('div');
  el.className = 'auto-toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('hide'), 3500);
  setTimeout(() => el.remove(), 4200);
}

function autoClear() {
  if (!confirm('¿Borrar la sesión guardada en este navegador y empezar de cero?')) return;
  _autoActive = false;
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* sin almacenamiento */ }
  location.reload();
}

/** Repone la sesión de la avanzada cuando ya están cargados sus datos. */
async function autoRestoreAdvanced() {
  const s = window.CE_ADV_PENDIENTE;
  // Si los datos no han llegado, se conserva para la próxima vez.
  if (!s || typeof _advLoaded === 'undefined' || !_advLoaded) return;
  window.CE_ADV_PENDIENTE = null;
  try {
    await advApplySession(s);
    autoToast('Sesión de la calculadora avanzada restaurada');
  } catch (e) {
    // Si la elección guardada ya no existe o no se pudo descargar, se sigue en blanco.
  }
}

/* Antes de que ui.js arranque: si hay sesión guardada, se la hace pasar por la
   de una copia guardada para que las filas se reconstruyan con ella. */
(function autoPrepare() {
  // Una copia guardada trae su propia sesión: manda sobre la del navegador.
  if (window.CE_SESION) return;
  const s = autoRead();
  if (!s) { _autoActive = true; return; }
  window.CE_SESION = s.calc;
  window.CE_ADV_PENDIENTE = s.adv || null;
  _autoRestored = true;
  _autoActive = true;
  window.CE_AUTO_PESTANA = s.pestana;
})();

document.addEventListener('DOMContentLoaded', () => {
  if (_autoRestored) {
    // Las pestañas sin datos propios (avanzada, teoría) no las repone sesionRecuperar.
    const hashTab = location.hash.replace('#', '');
    if (!hashTab && ['advanced', 'theory'].includes(window.CE_AUTO_PESTANA)) switchTab(window.CE_AUTO_PESTANA);
    autoToast('Sesión anterior restaurada');
  }
  select('#auto-clear-btn')?.addEventListener('click', autoClear);

  // Se guarda sólo lo que cambia, cada pocos segundos y al salir de la página.
  setInterval(autoSaveNow, AUTOSAVE_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoSaveNow(); });
  window.addEventListener('pagehide', autoSaveNow);
});
