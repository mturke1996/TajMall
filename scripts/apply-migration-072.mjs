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
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^"|"$/g, ''),
      ];
    }),
);

const dbUrl = (env.DATABASE_URL || '').replace('?pgbouncer=true', '');
const sql = readFileSync(
  resolve(root, 'supabase/migrations/072_fix_rent_links_accruals_and_period_limits.sql'),
  'utf8',
);

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log('Connected — applying 072…');
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');

  const over = await client.query(`
    SELECT COUNT(*)::int AS n
    FROM journal_entries je
    JOIN tenant_charges tc ON tc.id = je.source_id
    JOIN journal_lines jl ON jl.journal_id = je.id
    JOIN categories cat ON cat.id = jl.category_id
    WHERE je.source_type = 'CHARGE' AND je.status = 'POSTED'
      AND cat.code = 'REV-RNT' AND jl.credit > tc.amount + 0.01
  `);
  const july = await client.query(`
    SELECT COALESCE(SUM(jl.credit),0)::float AS credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_id
    JOIN categories cat ON cat.id = jl.category_id
    WHERE je.status='POSTED' AND je.entry_date BETWEEN '2026-07-01' AND '2026-07-31'
      AND cat.code='REV-RNT'
  `);
  console.log({ overstatedStill: over.rows[0].n, julyRevRnt: july.rows[0].credit });
  console.log('OK');
} catch (e) {
  await client.query('ROLLBACK');
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
