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
  resolve(root, 'supabase/migrations/066_portal_token_and_rent_reverse_fix.sql'),
  'utf8',
);

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log('Connected — applying 066_portal_token_and_rent_reverse_fix…');
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');

  const priv = await client.query(`
    SELECT grantee, privilege_type
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'contacts'
      AND column_name = 'portal_token'
    ORDER BY grantee, privilege_type
  `);
  console.log('portal_token privileges:', priv.rows);

  const fn = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'purge_rent_links_for_journal'
  `);
  const def = fn.rows[0]?.def ?? '';
  console.log('purge includes journal_entry_id UNION:', def.includes('journal_entry_id = p_journal_id'));
  console.log('OK');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('FAILED', e.message);
  process.exit(1);
} finally {
  await client.end();
}
