/**
 * tabs.js
 * Registro e inyección del marcado de cada pestaña.
 *
 * El contenido de cada pestaña vive en su propio archivo dentro de tabs/.
 * Esos archivos se cargan como <script> y no con fetch a propósito: así la
 * página sigue funcionando al abrirla directamente desde el disco, donde el
 * navegador bloquea la lectura de archivos locales por fetch.
 *
 * El orden importa: este archivo se carga antes que los de tabs/, que al
 * cargarse llaman a registerTab(). El volcado al DOM se hace en
 * DOMContentLoaded, cuando ya están todos registrados; como este listener se
 * registra el primero, el DOM de las pestañas existe antes de que se
 * inicialicen los demás módulos.
 */

const TAB_REGISTRY = [];

/** Si ya se ha hecho el volcado inicial, lo que llegue tarde se vuelca solo. */
let _tabsMontadas = false;

/**
 * Llamada desde cada archivo de tabs/ para declarar su marcado. Las pestañas
 * que se descargan a demanda (mapa y teoría, ver js/carga-diferida.js) se
 * registran después del volcado inicial, así que se vuelcan al registrarse.
 */
function registerTab(id, className, html) {
  const tab = { id, className, html };
  TAB_REGISTRY.push(tab);
  if (_tabsMontadas) mountTab(tab);
}

/** Vuelca una pestaña en el contenedor principal, si no estaba ya. */
function mountTab(tab) {
  const main = document.querySelector('.main');
  if (!main || document.getElementById(`${tab.id}-tab`)) return;
  const section = document.createElement('section');
  section.id = `${tab.id}-tab`;
  section.className = tab.className;
  section.innerHTML = tab.html;
  main.appendChild(section);
}

/** Vuelca el marcado de todas las pestañas registradas hasta ahora. */
function mountTabs() {
  TAB_REGISTRY.forEach(mountTab);
  _tabsMontadas = true;
}

document.addEventListener('DOMContentLoaded', mountTabs);
