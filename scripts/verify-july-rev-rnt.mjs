import pg from 'pg';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')];
    }),
);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const julyRev = await client.query(`
  SELECT COALESCE(SUM(jl.credit), 0)::float AS credit,
         COUNT(DISTINCT je.id)::int AS jes
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_id
  JOIN categories cat ON cat.id = jl.category_id
  WHERE je.status = 'POSTED'
    AND je.entry_date BETWEEN '2026-07-01' AND '2026-07-31'
    AND cat.code = 'REV-RNT'
`);

const julyCharges = await client.query(`
  SELECT COALESCE(SUM(amount), 0)::float AS amt, COUNT(*)::int AS n
  FROM tenant_charges
  WHERE type = 'RENT'
    AND due_date BETWEEN '2026-07-01' AND '2026-07-31'
`);

const missing = await client.query(`
  SELECT COUNT(*)::int AS n
  FROM tenant_charges tc
  WHERE tc.amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.source_type = 'CHARGE'
        AND je.source_id = tc.id
        AND je.status = 'POSTED'
    )
`);

const julyChargeAccruals = await client.query(`
  SELECT COUNT(*)::int AS n,
         COALESCE(SUM(jl.credit), 0)::float AS credit
  FROM journal_entries je
  JOIN journal_lines jl ON jl.journal_id = je.id
  JOIN categories cat ON cat.id = jl.category_id
  WHERE je.source_type = 'CHARGE'
    AND je.status = 'POSTED'
    AND je.entry_date BETWEEN '2026-07-01' AND '2026-07-31'
    AND cat.code = 'REV-RNT'
`);

console.log(
  JSON.stringify(
    {
      julyRevRntCredit: julyRev.rows[0].credit,
      julyRevRntJournals: julyRev.rows[0].jes,
      julyRentCharges: julyCharges.rows[0],
      julyChargeAccrualRevRnt: julyChargeAccruals.rows[0],
      chargesStillMissingAccrual: missing.rows[0].n,
    },
    null,
    2,
  ),
);

await client.end();
