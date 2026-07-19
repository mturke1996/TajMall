// Smoke-verify migration 053 accounting integrity fixes.
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
  connectionTimeoutMillis: 15000,
});
await client.connect();

const badReversals = await client.query(`
  SELECT COUNT(*)::int AS n
  FROM journal_entries rev
  JOIN journal_entries orig ON orig.id = rev.reversal_of_entry_id
  WHERE rev.status = 'POSTED' AND orig.status = 'REVERSED'
`);

const reverseSrc = await client.query(`
  SELECT prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reverse_ledger_entry'
  LIMIT 1
`);

const insertsOpposite = /INSERT\s+INTO\s+public\.journal_entries/i.test(
  reverseSrc.rows[0]?.prosrc ?? '',
);

const bs = await client.query(`SELECT get_balance_sheet(CURRENT_DATE) AS r`);
const summary = bs.rows[0].r?.summary ?? {};

console.log(
  JSON.stringify(
    {
      leftover_double_reversals: badReversals.rows[0].n,
      reverse_still_inserts_entry: insertsOpposite,
      balance_sheet_has_net_income_key: Object.prototype.hasOwnProperty.call(
        summary,
        'net_income',
      ),
      ok:
        badReversals.rows[0].n === 0 &&
        !insertsOpposite &&
        Object.prototype.hasOwnProperty.call(summary, 'net_income'),
    },
    null,
    2,
  ),
);

await client.end();
process.exit(
  badReversals.rows[0].n === 0 &&
    !insertsOpposite &&
    Object.prototype.hasOwnProperty.call(summary, 'net_income')
    ? 0
    : 1,
);
