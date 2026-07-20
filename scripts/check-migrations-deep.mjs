/**
 * فحص عميق للكائنات من الهجرات المتأخرة (045–057)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const local = readdirSync(resolve(root, 'supabase/migrations'))
  .filter((f) => /^\d{3}_.+\.sql$/.test(f))
  .sort();

console.log('Local migrations:', local.length);
console.log(local.map((f) => f.replace('.sql', '')).join('\n'));
console.log('');

async function rpc(name, args) {
  const { error } = await sb.rpc(name, args ?? {});
  if (!error) return { ok: true, detail: 'callable' };
  const msg = error.message || '';
  const missing =
    msg.includes('Could not find') ||
    msg.includes('does not exist') ||
    error.code === 'PGRST202';
  return { ok: !missing, detail: msg.slice(0, 140), missing };
}

async function col(table, column) {
  const { error } = await sb.from(table).select(column).limit(1);
  if (!error) return { ok: true, detail: 'column ok' };
  const msg = error.message || '';
  const missing = msg.includes(column) || msg.includes('does not exist');
  return { ok: !missing, detail: msg.slice(0, 140), missing };
}

async function table(name) {
  const { error } = await sb.from(name).select('*', { head: true, count: 'exact' });
  if (!error) return { ok: true, detail: 'exists' };
  const msg = error.message || '';
  const missing = msg.includes('does not exist') || error.code === 'PGRST205';
  return { ok: !missing, detail: msg.slice(0, 140), missing };
}

const checks = [
  ['045', 'col', 'contacts.portal_token', () => col('contacts', 'portal_token')],
  ['045', 'rpc', 'ensure_tenant_portal_token', () =>
    rpc('ensure_tenant_portal_token', {
      p_tenant_id: '00000000-0000-0000-0000-000000000000',
    })],
  ['054', 'rpc', 'get_cashbox_balance', () =>
    rpc('get_cashbox_balance', {
      p_cashbox_id: '00000000-0000-0000-0000-000000000000',
    })],
  ['054', 'rpc', 'get_cashbox_ledger', () =>
    rpc('get_cashbox_ledger', {
      p_cashbox_id: '00000000-0000-0000-0000-000000000000',
    })],
  ['054', 'rpc', 'close_fiscal_year(p_year)', () => rpc('close_fiscal_year', { p_year: 2025 })],
  ['055', 'rpc', 'preview_fiscal_year_close', () =>
    rpc('preview_fiscal_year_close', { p_year: 2025 })],
  ['055', 'rpc', 'close_fiscal_year(+confirm)', () =>
    rpc('close_fiscal_year', { p_year: 2025, p_confirm_text: 'CLOSE' })],
  ['056', 'table', 'tenant_rent_exempt_months', () => table('tenant_rent_exempt_months')],
  ['056', 'rpc', 'tenant_rent_claim_start', () =>
    rpc('tenant_rent_claim_start', {
      p_tenant_id: '00000000-0000-0000-0000-000000000000',
    })],
  ['056', 'rpc', 'set_tenant_rent_exempt_months', () =>
    rpc('set_tenant_rent_exempt_months', {
      p_tenant_id: '00000000-0000-0000-0000-000000000000',
      p_months: ['2026-01'],
      p_exempt: true,
    })],
  ['056', 'rpc', 'is_tenant_rent_month_exempt', () =>
    rpc('is_tenant_rent_month_exempt', {
      p_tenant_id: '00000000-0000-0000-0000-000000000000',
      p_month: '2026-01',
    })],
  ['057', 'rpc', 'get_journal_entries_for_period', () =>
    rpc('get_journal_entries_for_period', {
      p_start_date: '2026-01-01',
      p_end_date: '2026-01-31',
    })],
];

const missing = [];
for (const [mig, kind, name, fn] of checks) {
  const r = await fn();
  const mark = r.ok ? '✓' : '✗';
  console.log(`${mark} [${mig}] ${kind} ${name} — ${r.detail}`);
  if (!r.ok) missing.push({ mig, kind, name, detail: r.detail });
}

// Direct SQL: list functions matching late migrations
const client = new pg.Client({
  connectionString: env.DATABASE_URL.replace('?pgbouncer=true', ''),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows: funcs } = await client.query(`
  SELECT p.proname AS name,
         pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      p.proname ILIKE '%portal%'
      OR p.proname ILIKE '%fiscal%'
      OR p.proname ILIKE '%year_close%'
      OR p.proname ILIKE '%exempt%'
      OR p.proname ILIKE '%journal_entries_for_period%'
      OR p.proname ILIKE '%cashbox_balance%'
      OR p.proname ILIKE '%cashbox_ledger%'
    )
  ORDER BY p.proname
`);
console.log('\n=== Related functions on remote ===');
funcs.forEach((f) => console.log(`  ${f.name}(${f.args})`));

const { rows: migTable } = await client.query(`
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_name IN ('schema_migrations', 'supabase_migrations')
     OR table_schema = 'supabase_migrations'
`);
console.log('\n=== Migration tracking tables ===');
console.log(migTable.length ? migTable : 'NONE — الهجرات طُبّقت يدوياً بدون تتبع Supabase CLI');

await client.end();

console.log('\n=== SUMMARY ===');
if (!missing.length) {
  console.log('كل الكائنات المفحوصة موجودة.');
} else {
  console.log('ناقص / غير مهجّر:');
  missing.forEach((m) => console.log(`  ✗ ${m.mig} ${m.name}`));
  process.exitCode = 1;
}
