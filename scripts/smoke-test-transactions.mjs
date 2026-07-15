// Smoke test: revenue + expense insert triggers posting (rolled back).
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
const client = new pg.Client({ connectionString: conn, connectionTimeoutMillis: 15000 });
await client.connect();

try {
  await client.query('BEGIN');
  const meta = await client.query(`
    SELECT
      (SELECT id FROM categories WHERE kind='REVENUE' AND active=true ORDER BY sort_order LIMIT 1) AS rev_cat,
      (SELECT id FROM categories WHERE kind='EXPENSE' AND active=true ORDER BY sort_order LIMIT 1) AS exp_cat,
      (SELECT id FROM cashboxes ORDER BY code LIMIT 1) AS cashbox
  `);
  const { rev_cat, exp_cat, cashbox } = meta.rows[0];
  if (!rev_cat || !exp_cat || !cashbox) throw new Error('Missing seed category/cashbox');

  for (const [kind, cat] of [['REVENUE', rev_cat], ['EXPENSE', exp_cat]]) {
    const ins = await client.query(
      `INSERT INTO transactions (kind, status, method, amount, category_id, cashbox_id, tx_date, description, auto_allocate_charges, posted_at)
       VALUES ($1, 'POSTED', 'CASH', 1.000, $2, $3, CURRENT_DATE, $4, false, now())
       RETURNING id`,
      [kind, cat, cashbox, `smoke-${kind}`],
    );
    const txId = ins.rows[0].id;
    const je = await client.query(
      `SELECT count(*)::int AS n FROM journal_entries WHERE source_type='TRANSACTION' AND source_id=$1 AND status='POSTED'`,
      [txId],
    );
    if (je.rows[0].n < 1) throw new Error(`${kind}: no journal entry created`);
    console.log(`✓ ${kind} insert + ledger posting OK (tx ${txId})`);
  }

  await client.query('ROLLBACK');
  console.log('Rollback OK — no test data persisted');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('FAIL:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
