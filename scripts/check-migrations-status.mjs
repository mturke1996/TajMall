/**
 * مقارنة ملفات الهجرة المحلية مع كائنات قاعدة Fluxen البعيدة
 * التشغيل: node scripts/check-migrations-status.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
const envPath = resolve(root, '.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
const dbUrl = env.DATABASE_URL;

const localFiles = readdirSync(resolve(root, 'supabase/migrations'))
  .filter((f) => /^\d{3}_.+\.sql$/.test(f))
  .sort();

console.log('=== Fluxen project ===');
console.log('URL:', url);
console.log('Local migration files:', localFiles.length);
console.log('First:', localFiles[0]);
console.log('Last:', localFiles[localFiles.length - 1]);
console.log('');

/** هجرات رئيسية → كائنات يجب أن توجد إن طُبّقت */
const EXPECTED = [
  { migration: '001', kind: 'table', name: 'profiles' },
  { migration: '001', kind: 'table', name: 'cashboxes' },
  { migration: '001', kind: 'table', name: 'transactions' },
  { migration: '004', kind: 'table', name: 'contacts' },
  { migration: '007', kind: 'table', name: 'journal_entries' },
  { migration: '013', kind: 'table', name: 'lease_contracts' },
  { migration: '013', kind: 'table', name: 'mall_units' },
  { migration: '022', kind: 'table', name: 'tenant_charges' },
  { migration: '033', kind: 'view', name: 'tenant_rent_summary' },
  { migration: '042', kind: 'table', name: 'bank_reconciliations' },
  { migration: '043', kind: 'table', name: 'budgets' },
  { migration: '047', kind: 'rpc', name: 'tenant_rent_summary_for_month', args: { p_month_key: '2026-01' } },
  { migration: '022', kind: 'rpc', name: 'get_tenant_rent_calendar', args: { p_tenant_id: '00000000-0000-0000-0000-000000000000', p_year: 2026 } },
  { migration: '026', kind: 'rpc', name: 'set_tenant_rent_month_status', args: { p_tenant_id: '00000000-0000-0000-0000-000000000000', p_months: ['2026-01'], p_paid: false } },
  { migration: '029', kind: 'rpc', name: 'ensure_tenant_lease_contract', args: { p_tenant_id: '00000000-0000-0000-0000-000000000000' } },
  { migration: '045', kind: 'rpc', name: 'ensure_tenant_portal_token', args: { p_tenant_id: '00000000-0000-0000-0000-000000000000' } },
  { migration: '054', kind: 'rpc', name: 'close_fiscal_year', args: {} },
  { migration: '056', kind: 'table', name: 'tenant_rent_exempt_months' },
];

const sb = createClient(url, key, { auth: { persistSession: false } });

async function tableOk(name) {
  const { error } = await sb.from(name).select('*', { count: 'exact', head: true });
  if (!error) return { ok: true, detail: 'exists' };
  const msg = error.message || '';
  if (msg.includes('does not exist') || error.code === 'PGRST205' || error.code === '42P01') {
    return { ok: false, detail: msg };
  }
  return { ok: true, detail: `exists (${msg.slice(0, 70)})` };
}

async function rpcOk(name, args) {
  const { error } = await sb.rpc(name, args ?? {});
  if (!error) return { ok: true, detail: 'callable' };
  const msg = error.message || '';
  if (msg.includes('Could not find') || msg.includes('does not exist') || error.code === 'PGRST202') {
    return { ok: false, detail: msg.slice(0, 140) };
  }
  return { ok: true, detail: `exists (${msg.slice(0, 90)})` };
}

const results = [];
for (const item of EXPECTED) {
  const r =
    item.kind === 'rpc'
      ? await rpcOk(item.name, item.args)
      : await tableOk(item.name);
  results.push({ ...item, ...r });
  const mark = r.ok ? '✓' : '✗';
  console.log(`${mark} [${item.migration}] ${item.kind} ${item.name} — ${r.detail}`);
}

console.log('');

// Try reading supabase_migrations via direct Postgres if available
if (dbUrl) {
  const client = new pg.Client({
    connectionString: dbUrl.replace('?pgbouncer=true', ''),
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT version, name
      FROM supabase_migrations.schema_migrations
      ORDER BY version
    `);
    console.log('=== supabase_migrations.schema_migrations ===');
    console.log('Remote recorded migrations:', rows.length);
    if (rows.length) {
      console.log('First remote:', rows[0].version, rows[0].name);
      console.log('Last remote:', rows[rows.length - 1].version, rows[rows.length - 1].name);
    }

    // Compare naming styles: local uses 001_xxx, remote may use timestamps or same names
    const remoteNames = new Set(rows.map((r) => r.name));
    const localNames = localFiles.map((f) => f.replace(/\.sql$/, ''));
    const missingInRemote = localNames.filter((n) => {
      // match by suffix name without number, or exact, or contains
      const bare = n.replace(/^\d{3}_/, '');
      return ![...remoteNames].some(
        (rn) => rn === n || rn === bare || rn.includes(bare) || bare.includes(rn),
      );
    });

    console.log('');
    console.log('Local files not clearly matched in schema_migrations:', missingInRemote.length);
    if (missingInRemote.length && missingInRemote.length <= 40) {
      missingInRemote.forEach((n) => console.log('  -', n));
    } else if (missingInRemote.length > 40) {
      missingInRemote.slice(0, 20).forEach((n) => console.log('  -', n));
      console.log('  ... and', missingInRemote.length - 20, 'more');
    }

    // Also list remote names that look Fluxen-related
    const fluxenRemote = rows.filter((r) =>
      /tenant|rent|journal|cashbox|mall|voucher|contact|budget|reconcil|year_close|exempt/i.test(
        r.name,
      ),
    );
    console.log('');
    console.log('Fluxen-related remote migration names:', fluxenRemote.length);
    fluxenRemote.slice(-15).forEach((r) => console.log('  ', r.version, r.name));

    await client.end();
  } catch (e) {
    console.log('Could not read schema_migrations via DATABASE_URL:', e.message);
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
} else {
  console.log('No DATABASE_URL — skipped schema_migrations table check');
}

const missing = results.filter((r) => !r.ok);
console.log('');
console.log('=== SUMMARY ===');
console.log('Probes OK:', results.length - missing.length, '/', results.length);
if (missing.length) {
  console.log('MISSING objects (migrations likely NOT applied):');
  missing.forEach((m) => console.log('  ✗', m.migration, m.name));
  process.exitCode = 1;
} else {
  console.log('All critical objects from migrations 001–056 appear present on remote DB.');
}
