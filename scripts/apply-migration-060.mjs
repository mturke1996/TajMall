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
  resolve(root, 'supabase/migrations/060_voucher_contact_id.sql'),
  'utf8',
);

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log('Connected — applying 060_voucher_contact_id…');
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  const { rows } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'disbursement_vouchers'
      AND column_name = 'contact_id'
  `);
  if (!rows.length) throw new Error('contact_id column missing after migration');
  console.log('✓ 060 applied — contact_id present on disbursement_vouchers');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('✗ FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
