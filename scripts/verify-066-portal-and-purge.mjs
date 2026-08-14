/**
 * Verify CR-01: authenticated role cannot SELECT contacts.portal_token.
 * Uses DATABASE_URL as postgres (bypass) + SET ROLE authenticated simulation via
 * a check of column_privileges + optional PostgREST probe with anon key if present.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

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

const { rows: sel } = await client.query(`
  SELECT grantee
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'contacts'
    AND column_name = 'portal_token'
    AND privilege_type = 'SELECT'
`);
const bad = sel.filter((r) =>
  ['anon', 'authenticated', 'PUBLIC', 'public'].includes(r.grantee),
);
console.log('SELECT grantees on portal_token:', sel.map((r) => r.grantee));
if (bad.length) {
  console.error('FAIL: portal_token still SELECT-able by', bad.map((r) => r.grantee));
  process.exitCode = 1;
} else {
  console.log('PASS: anon/authenticated have no SELECT on portal_token');
}

const { rows: purge } = await client.query(`
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'purge_rent_links_for_journal'
`);
const def = purge[0]?.def ?? '';
if (!def.includes('UNION') || !def.includes('journal_entry_id = p_journal_id')) {
  console.error('FAIL: purge_rent_links_for_journal missing UNION legacy path');
  process.exitCode = 1;
} else {
  console.log('PASS: purge_rent_links_for_journal includes legacy journal_entry_id path');
}

await client.end();

// PostgREST: selecting portal_token with anon key should omit/error
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (url && anon) {
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.from('contacts').select('id, portal_token').limit(1);
  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (
      msg.includes('portal_token') ||
      msg.includes('permission') ||
      error.code === '42501'
    ) {
      console.log('PASS: PostgREST rejects portal_token select:', error.message);
    } else {
      console.warn('WARN: unexpected PostgREST error:', error.message);
      process.exitCode = 1;
    }
  } else if (
    data?.[0] &&
    Object.prototype.hasOwnProperty.call(data[0], 'portal_token') &&
    data[0].portal_token != null
  ) {
    console.error('FAIL: PostgREST returned portal_token field:', data[0]);
    process.exitCode = 1;
  } else {
    console.log('PASS: PostgREST response has no usable portal_token');
  }
}
