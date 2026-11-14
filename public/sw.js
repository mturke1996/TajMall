/**
 * Fluxen service worker — keeps the app SHELL available without a connection.
 *
 * What it does
 *   - Pages (HTML)        → network first (6 s), then the last good copy, then /offline.html.
 *   - Hashed build files  → cache first: /_next/static/<hash> never changes for a given name.
 *   - Fonts and images    → stale-while-revalidate.
 *   - API, auth, portal   → untouched (financial data must be fresh; the portal URL is a credential).
 *
 * What it deliberately does NOT do
 *   - It never skips waiting by itself. A new version waits until the user taps "تحديث" (message
 *     SKIP_WAITING): reloading a page under someone's hands loses what they have typed in a form.
 *   - It stores only plain, successful, same-origin responses that were not redirected. Chromium refuses to
 *     answer a navigation with a response that carries a redirect, so a cached "/dashboard" that was really
 *     the login page would break offline navigation instead of helping it.
 *   - It stores no application data. Data for offline use belongs to the app's own encrypted store
 *     (docs/OFFLINE-MODE-DESIGN-2026-11-14.md); caches here hold only data-free pages and build files.
 *
 * Versioned by SW_VERSION: bump it to drop every older cache.
 */

const SW_VERSION = 'fluxen-v5';
const SHELL_CACHE = `${SW_VERSION}-shell`;
const ASSETS_CACHE = `${SW_VERSION}-assets`;
const OFFLINE_URL = '/offline.html';
const NAVIGATION_TIMEOUT_MS = 6000;
const MAX_ASSET_ENTRIES = 400;

const APP_SHELL = [
  '/',
  '/login',
  '/dashboard',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

/** A response worth keeping: successful, from this origin, not a redirect. */
function isCacheable(response) {
  return Boolean(response) && response.ok && response.type === 'basic' && !response.redirected;
}

// ── install / activate ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // one by one: cache.addAll() stores nothing at all when a single address fails
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (isCacheable(response)) await cache.put(url, response);
          } catch {
            /* offline during install, or a page that redirects (logged out): skipped, cached on first visit */
          }
        }),
      );
    })(),
  );
  // no skipWaiting() here: see the header comment
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSETS_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('fluxen-') && !keep.has(key))
          .map((key) => caches.delete(key)),
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

  // API / auth / the tenant portal (its address is the credential) / Next data → never cached
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/portal/') ||
    url.pathname.includes('/_next/data/')
  ) {
    return; // let the browser handle it normally
  }

  // Hashed build output: the name changes with the content, so a cached copy is always right
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Fonts and images: show what we have, refresh in the background
  if (url.pathname.startsWith('/fonts/') || /\.(png|jpg|jpeg|webp|svg|woff2?|ttf|ico)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Pages
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirst(request));
  }
});

async function trim(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_ASSET_ENTRIES;
  for (let i = 0; i < excess; i += 1) await cache.delete(keys[i]); // oldest first
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (isCacheable(response)) {
    cache
      .put(request, response.clone())
      .then(() => trim(cache))
      .catch(() => {});
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  const fetched = fetch(request)
    .then((response) => {
      if (isCacheable(response)) {
        cache
          .put(request, response.clone())
          .then(() => trim(cache))
          .catch(() => {});
      }
      return response;
    })
    .catch(() => cached);
  return cached || fetched;
}

/** A cached copy of this page: the exact address first, then the same page without its query string. */
async function cachedPage(cache, request) {
  return (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
}

function offlineFallbackResponse() {
  return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(request).then((response) => {
    if (isCacheable(response)) cache.put(request, response.clone()).catch(() => {});
    return response;
  });
  network.catch(() => {}); // when the cached copy wins the race this promise may still fail later: not an error

  try {
    const cached = await cachedPage(cache, request);
    // nothing saved to fall back on: wait for the network as long as the browser allows
    if (!cached) return await network;
    // a saved copy exists: do not leave the user waiting on a bad connection
    return await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS)),
    ]);
  } catch {
    return (
      (await cachedPage(cache, request)) ||
      (await cache.match(OFFLINE_URL)) ||
      offlineFallbackResponse()
    );
  }
}
