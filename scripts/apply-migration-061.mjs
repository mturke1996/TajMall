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
  resolve(root, 'supabase/migrations/061_tenant_rent_price_bands.sql'),
  'utf8',
);

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log('Connected — applying 061_tenant_rent_price_bands…');
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  const { rows } = await client.query(`
    SELECT to_regclass('public.tenant_rent_price_bands') AS table_ok,
           EXISTS (
             SELECT 1 FROM pg_proc WHERE proname = 'resolve_tenant_rent_amount'
           ) AS fn_ok;
  `);
  console.log('OK', rows[0]);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('FAILED', e.message);
  process.exit(1);
} finally {
  await client.end();
}
