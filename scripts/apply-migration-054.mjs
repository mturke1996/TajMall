import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

function loadEnv(file) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return {};
  const txt = fs.readFileSync(full, 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)?"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local') };
const conn = env.DATABASE_URL || env.DIRECT_URL;
if (!conn) {
  console.error('No DATABASE_URL/DIRECT_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn, connectionTimeoutMillis: 30000 });
await client.connect();
const sql = fs.readFileSync(
  'supabase/migrations/054_cashbox_gl_unify_and_year_close.sql',
  'utf8',
);

try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('Applied migration 054');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('Migration 054 failed:', e.message);
  process.exit(1);
}

const checks = await client.query(`
  SELECT
    (SELECT COUNT(*)::int FROM categories WHERE code='EQ-RE') AS eq_re,
    (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='close_fiscal_year') AS close_fn,
    (SELECT prosrc LIKE '%journal_lines%'
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='get_cashbox_balance' LIMIT 1) AS balance_from_gl
`);
console.log('Checks:', checks.rows[0]);
await client.end();
