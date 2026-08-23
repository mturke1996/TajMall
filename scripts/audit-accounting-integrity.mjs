/**
 * Read-only accounting integrity audit of the live database (runs inside BEGIN READ ONLY).
 * Prints only counts and totals — no names, phones or other personal data.
 *
 *   node scripts/audit-accounting-integrity.mjs          # table
 *   node scripts/audit-accounting-integrity.mjs --json   # machine-readable
 *
 * FAIL = the books or reports are wrong / data is exposed. WARN = needs review. INFO = context.
 * Exit code is 1 when any FAIL is found.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readLocalEnv } from './lib/pglite-replica.mjs';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const pg = require('pg');
const env = readLocalEnv();
const connectionString = (env.DATABASE_URL || env.DIRECT_URL || '').replace('?pgbouncer=true', '');
if (!connectionString) throw new Error('Set DATABASE_URL or DIRECT_URL in .env.local.');

const POSTED_LINES = `journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'POSTED'`;
const GL_CASH = `(SELECT coalesce(sum(jl.debit - jl.credit), 0) FROM ${POSTED_LINES}
  JOIN categories c ON c.id = jl.category_id AND c.code = 'AST-CSH')`;
const LINKED_ON_TX = `(SELECT coalesce(sum(l.amount), 0) FROM tenant_rent_journal_links l
  JOIN journal_entries je ON je.id = l.journal_entry_id AND je.status = 'POSTED'
  WHERE je.source_type = 'TRANSACTION' AND je.source_id = t.id)`;

// Each check returns one row: n (count that must be 0 unless severity says otherwise), amount, note.
const CHECKS = [
  ['ledger', 'FAIL', 'قيود مرحّلة غير متوازنة', `
    SELECT count(*) n FROM (SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_id = je.id
    WHERE je.status = 'POSTED' GROUP BY je.id HAVING sum(jl.debit) <> sum(jl.credit)) x`],
  ['ledger', 'FAIL', 'قيود مرحّلة بأقل من سطرين', `
    SELECT count(*) n FROM journal_entries je WHERE je.status = 'POSTED'
    AND (SELECT count(*) FROM journal_lines jl WHERE jl.journal_id = je.id) < 2`],
  ['ledger', 'FAIL', 'أسطر قيد بمدين ودائن معاً أو سالبة أو صفرية', `
    SELECT count(*) n FROM journal_lines WHERE (debit > 0 AND credit > 0) OR debit < 0 OR credit < 0 OR (debit = 0 AND credit = 0)`],
  ['ledger', 'FAIL', 'معاملات مرحّلة ليس لها قيد مرحّل واحد بالضبط', `
    SELECT count(*) n FROM transactions t WHERE t.status = 'POSTED' AND (SELECT count(*) FROM journal_entries je
    WHERE je.source_type = 'TRANSACTION' AND je.source_id = t.id AND je.status = 'POSTED') <> 1`],
  ['ledger', 'FAIL', 'قيد المعاملة يخالف مبلغها أو تاريخها أو خزينتها', `
    SELECT count(*) n FROM (SELECT t.id FROM transactions t
    JOIN journal_entries je ON je.source_type = 'TRANSACTION' AND je.source_id = t.id AND je.status = 'POSTED'
    JOIN journal_lines jl ON jl.journal_id = je.id GROUP BY t.id, je.id
    HAVING sum(jl.debit) <> t.amount OR t.tx_date <> je.entry_date
        OR NOT (t.cashbox_id IS NOT DISTINCT FROM max(jl.cashbox_id::text)::uuid)) x`],
  ['cash', 'FAIL', 'أسطر نقدية (AST-CSH) بلا خزينة — تجعل الخزائن تخالف الدفتر', `
    SELECT count(*) n, coalesce(sum(jl.credit - jl.debit), 0) amount FROM ${POSTED_LINES}
    JOIN categories c ON c.id = jl.category_id AND c.code = 'AST-CSH' WHERE jl.cashbox_id IS NULL`],
  ['cash', 'FAIL', 'إجمالي الخزائن (لوحة التحكم) ≠ رصيد النقدية في الدفتر', `
    SELECT CASE WHEN abs(get_treasury_balance_total() - ${GL_CASH}) > 0.0005 THEN 1 ELSE 0 END n,
           get_treasury_balance_total() - ${GL_CASH} amount,
           'treasury=' || get_treasury_balance_total() || ' gl=' || ${GL_CASH} note`],
  ['statements', 'FAIL', 'الميزانية: إجمالي الأصول ≠ أرصدة الأصول المرحّلة', `
    SELECT CASE WHEN abs((get_balance_sheet(CURRENT_DATE)->'summary'->>'total_assets')::numeric - x.v) > 0.0005 THEN 1 ELSE 0 END n,
           (get_balance_sheet(CURRENT_DATE)->'summary'->>'total_assets')::numeric - x.v amount,
           'report=' || (get_balance_sheet(CURRENT_DATE)->'summary'->>'total_assets') || ' gl_assets=' || x.v note
    FROM (SELECT coalesce(sum(GREATEST(b, 0)), 0) v FROM (SELECT sum(jl.debit - jl.credit) b FROM ${POSTED_LINES}
          JOIN categories c ON c.id = jl.category_id AND c.type = 'ASSET' GROUP BY c.id) y) x`],
  ['statements', 'FAIL', 'الميزانية غير متوازنة (الأصول ≠ الخصوم + حقوق الملكية)', `
    SELECT CASE WHEN abs(a - l - e) > 0.0005 THEN 1 ELSE 0 END n, a - l - e amount FROM (SELECT
      (s->>'total_assets')::numeric a, (s->>'total_liabilities')::numeric l, (s->>'total_equity')::numeric e
      FROM (SELECT get_balance_sheet(CURRENT_DATE)->'summary' s) z) y`],
  ['statements', 'WARN', 'إيراد لوحة التحكم (نقدي) ≠ إيراد قائمة الدخل (استحقاق) للسنة الجارية', `
    SELECT CASE WHEN abs(d - p) > 0.0005 THEN 1 ELSE 0 END n, d - p amount, 'dashboard=' || d || ' p&l=' || p note FROM (
      SELECT (SELECT coalesce(sum(amount), 0) FROM transactions WHERE status = 'POSTED' AND kind = 'REVENUE'
              AND date_trunc('year', tx_date) = date_trunc('year', CURRENT_DATE)) d,
             (get_profit_loss(extract(year FROM CURRENT_DATE)::int, 'year', NULL, NULL)->'summary'->>'total_revenue')::numeric p) x`],
  ['rent', 'FAIL', 'مطالبات إيجار بلا قيد استحقاق إيراد (الإيراد لا يظهر في قائمة الدخل)', `
    SELECT count(*) n, coalesce(sum(tc.amount), 0) amount FROM tenant_charges tc WHERE NOT EXISTS (
      SELECT 1 FROM journal_entries je WHERE je.source_type = 'CHARGE' AND je.source_id = tc.id AND je.status = 'POSTED')`],
  ['rent', 'FAIL', 'مطالبات مكررة لنفس المستأجر والشهر', `
    SELECT count(*) n FROM (SELECT lc.tenant_id, date_trunc('month', tc.due_date) FROM tenant_charges tc
    JOIN lease_contracts lc ON lc.id = tc.contract_id WHERE tc.type = 'RENT' GROUP BY 1, 2 HAVING count(*) > 1) x`],
  ['rent', 'FAIL', 'المسدد في المطالبة ≠ روابط السداد المرحّلة', `
    SELECT count(*) n FROM tenant_charges tc WHERE tc.type = 'RENT' AND tc.total_paid <> LEAST(tc.amount,
      (SELECT coalesce(sum(l.amount), 0) FROM tenant_rent_journal_links l
       JOIN journal_entries je ON je.id = l.journal_entry_id AND je.status = 'POSTED' WHERE l.charge_id = tc.id))`],
  ['rent', 'FAIL', 'قيود رُبط عليها إيجار أكثر من مبلغها', `
    SELECT count(*) n, coalesce(sum(excess), 0) amount FROM (SELECT sum(l.amount) - max(d.amt) AS excess FROM tenant_rent_journal_links l
    JOIN (SELECT journal_id, sum(debit) amt FROM journal_lines GROUP BY 1) d ON d.journal_id = l.journal_entry_id
    GROUP BY l.journal_entry_id HAVING sum(l.amount) > max(d.amt) + 0.0005) x`],
  ['rent', 'WARN', 'دفعات إيجار جزء منها غير منسوب لأي شهر (فائض/مكرر)', `
    SELECT count(*) n, coalesce(sum(t.amount - ${LINKED_ON_TX}), 0) amount FROM transactions t
    JOIN categories c ON c.id = t.category_id AND c.code = 'REV-RNT'
    WHERE t.status = 'POSTED' AND t.amount - ${LINKED_ON_TX} > 0.0005`],
  ['rent', 'WARN', 'أشهر إيجار مستحقة حتى الشهر الحالي بلا مطالبة (لا تظهر في أعمار الذمم)', `
    WITH t AS (SELECT c.id tenant_id, date_trunc('month', tenant_rent_claim_start(c.id))::date s, lc.end_date
      FROM contacts c JOIN lease_contracts lc ON lc.tenant_id = c.id AND lc.status = 'ACTIVE' WHERE c.kind = 'TENANT'),
    m AS (SELECT t.tenant_id, gs::date mon FROM t, generate_series(t.s, date_trunc('month', CURRENT_DATE), interval '1 month') gs
      WHERE gs::date <= coalesce(t.end_date, '2999-01-01'))
    SELECT count(*) n, coalesce(sum(resolve_tenant_rent_amount(tenant_id, to_char(mon, 'YYYY-MM'))), 0) amount FROM m
    WHERE NOT is_tenant_rent_month_exempt(tenant_id, to_char(mon, 'YYYY-MM')) AND NOT EXISTS (
      SELECT 1 FROM tenant_charges tc JOIN lease_contracts l2 ON l2.id = tc.contract_id
      WHERE l2.tenant_id = m.tenant_id AND tc.type = 'RENT' AND date_trunc('month', tc.due_date) = m.mon)`],
  ['rent', 'INFO', 'إجمالي أعمار الذمم المعروض', `
    SELECT (get_tenant_ar_aging(CURRENT_DATE)->'summary'->>'tenant_count')::int n,
           (get_tenant_ar_aging(CURRENT_DATE)->'summary'->>'total_outstanding')::numeric amount`],
  ['rent', 'INFO', 'رصيد ذمم المستأجرين في الدفتر (سالب = دفعات مقدمة)', `
    SELECT 0 n, coalesce(sum(jl.debit - jl.credit), 0) amount FROM ${POSTED_LINES}
    JOIN categories c ON c.id = jl.category_id AND c.code = 'AST-REC'`],
  ['parties', 'FAIL', 'معاملات بند لا يطابق نوعها (إيراد على مصروف أو العكس)', `
    SELECT count(*) n, coalesce(sum(t.amount), 0) amount FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE (t.kind = 'REVENUE' AND c.type = 'EXPENSE') OR (t.kind = 'EXPENSE' AND c.type = 'REVENUE')`],
  ['parties', 'WARN', 'مصروفات مسجلة على جهة من نوع عميل / إيرادات على مورد', `
    SELECT count(*) n, coalesce(sum(t.amount), 0) amount FROM transactions t JOIN contacts c ON c.id = t.contact_id
    WHERE t.status = 'POSTED' AND ((t.kind = 'EXPENSE' AND c.kind = 'CUSTOMER') OR (t.kind = 'REVENUE' AND c.kind = 'VENDOR'))`],
  ['parties', 'INFO', 'مصروفات بلا مورد (تقرير الموردين لا يشملها)', `
    SELECT count(*) n, coalesce(sum(amount), 0) amount FROM transactions WHERE status = 'POSTED' AND kind = 'EXPENSE' AND contact_id IS NULL`],
  ['parties', 'WARN', 'معاملات متطابقة في نفس اليوم (جهة + مبلغ + نوع) — راجع التكرار', `
    SELECT count(*) n, coalesce(sum(amount * (k - 1)), 0) amount FROM (SELECT amount, count(*) k FROM transactions
    WHERE status = 'POSTED' GROUP BY tx_date, kind, amount, contact_id HAVING count(*) > 1) x`],
  ['parties', 'WARN', 'جهات تعامل مكررة بالاسم', `
    SELECT count(*) n FROM (SELECT lower(btrim(name)) FROM contacts GROUP BY 1 HAVING count(*) > 1) x`],
  ['vouchers', 'FAIL', 'إذن صرف إجماليه ≠ مجموع بنوده', `
    SELECT count(*) n FROM disbursement_vouchers v WHERE v.total_amount <>
      (SELECT coalesce(sum(amount), 0) FROM disbursement_voucher_lines l WHERE l.voucher_id = v.id)`],
  ['vouchers', 'FAIL', 'إذن صرف معتمد بلا قيد مرحّل', `
    SELECT count(*) n FROM disbursement_vouchers v WHERE v.status = 'APPROVED' AND NOT EXISTS (
      SELECT 1 FROM journal_entries je WHERE je.source_type = 'VOUCHER' AND je.source_id = v.id AND je.status = 'POSTED')`],
  ['vouchers', 'WARN', 'إذن صرف معتمد بلا خزينة أو بلا بند مصروف', `
    SELECT count(*) n, coalesce(sum(total_amount), 0) amount FROM disbursement_vouchers
    WHERE status = 'APPROVED' AND (cashbox_id IS NULL OR category_id IS NULL)`],
  ['periods', 'FAIL', 'فترات مالية متداخلة', `
    SELECT count(*) n FROM fiscal_periods a JOIN fiscal_periods b ON a.id < b.id
    AND a.start_date <= b.end_date AND b.start_date <= a.end_date`],
  ['periods', 'FAIL', 'قيود أُنشئت في فترة بعد إقفالها', `
    SELECT count(*) n FROM journal_entries je JOIN fiscal_periods fp ON je.entry_date BETWEEN fp.start_date AND fp.end_date
    WHERE fp.is_closed AND fp.closed_at IS NOT NULL AND je.created_at > fp.closed_at`],
  ['security', 'FAIL', 'دوال SECURITY DEFINER قابلة للتنفيذ من زائر مجهول (anon)', `
    SELECT count(*) n FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE')`],
  ['security', 'FAIL', 'عروض (views) قابلة للقراءة من زائر مجهول بدون RLS', `
    SELECT count(*) n FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
    AND has_table_privilege('anon', c.oid, 'SELECT')
    AND NOT coalesce(c.reloptions::text[] @> ARRAY['security_invoker=true'], false)`],
  ['security', 'FAIL', 'سياسات كتابة مفتوحة (USING/WITH CHECK true) تتجاوز الصلاحيات', `
    SELECT count(*) n FROM pg_policies WHERE schemaname = 'public' AND cmd <> 'SELECT'
    AND (lower(coalesce(qual, '')) IN ('true', '(true)') OR lower(coalesce(with_check, '')) IN ('true', '(true)'))
    AND tablename <> 'app_notifications'`],
  ['quality', 'INFO', 'معاملات بلا وصف', `SELECT count(*) n FROM transactions WHERE description IS NULL OR btrim(description) = ''`],
  ['quality', 'INFO', 'صكوك بلا رقم صك', `SELECT count(*) n FROM transactions WHERE method = 'CHEQUE' AND coalesce(btrim(cheque_number), '') = ''`],
];

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
const results = [];
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '60s'");
  const { rows: [meta] } = await client.query(`SELECT now() AS at,
    (SELECT count(*) FROM transactions) AS transactions, (SELECT count(*) FROM journal_entries) AS journals,
    (SELECT max(tx_date) FROM transactions)::text AS last_tx`);
  for (const [area, severity, label, sql] of CHECKS) {
    try {
      const { rows: [r] } = await client.query(sql);
      const n = Number(r?.n ?? 0);
      const status = severity === 'INFO' ? 'INFO' : n > 0 ? severity : 'PASS';
      results.push({ area, status, label, n, amount: r?.amount == null ? null : Number(r.amount), note: r?.note ?? '' });
    } catch (error) {
      results.push({ area, status: 'ERROR', label, n: null, amount: null, note: error.message });
      await client.query('ROLLBACK');
      await client.query('BEGIN READ ONLY');
    }
  }
  await client.query('ROLLBACK');

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ meta, results }, null, 2));
  } else {
    console.log(`Accounting integrity audit (read-only) — ${new Date(meta.at).toISOString()}`);
    console.log(`transactions=${meta.transactions} journals=${meta.journals} last_tx=${meta.last_tx}\n`);
    const money = (v) => (v == null ? '' : ` | ${v.toLocaleString('en-US', { maximumFractionDigits: 3 })} LYD`);
    for (const r of results) {
      console.log(`${r.status.padEnd(5)} [${r.area}] ${r.label}: ${r.n ?? '-'}${money(r.amount)}${r.note ? ` (${r.note})` : ''}`);
    }
    const count = (s) => results.filter((r) => r.status === s).length;
    console.log(`\nPASS=${count('PASS')} FAIL=${count('FAIL')} WARN=${count('WARN')} INFO=${count('INFO')} ERROR=${count('ERROR')}`);
  }
  process.exitCode = results.some((r) => r.status === 'FAIL' || r.status === 'ERROR') ? 1 : 0;
} finally {
  await client.end();
}
