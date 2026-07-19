// Apply migration 053 (accounting integrity + security) to remote DB.
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
  console.error('No DATABASE_URL/DIRECT_URL in .env or .env.local');
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn, connectionTimeoutMillis: 20000 });
await client.connect();

const sql = fs.readFileSync(
  'supabase/migrations/053_accounting_integrity_and_security.sql',
  'utf8',
);

try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('Applied migration 053');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('Migration 053 failed:', e.message);
  process.exit(1);
}

const checks = await client.query(`
  SELECT
    (SELECT prosrc LIKE '%إبطال فقط%' OR prosrc NOT LIKE '%Swap%'
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.proname='reverse_ledger_entry' AND n.nspname='public'
      LIMIT 1) AS reverse_void_only,
    (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.proname='auth_may_manage_journals' AND n.nspname='public') AS has_journal_auth,
    (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.proname='ensure_tenant_portal_token' AND n.nspname='public') AS has_portal_rpc,
    (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.proname='assert_fiscal_period_open' AND n.nspname='public') AS has_period_assert,
    (SELECT prosrc LIKE '%net_income%'
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.proname='get_balance_sheet' AND n.nspname='public'
      LIMIT 1) AS bs_has_net_income,
    (SELECT COUNT(*)::int FROM pg_constraint
      WHERE conname='journal_lines_not_both_sides') AS has_line_check
`);
console.log('Checks:', checks.rows[0]);

const probe = await client.query(
  `SELECT (r->'summary'->>'net_income') IS NOT NULL AS has_ni
   FROM get_balance_sheet(CURRENT_DATE) r`,
);
console.log('Balance sheet probe:', probe.rows[0]);

await client.end();
