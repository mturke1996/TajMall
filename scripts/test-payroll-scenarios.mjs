/**
 * Payroll scenarios (080) on an isolated PGlite replica — never touches production data.
 *   node scripts/test-payroll-scenarios.mjs              # repo migrations + 078 + 080
 *   node scripts/test-payroll-scenarios.mjs --prod-functions
 */
import { readFileSync } from 'node:fs';
import { createReplica, actAs } from './lib/pglite-replica.mjs';

const prodFunctions = process.argv.includes('--prod-functions');
const { db } = await createReplica({ prodFunctions });
const results = [];
const check = (area, name, ok, detail = '') => results.push({ area, name, ok: Boolean(ok), detail: String(detail ?? '') });
const rows = async (sql, p) => (await db.query(sql, p)).rows;
const one = async (sql, p) => (await rows(sql, p))[0];
const val = async (sql, p) => { const r = await one(sql, p); return r ? Object.values(r)[0] : undefined; };
const attempt = async (fn) => { try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: e.message }; } };
const n = (x) => Number(x ?? 0);
const near = (a, b) => Math.abs(n(a) - n(b)) < 0.001;

for (const file of ['docs/proposed-migrations/078_security_and_ledger_fixes.sql', 'docs/proposed-migrations/080_payroll.sql']) {
  const r = await attempt(() => db.exec(readFileSync(file, 'utf8')));
  check('setup', `تطبيق ${file.split('/').pop()}`, r.ok, r.error);
  if (!r.ok) { try { await db.exec('ROLLBACK'); } catch {} }
}

if (results.some((r) => !r.ok)) {
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} ${r.detail}`);
  process.exit(1);
}

// ── users and fixtures ──────────────────────────────────────────────────────
await actAs(db, 'superuser');
const U = { owner: '11111111-1111-4111-8111-111111111111', accountant: '44444444-4444-4444-8444-444444444444',
  cashier: '33333333-3333-4333-8333-333333333333', viewer: '22222222-2222-4222-8222-222222222222' };
for (const [role, id] of Object.entries(U)) await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${role}@test.local`]);
await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
for (const [role, id] of Object.entries(U)) {
  await db.query(`INSERT INTO profiles (id, role) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`, [id, role]);
}
const CASH = await val(`SELECT id FROM cashboxes WHERE kind = 'CASH' AND active ORDER BY code LIMIT 1`);
const as = (who) => actAs(db, 'authenticated', U[who]);
const glBalance = (code) => val(`SELECT coalesce(sum(jl.debit - jl.credit), 0) FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'POSTED'
  JOIN categories c ON c.id = jl.category_id AND c.code = $1`, [code]);
const cash = () => val(`SELECT get_cashbox_balance($1)`, [CASH]);

check('setup', 'حسابات الرواتب والربط', n(await val(`SELECT count(*) FROM categories WHERE code IN ('LIA-SAL','AST-ADV','EXP-BON')`)) === 3
  && n(await val(`SELECT count(*) FROM account_mappings WHERE source_type LIKE 'PAYROLL_%'`)) === 5);

await as('owner');
const mk = async (name, hire) => {
  const r = await val(`SELECT create_contact($1::jsonb)`, [JSON.stringify({ kind: 'EMPLOYEE', name, job_title: 'موظف', hire_date: hire })]);
  return r?.id ?? r;
};
const E1 = await mk('موظف اختبار 1', '2025-06-01');
const E2 = await mk('موظف اختبار 2', '2025-09-01');

// ── salary structures and history ───────────────────────────────────────────
await val(`SELECT payroll_set_salary($1, '2026-01-01', 2000, 300, 0, 0, 'تعيين')`, [E1]);
await val(`SELECT payroll_set_salary($1, '2026-01-01', 1500, 0, 0, 0, 'تعيين')`, [E2]);
await val(`SELECT payroll_set_salary($1, '2026-03-01', 2200, 300, 0, 0, 'زيادة سنوية')`, [E1]);
check('salary', 'هيكل الراتب يُحفظ بتاريخ سريان ويُحدَّث راتب البطاقة لآخر هيكل',
  n(await val(`SELECT count(*) FROM payroll_salary_structures WHERE employee_id = $1`, [E1])) === 2
  && near(await val(`SELECT salary FROM contacts WHERE id = $1`, [E1]), 2500));
for (const who of ['cashier', 'viewer']) {
  await as(who);
  const r = await attempt(() => val(`SELECT payroll_set_salary($1, '2026-02-01', 9999, 0, 0, 0, NULL)`, [E1]));
  check('security', `${who} لا يعدّل الرواتب`, !r.ok);
}
await actAs(db, 'anon');
check('security', 'الزائر المجهول لا يستدعي دوال الرواتب', !(await attempt(() => val(`SELECT payroll_prepare_run('2026-03')`))).ok);

// ── adjustments with approval ───────────────────────────────────────────────
await as('accountant');
const bonus = await val(`SELECT payroll_add_adjustment($1, '2026-03', 'BONUS', 500, 'مكافأة أداء')`, [E1]);
const penalty = await val(`SELECT payroll_add_adjustment($1, '2026-03', 'PENALTY', 100, 'تأخير متكرر')`, [E1]);
const absence = await val(`SELECT payroll_add_adjustment($1, '2026-03', 'ABSENCE', 150, 'غياب 3 أيام', 3)`, [E2]);
const draftBonus = await val(`SELECT payroll_add_adjustment($1, '2026-03', 'BONUS', 200, 'مكافأة لم تُعتمد')`, [E2]);
check('adjustments', 'المحاسب لا يعتمد حركاته بنفسه (فصل المهام)', !(await attempt(() => val(`SELECT payroll_decide_adjustment($1, true)`, [bonus]))).ok);
check('adjustments', 'السبب إلزامي', !(await attempt(() => val(`SELECT payroll_add_adjustment($1, '2026-03', 'BONUS', 50, '')`, [E1]))).ok);
await as('owner');
for (const id of [bonus, penalty, absence]) await val(`SELECT payroll_decide_adjustment($1, true, 'موافق')`, [id]);

// ── advance ─────────────────────────────────────────────────────────────────
const cashBefore = n(await cash());
await as('accountant');
const adv = await val(`SELECT payroll_issue_advance($1, 900, 3, $2, '2026-02-10', 'سلفة طارئة')`, [E2, CASH]);
check('advances', 'صرف سلفة يُنقص الخزينة ويُثبت أصل سلف الموظفين', near(cashBefore - n(await cash()), 900) && near(await glBalance('AST-ADV'), 900));
check('advances', 'معاملة السلفة لا تُحذف منفردة', !(await attempt(() => db.query(`DELETE FROM transactions WHERE id = (SELECT transaction_id FROM payroll_advances WHERE id = $1)`, [adv]))).ok);

// ── March run ───────────────────────────────────────────────────────────────
await as('accountant');
const prep = await val(`SELECT payroll_prepare_run('2026-03')`);
const runMar = prep.run_id;
const line = (emp, run) => one(`SELECT * FROM payroll_run_lines_status WHERE employee_id = $1 AND run_id = $2`, [emp, run]);
const l1 = await line(E1, runMar);
const l2 = await line(E2, runMar);
check('run', 'الموظف 1: أساسي 2200 + سكن 300 + مكافأة 500 − جزاء 100 = صافي 2900',
  near(l1?.gross, 3000) && near(l1?.net, 2900), `gross=${l1?.gross} net=${l1?.net}`);
check('run', 'الموظف 2: 1500 − غياب 150 − قسط سلفة 300 = صافي 1050',
  near(l2?.gross, 1350) && near(l2?.advance_repayment, 300) && near(l2?.net, 1050), `gross=${l2?.gross} adv=${l2?.advance_repayment} net=${l2?.net}`);
check('run', 'المكافأة غير المعتمدة لا تدخل الكشف', near(l2?.bonuses, 0));
check('run', 'لا يُرحَّل قبل الاعتماد', !(await attempt(() => val(`SELECT payroll_post_run($1)`, [runMar]))).ok);
await as('owner');
await val(`SELECT payroll_approve_run($1)`, [runMar]);
await as('accountant');
const je = await val(`SELECT payroll_post_run($1)`, [runMar]);
const jl = await rows(`SELECT c.code, sum(jl.debit) d, sum(jl.credit) c FROM journal_lines jl JOIN categories c ON c.id = jl.category_id
  WHERE jl.journal_id = $1 GROUP BY c.code`, [je]);
const by = Object.fromEntries(jl.map((r) => [r.code, r]));
check('ledger', 'قيد الرواتب: مدين رواتب 3850 + مكافآت 500 / دائن مستحق 3950 + سلف 300 + جزاءات 100',
  near(by['EXP-SAL']?.d, 3850) && near(by['EXP-BON']?.d, 500) && near(by['LIA-SAL']?.c, 3950)
  && near(by['AST-ADV']?.c, 300) && near(by['REV-OTH']?.c, 100), JSON.stringify(jl));
check('ledger', 'قيد الرواتب متوازن', near(jl.reduce((s, r) => s + n(r.d), 0), jl.reduce((s, r) => s + n(r.c), 0)));

// ── posted month is final ───────────────────────────────────────────────────
check('locks', 'لا يُرحَّل الكشف مرتين', !(await attempt(() => val(`SELECT payroll_post_run($1)`, [runMar]))).ok);
check('locks', 'لا يُعاد إعداد شهر مُرحَّل', !(await attempt(() => val(`SELECT payroll_prepare_run('2026-03')`))).ok);
check('locks', 'لا تُضاف حركة لشهر مُرحَّل', !(await attempt(() => val(`SELECT payroll_add_adjustment($1, '2026-03', 'BONUS', 10, 'متأخرة')`, [E1]))).ok);
check('locks', 'لا يُعدَّل راتب بأثر رجعي على شهر مُرحَّل', !(await attempt(() => val(`SELECT payroll_set_salary($1, '2026-03-01', 1, 0, 0, 0, NULL)`, [E1]))).ok);
check('locks', 'تعديل الراتب من الشهر التالي مسموح', (await attempt(() => val(`SELECT payroll_set_salary($1, '2026-04-01', 2200, 300, 100, 0, 'بدل نقل')`, [E1]))).ok);

// ── payments ────────────────────────────────────────────────────────────────
await as('cashier');
const cashBeforePay = n(await cash());
const pay1 = await attempt(() => val(`SELECT payroll_pay_line($1, 2900, $2, '2026-04-02')`, [l1.id, CASH]));
check('payments', 'أمين الخزينة يصرف الراتب كاملاً', pay1.ok, pay1.error);
check('payments', 'صرف الراتب يُنقص الخزينة ويُسقط الالتزام', near(cashBeforePay - n(await cash()), 2900) && near(-n(await glBalance('LIA-SAL')), 1050));
check('payments', 'لا يُصرف أكثر من الصافي', !(await attempt(() => val(`SELECT payroll_pay_line($1, 2000, $2, '2026-04-02')`, [l2.id, CASH]))).ok);
await val(`SELECT payroll_pay_line($1, 500, $2, '2026-04-02')`, [l2.id, CASH]);
const pay3 = await val(`SELECT payroll_pay_line($1, 550, $2, '2026-04-05')`, [l2.id, CASH]);
check('payments', 'الصرف على دفعتين يُكمل الصافي', near((await line(E2, runMar)).outstanding, 0));
check('payments', 'لا دفعة إضافية بعد الاكتمال', !(await attempt(() => val(`SELECT payroll_pay_line($1, 1, $2, '2026-04-06')`, [l2.id, CASH]))).ok);
await as('owner');
await db.query(`DELETE FROM transactions WHERE id = $1`, [pay3]);
check('payments', 'حذف معاملة صرف يعيد المتبقي تلقائياً', near((await line(E2, runMar)).outstanding, 550) && near(-n(await glBalance('LIA-SAL')), 550));

// ── advance settles over three months ───────────────────────────────────────
for (const m of ['2026-04', '2026-05', '2026-06']) {
  await as('accountant');
  const p = await val(`SELECT payroll_prepare_run($1)`, [m]);
  await as('owner');
  await val(`SELECT payroll_approve_run($1)`, [p.run_id]);
  await as('accountant');
  await val(`SELECT payroll_post_run($1)`, [p.run_id]);
}
const advRow = await one(`SELECT * FROM payroll_advances_status WHERE id = $1`, [adv]);
check('advances', 'السلفة تُسدَّد على 3 أقساط ثم تُغلق', advRow?.status === 'SETTLED' && near(advRow?.remaining, 0), `${advRow?.status} remaining=${advRow?.remaining}`);
const juneE2 = await one(`SELECT l.advance_repayment FROM payroll_run_lines l JOIN payroll_runs r ON r.id = l.run_id WHERE r.period_month = '2026-06' AND l.employee_id = $1`, [E2]);
check('advances', 'لا قسط بعد إغلاق السلفة', near(juneE2?.advance_repayment, 0));
check('ledger', 'رصيد سلف الموظفين = صفر بعد السداد', near(await glBalance('AST-ADV'), 0));
const aprilE1 = await one(`SELECT l.allowances FROM payroll_run_lines l JOIN payroll_runs r ON r.id = l.run_id WHERE r.period_month = '2026-04' AND l.employee_id = $1`, [E1]);
check('salary', 'تعديل الراتب يسري من شهره (بدل نقل أبريل)', near(aprilE1?.allowances, 400));

// ── reversal ────────────────────────────────────────────────────────────────
await as('owner');
check('reversal', 'لا يُعكس كشف صُرف منه', !(await attempt(() => val(`SELECT payroll_reverse_run($1, 'تجربة')`, [runMar]))).ok);
const runJun = await val(`SELECT id FROM payroll_runs WHERE period_month = '2026-06'`);
const rev = await attempt(() => val(`SELECT payroll_reverse_run($1, 'خطأ في الكشف')`, [runJun]));
check('reversal', 'عكس كشف لم يُصرف منه يعيده مسودة ويعكس قيده', rev.ok
  && (await val(`SELECT status FROM payroll_runs WHERE id = $1`, [runJun])) === 'DRAFT'
  && (await val(`SELECT count(*) FROM journal_entries WHERE source_type = 'PAYROLL_RUN' AND source_id = $1 AND status = 'POSTED'`, [runJun])) == 0, rev.error);

// ── cancelling an advance ───────────────────────────────────────────────────
await as('accountant');
const cashBeforeAdv = n(await cash());
const adv2 = await val(`SELECT payroll_issue_advance($1, 400, 2, $2, '2026-06-15', 'سلفة ثانية')`, [E1, CASH]);
await as('owner');
const cancel = await attempt(() => val(`SELECT payroll_cancel_advance($1, 'صُرفت بالخطأ')`, [adv2]));
check('advances', 'إلغاء سلفة لم تُخصم أقساطها يعيد الخزينة', cancel.ok && near(n(await cash()), cashBeforeAdv), cancel.error);

// ── closed period ───────────────────────────────────────────────────────────
await actAs(db, 'superuser');
await val(`SELECT assert_fiscal_period_open('2026-07-15')`);
await db.query(`UPDATE fiscal_periods SET is_closed = true, closed_at = now() WHERE '2026-07-15' BETWEEN start_date AND end_date`);
await as('accountant');
const pj = await val(`SELECT payroll_prepare_run('2026-07')`);
await as('owner');
await val(`SELECT payroll_approve_run($1)`, [pj.run_id]);
await as('accountant');
check('locks', 'لا يُرحَّل كشف في فترة مالية مقفلة', !(await attempt(() => val(`SELECT payroll_post_run($1)`, [pj.run_id]))).ok);

// ── visibility ──────────────────────────────────────────────────────────────
await as('cashier');
check('security', 'أمين الخزينة لا يرى هياكل الرواتب', n(await val(`SELECT count(*) FROM payroll_salary_structures`)) === 0);
check('security', 'أمين الخزينة يرى سطور الكشف ليصرفها', n(await val(`SELECT count(*) FROM payroll_run_lines_status`)) > 0);
await as('viewer');
check('security', 'المشاهد لا يرى أي بيانات رواتب',
  n(await val(`SELECT count(*) FROM payroll_run_lines_status`)) === 0 && n(await val(`SELECT count(*) FROM payroll_salary_structures`)) === 0);
await as('cashier');
{
  const w = await attempt(() => db.query(`UPDATE payroll_runs SET status = 'DRAFT'`));
  check('security', 'لا كتابة مباشرة على جداول الرواتب', !w.ok || w.value.affectedRows === 0, w.ok ? `affected=${w.value.affectedRows}` : '');
}

// ── history and integrity ───────────────────────────────────────────────────
await actAs(db, 'superuser');
const history = n(await val(`SELECT count(*) FROM audit_log WHERE entity_type = 'employee' AND entity_id = $1`, [E2]));
check('history', 'سجل الموظف يحفظ كل حدث (راتب، حركات، اعتماد، سلفة)', history >= 5, `events=${history}`);
check('ledger', 'كل القيود المرحّلة متوازنة', n(await val(`SELECT count(*) FROM (SELECT je.id FROM journal_entries je JOIN journal_lines jl ON jl.journal_id = je.id
  WHERE je.status = 'POSTED' GROUP BY je.id HAVING sum(jl.debit) <> sum(jl.credit)) x`)) === 0);
const outstanding = n(await val(`SELECT coalesce(sum(outstanding), 0) FROM payroll_run_lines_status WHERE run_status = 'POSTED'`));
check('ledger', 'رصيد الرواتب المستحقة في الدفتر = المتبقي غير المصروف في الكشوف', near(-n(await glBalance('LIA-SAL')), outstanding),
  `gl=${-n(await glBalance('LIA-SAL'))} runs=${outstanding}`);
const summary = await one(`SELECT last_12_months_salary_paid FROM employee_summary WHERE id = $1`, [E2]);
check('reports', 'ملخص الموظف يعدّ الرواتب المصروفة فقط (لا السلف)', near(summary?.last_12_months_salary_paid, 500), `paid=${summary?.last_12_months_salary_paid}`);

await db.close();
console.log(`\nPayroll scenarios — ${prodFunctions ? 'production logic' : 'repo migrations'} + 078 + 080\n`);
let area = '';
for (const r of results) {
  if (r.area !== area) { area = r.area; console.log(`[${area}]`); }
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `\n        ↳ ${r.detail}`}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed (${results.length} checks)`);
process.exitCode = failed ? 1 : 0;
