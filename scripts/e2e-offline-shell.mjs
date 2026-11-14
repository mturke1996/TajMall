/**
 * Real-browser check of the offline app shell (Chromium, production build, no Supabase needed):
 *
 *   npm run build            # with any NEXT_PUBLIC_SUPABASE_* values (the build does not connect)
 *   node scripts/e2e-offline-shell.mjs
 *
 * It starts `next start`, installs the service worker, cuts the network and proves:
 *   - a page opened before keeps opening, with its scripts, while offline;
 *   - a page never opened shows the friendly offline page, not a browser error;
 *   - nothing the shell needs fails to load while offline;
 *   - a new service worker version waits: it never reloads an open page by itself, only the user's tap does;
 *   - the manifest and icons are installable (PNG, maskable).
 *
 * Browser: `playwright-core` from node_modules, else a globally installed `playwright`. Set PW_CHANNEL=chrome to
 * use an installed Google Chrome (GitHub runners have one); with no setting Playwright's own Chromium is used.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return require(name);
    } catch {
      /* try the next one */
    }
  }
  throw new Error('Playwright is not installed (need playwright-core, or a global playwright).');
}

const PORT = Number(process.env.E2E_PORT ?? 3199);
const BASE = `http://127.0.0.1:${PORT}`;
// the Supabase URL points at a closed local port: the proxy's session check fails instantly instead of hanging
const env = {
  ...process.env,
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
  NEXT_PUBLIC_APP_NAME: 'Fluxen',
  NEXT_PUBLIC_DEFAULT_LOCALE: 'ar',
  NEXT_PUBLIC_DEFAULT_CURRENCY: 'LYD',
};

const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
const stop = () => {
  try {
    server.kill('SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`next start did not come up:\n${serverLog.slice(-2000)}`);
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS  ${name}`);
}

let browser;
try {
  await waitForServer();
  const { chromium } = loadPlaywright();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ locale: 'ar-LY', serviceWorkers: 'allow' });
  const page = await context.newPage();
  const failed = [];
  page.on('requestfailed', (request) => failed.push(request.url()));

  // 1. first visit: the worker installs and fills the shell cache
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await check('the service worker installs and saves the shell (login page, offline page, icons)', async () => {
    const saved = await page.evaluate(async () => {
      for (let i = 0; i < 50; i += 1) {
        const names = (await caches.keys()).filter((k) => k.startsWith('fluxen-v5'));
        const shell = names.find((k) => k.endsWith('-shell'));
        if (shell) {
          const urls = (await (await caches.open(shell)).keys()).map((r) => new URL(r.url).pathname);
          if (urls.includes('/login') && urls.includes('/offline.html')) return urls;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      return [];
    });
    assert.ok(saved.includes('/login') && saved.includes('/offline.html'), `saved: ${saved.join(',')}`);
  });

  // 2. a second online visit lets the (now controlling) worker save the scripts of this page
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.waitForTimeout(800);

  await check('the page is controlled by the worker and the manifest uses real PNG icons', async () => {
    const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
    const kinds = manifest.icons.map((i) => `${i.type}:${i.purpose}`).sort();
    assert.deepEqual(kinds, ['image/png:any', 'image/png:any', 'image/png:maskable']);
    for (const icon of manifest.icons) assert.equal((await fetch(`${BASE}${icon.src}`)).status, 200, icon.src);
  });

  // 3. offline
  await context.setOffline(true);
  failed.length = 0;

  await check('offline: a page opened before opens again, with its scripts', async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'load' });
    await page.waitForSelector('input[type="email"], input[name="email"], form', { timeout: 10000 });
    const chunkFailures = failed.filter((u) => u.includes('/_next/static/'));
    assert.deepEqual(chunkFailures, [], `scripts failed to load offline: ${chunkFailures.join(', ')}`);
    const hydrated = await page.evaluate(() => Boolean(document.querySelector('form')) && typeof window.next !== 'undefined' || document.readyState === 'complete');
    assert.ok(hydrated);
  });

  await check('offline: a page never opened shows the friendly offline page, not a browser error', async () => {
    const response = await page.goto(`${BASE}/reports/ledger`, { waitUntil: 'load' });
    assert.ok(response, 'the worker must answer the navigation');
    await page.waitForSelector('#retry', { timeout: 10000 });
    assert.match(await page.title(), /لا يوجد اتصال/);
    assert.match(await page.textContent('body'), /لا يوجد اتصال بالإنترنت/);
  });

  await check('offline: the offline page does not claim anything it cannot do (no "saved offline" promise)', async () => {
    const text = await page.textContent('body');
    assert.ok(!/محفوظاً/.test(text), 'the page must not promise that new entries are kept');
  });

  // 4. back online
  await context.setOffline(false);
  await check('back online: pages load from the network again', async () => {
    const response = await page.goto(`${BASE}/login`, { waitUntil: 'load' });
    assert.ok(response && response.ok());
  });

  // 5. a new version arrives while the page is open: it waits, the page is not reloaded, and only the user's tap applies it
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.evaluate(() => {
    window.__marker = 'still-here';
  });
  const oldScript = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js?v=2', { scope: '/', updateViaCache: 'imports' }));

  await check('a new worker version waits instead of taking over', async () => {
    await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration('/'))?.waiting), null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => window.__marker), 'still-here', 'the page was reloaded by the update');
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL), oldScript, 'the old worker must keep control');
  });

  await check('the user is asked, and the question stays until answered', async () => {
    await page.getByText('تحديث جديد متاح').waitFor({ timeout: 10000 });
    await page.waitForTimeout(6000); // longer than a normal toast lifetime
    assert.ok(await page.getByText('تحديث جديد متاح').isVisible(), 'the update prompt disappeared by itself');
  });

  await check('tapping "تحديث" applies the new version and reloads once', async () => {
    await page.getByRole('button', { name: 'تحديث' }).click();
    await page.waitForFunction(() => window.__marker === undefined, null, { timeout: 15000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 });
    const now = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
    assert.ok(now.endsWith('/sw.js?v=2'), `controller is ${now}`);
  });

  console.log(`\n${passed} checks passed`);
} catch (error) {
  console.error(error);
  console.error('--- next start log (tail) ---\n' + serverLog.slice(-1500));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  stop();
}
