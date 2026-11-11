// Versión de la caché: súbela cuando cambie algo que deba reemplazarse sí o sí.
// No hace falta tocar los ?v= de los scripts: el servidor de red va primero y la
// caché se busca sin parámetros, así que una URL con o sin ?v= es el mismo archivo.
const CACHE = 'calculadora-electoral-v7';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './datos/generado/indice.js',
  './datos/generado/mapa/geometria.js',
  './css/advanced.css',
  './css/tema-oscuro.css',
  './css/components.css',
  './css/header-tabs.css',
  './css/layout.css',
  './css/mapa.css',
  './css/otros-drag-responsive.css',
  './css/variables.css',
  './js/accesibilidad.js',
  './js/advanced-calc.js',
  './js/advanced-compare.js',
  './js/advanced-exportar.js',
  './js/carga-avanzada.js',
  './js/advanced-compensation.js',
  './js/advanced-data.js',
  './js/advanced-popups.js',
  './js/advanced-territorial.js',
  './js/advanced-ui.js',
  './js/algorithms.js',
  './js/autosave.js',
  './js/calculator.js',
  './js/constants.js',
  './js/groupings.js',
  './js/helpers.js',
  './js/hemicycle.js',
  './js/mapa.js',
  './js/mapa-datos.js',
  './js/mapa-modos.js',
  './js/mapa-puntos.js',
  './js/mapa-ui.js',
  './js/pactometer.js',
  './js/rows.js',
  './js/session.js',
  './js/tabs.js',
  './js/totals.js',
  './js/ui.js',
  './tabs/avanzada.js',
  './tabs/calculadora.js',
  './tabs/mapa.js',
  './tabs/pactometro.js',
  './tabs/teoria.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// El índice de datos se lee aquí para precachear la elección más reciente de
// cada ámbito: así la avanzada funciona sin red desde el primer arranque.
// importScripts también hace que, al cambiar el índice, el navegador renueve este SW.
let DATOS_RECIENTES = [];
try {
  self.window = self;
  importScripts('./datos/generado/indice.js');
  DATOS_RECIENTES = (self.CE_DATOS_INDICE?.ambitos || [])
    .map(a => [...(a.elecciones || [])].sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)))[0])
    .filter(Boolean)
    .map(e => `./datos/generado/elecciones/${encodeURIComponent(e.archivo)}.js`);
} catch (err) { /* sin índice: sólo se precachean los archivos de la aplicación */ }

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await c.addAll(ASSETS);
      // Los datos son opcionales: si alguno falla, la instalación sigue adelante.
      await Promise.allSettled(DATOS_RECIENTES.map(u => c.add(u)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first con respaldo en caché (incluye fuentes de Google ya visitadas)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
