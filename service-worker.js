/* =====================================================================
   DOOSAN 340 — SERVICE WORKER
   Caches the static app shell only. All Firebase Auth/Firestore traffic
   (firestore.googleapis.com, identitytoolkit, gstatic Firebase SDK
   modules, Google Fonts) is left alone — Firestore's own offline
   persistence layer (see initializeFirestore/persistentLocalCache in
   index.html) is what keeps data working offline, this worker only
   makes sure the app itself can still launch with no connection.
   ===================================================================== */

const CACHE_VERSION = 'd340-shell-v4';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

function isAppShellRequest(url) {
  // Only same-origin GET requests for the shell files themselves.
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never touch writes
  const url = new URL(req.url);

  // Let all cross-origin traffic (Firebase Auth, Firestore, Google
  // Fonts, gstatic SDK) go straight to the network untouched.
  if (!isAppShellRequest(url)) return;

  // Network-first for the app shell so updates are picked up quickly,
  // falling back to cache when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
