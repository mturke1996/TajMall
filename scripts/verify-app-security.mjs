/**
 * Regression checks for the application layer's security rules (no database, no network):
 *   npx tsx scripts/verify-app-security.mjs
 *
 * Part 1 runs the pure helpers: CSV formula neutralising, in-app redirect validation, PostgREST filter
 * sanitising, phone normalisation, the same-origin / bearer / constant-time guards.
 * Part 2 reads the source: who may call the admin routes, where the service-role key may appear, which
 * browser sinks and external links are allowed, the response headers, the portal page, secrets in tracked
 * files. A line printed as WARN is a known gap in a file this check's author may not edit; it is listed in
 * PENDING below and stops being a warning (and this script says so) once the file is fixed.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let passed = 0;
let warned = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};
const checkAsync = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};
const warn = (msg) => {
  warned += 1;
  console.log(`WARN  ${msg}`);
};

// ── Part 1: helpers ─────────────────────────────────────────────────────────────────────────────

const { neutralizeCsvCell, buildCsv } = await import('../src/lib/csv-export.ts');

check('csv: = + - @ tab CR LF are neutralised', () => {
  for (const cell of ['=1+1', '=HYPERLINK("http://x","y")', '+cmd|\' /C calc\'!A0', '-2+3+cmd|\' /C calc\'!A0', '@SUM(A1:A9)', '\t=1', '\r=1', '\n=1']) {
    assert.equal(neutralizeCsvCell(cell), `'${cell}`, JSON.stringify(cell));
  }
});
check('csv: numbers and numeric text are left alone', () => {
  assert.equal(neutralizeCsvCell(-50), '-50');
  assert.equal(neutralizeCsvCell(12.5), '12.5');
  assert.equal(neutralizeCsvCell('-12.5'), '-12.5');
  assert.equal(neutralizeCsvCell('-1,250.00'), '-1,250.00');
  assert.equal(neutralizeCsvCell('+218 91 234 5678'), '+218 91 234 5678');
  assert.equal(neutralizeCsvCell('0912345678'), '0912345678');
});
check('csv: ordinary and Arabic text are untouched', () => {
  assert.equal(neutralizeCsvCell('إيجار شهر 10'), 'إيجار شهر 10');
  assert.equal(neutralizeCsvCell('a=b'), 'a=b');
  assert.equal(neutralizeCsvCell(''), '');
  assert.equal(neutralizeCsvCell(null), '');
  assert.equal(neutralizeCsvCell(undefined), '');
});
check('csv: values that become text through String() are checked too', () => {
  assert.equal(neutralizeCsvCell(['=1+1']), "'=1+1");
  assert.equal(neutralizeCsvCell({ toString: () => '@x' }), "'@x");
});
check('csv: a formula-like word after digits cannot hide behind the numeric exemption', () => {
  for (const cell of ['-1+cmd', '+1|cmd', '-1!A1', '-1@x', '-1=2']) {
    assert.equal(neutralizeCsvCell(cell), `'${cell}`, cell);
  }
});
check('csv: the file quotes commas, quotes and newlines and starts with a BOM', () => {
  const csv = buildCsv(['a', 'b'], [['x,y', 'say "hi"\nbye'], ['=2+2', -5]]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.includes('"x,y"'));
  assert.ok(csv.includes('"say ""hi""\nbye"'));
  assert.ok(csv.includes("'=2+2,-5"));
});

const { safeInternalPath, isSafeInternalPath } = await import('../src/lib/supabase/safe-redirect.ts');

check('redirect: ordinary in-app paths pass, with query and hash', () => {
  assert.equal(safeInternalPath('/dashboard'), '/dashboard');
  assert.equal(safeInternalPath('/transactions?highlight=abc#row'), '/transactions?highlight=abc#row');
  assert.equal(safeInternalPath('/login/reset-password'), '/login/reset-password');
});
check('redirect: other sites are refused (absolute, protocol-relative, backslash, scheme)', () => {
  for (const bad of ['https://evil.example', 'http://evil.example/x', '//evil.example', '/\\evil.example', '\\\\evil.example', 'javascript:alert(1)', 'evil.example', 'data:text/html,x', '']) {
    assert.equal(safeInternalPath(bad, '/dashboard'), '/dashboard', JSON.stringify(bad));
  }
});
check('redirect: tab, newline and CR tricks are refused (the URL parser deletes them: "/<TAB>/evil" is "//evil")', () => {
  for (const bad of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/\u0000/evil.example', '/ /evil.example', '/\u007f/evil.example']) {
    assert.equal(safeInternalPath(bad, '/dashboard'), '/dashboard', JSON.stringify(bad));
  }
  // what a browser makes of the three characters it deletes, to prove the cases above mean something
  for (const attack of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example']) {
    assert.notEqual(new URL(attack, 'https://app.example').origin, 'https://app.example', `not an attack: ${JSON.stringify(attack)}`);
  }
});
check('redirect: null, undefined, non-strings and huge values fall back', () => {
  assert.equal(safeInternalPath(null, '/x'), '/x');
  assert.equal(safeInternalPath(undefined, '/x'), '/x');
  assert.equal(safeInternalPath(/** @type {any} */ (42), '/x'), '/x');
  assert.equal(safeInternalPath(`/${'a'.repeat(3000)}`, '/x'), '/x');
  assert.equal(isSafeInternalPath('/ok'), true);
  assert.equal(isSafeInternalPath('//no'), false);
});

const { sanitizeSearchTerm, buildIlikeOrFilter } = await import('../src/lib/supabase/postgrest-filter.ts');

check('filter: characters with a meaning in or=(...) / ilike are removed', () => {
  assert.equal(sanitizeSearchTerm('abc'), 'abc');
  assert.equal(sanitizeSearchTerm('  أحمد   علي '), 'أحمد علي');
  const evil = 'x%,id.not.is.null,or(a.eq.1)';
  const s = sanitizeSearchTerm(evil);
  assert.ok(!/[,()%"\\_*]/.test(s), s);
  assert.equal(sanitizeSearchTerm('50%_off\\"quoted"'), '50 off quoted');
  assert.equal(sanitizeSearchTerm('a\nb\tc'), 'a b c');
  assert.equal(sanitizeSearchTerm(null), '');
  assert.equal(sanitizeSearchTerm('x'.repeat(500)).length, 100);
});
check('filter: the or() string has exactly one condition per column and no stray separators', () => {
  const f = buildIlikeOrFilter(['reference', 'description'], 'x%,id.not.is.null');
  assert.equal(f, 'reference.ilike.%x id.not.is.null%,description.ilike.%x id.not.is.null%');
  assert.equal(f.split(',').length, 2);
  assert.equal(buildIlikeOrFilter(['reference'], '  %%  '), null);
  assert.equal(buildIlikeOrFilter(['reference'], ''), null);
});
check('filter: a column name must be a plain identifier', () => {
  assert.throws(() => buildIlikeOrFilter(['a,b'], 'x'));
  assert.throws(() => buildIlikeOrFilter(['a).or(b'], 'x'));
});

const wa = await import('../src/lib/whatsapp.ts');

check('phone: every common way of writing a Libyan number reaches the same wa.me number', () => {
  for (const raw of ['0912345678', '912345678', '+218 91 234 5678', '+218 091 234 5678', '00218912345678', '٠٩١٢٣٤٥٦٧٨', '091-234-5678']) {
    assert.equal(wa.normalizeLibyanPhone(raw), '218912345678', raw);
  }
});
check('phone: two numbers in one field, notes and too-short values give no link instead of a stranger\'s number', () => {
  assert.equal(wa.normalizeLibyanPhone('0912345678 / 0922345678'), null);
  assert.equal(wa.normalizeLibyanPhone('0912345678 ext 12345 room 7'), null);
  assert.equal(wa.normalizeLibyanPhone('123'), null);
  assert.equal(wa.normalizeLibyanPhone(''), null);
  assert.equal(wa.normalizeLibyanPhone('لا يوجد'), null);
});
check('phone: links carry digits only and the message is encoded', () => {
  const link = wa.buildWhatsAppLink('+218 91 234 5678', 'السيد/ة أحمد، المستحق 100 & "x" <b>?a=1&b=2#h');
  assert.match(link, /^https:\/\/wa\.me\/218912345678\?text=[A-Za-z0-9%._~!*'()-]+$/);
  assert.ok(!link.includes('<') && !link.includes(' ') && !link.includes('"'));
  assert.equal(wa.buildTelLink('0912345678'), 'tel:+218912345678');
  assert.equal(wa.buildWhatsAppLink('javascript:alert(1)', 'x'), null);
  assert.equal(wa.buildTelLink('javascript:alert(1)'), null);
  assert.match(wa.buildMessageShareLink(null, 'hello'), /^https:\/\/wa\.me\/\?text=hello$/);
  assert.match(wa.buildMessageShareLink('garbage', 'hello'), /^https:\/\/wa\.me\/\?text=hello$/);
});

const guard = await import('../src/lib/supabase/request-guard.ts');
const req = (headers, url = 'https://taj-mall-nu.vercel.app/api/admin/invite') => ({ headers: new Headers(headers), url });

check('same-origin: own origin, no Origin (non-browser) and sec-fetch-site same-origin are accepted', () => {
  assert.equal(guard.isSameOriginRequest(req({ origin: 'https://taj-mall-nu.vercel.app' })), true);
  assert.equal(guard.isSameOriginRequest(req({})), true);
  assert.equal(guard.isSameOriginRequest(req({ 'sec-fetch-site': 'same-origin', origin: 'https://taj-mall-nu.vercel.app' })), true);
  assert.equal(guard.isSameOriginRequest(req({ 'sec-fetch-site': 'none' })), true);
  assert.equal(guard.isSameOriginRequest(req({ origin: 'https://app.example' }, 'https://x/api')), false);
  assert.equal(guard.isSameOriginRequest(req({ origin: 'https://app.example', host: 'app.example' }, 'http://localhost:3000/api')), true);
  assert.equal(guard.isSameOriginRequest(req({ origin: 'https://app.example', 'x-forwarded-host': 'app.example, other' }, 'http://localhost:3000/api')), true);
});
check('same-origin: another site, a sibling site, the opaque null origin and junk are refused', () => {
  assert.equal(guard.isSameOriginRequest(req({ origin: 'https://evil.example' })), false);
  assert.equal(guard.isSameOriginRequest(req({ origin: 'https://taj-mall-nu.vercel.app.evil.example' })), false);
  assert.equal(guard.isSameOriginRequest(req({ origin: 'null' })), false);
  assert.equal(guard.isSameOriginRequest(req({ origin: 'not a url' })), false);
  assert.equal(guard.isSameOriginRequest(req({ 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(guard.isSameOriginRequest(req({ 'sec-fetch-site': 'same-site', origin: 'https://taj-mall-nu.vercel.app' })), false);
});
check('json: only application/json bodies pass (a plain HTML form cannot send one)', () => {
  assert.equal(guard.isJsonRequest(req({ 'content-type': 'application/json' })), true);
  assert.equal(guard.isJsonRequest(req({ 'content-type': 'application/json; charset=utf-8' })), true);
  assert.equal(guard.isJsonRequest(req({ 'content-type': 'text/plain' })), false);
  assert.equal(guard.isJsonRequest(req({ 'content-type': 'application/x-www-form-urlencoded' })), false);
  assert.equal(guard.isJsonRequest(req({})), false);
});
check('bearer + constant-time compare', () => {
  assert.equal(guard.bearerToken(req({ authorization: 'Bearer abc123' })), 'abc123');
  assert.equal(guard.bearerToken(req({ authorization: 'bearer abc123' })), 'abc123');
  assert.equal(guard.bearerToken(req({ authorization: 'Basic abc123' })), null);
  assert.equal(guard.bearerToken(req({ authorization: 'Bearer' })), null);
  assert.equal(guard.bearerToken(req({})), null);
  assert.equal(guard.safeEqual('secret-value', 'secret-value'), true);
  assert.equal(guard.safeEqual('secret-value', 'secret-valuE'), false);
  assert.equal(guard.safeEqual('short', 'a-much-longer-value'), false);
  assert.equal(guard.safeEqual('', ''), true);
});

const { isHttpsRequest } = await import('../src/lib/supabase/env.ts');
check('cookies: Secure is chosen from the proxy header, then the URL protocol', () => {
  assert.equal(isHttpsRequest('https'), true);
  assert.equal(isHttpsRequest('https, http'), true);
  assert.equal(isHttpsRequest('http'), false);
  assert.equal(isHttpsRequest(null, 'https:'), true);
  assert.equal(isHttpsRequest(null, 'http:'), false);
  assert.equal(isHttpsRequest(undefined), false);
});

// ── Part 2: source rules ────────────────────────────────────────────────────────────────────────

/** Files in this list are known gaps outside the file ownership of whoever wrote the check. */
const PENDING = new Set([]);
const stillPending = new Set();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}
const srcFiles = walk(join(root, 'src')).map((f) => ({ rel: relative(root, f).replaceAll('\\', '/'), text: readFileSync(f, 'utf8') }));
const isClientFile = (text) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(text);

check('secrets: the service-role key is read only by server code, never by a client component', () => {
  for (const f of srcFiles) {
    const touches = /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient|getSupabaseServiceRoleKey/.test(f.text);
    if (!touches) continue;
    assert.ok(!isClientFile(f.text), `${f.rel} is a client component and uses the service-role key`);
  }
  const allowed = ['src/app/api/', 'src/app/portal/', 'src/lib/supabase/'];
  for (const f of srcFiles) {
    if (!/createSupabaseAdminClient\(|process\.env\.SUPABASE_(SECRET|SERVICE)/.test(f.text)) continue;
    assert.ok(allowed.some((a) => f.rel.startsWith(a)), `${f.rel} uses the service-role key outside the allowed server folders`);
  }
});
check('secrets: no client component imports the server-only Supabase module', () => {
  for (const f of srcFiles) {
    if (!isClientFile(f.text)) continue;
    assert.ok(!/from ['"]@\/lib\/supabase\/(server|request-guard)['"]/.test(f.text), `${f.rel} imports server-only code`);
  }
});
check('secrets: nothing public (NEXT_PUBLIC_*) is named like a secret', () => {
  const names = new Set();
  for (const f of srcFiles) for (const m of f.text.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) names.add(m[1]);
  for (const n of names) assert.ok(!/SECRET|SERVICE|PASSWORD|PRIVATE|TOKEN|KEY_SECRET/.test(n), `${n} would be sent to every browser`);
});
check('secrets: the keepalive secret and keys are never logged', () => {
  for (const f of srcFiles) {
    for (const m of f.text.matchAll(/console\.(?:log|info|warn|error|debug)\(([^;]*)\)/g)) {
      assert.ok(!/KEEPALIVE_SECRET|SUPABASE_SECRET_KEY|SERVICE_ROLE|password\b(?!Reset)/i.test(m[1].replace(/'[^']*'/g, '')), `${f.rel}: ${m[0].slice(0, 80)}`);
    }
  }
});

check('xss: no raw HTML sinks, eval or Function constructors in the app', () => {
  for (const f of srcFiles) {
    assert.ok(!/dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\(|\beval\(|new Function\(/.test(f.text), `${f.rel} has a raw HTML or eval sink`);
  }
});

/** The text of a call starting at `open` (the index of its "("), up to the matching ")". */
function callBody(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}
check('links: every window.open to a new tab says noopener, every target=_blank has rel=noopener', () => {
  for (const f of srcFiles) {
    for (const m of f.text.matchAll(/window\.open\(/g)) {
      const body = callBody(f.text, m.index + m[0].length - 1);
      if (/_blank/.test(body)) assert.match(body, /noopener/, `${f.rel}: window.open without noopener`);
    }
    for (const m of f.text.matchAll(/target=["']_blank["']/g)) {
      const around = f.text.slice(Math.max(0, m.index - 300), m.index + 300);
      assert.match(around, /rel=["'][^"']*noopener/, `${f.rel}: target=_blank without rel=noopener`);
    }
  }
});
check('links: no javascript: or data: URL is ever built', () => {
  for (const f of srcFiles) {
    if (f.rel.startsWith('src/lib/supabase/safe-redirect')) continue;
    for (const m of f.text.matchAll(/href=\{?[`'"]javascript:|location(?:\.href)?\s*=\s*[`'"]javascript:/g)) {
      assert.fail(`${f.rel}: ${m[0]}`);
    }
  }
});

check('filters: a PostgREST or() string is never built from a variable by hand', () => {
  for (const f of srcFiles) {
    for (const m of f.text.matchAll(/\.or\(\s*`([^`]*)`/g)) {
      if (!m[1].includes('${')) continue;
      if (PENDING.has(f.rel)) {
        stillPending.add(f.rel);
        warn(`${f.rel}: .or(\`…\${…}…\`) is spliced by hand; replace with buildIlikeOrFilter (src/lib/supabase/postgrest-filter.ts)`);
      } else {
        assert.fail(`${f.rel}: .or() built by hand from a variable: ${m[0].slice(0, 90)}`);
      }
    }
  }
});

check('redirects: a ?next= or a stored link goes through safeInternalPath, never a pattern test', () => {
  const sites = ['src/app/(auth)/login/page.tsx', 'src/app/(app)/notifications/page.tsx'];
  for (const rel of sites) {
    const f = srcFiles.find((x) => x.rel === rel);
    if (!f) continue;
    if (/safeInternalPath/.test(f.text)) continue;
    if (PENDING.has(rel)) {
      stillPending.add(rel);
      warn(`${rel}: redirect/link target not validated with safeInternalPath (a "/<TAB>/evil.example" value passes the old pattern)`);
    } else {
      assert.fail(`${rel} does not use safeInternalPath`);
    }
  }
  // the auth routes concatenate onto their own origin, which an extra path segment cannot escape
  for (const rel of ['src/app/auth/confirm/route.ts', 'src/app/auth/callback/route.ts']) {
    const f = srcFiles.find((x) => x.rel === rel);
    assert.ok(f && /\$\{origin\}\$\{safeNext\}/.test(f.text), `${rel} must build its redirect as origin + path`);
  }
});

const route = (rel) => readFileSync(join(root, rel), 'utf8');
check('admin routes: same-origin and JSON checks run before anything else; identity before the body is read', () => {
  for (const rel of ['src/app/api/admin/invite/route.ts', 'src/app/api/admin/reset-password/route.ts']) {
    const t = route(rel);
    const iOrigin = t.indexOf('isSameOriginRequest(req)');
    const iJson = t.indexOf('isJsonRequest(req)');
    const iUser = t.indexOf('auth.getUser()');
    const iBody = t.indexOf('req.json()');
    assert.ok(iOrigin > 0 && iJson > 0 && iUser > 0 && iBody > 0, `${rel}: a guard is missing`);
    assert.ok(iOrigin < iUser && iJson < iUser && iUser < iBody, `${rel}: guards must run origin, JSON, identity, then body`);
    assert.ok(/from\('profiles'\)[\s\S]*?\.select\('role'\)/.test(t), `${rel}: the caller's role must be read from the database`);
    assert.ok(!/body\.role|rawBody\.role|parsed\.data\.role.*callerRole\s*=/.test(t), `${rel}: a role must never be taken from the request as the caller's`);
  }
});
check('admin routes: resetting another account\'s password is the owner\'s alone; only an owner grants owner', () => {
  const reset = route('src/app/api/admin/reset-password/route.ts');
  assert.match(reset, /callerRole\s*!==\s*'owner'/);
  assert.ok(!/can\(callerRole,\s*'org\.users'\)/.test(reset), 'an admin must not pass the reset gate');
  assert.match(reset, /user_id\s*===\s*caller\.id/);
  const invite = route('src/app/api/admin/invite/route.ts');
  assert.match(invite, /role\s*===\s*'owner'\s*&&\s*callerRole\s*!==\s*'owner'/);
  assert.match(invite, /can\(callerRole,\s*'org\.users'\)/);
});
check('admin routes: passwords are 10 to 72 characters and the service-role client is created after the permission check', () => {
  for (const rel of ['src/app/api/admin/invite/route.ts', 'src/app/api/admin/reset-password/route.ts']) {
    const t = route(rel);
    assert.match(t, /\.min\(10/);
    assert.match(t, /\.max\(72/);
    assert.ok(t.indexOf('createSupabaseAdminClient()') > t.indexOf('org.users') || t.indexOf('createSupabaseAdminClient()') > t.indexOf("callerRole !== 'owner'"), `${rel}: admin client before the permission check`);
  }
});
check('keepalive: the bearer secret is compared in constant time; health leaks nothing', () => {
  const k = route('src/app/api/keepalive/route.ts');
  assert.match(k, /safeEqual\(/);
  assert.ok(!/===\s*`Bearer/.test(k));
  const h = route('src/app/api/health/route.ts');
  assert.ok(!/process\.env/.test(h));
});
check('middleware: unauthenticated visitors are sent to /login except for the listed public paths', () => {
  const m = route('src/lib/supabase/middleware.ts');
  assert.match(m, /if \(!user && !isPublic\)/);
  const publicBlock = m.slice(m.indexOf('const isPublic'), m.indexOf('// Unauthenticated'));
  for (const p of ['/api/admin', '/users', '/dashboard', '/api/auth/callback']) {
    assert.ok(!publicBlock.includes(`'${p}`), `${p} must not be public`);
  }
});

await checkAsync('headers: next.config.mjs sets the security headers and a report-only CSP in production', async () => {
  const savedEnv = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
    const cfg = (await import(`../next.config.mjs?prod=${Date.now()}`)).default;
    assert.equal(cfg.poweredByHeader, false);
    const rules = await cfg.headers();
    const at = (source) => rules.find((r) => r.source === source);
    const val = (rule, key) => rule?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

    const all = at('/(.*)');
    assert.ok(all, 'a catch-all header rule');
    assert.equal(val(all, 'X-Content-Type-Options'), 'nosniff');
    assert.equal(val(all, 'X-Frame-Options'), 'DENY');
    assert.match(val(all, 'Strict-Transport-Security'), /^max-age=\d{7,}$/);
    assert.ok(!/preload|includeSubDomains/i.test(val(all, 'Strict-Transport-Security')), 'no preload / subdomain rule on a platform domain');
    assert.match(val(all, 'Permissions-Policy'), /camera=\(\)/);
    assert.match(val(all, 'Permissions-Policy'), /geolocation=\(\)/);
    assert.equal(val(all, 'X-Permitted-Cross-Domain-Policies'), 'none');
    assert.equal(val(all, 'Cross-Origin-Opener-Policy'), 'same-origin');
    assert.match(val(all, 'Referrer-Policy'), /origin-when-cross-origin|no-referrer|strict-origin/);

    const csp = val(all, 'Content-Security-Policy-Report-Only');
    assert.ok(csp, 'CSP report-only present in production');
    assert.equal(val(all, 'Content-Security-Policy'), undefined, 'the CSP must not enforce yet');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /connect-src 'self' https:\/\/abcdefghijklmnopqrst\.supabase\.co wss:\/\/abcdefghijklmnopqrst\.supabase\.co/);
    assert.match(csp, /object-src 'self' blob:/); // the PDF <embed>
    assert.match(csp, /frame-src 'self' blob:/); // the PDF print frame
    assert.match(csp, /img-src [^;]*data:[^;]*blob:/);
    assert.match(csp, /base-uri 'self'/);
    assert.match(csp, /form-action 'self'/);
    assert.ok(!/'unsafe-eval'/.test(csp), 'no eval in production');
    assert.ok(!/(^|;)\s*script-src[^;]*\*[^;]*(;|$)/.test(csp.replace(/https:\/\/\*\.supabase\./g, '')), 'no wildcard script source');

    const portal = at('/portal/:path*');
    assert.ok(portal, 'a portal header rule');
    assert.equal(val(portal, 'Referrer-Policy'), 'no-referrer');
    assert.match(val(portal, 'X-Robots-Tag'), /noindex/);
    assert.match(val(portal, 'Cache-Control'), /no-store/);
    assert.ok(rules.indexOf(portal) > rules.indexOf(all), 'the portal rule must come after the catch-all so it overrides it');
    assert.match(val(at('/auth/:path*'), 'Cache-Control'), /no-store/);

    process.env.NODE_ENV = 'development';
    const dev = (await import(`../next.config.mjs?dev=${Date.now()}`)).default;
    const devAll = (await dev.headers()).find((r) => r.source === '/(.*)');
    assert.equal(val(devAll, 'Content-Security-Policy-Report-Only'), undefined, 'no CSP in development (React needs eval there)');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
});

check('vercel.json: API responses are never cached', () => {
  const v = JSON.parse(read('vercel.json'));
  const api = v.headers.find((h) => h.source === '/api/(.*)');
  assert.match(api.headers.find((h) => h.key === 'Cache-Control').value, /no-store/);
});

check('portal: not indexable, no Referer, token shape checked before the database, only what the page shows is fetched', () => {
  const p = read('src/app/portal/[token]/page.tsx');
  assert.match(p, /robots:\s*\{[^}]*index:\s*false/);
  assert.match(p, /referrer:\s*'no-referrer'/);
  assert.match(p, /PORTAL_TOKEN_SHAPE\.test\(token\)/);
  assert.match(p, /\.eq\('portal_token', token\)/);
  assert.match(p, /\.eq\('kind', 'TENANT'\)/);
  assert.match(p, /\.eq\('is_active', true\)/);
  const contactSelect = /\.from\('contacts'\)\s*\.select\('([^']*)'\)/.exec(p)?.[1] ?? '';
  for (const col of ['phone', 'salary', 'id_number', 'email', 'notes', 'portal_token']) {
    assert.ok(!new RegExp(`\\b${col}\\b`).test(contactSelect), `the portal must not fetch contacts.${col}`);
  }
  // every later query is scoped to the one tenant the token named
  assert.match(p, /\.eq\('tenant_id', contact\.id\)/);
  assert.match(p, /\.in\('contract_id', contractIds\)/);
  assert.ok(!/\.from\('(?:profiles|transactions|journal_entries|journal_lines|cashboxes|payroll)/.test(p), 'the portal reads tenant data only');
});
check('portal: the token generator makes 64 hex characters (two UUIDs without hyphens)', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/053_accounting_integrity_and_security.sql'), 'utf8');
  assert.match(sql, /replace\(gen_random_uuid\(\)::text \|\| gen_random_uuid\(\)::text, '-', ''\)/);
});

check('dependencies: install-time scripts are only reviewed local files with no network or process access', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const s of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']) {
    const cmd = pkg.scripts?.[s];
    if (!cmd) continue;
    const m = /^node (scripts\/[\w.-]+\.mjs)$/.exec(cmd);
    assert.ok(m, `package.json ${s} script "${cmd}" must be exactly "node scripts/<file>.mjs"`);
    const body = read(m[1]);
    assert.ok(
      !/child_process|node:net|node:http|node:https|node:dns|\bfetch\(|require\(|eval\(|new Function|spawn|execSync|exec\(/.test(body),
      `${m[1]} (run on every install) uses the network, a process or dynamic code`,
    );
    // it may only write inside node_modules
    for (const w of body.matchAll(/writeFileSync\(([^,]+),/g)) {
      assert.ok(/\bfile\b|node_modules/.test(w[1]), `${m[1]} writes somewhere other than node_modules: ${w[1]}`);
    }
  }
});
check('database access: the app never talks to Postgres directly (everything goes through Supabase and RLS)', () => {
  for (const f of srcFiles) {
    if (f.rel === 'src/lib/prisma.ts') continue;
    assert.ok(!/from ['"](?:@prisma\/client|pg)['"]|@\/lib\/prisma/.test(f.text), `${f.rel} imports Prisma or pg`);
  }
});

/** Files tracked by git (read-only listing), or every file under the repo when git is not available. */
function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean);
  } catch {
    return walk(root).map((f) => relative(root, f).replaceAll('\\', '/'));
  }
}
check('secrets: no key, token, private key or database password is committed in a tracked file', () => {
  const patterns = [
    ['a JWT (anon / service_role key)', /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
    ['a Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
    ['an AWS access key', /AKIA[0-9A-Z]{16}/],
    ['a GitHub token', /gh[pousr]_[A-Za-z0-9]{30,}/],
    ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ];
  const dbUrl = /postgres(?:ql)?:\/\/[^:@/\s"']+:([^@\s"']{4,})@/g;
  const placeholder = /YOUR|PASSWORD|password|\[|\]|\*|x{3,}|<|\{|\$|كلمة/;
  for (const rel of trackedFiles()) {
    if (/^(package-lock\.json|dogfood-output\/screenshots\/|public\/|src-tauri\/icons\/|\.agents\/)/.test(rel)) continue;
    if (/\.(png|jpe?g|ico|icns|ttf|woff2?|webp|gif)$/i.test(rel)) continue;
    let text;
    try {
      text = read(rel);
    } catch {
      continue;
    }
    for (const [what, re] of patterns) assert.ok(!re.test(text), `${rel} contains ${what}`);
    for (const m of text.matchAll(dbUrl)) assert.ok(placeholder.test(m[1]), `${rel} contains a database URL with a real-looking password`);
  }
});
check('secrets: environment files and audit dumps with production data are git-ignored', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /^\.env\*?\.?local?$/m);
  assert.match(ignore, /^tmp-\*\.json$/m);
  const files = trackedFiles();
  assert.ok(!files.some((f) => /^\.env(\.|$)/.test(f) && f !== '.env.example'), 'an env file is tracked');
  assert.ok(!files.some((f) => /^tmp-.*\.json$/.test(f)), 'a tmp audit dump is tracked');
});

for (const rel of PENDING) {
  if (!stillPending.has(rel)) console.log(`NOTE  ${rel} no longer has its known gap: remove it from PENDING in this script`);
}
console.log(`\n${passed} checks passed${warned ? `, ${warned} known gap(s) still open (WARN above)` : ''}`);
