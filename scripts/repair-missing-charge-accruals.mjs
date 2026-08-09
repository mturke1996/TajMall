/**
 * Backfill قيود اعتراف الإيراد (CHARGE) للمطالبات التي لا تملك
 * journal_entries(source_type='CHARGE', source_id=charge.id).
 *
 * نفس منطق هجرة 051 — آمن للتكرار (idempotent عبر NOT EXISTS).
 *
 * Usage:
 *   node scripts/repair-missing-charge-accruals.mjs
 *   node scripts/repair-missing-charge-accruals.mjs --from=2026-07-01 --to=2026-07-31
 *   node scripts/repair-missing-charge-accruals.mjs --dry-run
 */
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
if (!dbUrl) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fromArg = args.find((a) => a.startsWith('--from='))?.slice(7) ?? null;
const toArg = args.find((a) => a.startsWith('--to='))?.slice(5) ?? null;

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const missingSql = `
  SELECT tc.id, tc.type, tc.amount::numeric AS amount, tc.due_date,
         tc.description, tc.contract_id, tc.status
  FROM public.tenant_charges tc
  WHERE tc.amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.source_type = 'CHARGE' AND je.source_id = tc.id
        AND je.status = 'POSTED'
    )
    ${fromArg ? 'AND tc.due_date >= $1::date' : ''}
    ${toArg ? `AND tc.due_date <= $${fromArg ? 2 : 1}::date` : ''}
  ORDER BY tc.due_date, tc.id
`;

const params = [];
if (fromArg) params.push(fromArg);
if (toArg) params.push(toArg);

const { rows: missing } = await client.query(missingSql, params);
const sum = missing.reduce((s, r) => s + Number(r.amount), 0);
console.log(
  JSON.stringify(
    {
      dryRun,
      from: fromArg,
      to: toArg,
      missingCount: missing.length,
      missingAmountSum: sum,
      byMonth: missing.reduce((m, r) => {
        const k = String(r.due_date).slice(0, 7);
        m[k] = (m[k] || 0) + 1;
        return m;
      }, {}),
    },
    null,
    2,
  ),
);

if (dryRun || missing.length === 0) {
  await client.end();
  process.exit(0);
}

const cats = await client.query(`
  SELECT code, id FROM public.categories
  WHERE code IN ('AST-REC', 'REV-RNT', 'REV-SRV')
`);
const byCode = Object.fromEntries(cats.rows.map((r) => [r.code, r.id]));
if (!byCode['AST-REC'] || !byCode['REV-RNT']) {
  console.error('AST-REC or REV-RNT category missing');
  await client.end();
  process.exit(1);
}

const BATCH = 10;
let created = 0;
let createdSum = 0;

try {
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('fluxen.skip_charge_posting', '1', true)`,
    );

    for (const charge of batch) {
      const revCat =
        charge.type === 'SERVICE'
          ? byCode['REV-SRV'] || byCode['REV-RNT']
          : byCode['REV-RNT'];

      const period = await client.query(
        `SELECT id FROM public.fiscal_periods
         WHERE $1::date BETWEEN start_date AND end_date LIMIT 1`,
        [charge.due_date],
      );
      const periodId = period.rows[0]?.id ?? null;

      const version = await client.query(
        `SELECT COALESCE(MAX(posting_version), 0) + 1 AS v
         FROM public.journal_entries
         WHERE source_type = 'CHARGE' AND source_id = $1`,
        [charge.id],
      );

      const tenant = await client.query(
        `SELECT tenant_id FROM public.lease_contracts WHERE id = $1 LIMIT 1`,
        [charge.contract_id],
      );
      const tenantId = tenant.rows[0]?.tenant_id ?? null;

      const desc = charge.description || 'اعتراف إيراد إيجار';
      const je = await client.query(
        `INSERT INTO public.journal_entries (
           reference, entry_date, description, notes, status, period_id,
           source_type, source_id, posting_version, created_by_user_id, posted_at
         ) VALUES (
           $1, $2, $3, $4, 'POSTED', $5,
           'CHARGE', $6, $7, NULL, now()
         ) RETURNING id`,
        [
          `CHARGE #${String(charge.id).slice(0, 8)}`,
          charge.due_date,
          desc,
          'repair missing charge accrual',
          periodId,
          charge.id,
          version.rows[0].v,
        ],
      );
      const jeId = je.rows[0].id;

      await client.query(
        `INSERT INTO public.journal_lines (
           journal_id, category_id, debit, credit, description, sort_order, contact_id
         ) VALUES
           ($1, $2, $3, 0, $4, 0, $5),
           ($1, $6, 0, $3, $4, 1, $5)`,
        [jeId, byCode['AST-REC'], charge.amount, desc, tenantId, revCat],
      );

      created += 1;
      createdSum += Number(charge.amount);
    }

    await client.query('COMMIT');
    console.log(`batch ${Math.floor(i / BATCH) + 1}: +${batch.length} (total ${created})`);
  }

  const july = await client.query(`
    SELECT COALESCE(SUM(jl.credit), 0)::numeric AS rent_credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_id
    JOIN public.categories c ON c.id = jl.category_id
    WHERE je.status = 'POSTED'
      AND je.entry_date >= '2026-07-01' AND je.entry_date <= '2026-07-31'
      AND c.code = 'REV-RNT'
  `);

  const stillMissing = await client.query(`
    SELECT COUNT(*)::int AS n
    FROM public.tenant_charges tc
    WHERE tc.amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.source_type = 'CHARGE' AND je.source_id = tc.id
          AND je.status = 'POSTED'
      )
  `);

  console.log(
    JSON.stringify(
      {
        created,
        createdSum,
        july2026RevRntCredit: Number(july.rows[0].rent_credit),
        stillMissing: stillMissing.rows[0].n,
      },
      null,
      2,
    ),
  );
  console.log('OK');
} catch (e) {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* ignore */
  }
  console.error(e);
  process.exit(1);
} finally {
  await client.end();
}
