// DX360 Fleet Ops — Service Worker
// Bump CACHE_VERSION on every deploy so the old cache is dropped and
// the new app shell takes over. Firestore's own offline persistence
// (enabled in index.html) handles data sync; this worker only handles
// the app shell so the PWA can still *launch* with no network.

const CACHE_VERSION = 'dx360-ops-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(
        // Cache each shell asset independently so one missing file
        // (e.g. an icon not deployed yet) can't fail the whole install
        // the way cache.addAll's all-or-nothing behaviour would.
        APP_SHELL.map((url) => cache.add(url).catch((err) => console.warn('[sw] could not cache', url, err)))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Let the page force an immediate takeover after it has told the user
// an update is ready, instead of waiting for every tab to close.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET — never intercept Firestore/Auth network calls,
  // those go straight to the network and are managed by the SDK's own
  // offline cache, not this worker.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network first (so users get the newest shell
  // when online) but never leave someone stranded — fall back to the
  // cached shell the instant the network fails or times out.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static shell assets: cache-first, refresh in the background so the
  // cache doesn't go stale forever while still answering instantly.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
