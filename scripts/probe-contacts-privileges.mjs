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

const client = new pg.Client({
  connectionString: (env.DATABASE_URL || '').replace('?pgbouncer=true', ''),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

for (const role of ['anon', 'authenticated']) {
  const { rows } = await client.query(
    `
    SELECT
      has_table_privilege($1, 'public.contacts', 'SELECT') AS table_select,
      has_column_privilege($1, 'public.contacts', 'name', 'SELECT') AS name_select,
      has_column_privilege($1, 'public.contacts', 'portal_token', 'SELECT') AS token_select
    `,
    [role],
  );
  console.log(role, rows[0]);
}

// Can authenticated select name via SET ROLE?
await client.query('BEGIN');
await client.query(`SET LOCAL ROLE authenticated`);
try {
  const { rows } = await client.query(`SELECT id, name FROM public.contacts LIMIT 1`);
  console.log('SET ROLE authenticated SELECT name OK', rows[0]?.id ? 'row' : 'empty');
} catch (e) {
  console.log('SET ROLE authenticated SELECT name FAIL', e.message);
}
try {
  const { rows } = await client.query(`SELECT id, portal_token FROM public.contacts LIMIT 1`);
  console.log('SET ROLE authenticated SELECT portal_token UNEXPECTED', rows[0]);
} catch (e) {
  console.log('SET ROLE authenticated SELECT portal_token blocked OK:', e.message.split('\n')[0]);
}
await client.query('ROLLBACK');
await client.end();
