/**
 * carga-avanzada.js
 * Carga diferida de la calculadora avanzada.
 *
 * Sus módulos pesan unos 190 KB (más los datos) y sólo hacen falta al abrir esa
 * pestaña, así que no se descargan ni se analizan al arrancar. advanced-compensation.js
 * sí va en el arranque porque la calculadora normal también lo usa.
 *
 * Los scripts se insertan con async = false: se descargan a la vez pero se
 * ejecutan en este orden, que es el de sus dependencias.
 */

const ADV_MODULOS = [
  'datos/generado/indice.js',
  'js/advanced-data.js',
  'js/prorrateo.js',
  'js/advanced-calc.js',
  // Antes de advanced-ui.js, que la llama al montar las secciones.
  'js/avanzada-oscilacion.js',
  'js/advanced-ui.js',
  'js/advanced-popups.js',
  // Se registra en ADV_POPUPS, así que va después de advanced-popups.js.
  'js/mapa-popup.js',
  'js/advanced-territorial.js',
  'js/comparar-calc.js',
  'js/advanced-compare.js',
  'js/advanced-exportar.js'
];

let _advModulosPromesa = null;

function _advInsertarScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error(`No se ha podido cargar ${src}`)); };
    document.head.appendChild(s);
  });
}

/** Descarga los módulos de la avanzada (una sola vez) y arranca su interfaz. */
function advCargarModulos() {
  if (_advModulosPromesa) return _advModulosPromesa;
  // La avanzada usa el mapa en dos sitios (su ventana «Mapa» y el «Ver en el
  // mapa» del comparador), así que se piden sus módulos por detrás, sin esperar.
  if (typeof mapaCargarModulos === 'function') mapaCargarModulos().catch(() => {});
  _advModulosPromesa = Promise.all(ADV_MODULOS.map(_advInsertarScript))
    .then(() => {
      // Sus listeners de DOMContentLoaded ya no se disparan: se arranca a mano.
      advInit();
      if (typeof advInitPopups === 'function') advInitPopups();
    })
    .catch(err => { _advModulosPromesa = null; throw err; });
  return _advModulosPromesa;
}
