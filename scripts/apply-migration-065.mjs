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

const sql = readFileSync(
  resolve(root, 'supabase/migrations/065_rent_price_sync_hardening.sql'),
  'utf8',
);

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log('Connected — applying 065_rent_price_sync_hardening…');
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  const { rows } = await client.query(`
    SELECT
      (pg_get_functiondef(p.oid) LIKE '%auth_role_may_write%') AS has_guard,
      (pg_get_functiondef(p.oid) LIKE '%frozen_settled%') AS has_freeze
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sync_rent_charges_to_schedule'
  `);
  console.log('OK', rows[0]);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('FAILED', e.message);
  process.exit(1);
} finally {
  await client.end();
}
