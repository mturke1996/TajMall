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

const { rows: cols } = await client.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'contacts'
    AND column_name <> 'portal_token'
  ORDER BY ordinal_position
`);

const list = cols.map((r) => `"${r.column_name}"`).join(', ');
console.log('Granting SELECT on', cols.length, 'columns (excluding portal_token)');

await client.query('BEGIN');
try {
  // Table-level SELECT implies all columns — revoke then re-grant column list
  for (const role of ['anon', 'authenticated', 'PUBLIC']) {
    await client.query(`REVOKE SELECT ON TABLE public.contacts FROM ${role}`);
  }

  await client.query(
    `GRANT SELECT (${list}) ON TABLE public.contacts TO anon, authenticated`,
  );

  // Keep write privileges as they were (table-level insert/update/delete via RLS)
  // INSERT/UPDATE still need column grants for writes that touch portal_token via RPC only.
  // Ensure authenticated cannot UPDATE portal_token either:
  const updList = list; // same columns without portal_token
  await client.query(`REVOKE UPDATE ON TABLE public.contacts FROM anon, authenticated, PUBLIC`);
  await client.query(
    `GRANT UPDATE (${updList}) ON TABLE public.contacts TO authenticated`,
  );
  // INSERT: allow all non-token columns; token set only via SECURITY DEFINER RPC
  await client.query(`REVOKE INSERT ON TABLE public.contacts FROM anon, authenticated, PUBLIC`);
  await client.query(
    `GRANT INSERT (${updList}) ON TABLE public.contacts TO authenticated`,
  );
  await client.query(`GRANT DELETE ON TABLE public.contacts TO authenticated`);

  // service_role / postgres keep full access
  await client.query(`GRANT ALL ON TABLE public.contacts TO service_role, postgres`);

  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('FAILED', e.message);
  await client.end();
  process.exit(1);
}

const { rows: priv } = await client.query(`
  SELECT grantee, privilege_type
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'contacts'
    AND column_name = 'portal_token'
  ORDER BY grantee, privilege_type
`);
console.log('portal_token privileges after fix:', priv.rows);

const { rows: sample } = await client.query(`
  SELECT grantee, privilege_type
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'contacts'
    AND column_name = 'name'
    AND grantee IN ('anon', 'authenticated')
  ORDER BY grantee, privilege_type
`);
console.log('name column (control):', sample);

await client.end();
console.log('OK');
