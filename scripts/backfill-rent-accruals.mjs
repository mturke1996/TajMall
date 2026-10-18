/**
 * Posts the missing revenue accrual (Dr AST-REC / Cr REV-RNT) for rent charges that have none.
 * Requires 078 (post_missing_charge_accrual).
 *
 *   node scripts/backfill-rent-accruals.mjs                         # preview only (read-only)
 *   node scripts/backfill-rent-accruals.mjs --confirm               # open periods: accrual on the charge's own date
 *   node scripts/backfill-rent-accruals.mjs --confirm --include-closed
 *        # also closed months, accrued on today's date so closed periods stay untouched
 *
 * Everything runs in one transaction and is checked before COMMIT. Every entry it creates is a
 * CHARGE journal created in this run; it saves their list and an exact undo script in ~/Fluxen-Backups.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readLocalEnv } from './lib/pglite-replica.mjs';

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const includeClosed = args.includes('--include-closed');
const pg = createRequire(resolve(process.cwd(), 'package.json'))('pg');
const env = readLocalEnv();
const client = new pg.Client({ connectionString: (env.DATABASE_URL || env.DIRECT_URL).replace('?pgbouncer=true', ''), ssl: { rejectUnauthorized: false } });
await client.connect();

const MISSING = `
  SELECT tc.id, to_char(tc.due_date, 'YYYY-MM') AS month, tc.amount,
         EXISTS (SELECT 1 FROM public.fiscal_periods fp
                 WHERE tc.due_date BETWEEN fp.start_date AND fp.end_date AND fp.is_closed) AS period_closed
  FROM public.tenant_charges tc
  WHERE tc.amount > 0
    AND NOT EXISTS (SELECT 1 FROM public.journal_entries je
                    WHERE je.source_type = 'CHARGE' AND je.source_id = tc.id AND je.status = 'POSTED')`;

try {
  await client.query(confirm ? 'BEGIN' : 'BEGIN READ ONLY');
  const { rows } = await client.query(MISSING);
  const scope = rows.filter((r) => includeClosed || !r.period_closed);
  const byMonth = new Map();
  for (const r of rows) {
    const k = `${r.month}${r.period_closed ? ' (مقفل)' : ''}`;
    const e = byMonth.get(k) ?? { charges: 0, amount: 0, inScope: includeClosed || !r.period_closed };
    e.charges += 1;
    e.amount += Number(r.amount);
    byMonth.set(k, e);
  }
  console.log('Rent charges without a revenue accrual:');
  for (const [k, e] of [...byMonth].sort()) {
    console.log(`  ${k.padEnd(14)} ${String(e.charges).padStart(4)} charges  ${e.amount.toLocaleString('en-US', { maximumFractionDigits: 3 }).padStart(12)} LYD  ${e.inScope ? 'will post' : 'skipped (closed — use --include-closed)'}`);
  }
  const total = scope.reduce((s, r) => s + Number(r.amount), 0);
  console.log(`In scope: ${scope.length} charges, ${total.toLocaleString('en-US', { maximumFractionDigits: 3 })} LYD`);

  if (!confirm) {
    console.log('\nPreview only. Re-run with --confirm to post.');
    await client.query('ROLLBACK');
  } else {
    const ready = await client.query(`SELECT to_regprocedure('public.post_missing_charge_accrual(uuid)') IS NOT NULL AS ok`);
    if (!ready.rows[0].ok) throw new Error('078 is not applied (post_missing_charge_accrual missing) — run npm run db:apply-proposed first');
    let posted = 0;
    const postedCharges = [];
    for (const r of scope) {
      const res = await client.query(`SELECT public.post_missing_charge_accrual($1) AS je`, [r.id]);
      if (res.rows[0].je) {
        posted += 1;
        postedCharges.push({ charge_id: r.id, journal_entry_id: res.rows[0].je, month: r.month, amount: Number(r.amount) });
      }
    }
    const left = (await client.query(`${MISSING} AND tc.id = ANY($1::uuid[])`, [scope.map((r) => r.id)])).rows.length;
    const unbalanced = Number((await client.query(`SELECT count(*) n FROM (SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_id = je.id
      WHERE je.status = 'POSTED' AND je.source_type = 'CHARGE' GROUP BY je.id HAVING sum(jl.debit) <> sum(jl.credit)) x`)).rows[0].n);
    if (left !== 0 || unbalanced !== 0 || posted !== scope.length) {
      await client.query('ROLLBACK');
      throw new Error(`verification failed (posted=${posted}/${scope.length}, still missing=${left}, unbalanced=${unbalanced}) — nothing was saved`);
    }
    await client.query('COMMIT');
    console.log(`\nPosted ${posted} accruals (${total.toLocaleString('en-US', { maximumFractionDigits: 3 })} LYD).`);
    // The undo targets exactly the entries this run created (never a time window, which would also
    // catch accruals other people posted meanwhile) and uses the ledger's own reversal, which writes
    // an opposite entry instead of editing history.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Next to the database snapshots, outside the repository: these files hold financial data.
    const outDir = join(homedir(), 'Fluxen-Backups');
    const logFile = join(outDir, `backfill-rent-accruals-${stamp}.json`);
    const undoFile = join(outDir, `backfill-rent-accruals-${stamp}.UNDO.sql`);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(logFile, JSON.stringify({ posted_at: new Date().toISOString(), total, entries: postedCharges }, null, 2));
    writeFileSync(undoFile, [
      `-- Reverses the ${posted} rent accruals posted by scripts/backfill-rent-accruals.mjs at ${new Date().toISOString()}.`,
      'BEGIN;',
      ...postedCharges.map((c) => `SELECT public.reverse_ledger_entry('CHARGE', '${c.charge_id}', NULL); -- ${c.month} ${c.amount} LYD`),
      'COMMIT;',
      '',
    ].join('\n'));
    console.log(`Saved the list of entries to ${logFile}`);
    console.log(`To reverse exactly this run: psql "$DATABASE_URL" -f ${undoFile}`);
  }
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
