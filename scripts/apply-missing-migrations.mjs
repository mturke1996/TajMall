/**
 * تطبيق الهجرات الناقصة 056 و 057 على قاعدة Fluxen البعيدة
 * التشغيل: node scripts/apply-missing-migrations.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');

const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const dbUrl = (env.DATABASE_URL || '').replace('?pgbouncer=true', '');
if (!dbUrl) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const files = [
  '056_tenant_rent_exempt_months.sql',
  '057_journal_entries_for_period.sql',
];

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log('Connected to Fluxen DB');

for (const file of files) {
  const path = resolve(root, 'supabase/migrations', file);
  const sql = readFileSync(path, 'utf8');
  console.log(`\n>>> Applying ${file} (${sql.length} bytes)…`);
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`✓ ${file} applied`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`✗ ${file} FAILED:`, e.message);
    await client.end();
    process.exit(1);
  }
}

// Verify
const { rows } = await client.query(`
  SELECT p.proname AS name,
         pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'tenant_rent_claim_start',
      'is_tenant_rent_month_exempt',
      'set_tenant_rent_exempt_months',
      'get_journal_entries_for_period',
      'get_tenant_rent_calendar',
      'ensure_tenant_rent_charges'
    )
  ORDER BY p.proname, args
`);

console.log('\n=== Verified functions ===');
rows.forEach((r) => console.log(`  ✓ ${r.name}(${r.args})`));

const needed = [
  'tenant_rent_claim_start',
  'is_tenant_rent_month_exempt',
  'set_tenant_rent_exempt_months',
  'get_journal_entries_for_period',
];
const present = new Set(rows.map((r) => r.name));
const missing = needed.filter((n) => !present.has(n));

await client.end();

if (missing.length) {
  console.error('\nStill missing:', missing.join(', '));
  process.exit(1);
}

console.log('\n✓ Migrations 056 + 057 applied and verified');
