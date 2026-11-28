// CotizaPro — service worker: funciona sin internet
const CACHE = 'cotizapro-v10';
const ASSETS = [
  './', './index.html', './css/styles.css', './js/app.js', './js/store.js', './js/parser.js', './js/icons.js', './js/pdf.js', './js/geo.js', './js/i18n.js', './js/i18n-en.js', './js/photos.js', './js/vendor/jspdf.umd.min.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Archivos propios: primero red, si no hay internet usa la copia guardada
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }
  // Fuentes de Google: guardar después de la primera vez
  if (url.hostname.includes('fonts.g')) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
  }
});
