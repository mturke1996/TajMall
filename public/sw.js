/**
 * Fluxen service worker.
 *
 * Strategy:
 *   - HTML pages       → network-first, fall back to last good copy
 *                        (so the app shell still opens when offline).
 *   - Static assets    → stale-while-revalidate
 *                        (Next.js immutable hashed assets).
 *   - API + auth       → network-only, never cache
 *                        (financial data must always be fresh).
 *
 * Versioned by SW_VERSION — bump to force a fresh cache.
 */

const SW_VERSION = 'fluxen-v2';
const SHELL_CACHE = `${SW_VERSION}-shell`;
const ASSETS_CACHE = `${SW_VERSION}-assets`;

const APP_SHELL = [
  '/',
  '/login',
  '/dashboard',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

// ── install / activate ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {
        /* tolerate missing entries during dev */
      }),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(SW_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// ── fetch ─────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API / auth → never cache. Always network.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('/_next/data/')
  ) {
    return; // let the browser handle it normally
  }

  // Static assets → stale-while-revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    /\.(png|jpg|jpeg|webp|svg|woff2?|ttf|ico)$/.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // HTML / pages → network-first
  if (
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html')
  ) {
    event.respondWith(networkFirst(request));
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  const fetched = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fetched;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // last-resort fallback to the login page (always cached)
    return cache.match('/login') || new Response('Offline', { status: 503 });
  }
}
