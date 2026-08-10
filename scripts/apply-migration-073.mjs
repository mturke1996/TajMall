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
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^"|"$/g, ''),
      ];
    }),
);

const dbUrl = (env.DATABASE_URL || '').replace('?pgbouncer=true', '');
const sql = readFileSync(
  resolve(
    root,
    'supabase/migrations/073_fix_payment_method_and_contacts_grants.sql',
  ),
  'utf8',
);

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log('Connected — applying 073…');
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');

  const fn = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'record_rent_payment'
    ORDER BY p.oid DESC
    LIMIT 1
  `);
  const def = fn.rows[0]?.def ?? '';
  if (!def.includes('payment_method')) {
    throw new Error('record_rent_payment still missing payment_method cast');
  }
  console.log('OK — 073 applied (record_rent_payment + contacts grants)');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('Failed:', e);
  process.exit(1);
} finally {
  await client.end();
}
