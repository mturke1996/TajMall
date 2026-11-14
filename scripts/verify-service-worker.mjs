/**
 * Offline-shell rules of public/sw.js, checked in an isolated VM with a fake Cache API and fetch (no browser,
 * no network):
 *
 *   node scripts/verify-service-worker.mjs
 *
 * A real-browser check of the same behaviour is scripts/e2e-offline-shell.mjs (needs Chromium).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const code = readFileSync(resolve('public/sw.js'), 'utf8');
const ORIGIN = 'https://app.test';

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS  ${name}`);
}

/** A response that looks like what a same-origin fetch returns. */
function reply(body, { status = 200, type = 'basic', redirected = false, headers = {} } = {}) {
  const response = new Response(body, { status, headers });
  Object.defineProperty(response, 'type', { value: type });
  Object.defineProperty(response, 'redirected', { value: redirected });
  return response;
}

const urlOf = (req) => (typeof req === 'string' ? new URL(req, ORIGIN) : new URL(req.url));
const keyOf = (req, ignoreSearch) => {
  const u = urlOf(req);
  return ignoreSearch ? u.origin + u.pathname : u.href;
};

function fakeCache() {
  const store = new Map();
  return {
    store,
    async match(req, options = {}) {
      const wanted = keyOf(req, options.ignoreSearch);
      for (const [k, v] of store) if (keyOf(k, options.ignoreSearch) === wanted) return v.clone();
      return undefined;
    },
    async put(req, res) {
      store.set(urlOf(req).href, res);
    },
    async delete(req) {
      return store.delete(urlOf(req).href);
    },
    async keys() {
      return [...store.keys()].map((k) => new Request(k));
    },
  };
}

/** Loads sw.js into a fresh sandbox. `net(url, init)` decides what the "network" answers. */
function boot({ net, timeoutMs = 15 } = {}) {
  const listeners = {};
  const cachesStore = new Map();
  const state = { skipWaiting: 0, claimed: 0, fetches: [] };
  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type, fn) => {
        listeners[type] = fn;
      },
      skipWaiting: () => {
        state.skipWaiting += 1;
      },
      clients: {
        claim: async () => {
          state.claimed += 1;
        },
      },
    },
    caches: {
      open: async (name) => {
        if (!cachesStore.has(name)) cachesStore.set(name, fakeCache());
        return cachesStore.get(name);
      },
      keys: async () => [...cachesStore.keys()],
      delete: async (name) => cachesStore.delete(name),
    },
    fetch: async (req, init) => {
      const url = urlOf(req).href;
      state.fetches.push(url);
      return net(url, init, req);
    },
    Response,
    Request,
    URL,
    Promise,
    // the 6 s navigation timeout is shortened so the test is fast; the rule under test is the same
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, timeoutMs)),
    console,
  };
  vm.runInNewContext(code, sandbox, { filename: 'sw.js' });

  const run = async (type, event) => {
    let pending = Promise.resolve();
    await listeners[type]({
      ...event,
      waitUntil: (p) => {
        pending = Promise.resolve(p);
      },
    });
    await pending;
  };
  const navigate = async (path, init = {}) => {
    const request = new Request(ORIGIN + path, { method: 'GET', ...init });
    Object.defineProperty(request, 'mode', { value: init.mode ?? 'navigate' });
    let answer;
    let handled = false;
    await listeners.fetch({
      request,
      respondWith: (p) => {
        handled = true;
        answer = p;
      },
    });
    return { handled, response: handled ? await answer : undefined };
  };
  return { listeners, state, cachesStore, run, navigate, cache: async (n) => sandbox.caches.open(n) };
}

const ok = (path) => reply(`<html>${path}</html>`, { headers: { 'content-type': 'text/html' } });
const onlineNet = (url) => ok(new URL(url).pathname);
const offlineNet = () => {
  throw new TypeError('Failed to fetch');
};

// ── update policy ──────────────────────────────────────────────────────────────────────────────────────────
await check('install never skips waiting by itself (a reload must not interrupt a form)', async () => {
  const sw = boot({ net: onlineNet });
  await sw.run('install', {});
  assert.equal(sw.state.skipWaiting, 0);
});
await check('only the SKIP_WAITING message (the user tapping "تحديث") activates a waiting version', async () => {
  const sw = boot({ net: onlineNet });
  await sw.run('message', { data: { type: 'SOMETHING_ELSE' } });
  await sw.run('message', { data: null });
  assert.equal(sw.state.skipWaiting, 0);
  await sw.run('message', { data: { type: 'SKIP_WAITING' } });
  assert.equal(sw.state.skipWaiting, 1);
});

// ── install / activate ─────────────────────────────────────────────────────────────────────────────────────
await check('install caches the shell one address at a time: one failure does not empty the cache', async () => {
  const sw = boot({ net: (url) => (url.endsWith('/dashboard') ? offlineNet() : onlineNet(url)) });
  await sw.run('install', {});
  const shell = await sw.cache('fluxen-v5-shell');
  const cached = [...shell.store.keys()].map((k) => new URL(k).pathname).sort();
  assert.ok(cached.includes('/login') && cached.includes('/offline.html'), cached.join(','));
  assert.ok(!cached.includes('/dashboard'));
});
await check('install does not store a redirected page (a logged-out /dashboard is really /login)', async () => {
  const sw = boot({ net: (url) => (url.endsWith('/dashboard') ? reply('<html>login</html>', { redirected: true }) : onlineNet(url)) });
  await sw.run('install', {});
  const shell = await sw.cache('fluxen-v5-shell');
  assert.ok(![...shell.store.keys()].some((k) => k.endsWith('/dashboard')));
});
await check('activate removes older Fluxen caches, keeps the current two and anyone else\'s, then takes control', async () => {
  const sw = boot({ net: onlineNet });
  for (const name of ['fluxen-v4-shell', 'fluxen-v4-assets', 'fluxen-v5-shell', 'fluxen-v5-assets', 'other-app-cache']) await sw.cache(name);
  await sw.run('activate', {});
  const left = [...sw.cachesStore.keys()].sort();
  assert.deepEqual(left, ['fluxen-v5-assets', 'fluxen-v5-shell', 'other-app-cache']);
  assert.equal(sw.state.claimed, 1);
});

// ── what is never touched ──────────────────────────────────────────────────────────────────────────────────
await check('API, auth, portal and Next data requests are left to the browser', async () => {
  const sw = boot({ net: onlineNet });
  for (const path of ['/api/keepalive', '/auth/callback?code=1', '/portal/abc123', '/_next/data/x/page.json']) {
    assert.equal((await sw.navigate(path)).handled, false, path);
  }
});
await check('writes and other origins are never intercepted', async () => {
  const sw = boot({ net: onlineNet });
  assert.equal((await sw.navigate('/dashboard', { method: 'POST', body: 'x' })).handled, false);
  const request = new Request('https://elsewhere.test/page');
  let handled = false;
  await sw.listeners.fetch({ request, respondWith: () => (handled = true) });
  assert.equal(handled, false);
});

// ── pages ──────────────────────────────────────────────────────────────────────────────────────────────────
await check('online: the page comes from the network and is kept for later', async () => {
  const sw = boot({ net: onlineNet });
  const { response } = await sw.navigate('/transactions');
  assert.match(await response.text(), /transactions/);
  await new Promise((r) => setTimeout(r, 5));
  const shell = await sw.cache('fluxen-v5-shell');
  assert.ok([...shell.store.keys()].some((k) => k.endsWith('/transactions')));
});
await check('offline: a page seen before opens from the saved copy', async () => {
  let down = false;
  const sw = boot({ net: (url) => (down ? offlineNet() : onlineNet(url)) });
  await sw.navigate('/mall');
  await new Promise((r) => setTimeout(r, 5));
  down = true;
  const { response } = await sw.navigate('/mall');
  assert.match(await response.text(), /mall/);
});
await check('offline: the same page with another query string still opens (highlight links, filters)', async () => {
  let down = false;
  const sw = boot({ net: (url) => (down ? offlineNet() : onlineNet(url)) });
  await sw.navigate('/transactions');
  await new Promise((r) => setTimeout(r, 5));
  down = true;
  const { response } = await sw.navigate('/transactions?highlight=42');
  assert.match(await response.text(), /transactions/);
});
await check('offline and never visited: the offline page is shown, not a browser error', async () => {
  let down = false;
  const sw = boot({ net: (url) => (down ? offlineNet() : onlineNet(url)) });
  await sw.run('install', {});
  down = true;
  const { response } = await sw.navigate('/reports/ledger');
  assert.match(await response.text(), /offline\.html/);
});
await check('offline with nothing saved at all: a plain 503, never an exception', async () => {
  const sw = boot({ net: offlineNet });
  const { response } = await sw.navigate('/anything');
  assert.equal(response.status, 503);
});
await check('a redirected page (session expired -> login) is shown but never saved under the old address', async () => {
  const sw = boot({ net: () => reply('<html>login</html>', { redirected: true }) });
  const { response } = await sw.navigate('/dashboard');
  assert.equal(response.status, 200);
  await new Promise((r) => setTimeout(r, 5));
  const shell = await sw.cache('fluxen-v5-shell');
  assert.equal(shell.store.size, 0);
});
await check('a failing server (500) is not saved', async () => {
  const sw = boot({ net: () => reply('boom', { status: 500 }) });
  await sw.navigate('/reports');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await sw.cache('fluxen-v5-shell')).store.size, 0);
});
await check('slow connection with a saved copy: the saved page opens after the timeout, not after a minute', async () => {
  let slow = false;
  const sw = boot({
    timeoutMs: 20,
    net: (url) => (slow ? new Promise(() => {}) : onlineNet(url)),
  });
  await sw.navigate('/cashboxes');
  await new Promise((r) => setTimeout(r, 5));
  slow = true;
  const started = Date.now();
  const { response } = await sw.navigate('/cashboxes');
  assert.match(await response.text(), /cashboxes/);
  assert.ok(Date.now() - started < 2000);
});
await check('slow connection and nothing saved: it keeps waiting for the network instead of failing early', async () => {
  const sw = boot({
    timeoutMs: 20,
    net: (url) => new Promise((resolveNet) => setTimeout(() => resolveNet(onlineNet(url)), 120)),
  });
  const { response } = await sw.navigate('/brand-new-page');
  assert.match(await response.text(), /brand-new-page/);
});

// ── build files and images ─────────────────────────────────────────────────────────────────────────────────
await check('hashed build files are cache-first: the second request never reaches the network', async () => {
  const sw = boot({ net: () => reply('console.log(1)', { headers: { 'content-type': 'text/javascript' } }) });
  await sw.navigate('/_next/static/chunks/abc123.js', { mode: 'no-cors' });
  await new Promise((r) => setTimeout(r, 5));
  const before = sw.state.fetches.length;
  const { response } = await sw.navigate('/_next/static/chunks/abc123.js', { mode: 'no-cors' });
  assert.equal(await response.text(), 'console.log(1)');
  assert.equal(sw.state.fetches.length, before);
});
await check('the asset cache is capped (oldest first) so old deploys do not pile up', async () => {
  const sw = boot({ net: (url) => reply(`file ${url}`) });
  for (let i = 0; i < 410; i += 1) {
    await sw.navigate(`/_next/static/chunks/f${i}.js`, { mode: 'no-cors' });
    await new Promise((r) => setTimeout(r, 0));
  }
  await new Promise((r) => setTimeout(r, 20));
  const assets = await sw.cache('fluxen-v5-assets');
  assert.ok(assets.store.size <= 400, `size=${assets.store.size}`);
  assert.ok([...assets.store.keys()].some((k) => k.endsWith('/f409.js')), 'the newest file must survive');
  assert.ok(![...assets.store.keys()].some((k) => k.endsWith('/f0.js')), 'the oldest file must be evicted');
});
await check('images are shown from the saved copy when the network is gone', async () => {
  let down = false;
  const sw = boot({ net: (url) => (down ? offlineNet() : reply(`img ${url}`)) });
  await sw.navigate('/icon-192.png', { mode: 'no-cors' });
  await new Promise((r) => setTimeout(r, 5));
  down = true;
  const { response } = await sw.navigate('/icon-192.png', { mode: 'no-cors' });
  assert.match(await response.text(), /img/);
});

console.log(`\n${passed} checks passed`);
