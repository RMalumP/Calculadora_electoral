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

/** Llamada desde cada archivo de tabs/ para declarar su marcado. */
function registerTab(id, className, html) {
  TAB_REGISTRY.push({ id, className, html });
}

/** Vuelca en el contenedor principal el marcado de todas las pestañas. */
function mountTabs() {
  const main = document.querySelector('.main');
  if (!main) return;

  TAB_REGISTRY.forEach(tab => {
    const section = document.createElement('section');
    section.id = `${tab.id}-tab`;
    section.className = tab.className;
    section.innerHTML = tab.html;
    main.appendChild(section);
  });
}

document.addEventListener('DOMContentLoaded', mountTabs);
