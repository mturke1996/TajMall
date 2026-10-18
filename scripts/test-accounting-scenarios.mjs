/**
 * End-to-end accounting scenarios on an isolated PGlite replica (never touches production data).
 *
 *   node scripts/test-accounting-scenarios.mjs                  # repo migrations only
 *   node scripts/test-accounting-scenarios.mjs --prod-functions  # + live functions, views and RLS policies (read-only fetch)
 *
 *   node scripts/test-accounting-scenarios.mjs --prod-functions --apply <file.sql> [--apply <file2.sql>]
 *                                                               # + candidate migration(s), applied in order
 *
 * Each check asserts the behaviour an accountant expects. A FAIL is a defect, not a flaky test.
 * Exit code is 1 when any check fails.
 */
import { readFileSync } from 'node:fs';
import { createReplica, actAs } from './lib/pglite-replica.mjs';

const args = process.argv.slice(2);
const prodFunctions = args.includes('--prod-functions');
const candidates = args.flatMap((a, i) => (a === '--apply' && args[i + 1] ? [args[i + 1]] : []));
const { db, migrations, overlay } = await createReplica({ prodFunctions });
const applied = [];
for (const file of candidates) {
  try {
    await db.exec(readFileSync(file, 'utf8'));
    applied.push({ file, ok: true });
  } catch (error) {
    applied.push({ file, ok: false, error: error.message });
    try { await db.exec('ROLLBACK'); } catch {}
  }
}

const results = [];
const check = (area, name, ok, detail = '') => results.push({ area, name, ok: Boolean(ok), detail: String(detail) });
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await rows(sql, params))[0];
const val = async (sql, params) => {
  const row = await one(sql, params);
  return row ? Object.values(row)[0] : undefined;
};
const attempt = async (fn) => {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};
const n = (x) => Number(x ?? 0);
const pgArray = (items) => `{${items.join(',')}}`;
const near = (a, b) => Math.abs(n(a) - n(b)) < 0.001;

// ── 0. Migrations replay from scratch ───────────────────────────────────────
for (const m of migrations) {
  if (!m.ok) {
    check('migrations', `إعادة تطبيق ${m.file} على قاعدة جديدة`, false,
      `${m.error.slice(0, 120)} | second pass: ${m.secondPass === 'ok' ? 'نجح (مشكلة ترتيب)' : m.secondPass.slice(0, 80)}`);
  }
}
check('migrations', 'كل الهجرات تُطبَّق بالترتيب على قاعدة فارغة', migrations.every((m) => m.ok),
  `${migrations.filter((m) => !m.ok).length} of ${migrations.length} failed on first pass`);
if (overlay) {
  check('migrations', 'تطبيق دوال الإنتاج على النسخة', overlay.failed.length === 0,
    `applied=${overlay.applied} failed=${overlay.failed.length} ${overlay.failed.join(' | ').slice(0, 200)}`);
}

for (const a of applied) check('migrations', `تطبيق الهجرة المرشحة ${a.file.split(/[\\/]/).pop()}`, a.ok, a.error ?? '');

// ── 1. Fixtures (superuser) ─────────────────────────────────────────────────
await actAs(db, 'superuser');
const OWNER = '11111111-1111-4111-8111-111111111111';
const VIEWER = '22222222-2222-4222-8222-222222222222';
const CASHIER = '33333333-3333-4333-8333-333333333333';
await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@test.local'), ($2, 'viewer@test.local'), ($3, 'cashier@test.local')`,
  [OWNER, VIEWER, CASHIER]);
// The role-escalation trigger trusts service_role, which is how an admin invite provisions roles.
await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
await db.query(`INSERT INTO profiles (id, role) VALUES ($1, 'owner'), ($2, 'viewer'), ($3, 'cashier')
                ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`, [OWNER, VIEWER, CASHIER]);

const cat = Object.fromEntries((await rows(`SELECT code, id FROM categories`)).map((r) => [r.code, r.id]));
const anyOfType = async (type, exclude) =>
  val(`SELECT id FROM categories WHERE type = $1 AND active AND code <> ALL($2::text[]) ORDER BY sort_order LIMIT 1`,
    [type, pgArray(exclude)]);
const REV_OTHER = cat['REV-PRK'] ?? (await anyOfType('REVENUE', ['REV-RNT', 'REV-SRV']));
const EXP_MAINT = cat['EXP-MNT'] ?? (await anyOfType('EXPENSE', []));
const boxes = await rows(`SELECT id, code, kind FROM cashboxes WHERE active ORDER BY code`);
const CASH = boxes.find((b) => b.kind === 'CASH')?.id;
const BANK = boxes.find((b) => b.kind === 'BANK')?.id;
check('fixtures', 'حسابات النظام الأساسية موجودة (AST-CSH, AST-REC, REV-RNT)',
  cat['AST-CSH'] && cat['AST-REC'] && cat['REV-RNT'] && CASH && BANK);

// ── 2. Contacts and leases (as the owner, through the same RPCs the UI calls) ─
await actAs(db, 'authenticated', OWNER);
const createContact = async (payload) => {
  const r = await val(`SELECT create_contact($1::jsonb)`, [JSON.stringify(payload)]);
  return r?.id ?? r?.contact?.id ?? r;
};
const T1 = await createContact({ kind: 'TENANT', name: 'مستأجر اختبار 1', shop_number: 'TST-101', monthly_rent: 1000 });
const T2 = await createContact({ kind: 'TENANT', name: 'مستأجر اختبار 2', shop_number: 'TST-102', monthly_rent: 2000 });
const T3 = await createContact({ kind: 'TENANT', name: 'مستأجر اختبار 3', shop_number: 'TST-103', monthly_rent: 1500 });
const T4 = await createContact({ kind: 'TENANT', name: 'مستأجر اختبار 4', shop_number: 'TST-104', monthly_rent: 1200 });
const V1 = await createContact({ kind: 'VENDOR', name: 'مورد اختبار' });
const C1 = await createContact({ kind: 'CUSTOMER', name: 'عميل اختبار' });
for (const t of [T1, T2, T3, T4]) await val(`SELECT ensure_tenant_lease_contract($1)`, [t]);
const band = await attempt(() => val(`SELECT set_tenant_rent_price_bands($1, $2::jsonb)`,
  [T2, JSON.stringify([{ from_month: '2026-04', to_month: '2026-12', amount: 2500 }])]));
check('fixtures', 'إنشاء مستأجرين وعقود وشريحة سعر', T1 && T2 && T3 && T4 && V1 && C1 && band.ok, band.error ?? '');

// ── helpers that read accounting state ──────────────────────────────────────
const cashboxBalance = (id) => val(`SELECT get_cashbox_balance($1)`, [id]);
const treasury = () => val(`SELECT get_treasury_balance_total()`);
const glCash = () => val(`
  SELECT coalesce(sum(jl.debit - jl.credit), 0) FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'POSTED'
  JOIN categories c ON c.id = jl.category_id AND c.code = 'AST-CSH'`);
const charge = (tenant, month) => one(`
  SELECT tc.* FROM tenant_charges tc JOIN lease_contracts lc ON lc.id = tc.contract_id
  WHERE lc.tenant_id = $1 AND tc.type = 'RENT' AND to_char(tc.due_date, 'YYYY-MM') = $2`, [tenant, month]);
const accrued = (chargeId) => val(`
  SELECT coalesce(sum(jl.credit), 0) FROM journal_entries je
  JOIN journal_lines jl ON jl.journal_id = je.id
  JOIN categories c ON c.id = jl.category_id AND c.code IN ('REV-RNT', 'REV-SRV')
  WHERE je.source_type = 'CHARGE' AND je.source_id = $1 AND je.status = 'POSTED'`, [chargeId]);
const txJournal = (txId) => one(`
  SELECT je.* FROM journal_entries je WHERE je.source_type = 'TRANSACTION' AND je.source_id = $1 AND je.status = 'POSTED'`, [txId]);
const linkedOn = (journalId) => val(`SELECT coalesce(sum(amount), 0) FROM tenant_rent_journal_links WHERE journal_entry_id = $1`, [journalId]);
const recordRent = (tenant, amount, date, months, box = CASH) => val(
  `SELECT record_rent_payment($1, $2, $3::date, $4, NULL, $5::text[], 'CASH')`,
  [tenant, amount, date, box, pgArray(months)]);
const insertTx = (kind, amount, date, categoryId, cashboxId, contactId = null, description = 'اختبار') => one(`
  INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id,
                            contact_id, created_by, posted_at, auto_allocate_charges)
  VALUES ($1, 'POSTED', 'CASH', $2, 'LYD', $3::date, $7, $4, $5, $6, $8, now(), true)
  RETURNING id, number`, [kind, amount, date, categoryId, cashboxId, contactId, description, OWNER]);
const rentRevenueGl = (from, to) => val(`
  SELECT coalesce(sum(jl.credit - jl.debit), 0) FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'POSTED'
  JOIN categories c ON c.id = jl.category_id AND c.code = 'REV-RNT'
  WHERE je.entry_date BETWEEN $1::date AND $2::date`, [from, to]);

// ── 3. Revenue and expense ──────────────────────────────────────────────────
{
  const before = n(await cashboxBalance(CASH));
  const tx = await insertTx('REVENUE', 500, '2026-02-10', REV_OTHER, CASH, C1, 'إيراد مواقف');
  const je = await txJournal(tx.id);
  const lines = await rows(`SELECT jl.*, c.code FROM journal_lines jl JOIN categories c ON c.id = jl.category_id WHERE jl.journal_id = $1`, [je?.id]);
  const cashLine = lines.find((l) => l.code === 'AST-CSH');
  check('revenue', 'إيراد عام ينشئ قيداً مرحّلاً متوازناً', je && near(lines.reduce((s, l) => s + n(l.debit), 0), 500) && near(lines.reduce((s, l) => s + n(l.credit), 0), 500));
  check('revenue', 'سطر النقدية يحمل الخزينة الصحيحة', cashLine && cashLine.cashbox_id === CASH && near(cashLine.debit, 500));
  check('revenue', 'رصيد الخزينة يزيد بقيمة الإيراد', near(n(await cashboxBalance(CASH)) - before, 500));
  check('customers', 'سطر الإيراد مربوط بالعميل', lines.some((l) => l.code !== 'AST-CSH' && l.contact_id === C1));
}
let vendorTxId;
{
  const before = n(await cashboxBalance(CASH));
  const tx = await insertTx('EXPENSE', 300, '2026-02-11', EXP_MAINT, CASH, V1, 'صيانة');
  vendorTxId = tx.id;
  const je = await txJournal(tx.id);
  const lines = await rows(`SELECT jl.*, c.code FROM journal_lines jl JOIN categories c ON c.id = jl.category_id WHERE jl.journal_id = $1`, [je?.id]);
  check('expenses', 'مصروف ينشئ قيداً متوازناً (مدين المصروف / دائن الخزينة)',
    lines.some((l) => l.category_id === EXP_MAINT && near(l.debit, 300)) && lines.some((l) => l.code === 'AST-CSH' && near(l.credit, 300)));
  check('expenses', 'رصيد الخزينة ينقص بقيمة المصروف', near(before - n(await cashboxBalance(CASH)), 300));
  check('vendors', 'سطر المصروف مربوط بالمورد', lines.some((l) => l.category_id === EXP_MAINT && l.contact_id === V1));
}

// ── 4. Rent across several months ───────────────────────────────────────────
let t1Payment;
{
  const r = await attempt(() => recordRent(T1, 3000, '2026-03-05', ['2026-01', '2026-02', '2026-03']));
  check('rent', 'تحصيل 3 أشهر دفعة واحدة ينجح', r.ok, r.error ?? '');
  t1Payment = r.value;
  const charges = await Promise.all(['2026-01', '2026-02', '2026-03'].map((m) => charge(T1, m)));
  check('rent', 'الأشهر الثلاثة مسددة بالكامل', charges.every((c) => c?.status === 'PAID' && near(c.total_paid, 1000)),
    charges.map((c) => `${c?.status}:${c?.total_paid}`).join(' '));
  const je = await txJournal(t1Payment?.transaction_id);
  check('rent', 'روابط السداد = مبلغ الدفعة', near(await linkedOn(je?.id), 3000));
  const acc = await Promise.all(charges.map((c) => accrued(c?.id)));
  check('rent', 'كل شهر مسدد له قيد استحقاق إيراد (مدين ذمم / دائن إيراد إيجار)', acc.every((a) => near(a, 1000)),
    `accrued per month: ${acc.join(', ')} — بدون استحقاق لا يظهر الإيجار في قائمة الدخل`);
  check('rent', 'قائمة الدخل (GL) تُظهر إيراد إيجار الربع الأول = 3000', near(await rentRevenueGl('2026-01-01', '2026-03-31'), 3000),
    `REV-RNT Q1 in GL = ${await rentRevenueGl('2026-01-01', '2026-03-31')}`);
}
let t2Partial;
{
  const r = await attempt(() => recordRent(T2, 1500, '2026-01-20', ['2026-01']));
  t2Partial = r.value;
  const c = await charge(T2, '2026-01');
  check('rent', 'سداد جزئي يجعل الشهر PARTIAL بالمبلغ الصحيح', r.ok && c?.status === 'PARTIAL' && near(c.total_paid, 1500), r.error ?? `${c?.status}:${c?.total_paid}`);
}
{
  const r = await attempt(() => recordRent(T2, 4500, '2026-04-02', ['2026-03', '2026-04']));
  const mar = await charge(T2, '2026-03');
  const apr = await charge(T2, '2026-04');
  check('rent', 'تحصيل شهرين عبر شريحة سعر (2000 ثم 2500)', r.ok && near(mar?.amount, 2000) && near(apr?.amount, 2500)
    && mar?.status === 'PAID' && apr?.status === 'PAID', r.error ?? `${mar?.amount}/${apr?.amount}`);
}
{
  const r = await attempt(() => recordRent(T3, 2000, '2026-01-15', ['2026-01']));
  const je = r.ok ? await txJournal(r.value.transaction_id) : null;
  const unlinked = r.ok ? 2000 - n(await linkedOn(je?.id)) : 0;
  check('rent', 'دفعة أكبر من الإيجار: الفائض يُرفض أو يُسجَّل رصيداً دائناً للمستأجر', !r.ok || unlinked === 0,
    r.ok ? `قُبلت الدفعة وبقي ${unlinked} د.ل غير منسوب لأي شهر أو رصيد` : r.error);
}
{
  const r = await attempt(() => recordRent(T1, 1000, '2026-03-06', ['2026-01']));
  check('rent', 'تكرار تحصيل شهر مسدد مسبقاً يُرفض', !r.ok,
    r.ok ? 'قُبلت دفعة مكررة لشهر مسدد؛ المبلغ لم يُربط بأي شهر' : r.error);
}

{
  // The tenant's own revenue-accrual entry is not cash: linking a month to it must be refused.
  await val(`SELECT ensure_tenant_rent_charges($1, $2::text[])`, [T3, pgArray(['2026-07'])]);
  const july = await charge(T3, '2026-07');
  const accrual = await val(`SELECT id FROM journal_entries WHERE source_type = 'CHARGE' AND source_id = $1 AND status = 'POSTED'`, [july?.id]);
  const expenseJournal = (await txJournal(vendorTxId))?.id;
  for (const [label, journalId] of [['قيد استحقاق', accrual], ['قيد مصروف', expenseJournal]]) {
    if (!journalId) continue;
    const r = await attempt(() => val(`SELECT set_tenant_rent_month_status($1, $2::text[], true, $3, NULL)`, [T3, pgArray(['2026-07']), journalId]));
    check('rent', `ربط شهر إيجار بـ${label} (ليس تحصيلاً) يُرفض`, !r.ok, r.ok ? 'قُبل — الشهر صار «مسدداً» بلا أي مبلغ مُحصّل' : '');
  }
}

// ── 5. Edits after the fact ─────────────────────────────────────────────────
{
  const r = await attempt(() => val(`SELECT set_ledger_event_reconciled('transaction', $1, true)`, [t1Payment?.transaction_id]));
  const charges = await Promise.all(['2026-01', '2026-02', '2026-03'].map((m) => charge(T1, m)));
  check('reconciliation', 'تسوية دفعة إيجار مصرفياً لا تُلغي سداد الأشهر', r.ok && charges.every((c) => c?.status === 'PAID'),
    r.error ?? charges.map((c) => `${c?.status}:${c?.total_paid}`).join(' '));
  const posted = await val(`SELECT count(*) FROM journal_entries WHERE source_type = 'TRANSACTION' AND source_id = $1 AND status = 'POSTED'`, [t1Payment?.transaction_id]);
  const reversed = await val(`SELECT count(*) FROM journal_entries WHERE source_type = 'TRANSACTION' AND source_id = $1 AND status = 'REVERSED'`, [t1Payment?.transaction_id]);
  check('reconciliation', 'التسوية لا تعيد ترحيل القيد', n(reversed) === 0, `posted=${posted} reversed=${reversed}`);
}
{
  const before = n(await cashboxBalance(CASH));
  const r = await attempt(() => db.query(`DELETE FROM transactions WHERE id = $1`, [t2Partial?.transaction_id]));
  const c = await charge(T2, '2026-01');
  check('rent', 'حذف دفعة إيجار يعيد الشهر غير مسدد', r.ok && c?.status === 'UNPAID' && near(c.total_paid, 0), r.error ?? `${c?.status}`);
  check('cashboxes', 'حذف الدفعة يعيد رصيد الخزينة', near(before - n(await cashboxBalance(CASH)), 1500));
}

// ── 6. Receivables and the rent calendar ────────────────────────────────────
{
  const aging = await val(`SELECT get_tenant_ar_aging(CURRENT_DATE)`);
  const row = (aging?.rows ?? []).find((x) => x.tenant_id === T1);
  // Every month from the lease start (January) to today is due; subtract what is actually linked.
  const monthsDue = n(await val(`SELECT extract(month FROM CURRENT_DATE)`));
  const paidT1 = n(await val(`
    SELECT coalesce(sum(l.amount), 0) FROM tenant_rent_journal_links l
    JOIN tenant_charges tc ON tc.id = l.charge_id JOIN lease_contracts lc ON lc.id = tc.contract_id
    WHERE lc.tenant_id = $1`, [T1]));
  const expected = monthsDue * 1000 - paidT1;
  check('receivables', 'أعمار الذمم تشمل كل أشهر الإيجار غير المسددة حتى اليوم', near(row?.total_outstanding, expected),
    `المتوقع ${expected} للمستأجر 1، الظاهر ${row?.total_outstanding ?? 0} — الأشهر التي لم تُنشأ لها مطالبة لا تظهر كذمم`);
}
{
  const ex = await attempt(() => val(`SELECT set_tenant_rent_exempt_months($1, $2::text[], true)`, [T3, pgArray(['2026-02'])]));
  const isEx = await val(`SELECT is_tenant_rent_month_exempt($1, '2026-02')`, [T3]);
  const pay = await attempt(() => recordRent(T3, 1500, '2026-02-10', ['2026-02']));
  check('rent', 'إعفاء شهر يُسجَّل ولا يقبل التحصيل عليه', ex.ok && isEx === true && !pay.ok, ex.error ?? (pay.ok ? 'قُبل تحصيل شهر معفى' : ''));
}

// ── 7. Disbursement voucher, transfers, statements ──────────────────────────
{
  // Mirrors the voucher screen: create a draft with lines, submit, then approve as owner.
  const voucherLines = (id) => rows(`
    SELECT jl.*, c.code FROM journal_entries je JOIN journal_lines jl ON jl.journal_id = je.id JOIN categories c ON c.id = jl.category_id
    WHERE je.source_type = 'VOUCHER' AND je.source_id = $1 AND je.status = 'POSTED'`, [id]);
  const draftVoucher = async (number, cashboxId, categoryId) => {
    const v = await one(`INSERT INTO disbursement_vouchers (voucher_number, voucher_date, payee, method, total_amount, created_by, status, cashbox_id, category_id)
                         VALUES ($1, '2026-05-10', 'مورد اختبار', 'TRANSFER', 650, $2, 'DRAFT', $3, $4) RETURNING id`, [number, OWNER, cashboxId, categoryId]);
    await db.query(`INSERT INTO disbursement_voucher_lines (voucher_id, sort_order, description, amount) VALUES ($1, 1, 'بند', 650)`, [v.id]);
    return v.id;
  };
  const submitAndApprove = async (id) => {
    const sub = await attempt(() => val(`SELECT submit_voucher_for_approval($1)`, [id]));
    const app = sub.ok ? await attempt(() => val(`SELECT decide_voucher_approval($1, true, NULL)`, [id])) : { ok: false, error: 'not submitted' };
    return { sub, app };
  };

  const complete = await draftVoucher('T-001', CASH, EXP_MAINT);
  const cashBefore = n(await cashboxBalance(CASH));
  const ok = await submitAndApprove(complete);
  check('vouchers', 'إرسال إذن صرف للاعتماد يعمل', ok.sub.ok, ok.sub.error ?? '');
  check('vouchers', 'اعتماد إذن صرف مكتمل يعمل', ok.app.ok, ok.app.error ?? '');
  const lines = await voucherLines(complete);
  check('vouchers', 'الإذن المعتمد يُرحَّل (مدين المصروف / دائن الخزينة المحددة) وينقص رصيدها',
    lines.some((l) => l.category_id === EXP_MAINT && near(l.debit, 650))
      && lines.some((l) => l.code === 'AST-CSH' && l.cashbox_id === CASH && near(l.credit, 650))
      && near(cashBefore - n(await cashboxBalance(CASH)), 650), `lines=${lines.length}`);

  const incomplete = await draftVoucher('T-002', null, null);
  const bad = await submitAndApprove(incomplete);
  const badLines = await voucherLines(incomplete);
  const cashLineWithoutBox = badLines.some((l) => l.code === 'AST-CSH' && !l.cashbox_id);
  check('vouchers', 'اعتماد إذن صرف بلا خزينة يُرفض (وإلا تختلف الخزائن عن الدفتر)', bad.sub.ok && !cashLineWithoutBox && badLines.length === 0,
    cashLineWithoutBox ? 'اعتُمد ورُحّل بسطر نقدية بلا خزينة' : (bad.sub.ok ? '' : `الإرسال نفسه فشل: ${bad.sub.error}`));
  const fallback = badLines.find((l) => n(l.debit) > 0);
  check('vouchers', 'إذن صرف بلا بند مصروف لا يُرحَّل على بند افتراضي', bad.sub.ok && !fallback,
    fallback ? `رُحّل تلقائياً على البند ${fallback.code}` : '');
}
{
  const cashBefore = n(await cashboxBalance(CASH));
  const bankBefore = n(await cashboxBalance(BANK));
  const glBefore = n(await glCash());
  const r = await attempt(() => val(`SELECT record_cashbox_transfer($1, $2, 200, '2026-05-12', 'تحويل اختبار', NULL)`, [CASH, BANK]));
  check('cashboxes', 'التحويل بين الخزائن ينقل الرصيد ولا يغيّر إجمالي النقدية',
    r.ok && near(cashBefore - n(await cashboxBalance(CASH)), 200) && near(n(await cashboxBalance(BANK)) - bankBefore, 200) && near(await glCash(), glBefore),
    r.error ?? '');
}
{
  check('statements', 'إجمالي الخزائن = رصيد حساب النقدية في الدفتر العام', near(await treasury(), await glCash()),
    `treasury=${await treasury()} gl=${await glCash()}`);
  const bs = await val(`SELECT get_balance_sheet(CURRENT_DATE)`);
  const bsCash = (bs?.assets ?? []).find((a) => a.category_code === 'AST-CSH')?.balance;
  check('statements', 'الميزانية: النقدية = رصيد الدفتر العام (بدون القيود المعكوسة)', near(bsCash, await glCash()),
    `balance sheet=${bsCash} gl=${await glCash()}`);
  const s = bs?.summary ?? {};
  check('statements', 'الميزانية متوازنة: الأصول = الخصوم + حقوق الملكية',
    near(n(s.total_assets), n(s.total_liabilities) + n(s.total_equity)),
    `assets=${s.total_assets} liabilities=${s.total_liabilities} equity=${s.total_equity}`);
  const bsPast = await val(`SELECT get_balance_sheet('2025-12-31')`);
  check('statements', 'الميزانية بتاريخ سابق لا تشمل حركات لاحقة', n(bsPast?.summary?.total_assets) === 0,
    `assets at 2025-12-31 = ${bsPast?.summary?.total_assets}`);
  const cashRevenue = n(await val(`SELECT coalesce(sum(revenue_total), 0) FROM monthly_summary`));
  const pl = await val(`SELECT get_profit_loss(extract(year FROM CURRENT_DATE)::int, 'year', NULL, NULL)`);
  check('statements', 'إيراد لوحة التحكم = إيراد قائمة الدخل لنفس الفترة', near(cashRevenue, pl?.summary?.total_revenue),
    `dashboard(monthly_summary)=${cashRevenue} profit&loss=${pl?.summary?.total_revenue}`);
  const unbalanced = await val(`
    SELECT count(*) FROM (SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_id = je.id
    WHERE je.status = 'POSTED' GROUP BY je.id HAVING sum(jl.debit) <> sum(jl.credit)) x`);
  check('statements', 'كل القيود المرحّلة متوازنة', n(unbalanced) === 0, `unbalanced=${unbalanced}`);
}

// ── 7b. Approval cannot be bypassed by writing to the table (082) ──────────
{
  const voucherJournal = (id) => val(`SELECT count(*) FROM journal_entries WHERE source_type = 'VOUCHER' AND source_id = $1 AND status = 'POSTED'`, [id]);
  const statusOf = (id) => val(`SELECT status FROM disbursement_vouchers WHERE id = $1`, [id]);
  await actAs(db, 'authenticated', CASHIER);
  const draft = await attempt(async () => {
    const v = await one(`INSERT INTO disbursement_vouchers (voucher_number, voucher_date, payee, method, total_amount, created_by, cashbox_id, category_id)
                         VALUES ('G-001', '2026-05-12', 'مورد', 'CASH', 300, $1, $2, $3) RETURNING id`, [CASHIER, CASH, EXP_MAINT]);
    await db.query(`INSERT INTO disbursement_voucher_lines (voucher_id, sort_order, description, amount) VALUES ($1, 0, 'بند', 300)`, [v.id]);
    return v.id;
  });
  check('voucher-guard', 'أمين الخزينة يُنشئ مسودة إذن صرف بأسطرها', draft.ok, draft.error ?? '');
  const id = draft.value;
  const cashBefore = n(await cashboxBalance(CASH));

  const selfApprove = await attempt(() => db.query(`UPDATE disbursement_vouchers SET status = 'APPROVED' WHERE id = $1`, [id]));
  check('voucher-guard', 'أمين الخزينة لا يعتمد إذنه بتعديل الجدول مباشرة', !selfApprove.ok && n(await voucherJournal(id)) === 0
    && near(n(await cashboxBalance(CASH)), cashBefore), selfApprove.ok ? `اعتُمد ورُحّل: الحالة ${await statusOf(id)}` : '');
  const insertApproved = await attempt(() => db.query(`INSERT INTO disbursement_vouchers (voucher_number, voucher_date, payee, method, total_amount, created_by, status, cashbox_id, category_id)
                         VALUES ('G-002', '2026-05-12', 'مورد', 'CASH', 300, $1, 'APPROVED', $2, $3)`, [CASHIER, CASH, EXP_MAINT]));
  check('voucher-guard', 'أمين الخزينة لا يُدخل إذناً معتمداً جاهزاً', !insertApproved.ok, insertApproved.ok ? 'قُبل ورُحّل' : '');

  const submit = await attempt(() => val(`SELECT submit_voucher_for_approval($1)`, [id]));
  check('voucher-guard', 'أمين الخزينة يرسل الإذن للاعتماد', submit.ok, submit.error ?? '');
  const editPending = await attempt(() => db.query(`UPDATE disbursement_vouchers SET total_amount = 3000 WHERE id = $1`, [id]));
  const linePending = await attempt(() => db.query(`INSERT INTO disbursement_voucher_lines (voucher_id, sort_order, description, amount) VALUES ($1, 1, 'إضافة', 50)`, [id]));
  check('voucher-guard', 'الإذن المنتظر لا يُعدَّل مبلغه ولا بنوده بعد إرساله', !editPending.ok && !linePending.ok,
    [editPending.ok && 'عُدّل المبلغ', linePending.ok && 'أُضيف بند'].filter(Boolean).join('، '));

  await actAs(db, 'authenticated', OWNER);
  const approve = await attempt(() => val(`SELECT decide_voucher_approval($1, true, NULL)`, [id]));
  check('voucher-guard', 'المالك يعتمد من شاشة الاعتماد ويُرحَّل القيد', approve.ok && n(await voucherJournal(id)) === 1, approve.error ?? '');

  await actAs(db, 'authenticated', CASHIER);
  const editApproved = await attempt(() => db.query(`UPDATE disbursement_vouchers SET total_amount = 1 WHERE id = $1`, [id]));
  const deleteDirect = await attempt(() => db.query(`DELETE FROM disbursement_vouchers WHERE id = $1`, [id]));
  const deleteRpc = await attempt(() => val(`SELECT delete_disbursement_voucher($1)`, [id]));
  check('voucher-guard', 'أمين الخزينة لا يعدّل إذناً معتمداً ولا يحذفه (مباشرة أو بالدالة)',
    !editApproved.ok && !deleteDirect.ok && !deleteRpc.ok && n(await voucherJournal(id)) === 1,
    [editApproved.ok && 'عُدّل', deleteDirect.ok && 'حُذف مباشرة', deleteRpc.ok && 'حُذف بالدالة'].filter(Boolean).join('، '));
  check('voucher-guard', 'رسالة الرفض بالعربية وتشرح من يستطيع', /المدير أو المحاسب/.test(deleteRpc.error ?? ''), deleteRpc.error ?? '');

  const ownDraft = await attempt(async () => {
    const v = await one(`INSERT INTO disbursement_vouchers (voucher_number, voucher_date, payee, method, total_amount, created_by, cashbox_id, category_id)
                         VALUES ('G-003', '2026-05-12', 'مورد', 'CASH', 40, $1, $2, $3) RETURNING id`, [CASHIER, CASH, EXP_MAINT]);
    await db.query(`INSERT INTO disbursement_voucher_lines (voucher_id, sort_order, description, amount) VALUES ($1, 0, 'بند', 40)`, [v.id]);
    await db.query(`UPDATE disbursement_vouchers SET payee = 'مورد معدّل' WHERE id = $1`, [v.id]);
    return val(`SELECT delete_disbursement_voucher($1)`, [v.id]);
  });
  check('voucher-guard', 'أمين الخزينة يعدّل مسودته ويحذفها مع أسطرها', ownDraft.ok, ownDraft.error ?? '');

  await actAs(db, 'authenticated', OWNER);
  const ownerDelete = await attempt(() => val(`SELECT delete_disbursement_voucher($1)`, [id]));
  check('voucher-guard', 'المالك يحذف الإذن المعتمد ويُعكس قيده', ownerDelete.ok && n(await voucherJournal(id)) === 0, ownerDelete.error ?? '');
  const noBox = await attempt(() => db.query(`INSERT INTO disbursement_vouchers (voucher_number, voucher_date, payee, method, total_amount, created_by, status)
                         VALUES ('G-004', '2026-05-12', 'مورد', 'CASH', 10, $1, 'APPROVED')`, [OWNER]));
  check('voucher-guard', 'حتى المالك لا يعتمد مباشرة إذناً بلا خزينة وبند', !noBox.ok, noBox.ok ? 'قُبل' : '');
}

// ── 7c. Roles: who may change whose role (082) ──────────────────────────────
{
  const ADMIN = '44444444-4444-4444-8444-444444444444';
  const STAFF = '55555555-5555-4555-8555-555555555555';
  await actAs(db, 'superuser');
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'admin@test.local'), ($2, 'staff@test.local')`, [ADMIN, STAFF]);
  const fresh = await val(`SELECT role FROM profiles WHERE id = $1`, [STAFF]);
  check('roles', 'الحساب الجديد يبدأ للعرض فقط حتى يُعيَّن دوره', fresh === undefined || fresh === 'viewer', `الدور ${fresh}`);
  await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await db.query(`INSERT INTO profiles (id, role) VALUES ($1, 'admin'), ($2, 'viewer') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`, [ADMIN, STAFF]);
  check('roles', 'مسار الدعوة (مفتاح الخدمة) يعيّن الدور', (await val(`SELECT role FROM profiles WHERE id = $1`, [ADMIN])) === 'admin');

  const setRole = (who, target, role) => attempt(async () => {
    await actAs(db, 'authenticated', who);
    const r = await db.query(`UPDATE profiles SET role = $2 WHERE id = $1 RETURNING role`, [target, role]);
    if (r.rows.length !== 1) throw new Error('لم يُحدَّث أي صف');
    return r.rows[0].role;
  });
  const roleOf = async (id) => {
    await actAs(db, 'superuser');
    return val(`SELECT role FROM profiles WHERE id = $1`, [id]);
  };

  const adminGrantsOwner = await setRole(ADMIN, STAFF, 'owner');
  check('roles', 'المدير لا يمنح دور المالك', !adminGrantsOwner.ok && (await roleOf(STAFF)) === 'viewer', adminGrantsOwner.ok ? 'مُنح' : '');
  const adminSelf = await setRole(ADMIN, ADMIN, 'owner');
  check('roles', 'المدير لا يجعل نفسه مالكاً', !adminSelf.ok && (await roleOf(ADMIN)) === 'admin', adminSelf.ok ? 'ترقّى' : '');
  const adminDemotesOwner = await setRole(ADMIN, OWNER, 'viewer');
  check('roles', 'المدير لا ينزع دور المالك', !adminDemotesOwner.ok && (await roleOf(OWNER)) === 'owner', adminDemotesOwner.ok ? 'نُزع' : '');
  const adminSetsCashier = await setRole(ADMIN, STAFF, 'Cashier ');
  check('roles', 'المدير يعيّن أمين خزينة (والقيمة تُوحَّد)', adminSetsCashier.ok && (await roleOf(STAFF)) === 'cashier', adminSetsCashier.error ?? `الدور ${await roleOf(STAFF)}`);
  const adminUnknown = await setRole(ADMIN, STAFF, 'manager');
  check('roles', 'دور غير معروف يُرفض', !adminUnknown.ok && (await roleOf(STAFF)) === 'cashier', adminUnknown.ok ? 'قُبل' : '');
  const cashierSelf = await setRole(CASHIER, CASHIER, 'admin');
  check('roles', 'أمين الخزينة لا يرقّي نفسه', !cashierSelf.ok && (await roleOf(CASHIER)) === 'cashier', cashierSelf.ok ? 'ترقّى' : '');

  const ownerGrants = await setRole(OWNER, STAFF, 'owner');
  const ownerRevokes = await setRole(OWNER, STAFF, 'viewer');
  check('roles', 'المالك يمنح دور المالك وينزعه', ownerGrants.ok && ownerRevokes.ok && (await roleOf(STAFF)) === 'viewer',
    ownerGrants.error ?? ownerRevokes.error ?? '');
  const ownerSelf = await setRole(OWNER, OWNER, 'admin');
  check('roles', 'المالك لا يغيّر دوره بنفسه (لا يبقى النظام بلا مالك)', !ownerSelf.ok && (await roleOf(OWNER)) === 'owner', ownerSelf.ok ? 'تغيّر' : '');

  // a role value outside the known list (typo, legacy) must not grant write access
  await actAs(db, 'superuser');
  await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await db.query(`UPDATE profiles SET role = 'manager' WHERE id = $1`, [STAFF]);
  await actAs(db, 'authenticated', STAFF);
  const unknownRole = await val(`SELECT get_my_role()`);
  const unknownWrite = await attempt(() => insertTx('EXPENSE', 5, '2026-05-12', EXP_MAINT, CASH, null, 'دور غير معروف'));
  check('roles', 'الدور غير المعروف يُعامَل للعرض فقط', unknownRole === 'viewer' && !unknownWrite.ok, `get_my_role=${unknownRole}${unknownWrite.ok ? '، وسجّل معاملة' : ''}`);
  await actAs(db, 'superuser');
  await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await db.query(`UPDATE profiles SET role = 'member' WHERE id = $1`, [STAFF]);
  await actAs(db, 'authenticated', STAFF);
  check('roles', "الدور القديم 'member' = أمين خزينة كما في الواجهة", (await val(`SELECT get_my_role()`)) === 'cashier');
  await actAs(db, 'authenticated', OWNER);
}

// ── 8. Period close ─────────────────────────────────────────────────────────
{
  await actAs(db, 'superuser');
  await val(`SELECT assert_fiscal_period_open('2026-03-15')`);
  await db.query(`UPDATE fiscal_periods SET is_closed = true, closed_at = now() WHERE '2026-03-15' BETWEEN start_date AND end_date`);
  await actAs(db, 'authenticated', OWNER);
  const del = await attempt(() => db.query(`DELETE FROM transactions WHERE id = $1`, [t1Payment?.transaction_id]));
  check('periods', 'حذف معاملة في فترة مقفلة يُرفض', !del.ok, del.ok ? 'حُذفت معاملة من فترة مقفلة' : '');
  const late = await attempt(() => recordRent(T4, 1200, new Date().toISOString().slice(0, 10), ['2026-03']));
  check('periods', 'تحصيل متأخر لشهر في فترة مقفلة يُسجَّل بتاريخ اليوم', late.ok, late.error ?? '');
}

// ── 8b. Monthly charge generation across a closed month ──────────────────────
{
  await actAs(db, 'superuser');
  // June holds no other fixture transactions, so closing it cannot interfere with later checks.
  await val(`SELECT assert_fiscal_period_open('2026-06-15')`);
  await db.query(`UPDATE fiscal_periods SET is_closed = true, closed_at = now() WHERE '2026-06-15' BETWEEN start_date AND end_date`);
  await actAs(db, 'authenticated', OWNER);
  const gen = await attempt(() => val(`SELECT generate_monthly_charges('2026-06')`));
  check('rent', 'توليد مطالبات شهر مقفل لا يُفشل العملية كلها', gen.ok, gen.error ?? '');
  const t4Jun = await charge(T4, '2026-06');
  const accrualDate = t4Jun ? await val(`SELECT entry_date::text FROM journal_entries WHERE source_type = 'CHARGE' AND source_id = $1 AND status = 'POSTED'`, [t4Jun.id]) : null;
  const today = await val(`SELECT CURRENT_DATE::text`);
  check('rent', 'مطالبة شهر مقفل تُستحق بتاريخ اليوم ولا تمس الفترة المقفلة', accrualDate === today, `accrual=${accrualDate} today=${today}`);

  const preview = await attempt(() => rows(`SELECT tenant_id, month_key FROM rent_missing_charges(to_char(CURRENT_DATE, 'YYYY-MM'))`));
  const has = (t, m) => (preview.value ?? []).some((r) => r.tenant_id === t && r.month_key === m);
  check('rent', 'قائمة أشهر الإيجار المستحقة بلا مطالبة متاحة للمراجعة', preview.ok && has(T1, '2026-04') && !has(T3, '2026-02'),
    preview.ok ? `rows=${preview.value.length}` : preview.error);

  // A tenant with a second active lease is still listed once per missing month.
  await actAs(db, 'superuser');
  const secondLease = await attempt(async () => {
    const unit = await val(`INSERT INTO mall_units (unit_number, floor, area_sqm) VALUES ('اختبار-عقد-ثان', '1', 10) RETURNING id`);
    return val(`INSERT INTO lease_contracts
      SELECT (jsonb_populate_record(NULL::lease_contracts, to_jsonb(lc) || jsonb_build_object('id', gen_random_uuid(), 'unit_id', $2::uuid))).*
      FROM lease_contracts lc WHERE lc.tenant_id = $1 AND lc.status = 'ACTIVE' LIMIT 1 RETURNING id`, [T1, unit]);
  });
  await actAs(db, 'authenticated', OWNER);
  const preview2 = await attempt(() => rows(`SELECT tenant_id, month_key, count(*) n FROM rent_missing_charges(to_char(CURRENT_DATE, 'YYYY-MM'))
    GROUP BY tenant_id, month_key HAVING count(*) > 1`));
  check('rent', 'مستأجر بعقدين نشطين يظهر مرة واحدة لكل شهر ناقص', secondLease.ok && preview2.ok && preview2.value.length === 0,
    secondLease.error ?? preview2.error ?? `duplicates=${preview2.value?.length}`);
  await actAs(db, 'superuser');
  if (secondLease.ok) await db.query(`DELETE FROM lease_contracts WHERE id = $1`, [secondLease.value]);

  await actAs(db, 'service_role');
  const job = await attempt(() => val(`SELECT generate_monthly_charges('2026-05')`));
  check('rent', 'مهمة الخادم المجدولة (service_role) تستطيع توليد المطالبات الشهرية', job.ok, job.error ?? '');
  await actAs(db, 'authenticated', OWNER);
}

// ── 9. Input validation ─────────────────────────────────────────────────────
{
  const wrongCat = await attempt(() => insertTx('REVENUE', 100, '2026-05-01', EXP_MAINT, CASH));
  check('validation', 'إيراد على بند مصروف يُرفض', !wrongCat.ok, wrongCat.ok ? 'قُبل إيراد على بند مصروف (يُنقص المصروف بدل زيادة الإيراد)' : '');
  const negative = await attempt(() => insertTx('EXPENSE', -50, '2026-05-01', EXP_MAINT, CASH));
  check('validation', 'مبلغ سالب يُرفض', !negative.ok);
  const transferKind = await attempt(() => insertTx('TRANSFER', 100, '2026-05-01', REV_OTHER, CASH));
  check('validation', 'نوع TRANSFER لا يُدخل كمعاملة عادية', !transferKind.ok);
  const delVendor = await attempt(() => db.query(`DELETE FROM contacts WHERE id = $1`, [V1]));
  const orphaned = await val(`SELECT count(*) FROM transactions WHERE id = $1 AND contact_id IS NULL`, [vendorTxId]);
  check('vendors', 'حذف مورد له معاملات يُرفض أو يؤرشف (لا يفصل التاريخ)', !delVendor.ok || n(orphaned) === 0,
    delVendor.ok ? 'حُذف المورد وأصبحت معاملاته بلا جهة' : delVendor.error);
}

// ── 10. Anonymous visitor (public anon key) ─────────────────────────────────
const t1Journal = (await txJournal(t1Payment?.transaction_id))?.id;
await actAs(db, 'authenticated', OWNER);
const probe = await attempt(() => recordRent(T4, 1200, '2026-05-03', ['2026-05']));
const probeJournal = probe.ok ? (await txJournal(probe.value.transaction_id))?.id : null;
const probeLinkedBefore = probeJournal ? n(await linkedOn(probeJournal)) : 0;
await actAs(db, 'anon');
const anonRead = async (label, sql) => {
  const r = await attempt(() => val(sql));
  check('security-anon', `الزائر المجهول لا يقرأ ${label}`, !r.ok || n(r.value) === 0, r.ok ? `rows=${r.value}` : '');
};
await anonRead('بيانات المستأجرين (tenants_rent_status)', `SELECT count(*) FROM tenants_rent_status`);
await anonRead('ملخص الإيجارات (tenant_rent_summary)', `SELECT count(*) FROM tenant_rent_summary`);
await anonRead('أرصدة الخزائن (cashbox_balances)', `SELECT count(*) FROM cashbox_balances`);
await anonRead('أسطر القيود (journal_lines_with_categories)', `SELECT count(*) FROM journal_lines_with_categories`);
const anonCall = async (label, sql, params) => {
  const r = await attempt(() => val(sql, params));
  check('security-anon', `الزائر المجهول لا يستطيع ${label}`, !r.ok, r.ok ? 'نُفّذ بنجاح' : '');
};
await anonCall('قراءة ميزان المراجعة', `SELECT get_trial_balance(2026)`);
await anonCall('قراءة إجمالي الخزينة', `SELECT get_treasury_balance_total()`);
await anonCall('إعفاء شهر إيجار لمستأجر', `SELECT set_tenant_rent_exempt_months($1, $2::text[], true)`, [T1, pgArray(['2026-06'])]);
await anonCall('حذف روابط سداد الإيجار لقيد', `SELECT purge_rent_links_for_journal($1)`, [probeJournal]);
await anonCall('كتابة سجل تدقيق مزيف', `SELECT write_audit_log('DELETE','transaction',NULL,'x','x',NULL,NULL,NULL,'info','{}'::jsonb)`);
await anonCall('تسجيل دفعة إيجار', `SELECT record_rent_payment($1, 1, CURRENT_DATE, NULL, NULL, $2::text[], 'CASH')`, [T4, pgArray(['2026-05'])]);
await anonCall('إنشاء إشعارات', `SELECT sync_overdue_charge_notifications()`);
await anonCall('دمج مطالبات الإيجار', `SELECT dedupe_rent_charges_data()`);
await actAs(db, 'superuser');
check('security-anon', 'بعد محاولات الزائر: روابط السداد سليمة', probeLinkedBefore > 0 && near(await linkedOn(probeJournal), probeLinkedBefore),
  `before=${probeLinkedBefore} after=${await linkedOn(probeJournal)}`);
check('security-anon', 'بعد محاولات الزائر: لم يُعفَ أي شهر إضافي', n(await val(`SELECT count(*) FROM tenant_rent_exempt_months WHERE tenant_id = $1`, [T1])) === 0);

// ── 11. Viewer role must be read-only ───────────────────────────────────────
await actAs(db, 'authenticated', VIEWER);
const viewerWrite = async (label, sql, params) => {
  const r = await attempt(() => db.query(sql, params));
  const changed = r.ok ? r.value.affectedRows ?? 0 : 0;
  check('security-viewer', `المشاهد لا يستطيع ${label}`, !r.ok || changed === 0, r.ok ? `affected=${changed}` : '');
};
await viewerWrite('إنشاء معاملة', `INSERT INTO transactions (kind, status, method, amount, currency, tx_date, category_id, cashbox_id)
  VALUES ('EXPENSE', 'DRAFT', 'CASH', 1, 'LYD', CURRENT_DATE, $1, $2)`, [EXP_MAINT, CASH]);
await viewerWrite('إدخال قيد يدوي مباشرة', `INSERT INTO journal_entries (entry_date, description, status) VALUES (CURRENT_DATE, 'viewer', 'POSTED')`);
await viewerWrite('حذف أسطر القيود', `DELETE FROM journal_lines WHERE journal_id = $1`, [t1Journal]);
await viewerWrite('إعادة فتح فترة مقفلة', `UPDATE fiscal_periods SET is_closed = false WHERE is_closed`);
await viewerWrite('حذف مطالبات الإيجار', `DELETE FROM tenant_charges WHERE contract_id IN (SELECT id FROM lease_contracts WHERE tenant_id = $1)`, [T4]);
await viewerWrite('تعديل قيمة عقد إيجار', `UPDATE lease_contracts SET monthly_rent = 1 WHERE tenant_id = $1`, [T1]);

// ── 12. Regression guard for signed-in users ────────────────────────────────
{
  const year = n(await val(`SELECT extract(year FROM CURRENT_DATE)`));
  const month = await val(`SELECT to_char(CURRENT_DATE, 'YYYY-MM')`);
  const views = (await rows(`SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v' ORDER BY 1`)).map((r) => r.relname);
  const reads = [
    ...views.map((v) => [`view ${v}`, `SELECT count(*) FROM public.${v}`, []]),
    ['get_trial_balance', `SELECT get_trial_balance($1)`, [year]],
    ['get_profit_loss', `SELECT get_profit_loss($1, 'year', NULL, NULL)`, [year]],
    ['get_cash_flow', `SELECT get_cash_flow($1)`, [year]],
    ['get_balance_sheet', `SELECT get_balance_sheet(CURRENT_DATE)`, []],
    ['get_tenant_ar_aging', `SELECT get_tenant_ar_aging(CURRENT_DATE)`, []],
    ['get_tenant_rent_calendar', `SELECT get_tenant_rent_calendar($1, $2)`, [T1, year]],
    ['tenant_rent_summary_for_month', `SELECT count(*) FROM tenant_rent_summary_for_month($1)`, [month]],
    ['get_treasury_balance_total', `SELECT get_treasury_balance_total()`, []],
    ['transactions', `SELECT count(*) FROM transactions`, []],
    ['contacts', `SELECT count(*) FROM contacts`, []],
  ];
  for (const [who, uid] of [['owner', OWNER], ['cashier', CASHIER], ['viewer', VIEWER]]) {
    await actAs(db, 'authenticated', uid);
    const failures = [];
    for (const [label, sql, params] of reads) {
      const r = await attempt(() => val(sql, params));
      if (!r.ok) failures.push(`${label}: ${r.error.slice(0, 60)}`);
    }
    check('regression', `${who}: كل الشاشات والتقارير تُقرأ دون خطأ (${reads.length} مصدر)`, failures.length === 0, failures.join(' | '));
  }
  await actAs(db, 'authenticated', CASHIER);
  const rev = await attempt(() => insertTx('REVENUE', 75, `${month}-02`, REV_OTHER, CASH, C1, 'إيراد أمين خزينة'));
  check('regression', 'أمين الخزينة يسجّل إيراداً', rev.ok, rev.error ?? '');
  const exp = await attempt(() => insertTx('EXPENSE', 25, `${month}-02`, EXP_MAINT, CASH, null, 'مصروف أمين خزينة'));
  check('regression', 'أمين الخزينة يسجّل مصروفاً', exp.ok, exp.error ?? '');
  const rent = await attempt(() => recordRent(T4, 1200, `${month}-03`, [month]));
  check('regression', 'أمين الخزينة يحصّل إيجار شهر', rent.ok, rent.error ?? '');
  const transfer = await attempt(() => val(`SELECT record_cashbox_transfer($1, $2, 10, CURRENT_DATE, 'تحويل', NULL)`, [CASH, BANK]));
  check('regression', 'أمين الخزينة يحوّل بين الخزائن', transfer.ok, transfer.error ?? '');
  const contact = await attempt(() => createContact({ kind: 'CUSTOMER', name: 'عميل أمين الخزينة' }));
  check('regression', 'أمين الخزينة يضيف جهة تعامل', contact.ok && contact.value, contact.error ?? '');
  await actAs(db, 'authenticated', OWNER);
  const exempt = await attempt(() => val(`SELECT set_tenant_rent_exempt_months($1, $2::text[], true)`, [T4, pgArray(['2026-12'])]));
  check('regression', 'المالك يعفي شهراً', exempt.ok, exempt.error ?? '');
  const notif = await attempt(() => val(`SELECT sync_overdue_charge_notifications()`));
  check('regression', 'المالك يحدّث إشعارات المتأخرات', notif.ok, notif.error ?? '');
}

// ── report ──────────────────────────────────────────────────────────────────
await actAs(db, 'superuser');
await db.close();
const byArea = new Map();
for (const r of results) byArea.set(r.area, [...(byArea.get(r.area) ?? []), r]);
console.log(`\nAccounting scenario suite — ${prodFunctions ? 'production logic' : 'repo migrations only'}${candidates.length ? ` + ${candidates.length} candidate migration(s)` : ''}\n`);
for (const [area, list] of byArea) {
  console.log(`[${area}]`);
  for (const r of list) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `\n        ↳ ${r.detail}`}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed (${results.length} checks)`);
process.exitCode = failed > 0 ? 1 : 0;
