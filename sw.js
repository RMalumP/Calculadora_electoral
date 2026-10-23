const CACHE = 'calculadora-electoral-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/variables.css', './css/header-tabs.css', './css/layout.css',
  './css/components.css', './css/otros-drag-responsive.css',
  './js/helpers.js', './js/constants.js', './js/algorithms.js', './js/rows.js',
  './js/totals.js', './js/calculator.js', './js/hemicycle.js', './js/pactometer.js', './js/ui.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
