// Apply migration 052 to remote DB and verify cash account mapping.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

function loadEnv(file) {
  const txt = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)?"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnv('.env.local');
const conn = env.DATABASE_URL || env.DIRECT_URL;
if (!conn) {
  console.error('No DATABASE_URL/DIRECT_URL in .env.local');
  process.exit(1);
}

const client = new pg.Client({ connectionString: conn, connectionTimeoutMillis: 15000 });
await client.connect();
const sql = fs.readFileSync('supabase/migrations/052_fix_transaction_posting_cash_account.sql', 'utf8');
await client.query(sql);
console.log('Applied migration 052');

const checks = await client.query(`
  SELECT
    (SELECT count(*)::int FROM categories WHERE code='AST-CSH' AND active=true) AS ast_csh,
    (SELECT count(*)::int FROM account_mappings WHERE source_type='REVENUE_CASH_ASSET' AND category_id IS NOT NULL) AS rev_cash_map,
    (SELECT prosrc LIKE '%AST-CSH%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='process_transaction_posting' AND n.nspname='public') AS fn_has_fallback
`);
console.log('Checks:', checks.rows[0]);
await client.end();
