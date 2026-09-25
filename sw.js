/* Fuel — offline support. The app files are cached so Fuel opens without a connection.
   Barcode lookups (openfoodfacts.org) always go to the network. Bump VERSION when files change. */
const VERSION = 'fuel-v3';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'fonts/fonts.css',
  'fonts/barlow-400.woff2',
  'fonts/barlow-500.woff2',
  'fonts/barlow-600.woff2',
  'fonts/barlow-700.woff2',
  'fonts/barlow-condensed-600.woff2',
  'fonts/barlow-condensed-700.woff2',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'vendor/barcode-detector.js',
  'vendor/zxing_reader.wasm',
  'vendor/zxing.min.js',
  'src/base.css',
  'src/fuel.css',
  'src/core.js',
  'src/crypto.js',
  'src/store.js',
  'src/ui.js',
  'src/charts.js',
  'src/foods.js',
  'src/nutrition.js',
  'src/scan.js',
  'src/food.js',
  'src/view-today.js',
  'src/view-train.js',
  'src/view-body.js',
  'src/view-progress.js',
  'src/view-settings.js',
  'src/view-dashboard.js',
  'src/view-more.js',
  'src/app.js'
];

self.addEventListener('install', (e) => {
  /* cache: 'reload' skips the browser's HTTP cache, so a new version never precaches old files. */
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  /* Cached copy first for speed and offline use; refresh it in the background. */
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(e.request, { ignoreSearch: true }).then((hit) => {
        const fresh = fetch(e.request)
          .then((res) => {
            if (res && res.ok) cache.put(e.request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || fresh;
      })
    )
  );
});
