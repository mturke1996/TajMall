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
const client = new pg.Client({
  connectionString: env.DATABASE_URL || env.DIRECT_URL,
  connectionTimeoutMillis: 20000,
});
await client.connect();
const sql = fs.readFileSync(
  'supabase/migrations/055_year_close_manual_confirm.sql',
  'utf8',
);
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('Applied migration 055');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('Migration 055 failed:', e.message);
  process.exit(1);
}
const r = await client.query(`
  SELECT p.oid::regprocedure::text AS sig
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('preview_fiscal_year_close','close_fiscal_year')
  ORDER BY 1
`);
console.log(r.rows.map((x) => x.sig).join('\n'));
await client.end();
