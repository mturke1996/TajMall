/**
 * Employee file and leave (083) and the tenant claim start (084) on an isolated PGlite replica — never touches
 * production data.
 *
 *   npx tsx scripts/test-leave-scenarios.mjs
 *
 * It needs tsx because it holds the app's own rules (src/lib/leave.ts) to the same answers as the database: working
 * days, the annual balance and the shortage check must agree between what the screen shows and what the function
 * enforces.
 *
 * Applied in the order production has them: repository migrations, 078, 080, 081, 082, then 083; 084 is applied in
 * its own section so the before and after can be compared.
 */
import { readFileSync } from 'node:fs';
import { createReplica, actAs } from './lib/pglite-replica.mjs';

let L;
let addDaysISO;
try {
  L = await import('../src/lib/leave.ts');
  ({ addDaysISO } = await import('../src/lib/mall-dates.ts'));
} catch (e) {
  console.error('Run this file with tsx: npx tsx scripts/test-leave-scenarios.mjs\n', e.message);
  process.exit(2);
}

const DIR = 'docs/proposed-migrations';
const sqlOf = (f) => readFileSync(`${DIR}/${f}`, 'utf8');
const { db } = await createReplica();
const results = [];
const check = (area, name, ok, detail = '') => results.push({ area, name, ok: Boolean(ok), detail: String(detail ?? '') });
const rows = async (sql, p) => (await db.query(sql, p)).rows;
const one = async (sql, p) => (await rows(sql, p))[0];
const val = async (sql, p) => { const r = await one(sql, p); return r ? Object.values(r)[0] : undefined; };
const attempt = async (fn) => {
  try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: e.message, code: e.code }; }
};
const n = (x) => Number(x ?? 0);
const near = (a, b) => Math.abs(n(a) - n(b)) < 0.001;
const has = (r, text) => !r.ok && String(r.error).includes(text);

for (const file of ['078_security_and_ledger_fixes.sql', '080_payroll.sql', '081_rent_safety.sql', '082_role_and_voucher_guards.sql', '083_employee_leave.sql']) {
  const r = await attempt(() => db.exec(sqlOf(file)));
  check('setup', `تطبيق ${file}`, r.ok, r.error);
  if (!r.ok) { try { await db.exec('ROLLBACK'); } catch {} }
}
if (results.some((r) => !r.ok)) {
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} ${r.detail}`);
  process.exit(1);
}

// ── users and fixtures ──────────────────────────────────────────────────────
await actAs(db, 'superuser');
const U = {
  owner: '11111111-1111-4111-8111-111111111111', viewer: '22222222-2222-4222-8222-222222222222',
  cashier: '33333333-3333-4333-8333-333333333333', accountant: '44444444-4444-4444-8444-444444444444',
  admin: '55555555-5555-4555-8555-555555555555',
};
for (const [role, id] of Object.entries(U)) await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${role}@test.local`]);
await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
for (const [role, id] of Object.entries(U)) {
  await db.query(`INSERT INTO profiles (id, role) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`, [id, role]);
}
const as = (who) => actAs(db, 'authenticated', U[who]);
const TODAY = await val(`SELECT leave_today()::text`);
const day = (offset) => addDaysISO(TODAY, offset);
// the next Sunday strictly after a date, so a test can start a leave on a working day whatever today is
const nextSunday = (iso) => { let d = addDaysISO(iso, 1); while (L.weekdayOf(d) !== 0) d = addDaysISO(d, 1); return d; };

check('setup', 'الجداول والدوال موجودة والصفوف محمية', n(await val(`SELECT count(*) FROM pg_class WHERE relname IN ('employee_details','employee_leave_requests') AND relrowsecurity`)) === 2
  && n(await val(`SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN
    ('employee_details_upsert','employee_leave_request','employee_leave_decide','employee_leave_cancel','employee_leave_end_early','employee_leave_balance','employees_on_leave')`)) === 7);
check('setup', 'اليوم المحلي في ليبيا يطابق ساعة طرابلس', TODAY === new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Tripoli' }), `db=${TODAY}`);

await as('owner');
const mk = async (name, hire = '2024-03-01', kind = 'EMPLOYEE') => {
  const r = await val(`SELECT create_contact($1::jsonb)`, [JSON.stringify({ kind, name, job_title: 'موظف', hire_date: hire, salary: 2000 })]);
  return r?.id ?? r;
};
const E = {
  a: await mk('موظف الإجازات أ'), b: await mk('موظف الرصيد ب'), c: await mk('موظف الحد ج'), d: await mk('موظف بلا ملف د'),
  e: await mk('موظف الأدوار هـ'), f: await mk('موظف الإلغاء و'), g: await mk('موظف الإنهاء المبكر ز'), h: await mk('موظف المتواجدون ح'),
  late: await mk('موظف عُيّن حديثاً', '2026-06-01'), x: await mk('موظف القرارات س'), rel: await mk('موظف التواريخ النسبية ع'),
};
const TENANT = await val(`SELECT create_contact($1::jsonb)`, [JSON.stringify({ kind: 'TENANT', name: 'مستأجر ليس موظفاً', shop_number: 'LV-1', monthly_rent: 500 })]).then((r) => r?.id ?? r);

const call = (sql, p) => attempt(() => val(sql, p));
const request = (who, emp, type, s, e, reason = null, approve = false, override = null) =>
  (async () => { await as(who); return call(`SELECT employee_leave_request($1, $2, $3::date, $4::date, $5, $6, $7)`, [emp, type, s, e, reason, approve, override]); })();
const decide = (who, id, approve, note = null, override = false) =>
  (async () => { await as(who); return call(`SELECT employee_leave_decide($1, $2, $3, $4)`, [id, approve, note, override]); })();
const cancel = (who, id, reason = 'تغيّرت الخطة') =>
  (async () => { await as(who); return call(`SELECT employee_leave_cancel($1, $2)`, [id, reason]); })();
const request_row = (id) => one(`SELECT *, start_date::text AS s, end_date::text AS e FROM employee_leave_requests WHERE id = $1`, [id]);
const balance = async (emp, year) => {
  await as('accountant');
  const r = await rows(`SELECT * FROM employee_leave_balance($1, $2)`, [emp, year]);
  return Object.fromEntries(r.map((x) => [x.leave_type, { entitlement: x.entitlement == null ? null : n(x.entitlement), carry: x.carry_over == null ? null : n(x.carry_over), taken: n(x.taken), pending: n(x.pending), remaining: x.remaining == null ? null : n(x.remaining) }]));
};
const upsert = (who, emp, fields = {}) =>
  (async () => {
    await as(who);
    const f = { employment_type: null, national_id: null, birth_date: null, contract_end: null, probation_end: null, bank_name: null, bank_account: null, iban: null,
      emergency_name: null, emergency_phone: null, annual: null, carry: null, carry_year: null, term_date: null, term_reason: null, notes: null, ...fields };
    return call(`SELECT employee_details_upsert($1, $2, $3, $4::date, $5::date, $6::date, $7, $8, $9, $10, $11, $12, $13, $14, $15::date, $16, $17)`,
      [emp, f.employment_type, f.national_id, f.birth_date, f.contract_end, f.probation_end, f.bank_name, f.bank_account, f.iban, f.emergency_name, f.emergency_phone,
        f.annual, f.carry, f.carry_year, f.term_date, f.term_reason, f.notes]);
  })();

// ── working days: the database and the screen's rules agree ─────────────────
{
  await actAs(db, 'superuser');
  const pairs = [];
  for (let s = 0; s < 40; s += 1) for (const len of [0, 1, 2, 4, 6, 7, 9, 13, 20, 40]) pairs.push([addDaysISO('2026-12-10', s), addDaysISO('2026-12-10', s + len)]);
  for (let s = 0; s < 10; s += 1) pairs.push([addDaysISO('2028-02-24', s), addDaysISO('2028-03-03', s)]);
  const sql = await rows(`SELECT t.s, t.e, leave_working_days(t.s::date, t.e::date)::int AS d FROM unnest($1::text[], $2::text[]) AS t(s, e)`, [pairs.map((p) => p[0]), pairs.map((p) => p[1])]);
  const wrong = sql.filter((r) => r.d !== L.workingDays(r.s, r.e));
  check('parity', `أيام العمل: ${sql.length} فترة تتطابق بين الدالة وlibs/leave.ts (الجمعة والسبت عطلة)`, wrong.length === 0, wrong.slice(0, 3).map((r) => `${r.s}..${r.e}: db=${r.d} app=${L.workingDays(r.s, r.e)}`).join(' | '));
  const nexts = await rows(`SELECT d::text AS d, leave_next_working_day(d::date)::text AS nxt FROM unnest($1::text[]) AS t(d)`, [Array.from({ length: 21 }, (_, i) => addDaysISO('2026-10-18', i))]);
  check('parity', 'يوم العودة المتوقع يتطابق بين الدالة والتطبيق', nexts.every((r) => r.nxt === L.nextWorkingDay(r.d)), nexts.filter((r) => r.nxt !== L.nextWorkingDay(r.d)).map((r) => r.d).join(','));
  const inYear = await rows(`SELECT leave_days_in_year('2026-12-28', '2027-01-05', y)::int AS d, y FROM unnest(ARRAY[2025, 2026, 2027, 2028]) y ORDER BY y`);
  check('parity', 'أيام إجازة تعبر رأس السنة تُقسَّم: 0 / 4 / 3 / 0', inYear.map((r) => r.d).join('/') === '0/4/3/0', inYear.map((r) => r.d).join('/'));
  check('parity', 'العدّ يتطابق مع التطبيق للسنوات الثلاث نفسها', inYear.every((r) => r.d === L.workingDaysInYear('2026-12-28', '2027-01-05', r.y)));
  const labels = await rows(`SELECT t, leave_type_label(t) AS l FROM unnest($1::text[]) AS x(t)`, [[...L.LEAVE_TYPES, 'NOPE']]);
  check('parity', 'أسماء أنواع الإجازة في سجل الموظف تطابق أسماءها على الشاشة', labels.every((r) => r.l === L.leaveTypeLabel(r.t)), JSON.stringify(labels.filter((r) => r.l !== L.leaveTypeLabel(r.t))));
  const counts = [1, 2, 3, 4, 5, 9, 10, 11, 12, 22, 23, 100];
  const dl = await rows(`SELECT n, leave_days_label(n::numeric) AS l FROM unnest($1::int[]) AS t(n)`, [counts]);
  check('parity', 'عدد أيام العمل في سجل الموظف يوافق مفرده ومثناه وجمعه كما على الشاشة', dl.every((r) => r.l === L.workingDaysLabel(r.n)), JSON.stringify(dl.filter((r) => r.l !== L.workingDaysLabel(r.n))));
  const rl = await rows(`SELECT leave_range_label('2026-02-01'::date, '2026-02-05'::date) AS a, leave_range_label('2026-02-01'::date, '2026-02-01'::date) AS b`);
  check('parity', 'المدة في سجل الموظف: «من… إلى…» ويوم واحد «بتاريخ…»', rl[0].a === 'من 01/02/2026 إلى 05/02/2026' && rl[0].b === 'بتاريخ 01/02/2026', JSON.stringify(rl[0]));
}

// ── security: who can reach what ────────────────────────────────────────────
{
  await actAs(db, 'anon');
  check('security', 'الزائر المجهول لا يستدعي دوال الإجازات', !(await call(`SELECT employee_leave_balance($1, 2026)`, [E.a])).ok
    && !(await call(`SELECT employees_on_leave(CURRENT_DATE)`)).ok && !(await call(`SELECT employee_leave_request($1, 'SICK', '2026-03-01', '2026-03-02')`, [E.a])).ok);
  await as('owner');
  const internal = await call(`SELECT leave_working_days('2026-03-01', '2026-03-05')`);
  check('security', 'دوال المساعدة الداخلية لا تُستدعى من الواجهة', !internal.ok && !(await call(`SELECT leave_require('manage')`)).ok && !(await call(`SELECT leave_used($1, 2026, 'ANNUAL', 'APPROVED')`, [E.a])).ok, internal.error);
  const direct = await attempt(() => db.query(`INSERT INTO employee_leave_requests (employee_id, leave_type, start_date, end_date, days, status, decided_at) VALUES ($1, 'ANNUAL', '2026-03-01', '2026-03-05', 5, 'APPROVED', now())`, [E.a]));
  check('security', 'لا إدراج مباشر في جدول الإجازات حتى للمالك', !direct.ok, direct.error);
  const directDetails = await attempt(() => db.query(`INSERT INTO employee_details (employee_id) VALUES ($1)`, [E.a]));
  const directUpdate = await attempt(() => db.query(`UPDATE employee_leave_requests SET status = 'APPROVED'`));
  const directDelete = await attempt(() => db.query(`DELETE FROM employee_details`));
  check('security', 'لا إدراج أو تعديل أو حذف مباشر على الجداول', !directDetails.ok && !directUpdate.ok && !directDelete.ok);

  for (const who of ['cashier', 'viewer']) {
    check('security', `${who} لا يطلب إجازة`, !(await request(who, E.a, 'SICK', '2026-03-01', '2026-03-02')).ok);
    check('security', `${who} لا يفتح ملف موظف`, !(await upsert(who, E.a, { annual: 20 })).ok);
    check('security', `${who} لا يرى رصيد الإجازات`, !(await (async () => { await as(who); return call(`SELECT * FROM employee_leave_balance($1, 2026)`, [E.a]); })()).ok);
  }
  const acc = await request('accountant', E.a, 'SICK', '2026-03-01', '2026-03-02', 'مرض');
  check('security', 'المحاسب يطلب إجازة (بانتظار القرار)', acc.ok && (await request_row(acc.value))?.status === 'PENDING', acc.error);
  check('security', 'المحاسب لا يعتمد إجازة بنفسه عند الطلب', has(await request('accountant', E.a, 'SICK', '2026-04-05', '2026-04-06', null, true), 'للمالك أو المدير'));
  check('security', 'المحاسب لا يعتمد طلباً (فصل المهام)', !(await decide('accountant', acc.value, true)).ok);
  check('security', 'المحاسب لا يتجاوز الرصيد (التجاوز للمالك والمدير)', !(await request('accountant', E.a, 'ANNUAL', '2026-04-05', '2026-04-06', null, false, 'سبب')).ok);
  check('security', 'أمين الخزينة لا يعتمد', !(await decide('cashier', acc.value, true)).ok);
  const byAdmin = await decide('admin', acc.value, true, 'موافق');
  check('security', 'المدير يعتمد', byAdmin.ok && (await request_row(acc.value))?.status === 'APPROVED', byAdmin.error);
  await as('accountant');
  check('security', 'المحاسب يرى جدول الإجازات وملفات الموظفين', n(await val(`SELECT count(*) FROM employee_leave_requests`)) > 0);
  await upsert('accountant', E.a, { annual: 30 });
  await as('accountant');
  check('security', 'المحاسب يرى ملف الموظف', n(await val(`SELECT count(*) FROM employee_details`)) === 1);
  for (const who of ['cashier', 'viewer']) {
    await as(who);
    check('security', `${who} لا يقرأ الجداول مباشرة`, n(await val(`SELECT count(*) FROM employee_leave_requests`)) === 0 && n(await val(`SELECT count(*) FROM employee_details`)) === 0);
  }
  await as('cashier');
  const cashierSees = await rows(`SELECT * FROM employees_on_leave($1::date)`, ['2026-03-01']);
  check('security', 'أمين الخزينة يرى من في إجازة بلا سبب ولا ملاحظة', cashierSees.length === 1 && !('reason' in cashierSees[0]) && !('decision_note' in cashierSees[0]), JSON.stringify(cashierSees[0]));
  await as('viewer');
  check('security', 'المشاهد لا يرى أحداً (لا خطأ، قائمة فارغة)', (await rows(`SELECT * FROM employees_on_leave($1::date)`, ['2026-03-01'])).length === 0);
}

// ── the employee file ───────────────────────────────────────────────────────
{
  const created = await upsert('accountant', E.b, {
    employment_type: 'CONTRACT', national_id: '119900112233', birth_date: '1990-05-17', contract_end: '2027-03-01', bank_name: 'مصرف الواحة', bank_account: '0012345',
    iban: 'ly83 0020 0000 0000 1234 5678 9', emergency_name: 'عمر', emergency_phone: '0912222222', annual: 24, carry: 5, notes: 'ملاحظة',
  });
  check('details', 'المحاسب يفتح ملف الموظف', created.ok, created.error);
  await actAs(db, 'superuser');
  const d = await one(`SELECT *, contract_end::text AS ce FROM employee_details WHERE employee_id = $1`, [E.b]);
  check('details', 'الآيبان يُحفظ بلا مسافات وبأحرف كبيرة', d?.iban === 'LY83002000000000123456789', d?.iban);
  check('details', 'نوع التوظيف والأيام والرصيد المرحّل محفوظة', d?.employment_type === 'CONTRACT' && near(d.annual_leave_days, 24) && near(d.leave_carry_over, 5) && d.ce === '2027-03-01');
  check('details', 'الرصيد المرحّل بلا سنة يُنسب للسنة الحالية', d?.leave_carry_over_year === Number(TODAY.slice(0, 4)), String(d?.leave_carry_over_year));
  check('details', 'ملف الموظف لا يغيّر بطاقته', n(await val(`SELECT salary FROM contacts WHERE id = $1`, [E.b])) === 2000);
  const audit = await rows(`SELECT summary_ar, metadata FROM audit_log WHERE entity_type = 'employee' AND entity_id = $1 AND metadata->>'event' = 'employee_details'`, [E.b]);
  check('details', 'فتح الملف يُسجَّل في سجل الموظف', audit.length === 1 && audit[0].summary_ar.includes('فتح ملف الموظف'), audit[0]?.summary_ar);

  // a second save of the same file changes nothing and writes nothing; the stored year is kept
  await upsert('accountant', E.b, { employment_type: 'CONTRACT', national_id: '119900112233', birth_date: '1990-05-17', contract_end: '2027-03-01', bank_name: 'مصرف الواحة',
    bank_account: '0012345', iban: 'LY83002000000000123456789', emergency_name: 'عمر', emergency_phone: '0912222222', annual: 24, carry: 5, notes: 'ملاحظة' });
  await actAs(db, 'superuser');
  check('details', 'حفظ ملف لم يتغيّر لا يكتب في السجل', n(await val(`SELECT count(*) FROM audit_log WHERE entity_type = 'employee' AND entity_id = $1 AND metadata->>'event' = 'employee_details'`, [E.b])) === 1);

  // changing one thing logs that thing and does not copy identity or bank values into the log
  await upsert('accountant', E.b, { employment_type: 'CONTRACT', national_id: '119900112233', birth_date: '1990-05-17', contract_end: '2027-03-01', bank_name: 'مصرف الواحة',
    bank_account: '9999999', iban: 'LY83002000000000123456789', emergency_name: 'عمر', emergency_phone: '0912222222', annual: 24, carry: 5, notes: 'ملاحظة' });
  await actAs(db, 'superuser');
  const changed = await one(`SELECT summary_ar, metadata::text AS m FROM audit_log WHERE entity_type = 'employee' AND entity_id = $1 AND metadata->>'event' = 'employee_details' ORDER BY created_at DESC LIMIT 1`, [E.b]);
  check('details', 'تعديل الحساب المصرفي يُسجَّل بالاسم فقط، بلا رقم الحساب', changed.summary_ar.includes('الحساب المصرفي') && !changed.m.includes('9999999') && !changed.m.includes('0012345') && !changed.m.includes('LY83'), changed.summary_ar);

  // carry-over year: kept while the carry-over is unchanged, reset to the current year when it changes
  await actAs(db, 'superuser');
  await db.query(`UPDATE employee_details SET leave_carry_over_year = 2026 WHERE employee_id = $1`, [E.b]);
  await upsert('accountant', E.b, { employment_type: 'CONTRACT', annual: 24, carry: 5, notes: 'تعديل لاحق' });
  await actAs(db, 'superuser');
  check('details', 'تعديل ملف بالرصيد المرحّل نفسه يُبقي سنته (لا يمنحه من جديد)', n(await val(`SELECT leave_carry_over_year FROM employee_details WHERE employee_id = $1`, [E.b])) === 2026);
  await upsert('accountant', E.b, { annual: 24, carry: 7 });
  await actAs(db, 'superuser');
  check('details', 'تغيير الرصيد المرحّل بلا سنة يجعله للسنة الحالية', n(await val(`SELECT leave_carry_over_year FROM employee_details WHERE employee_id = $1`, [E.b])) === Number(TODAY.slice(0, 4)));
  await upsert('accountant', E.b, { annual: 24, carry: 5, carry_year: 2026, employment_type: 'CONTRACT' });
  await actAs(db, 'superuser');
  const keep = await one(`SELECT employment_type, annual_leave_days, leave_carry_over FROM employee_details WHERE employee_id = $1`, [E.b]);
  check('details', 'النوع والأيام والرصيد تبقى كما هي عند تركها فارغة', keep.employment_type === 'CONTRACT' && near(keep.annual_leave_days, 24) && near(keep.leave_carry_over, 5));
  await upsert('accountant', E.b, {});
  await actAs(db, 'superuser');
  const kept = await one(`SELECT employment_type, annual_leave_days, leave_carry_over, national_id FROM employee_details WHERE employee_id = $1`, [E.b]);
  check('details', 'ترك النوع والأيام والرصيد فارغة يُبقيها، وترك غيرها فارغاً يمسحها', kept.employment_type === 'CONTRACT' && near(kept.annual_leave_days, 24) && near(kept.leave_carry_over, 5) && kept.national_id === null);
  await upsert('accountant', E.b, { annual: 24, carry: 5, carry_year: 2026 });

  const bad = [
    ['آيبان غير صحيح', { iban: 'LY83' }, 'الآيبان'],
    ['نوع توظيف مجهول', { employment_type: 'HOBBY' }, 'نوع التوظيف'],
    ['تاريخ ميلاد في المستقبل', { birth_date: day(30) }, 'الماضي'],
    ['أيام إجازة سنوية فوق 120', { annual: 200 }, 'بين 0 و120'],
    ['رصيد مرحّل سالب', { carry: -1 }, 'بين 0 و120'],
    ['إنهاء خدمة بلا سبب', { term_date: day(10) }, 'سبب انتهاء الخدمة'],
    ['إنهاء خدمة قبل التعيين', { term_date: '2023-01-01', term_reason: 'استقالة' }, 'قبل تاريخ التعيين'],
  ];
  for (const [name, fields, text] of bad) {
    const r = await upsert('accountant', E.c, fields);
    check('details', `يُرفض: ${name}`, has(r, text), r.error);
  }
  check('details', 'ملف لجهة ليست موظفاً يُرفض', has(await upsert('accountant', TENANT, { annual: 20 }), 'ليس من نوع موظف'));
  check('details', 'ملف لمعرّف غير موجود يُرفض', !(await upsert('accountant', '99999999-9999-4999-8999-999999999999', { annual: 20 })).ok);
}

// ── requesting leave ────────────────────────────────────────────────────────
let reqSun5;
{
  // Sun 2026-02-01 .. Thu 2026-02-05 is five working days
  const r = await request('accountant', E.a, 'ANNUAL', '2026-02-01', '2026-02-05', 'إجازة سنوية');
  reqSun5 = r.value;
  const row = r.ok ? await request_row(r.value) : null;
  check('request', 'طلب سنوية من الأحد إلى الخميس = 5 أيام، بانتظار القرار', r.ok && n(row.days) === 5 && row.status === 'PENDING' && row.decided_at === null && row.created_by === U.accountant, r.error);
  const r2 = await request('accountant', E.b, 'SICK', '2026-02-05', '2026-02-08', 'مرض');
  check('request', 'الخميس إلى الأحد = يومان (الجمعة والسبت خارج العدّ)', r2.ok && n((await request_row(r2.value)).days) === 2, r2.error);
  const wk = await request('accountant', E.b, 'SICK', '2026-02-13', '2026-02-14');
  check('request', 'فترة كلها جمعة وسبت تُرفض', has(wk, 'عطلة أسبوعية'), wk.error);
  const long = await request('accountant', E.b, 'SICK', '2026-03-01', '2026-03-03', null);
  check('request', 'إجازة مرضية بلا سبب مقبولة (السبب إلزامي للأخرى فقط)', long.ok, long.error);
  check('request', 'نوع «أخرى» يحتاج سبباً', has(await request('accountant', E.b, 'OTHER', '2026-03-08', '2026-03-09', ' '), 'اكتب سبب'));
  check('request', 'نوع «أخرى» بسبب مقبول', (await request('accountant', E.b, 'OTHER', '2026-03-08', '2026-03-09', 'مراجعة جهة حكومية')).ok);
  check('request', 'نوع مجهول يُرفض', has(await request('accountant', E.b, 'VACATION', '2026-05-03', '2026-05-04'), 'نوع الإجازة'));
  check('request', 'نهاية قبل البداية تُرفض', has(await request('accountant', E.b, 'SICK', '2026-05-05', '2026-05-03'), 'قبل تاريخ بدايتها'));
  check('request', 'تاريخ ناقص يُرفض', has(await request('accountant', E.b, 'SICK', null, '2026-05-03'), 'حدّد'));
  check('request', 'إجازة أطول من سنة تُرفض', has(await request('accountant', E.b, 'UNPAID', '2026-01-01', '2027-02-01'), 'أطول من سنة'));
  check('request', 'سنة غير معقولة (2019 أو بعد سنتين) تُرفض', has(await request('accountant', E.b, 'SICK', '2019-05-05', '2019-05-06'), 'غير معقول')
    && has(await request('accountant', E.b, 'SICK', day(800), day(801)), 'غير معقول'));
  check('request', 'إجازة قبل تاريخ تعيين الموظف تُرفض', has(await request('accountant', E.late, 'SICK', '2026-05-03', '2026-05-04'), 'قبل تاريخ تعيين'));
  check('request', 'إجازة لجهة ليست موظفاً تُرفض', has(await request('accountant', TENANT, 'SICK', '2026-05-03', '2026-05-04'), 'ليس من نوع موظف'));
  const withApprove = await request('owner', E.b, 'SICK', '2026-04-05', '2026-04-06', null, true);
  const wa = withApprove.ok ? await request_row(withApprove.value) : null;
  check('request', 'المالك يسجّل إجازة معتمدة مباشرة', withApprove.ok && wa.status === 'APPROVED' && wa.decided_by === U.owner && wa.decided_at, withApprove.error);
  // the number of days comes from the dates, never from the caller
  await actAs(db, 'superuser');
  const stored = await rows(`SELECT days, start_date::text AS s, end_date::text AS e FROM employee_leave_requests WHERE employee_id = $1`, [E.b]);
  check('parity', 'الأيام المخزّنة في كل طلب = عدّ التطبيق للتواريخ نفسها', stored.every((r) => n(r.days) === L.workingDays(r.s, r.e)), JSON.stringify(stored.filter((r) => n(r.days) !== L.workingDays(r.s, r.e))));
}

// ── overlap ─────────────────────────────────────────────────────────────────
{
  // dates are relative to today so that cancelling (allowed only before a leave starts) works on any day the test runs
  const S = nextSunday(day(100));
  const d = (k) => addDaysISO(S, k);
  const base = await request('accountant', E.e, 'SICK', d(0), d(4)); // Sun..Thu
  const clash = await request('accountant', E.e, 'SICK', d(3), d(7));
  const fmt = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  check('overlap', 'فترة تتداخل مع طلب بانتظار القرار تُرفض وتذكر تواريخه', has(clash, 'بانتظار القرار') && String(clash.error).includes(fmt(d(0))) && String(clash.error).includes(fmt(d(4))) && clash.code === '23P01', clash.error);
  check('overlap', 'يوم واحد مشترك كافٍ للتداخل', has(await request('accountant', E.e, 'ANNUAL', d(4), d(11)), 'تتداخل'));
  check('overlap', 'فترة تحتوي طلباً قائماً تُرفض', has(await request('accountant', E.e, 'SICK', d(-6), d(30)), 'تتداخل'));
  check('overlap', 'اليوم التالي مباشرة لا يتداخل', (await request('accountant', E.e, 'SICK', d(5), d(9))).ok);
  check('overlap', 'موظف آخر في التواريخ نفسها مسموح', (await request('accountant', E.f, 'SICK', d(0), d(4))).ok);
  await decide('owner', base.value, true);
  check('overlap', 'التداخل مع إجازة معتمدة يُرفض أيضاً', has(await request('accountant', E.e, 'SICK', d(1), d(2)), 'معتمدة'));
  const cancelled = await cancel('owner', base.value, 'ألغيت لاختبار التداخل');
  check('overlap', 'تُلغى الإجازة المعتمدة التي لم تبدأ', cancelled.ok, cancelled.error);
  const reopened = await request('accountant', E.e, 'SICK', d(1), d(2));
  check('overlap', 'بعد الإلغاء تُفتح التواريخ من جديد', reopened.ok, reopened.error);
  const rej = await request('accountant', E.f, 'SICK', d(14), d(18));
  await decide('owner', rej.value, false, 'ضغط العمل');
  check('overlap', 'الطلب المرفوض لا يمنع غيره', (await request('accountant', E.f, 'SICK', d(15), d(16))).ok);

  // the trigger holds even for writes that skip the functions
  await actAs(db, 'superuser');
  const direct = await attempt(() => db.query(`INSERT INTO employee_leave_requests (employee_id, leave_type, start_date, end_date, days, status) VALUES ($1, 'SICK', $2::date, $2::date, 1, 'PENDING')`, [E.e, d(1)]));
  check('overlap', 'الإدراج المباشر المتداخل يُرفض بالمشغّل أيضاً', !direct.ok && direct.code === '23P01', direct.error);
  const revive = await attempt(() => db.query(`UPDATE employee_leave_requests SET status = 'PENDING', cancelled_at = NULL WHERE id = $1`, [base.value]));
  check('overlap', 'إعادة إحياء طلب ملغى فوق إجازة قائمة تُرفض', !revive.ok && revive.code === '23P01', revive.error);
  const moveInto = await attempt(() => db.query(`UPDATE employee_leave_requests SET start_date = $2::date, end_date = $3::date, days = 5 WHERE id = $1`, [reopened.value, d(5), d(9)]));
  check('overlap', 'وتحريك طلب فوق طلب قائم يُرفض أيضاً', !moveInto.ok && moveInto.code === '23P01', moveInto.error);
}

// ── annual balance: carry-over, pending, taken, the year boundary ───────────
{
  // E.b has 24 days a year and 5 carried into 2026 (see the file section); give a clean slate with its own requests
  await actAs(db, 'superuser');
  await db.query(`DELETE FROM employee_leave_requests WHERE employee_id = $1`, [E.b]);
  await upsert('accountant', E.b, { annual: 30, carry: 5, carry_year: 2026, employment_type: 'FULL_TIME' });
  const a1 = await request('owner', E.b, 'ANNUAL', '2026-02-01', '2026-02-05', null, true); // 5 approved
  const a2 = await request('accountant', E.b, 'ANNUAL', '2026-04-05', '2026-04-09'); // 5 pending
  const s1 = await request('owner', E.b, 'SICK', '2026-03-01', '2026-03-03', null, true); // 3
  const u1 = await request('owner', E.b, 'UNPAID', '2026-05-03', '2026-05-04', null, true); // 2
  const x1 = await request('accountant', E.b, 'ANNUAL', '2026-08-02', '2026-08-06');
  await cancel('accountant', x1.value);
  const x2 = await request('accountant', E.b, 'ANNUAL', '2026-09-06', '2026-09-10');
  await decide('owner', x2.value, false, 'غير ممكن في هذا الأسبوع');
  check('balance', 'مدخلات الرصيد صحيحة', [a1, a2, s1, u1, x1, x2].every((r) => r.ok), [a1, a2, s1, u1, x1, x2].map((r) => r.error).filter(Boolean).join(' | '));
  const b = await balance(E.b, 2026);
  check('balance', 'الاستحقاق = 30 + 5 مرحّلة، المأخوذ 5، المعلّق 5، المتبقي 25', b.ANNUAL.entitlement === 35 && b.ANNUAL.carry === 5 && b.ANNUAL.taken === 5 && b.ANNUAL.pending === 5 && b.ANNUAL.remaining === 25, JSON.stringify(b.ANNUAL));
  check('balance', 'المرضية والبلا راتب عدّادات بلا استحقاق، والملغى والمرفوض لا يُحسبان', b.SICK.taken === 3 && b.SICK.entitlement === null && b.SICK.remaining === null && b.UNPAID.taken === 2 && b.ANNUAL.taken + b.ANNUAL.pending === 10, JSON.stringify(b));
  const order = (await (async () => { await as('accountant'); return rows(`SELECT leave_type FROM employee_leave_balance($1, 2026)`, [E.b]); })()).map((r) => r.leave_type).join(',');
  check('balance', 'ستة أسطر بترتيب ثابت', order === 'ANNUAL,SICK,UNPAID,EMERGENCY,MATERNITY,OTHER', order);

  // the app computes the same lines from the same requests
  await actAs(db, 'superuser');
  const reqs = await rows(`SELECT id, employee_id, leave_type, status, start_date::text AS start_date, end_date::text AS end_date FROM employee_leave_requests WHERE employee_id = $1`, [E.b]);
  const app = L.computeBalance(reqs, { year: 2026, annualDays: 30, carryOver: 5, carryOverYear: 2026 });
  const sameLines = app.every((l) => l.taken === b[l.type].taken && l.pending === b[l.type].pending && (l.remaining ?? null) === b[l.type].remaining && (l.entitlement ?? null) === b[l.type].entitlement);
  check('parity', 'الرصيد: التطبيق يحسب السطور الستة كما تحسبها الدالة', sameLines, JSON.stringify(app.map((l) => [l.type, l.taken, l.pending, l.remaining])));

  // across New Year: Sun 2026-12-27 .. Wed 2027-01-06 is 5 days in 2026 and 4 in 2027
  const ny = await request('owner', E.b, 'ANNUAL', '2026-12-27', '2027-01-06', null, true);
  const b26 = await balance(E.b, 2026);
  const b27 = await balance(E.b, 2027);
  check('balance', 'إجازة عبر رأس السنة: 5 أيام تُخصم من 2026 و4 من 2027', ny.ok && b26.ANNUAL.taken === 10 && b27.ANNUAL.taken === 4, `${b26.ANNUAL.taken}/${b27.ANNUAL.taken} ${ny.error ?? ''}`);
  check('balance', 'الرصيد المرحّل لا ينتقل إلى 2027: الاستحقاق 30', b27.ANNUAL.entitlement === 30 && b27.ANNUAL.carry === 0 && b27.ANNUAL.remaining === 26, JSON.stringify(b27.ANNUAL));
  const none = await balance(E.b, 2030);
  check('balance', 'سنة بلا إجازات: الاستحقاق كاملاً والمأخوذ صفر', none.ANNUAL.entitlement === 30 && none.ANNUAL.taken === 0 && none.ANNUAL.remaining === 30);
  const fresh = await balance(E.d, 2026);
  check('balance', 'موظف بلا ملف: 30 يوماً افتراضياً', fresh.ANNUAL.entitlement === 30 && fresh.ANNUAL.carry === 0 && fresh.ANNUAL.remaining === 30, JSON.stringify(fresh.ANNUAL));
  check('balance', 'سنة غير صحيحة تُرفض', !(await call(`SELECT * FROM employee_leave_balance($1, 1999)`, [E.b])).ok);
  check('balance', 'رصيد جهة ليست موظفاً يُرفض', !(await call(`SELECT * FROM employee_leave_balance($1, 2026)`, [TENANT])).ok);
  const defYear = await rows(`SELECT count(*) AS c FROM employee_leave_balance($1)`, [E.b]);
  check('balance', 'بلا سنة تُحسب السنة الحالية', n(defYear[0].c) === 6);
}

// ── the annual balance never goes below zero without a written reason ───────
let overridden;
{
  await upsert('accountant', E.c, { annual: 10, carry: 0 });
  const eleven = await request('accountant', E.c, 'ANNUAL', '2026-01-04', '2026-01-15'); // Sun 4 .. Thu 15 = 10 days
  check('limit', 'إجازة تساوي الرصيد تماماً مقبولة', eleven.ok, eleven.error);
  const over = await request('accountant', E.c, 'ANNUAL', '2026-02-01', '2026-02-01');
  check('limit', 'يوم زائد يُرفض برمز LV001 ورسالة بالمتاح والمطلوب', !over.ok && over.code === 'LV001' && String(over.error).includes('المتاح 0') && String(over.error).includes('المطلوب 1'), over.error);
  check('limit', 'الرسالة تقول من يستطيع التجاوز', String(over.error).includes('المالك أو المدير'));
  // the app's check says the same before anything is sent
  await actAs(db, 'superuser');
  const reqsC = await rows(`SELECT id, employee_id, leave_type, status, start_date::text AS start_date, end_date::text AS end_date FROM employee_leave_requests WHERE employee_id = $1`, [E.c]);
  const appCheck = L.checkAnnualBalance(reqsC, { start: '2026-02-01', end: '2026-02-01', annualDays: 10, carryOver: 0, carryOverYear: null });
  check('parity', 'فحص الرصيد في التطبيق يرفض الطلب نفسه ويعطي المتاح والمطلوب نفسيهما', !appCheck.ok && appCheck.years[0].available === 0 && appCheck.years[0].need === 1);
  const okCheck = L.checkAnnualBalance(reqsC, { start: '2026-01-04', end: '2026-01-15', annualDays: 10, carryOver: 0, carryOverYear: null, excludeId: eleven.value });
  check('parity', 'ويقبل التعديل على الطلب نفسه (لا يحسب أيامه مرتين)', okCheck.ok);

  const noWords = await request('owner', E.c, 'ANNUAL', '2026-02-01', '2026-02-01', null, false, '  ');
  check('limit', 'المالك بلا سبب مكتوب لا يتجاوز', !noWords.ok && noWords.code === 'LV001', noWords.error);
  const short = await request('owner', E.c, 'ANNUAL', '2026-02-01', '2026-02-01', null, false, 'ab');
  check('limit', 'سبب التجاوز أقل من 3 أحرف يُرفض', has(short, 'سبب تجاوز'), short.error);
  overridden = await request('owner', E.c, 'ANNUAL', '2026-02-01', '2026-02-01', null, false, 'حالة وفاة في العائلة');
  const ov = overridden.ok ? await request_row(overridden.value) : null;
  check('limit', 'المالك يتجاوز بسبب مكتوب، ويُحفظ السبب على الطلب', overridden.ok && ov.override_note === 'حالة وفاة في العائلة' && ov.status === 'PENDING', overridden.error);
  const adminOver = await request('admin', E.c, 'ANNUAL', '2026-03-01', '2026-03-01', null, true, 'قرار المدير');
  check('limit', 'المدير يسجّل ويعتمد ويتجاوز في خطوة واحدة', adminOver.ok && (await request_row(adminOver.value)).status === 'APPROVED', adminOver.error);
  const b = await balance(E.c, 2026);
  check('limit', 'الرصيد بعد التجاوز سالب ومعروض كما هو (-2) لا مخفي', b.ANNUAL.remaining === -2 && b.ANNUAL.taken === 1 && b.ANNUAL.pending === 11, JSON.stringify(b.ANNUAL));
  check('limit', 'الإجازة المرضية لا حدّ لها', (await request('accountant', E.c, 'SICK', '2026-04-05', '2026-06-25')).ok);
  check('limit', 'ولا البلا راتب', (await request('accountant', E.c, 'UNPAID', '2026-07-05', '2026-09-24')).ok);

  // an approval counts approved days only, and checks again: the allowance may have been lowered since the request
  await upsert('accountant', E.a, { annual: 30, carry: 0 });
  const pend = await request('accountant', E.a, 'ANNUAL', '2026-09-06', '2026-09-17'); // Sun 6 .. Thu 17 = 10 days
  await upsert('accountant', E.a, { annual: 6, carry: 0 });
  const strict = await decide('owner', pend.value, true);
  check('limit', 'الاعتماد يعيد فحص الرصيد بعد تخفيض الاستحقاق', !strict.ok && strict.code === 'LV001', strict.error);
  check('limit', 'التجاوز عند الاعتماد يحتاج تأكيداً وسبباً', !(await decide('owner', pend.value, true, null, true)).ok && !(await decide('owner', pend.value, true, 'سبب كافٍ', false)).ok);
  const forced = await decide('owner', pend.value, true, 'اتُّفق على التعويض', true);
  const pr = await request_row(pend.value);
  check('limit', 'اعتماد مع تأكيد التجاوز والسبب ينجح ويحفظ السبب', forced.ok && pr.status === 'APPROVED' && pr.override_note === 'اتُّفق على التعويض' && pr.decision_note === 'اتُّفق على التعويض', forced.error);
  const overOwn = await decide('owner', overridden.value, true);
  check('limit', 'طلب سُجّل بتجاوز وبسبب مكتوب يُعتمد دون تكرار التأكيد', overOwn.ok, overOwn.error);
}

// ── decisions ───────────────────────────────────────────────────────────────
{
  const p = await request('accountant', E.x, 'SICK', '2026-08-02', '2026-08-04');
  check('decide', 'الرفض يحتاج سبباً', has(await decide('owner', p.value, false, ' '), 'سبب الرفض'));
  const rej = await decide('owner', p.value, false, 'لا مبرر');
  const row = await request_row(p.value);
  check('decide', 'الرفض يحفظ القرار والسبب وصاحبه', rej.ok && row.status === 'REJECTED' && row.decision_note === 'لا مبرر' && row.decided_by === U.owner && row.decided_at, rej.error);
  check('decide', 'طلب مقرَّر فيه لا يُقرَّر مرتين', has(await decide('owner', p.value, true), 'ليس بانتظار القرار'));
  check('decide', 'قرار فارغ يُرفض', !(await decide('owner', p.value, null)).ok);
  check('decide', 'طلب غير موجود', has(await decide('owner', '99999999-9999-4999-8999-999999999999', true), 'غير موجود'));
}

// ── cancel ──────────────────────────────────────────────────────────────────
let futureApproved;
{
  const start = nextSunday(day(40));
  const end = addDaysISO(start, 4);
  const pend = await request('accountant', E.rel, 'SICK', start, end);
  check('cancel', 'السبب إلزامي للإلغاء', has(await cancel('accountant', pend.value, ' '), 'سبب الإلغاء'));
  const c1 = await cancel('accountant', pend.value, 'تراجع الموظف');
  const r1 = await request_row(pend.value);
  check('cancel', 'المحاسب يسحب طلباً بانتظار القرار', c1.ok && r1.status === 'CANCELLED' && r1.cancelled_by === U.accountant && r1.cancel_reason === 'تراجع الموظف' && r1.cancelled_at, c1.error);
  check('cancel', 'الملغى لا يُلغى ثانية', has(await cancel('owner', pend.value), 'ملغى'));

  const fut = await request('owner', E.rel, 'SICK', start, end, null, true);
  futureApproved = fut.value;
  check('cancel', 'المحاسب لا يلغي إجازة معتمدة', !(await cancel('accountant', fut.value)).ok);
  check('cancel', 'أمين الخزينة لا يلغي', !(await cancel('cashier', fut.value)).ok);
  const c2 = await cancel('owner', fut.value, 'قرار المالك');
  check('cancel', 'المالك يلغي إجازة معتمدة لم تبدأ', c2.ok && (await request_row(fut.value)).status === 'CANCELLED', c2.error);
  const rebook = await request('accountant', E.rel, 'SICK', start, end);
  check('cancel', 'بعد الإلغاء تُحجز التواريخ ذاتها من جديد', rebook.ok, rebook.error);

  const started = await request('owner', E.rel, 'SICK', day(-10), day(-8), null, true);
  const cs = await cancel('owner', started.value);
  check('cancel', 'إجازة بدأت لا تُلغى، والرسالة تدل على «رجوع مبكر»', has(cs, 'رجوع مبكر') && cs.code === '55000', cs.error);
  const rejected = await request('accountant', E.rel, 'SICK', nextSunday(day(70)), addDaysISO(nextSunday(day(70)), 1));
  await decide('owner', rejected.value, false, 'مرفوض للاختبار');
  check('cancel', 'المرفوض لا يُلغى', has(await cancel('owner', rejected.value), 'مرفوض'));
  const today = await request('owner', E.h, 'SICK', TODAY, TODAY, null, true).then(async (r) => r);
  // a leave that starts today has not been taken yet: it can still be cancelled (when today is a working day it counts)
  if (today.ok) check('cancel', 'إجازة تبدأ اليوم ما زالت تُلغى', (await cancel('owner', today.value)).ok);
  else check('cancel', 'إجازة تبدأ اليوم ما زالت تُلغى', has(today, 'عطلة أسبوعية'), today.error);
}

// ── end early ───────────────────────────────────────────────────────────────
{
  const start = day(-3);
  const end = day(7);
  const og = await request('owner', E.g, 'ANNUAL', start, end, null, true);
  const before = await request_row(og.value);
  const newEnd = day(1);
  const wdNew = L.workingDays(start, newEnd);
  const e1 = await (async () => { await as('owner'); return call(`SELECT employee_leave_end_early($1, $2::date, $3)`, [og.value, newEnd, 'عاد إلى العمل']); })();
  const after = await request_row(og.value);
  check('early', 'العودة المبكرة تقصّر الإجازة وتعيد حساب الأيام وتحفظ النهاية الأصلية',
    og.ok && e1.ok && after.e === newEnd && n(after.days) === wdNew && after.original_end_date?.toISOString?.().slice(0, 10) === end && n(before.days) > n(after.days), `${e1.error ?? ''} ${after?.e} ${after?.days}`);
  const b = await balance(E.g, Number(TODAY.slice(0, 4)));
  check('early', 'الأيام التي لم تُؤخذ تعود إلى الرصيد', b.ANNUAL.taken === wdNew || Number(start.slice(0, 4)) !== Number(TODAY.slice(0, 4)), JSON.stringify(b.ANNUAL));
  const e2 = await (async () => { await as('owner'); return call(`SELECT employee_leave_end_early($1, $2::date, $3)`, [og.value, day(0), 'عودة أبكر']); })();
  const after2 = await request_row(og.value);
  check('early', 'تقصير ثانٍ يُبقي النهاية الأصلية الأولى', e2.ok && after2.original_end_date?.toISOString?.().slice(0, 10) === end && after2.e === day(0), e2.error);
  const callEarly = async (who, id, d, reason = 'سبب') => { await as(who); return call(`SELECT employee_leave_end_early($1, $2::date, $3)`, [id, d, reason]); };
  check('early', 'المحاسب لا يقصّر', !(await callEarly('accountant', og.value, day(-1))).ok);
  check('early', 'السبب إلزامي', has(await callEarly('owner', og.value, day(-1), ' '), 'سبب'));
  check('early', 'نهاية لا تقصّر (مساوية أو أبعد) تُرفض', has(await callEarly('owner', og.value, day(0)), 'بين') && has(await callEarly('owner', og.value, day(5)), 'بين'));
  check('early', 'نهاية قبل البداية تُرفض', has(await callEarly('owner', og.value, addDaysISO(start, -1)), 'بين'));
  const pend = await request('accountant', E.g, 'SICK', day(40), day(41));
  check('early', 'تُقصَّر المعتمدة فقط', has(await callEarly('owner', pend.value, day(40)), 'المعتمدة'));
  // a leave that starts on a Friday and is cut back to the weekend leaves no working day
  let fri = day(60);
  while (L.weekdayOf(fri) !== 5) fri = addDaysISO(fri, 1);
  const fl = await request('owner', E.g, 'SICK', fri, addDaysISO(fri, 5), null, true);
  const zero = await callEarly('owner', fl.value, addDaysISO(fri, 1));
  check('early', 'تقصير إلى جمعة وسبت فقط يُرفض ويُوجَّه إلى الإلغاء', fl.ok && has(zero, 'ألغِها'), zero.error ?? fl.error);
}

// ── who is away ─────────────────────────────────────────────────────────────
{
  // E.h: approved Sun 2026-09-06 .. Thu 2026-09-10; pending and rejected leave around it
  const a = await request('owner', E.h, 'SICK', '2026-09-06', '2026-09-10', null, true);
  await request('accountant', E.h, 'SICK', '2026-09-20', '2026-09-24'); // pending
  const rj = await request('accountant', E.h, 'SICK', '2026-10-04', '2026-10-08');
  await decide('owner', rj.value, false, 'لا');
  const S2 = nextSunday(day(120));
  const ca = await request('owner', E.h, 'SICK', S2, addDaysISO(S2, 4), null, true);
  await cancel('owner', ca.value, 'ألغيت');
  const at = async (d, who = 'accountant') => { await as(who); return rows(`SELECT employee_name, leave_type, return_date::text AS back, request_id FROM employees_on_leave($1::date)`, [d]); };
  const names = async (d) => (await at(d)).filter((r) => r.employee_name.includes('المتواجدون'));
  check('away', 'اليوم الأول والأخير والأوسط من الإجازة المعتمدة يظهر فيها الموظف',
    (await names('2026-09-06')).length === 1 && (await names('2026-09-08')).length === 1 && (await names('2026-09-10')).length === 1);
  check('away', 'اليوم قبل البداية وبعد النهاية لا يظهر فيه', (await names('2026-09-05')).length === 0 && (await names('2026-09-11')).length === 0);
  check('away', 'الجمعة بعد الخميس الأخير: لا يظهر، ويوم العودة المتوقع الأحد', (await names('2026-09-11')).length === 0 && (await names('2026-09-08'))[0].back === '2026-09-13', (await names('2026-09-08'))[0]?.back);
  check('away', 'المعلّق والمرفوض والملغى لا يُحسبون إجازة', (await names('2026-09-22')).length === 0 && (await names('2026-10-06')).length === 0 && (await names(addDaysISO(S2, 1))).length === 0);
  check('away', 'أمين الخزينة يرى القائمة نفسها', (await names('2026-09-08')).length === 1 && (await at('2026-09-08', 'cashier')).length >= 1);
  check('away', 'بلا تاريخ تُحسب الإجازات القائمة اليوم', await (async () => { await as('accountant'); return (await rows(`SELECT * FROM employees_on_leave()`)).every((r) => r.start_date <= new Date(TODAY) && r.end_date >= new Date(TODAY)); })());
  check('away', 'لا قائمة مدخلها طلب مؤجَّل: يعاد طلب واحد لكل إجازة', a.ok && (await at('2026-09-08')).filter((r) => r.request_id === a.value).length === 1);
}

// ── termination and the file ────────────────────────────────────────────────
{
  const start = day(30);
  const lv = await request('accountant', E.late, 'SICK', nextSunday(start), addDaysISO(nextSunday(start), 2));
  const blocked = await upsert('accountant', E.late, { term_date: day(5), term_reason: 'استقالة' });
  check('end of service', 'لا يُنهى الإجازة بعد تاريخ انتهاء الخدمة: يُرفض الإنهاء ما دامت هناك إجازة لاحقة', has(blocked, 'توجد إجازة'), blocked.error);
  await cancel('accountant', lv.value, 'تنتهي الخدمة');
  const ok = await upsert('accountant', E.late, { term_date: day(5), term_reason: 'استقالة' });
  check('end of service', 'بعد إلغاء الإجازة يُسجَّل انتهاء الخدمة', ok.ok, ok.error);
  const after = await request('accountant', E.late, 'SICK', nextSunday(day(10)), addDaysISO(nextSunday(day(10)), 1));
  check('end of service', 'لا إجازة بعد انتهاء الخدمة', has(after, 'بعد تاريخ انتهاء خدمة'), after.error);
  const inside = await request('accountant', E.late, 'SICK', addDaysISO(day(0), -5), addDaysISO(day(0), -5));
  check('end of service', 'قبل انتهاء الخدمة (وبعد التعيين) مسموح ما لم تقع في عطلة', inside.ok || has(inside, 'عطلة'), inside.error);
  await actAs(db, 'superuser');
  check('end of service', 'انتهاء الخدمة يُسجَّل بتحذير في سجل الموظف', n(await val(`SELECT count(*) FROM audit_log WHERE entity_type = 'employee' AND entity_id = $1 AND severity = 'warning' AND metadata->>'event' = 'employee_details'`, [E.late])) === 1);
  const clear = await upsert('accountant', E.late, {});
  await actAs(db, 'superuser');
  check('end of service', 'مسح تاريخ الانتهاء يمسح السبب أيضاً', clear.ok && (await val(`SELECT termination_reason FROM employee_details WHERE employee_id = $1`, [E.late])) === null);
}

// ── history ─────────────────────────────────────────────────────────────────
{
  await actAs(db, 'superuser');
  const events = await rows(`SELECT metadata->>'event' AS ev, count(*)::int AS c FROM audit_log WHERE entity_type = 'employee' AND metadata->>'event' LIKE 'leave_%' GROUP BY 1`);
  const ev = Object.fromEntries(events.map((r) => [r.ev, r.c]));
  check('history', 'كل خطوة تُسجَّل: طلب، اعتماد، رفض، إلغاء، تقصير', ['leave_requested', 'leave_approved', 'leave_rejected', 'leave_cancelled', 'leave_shortened'].every((k) => ev[k] > 0), JSON.stringify(ev));
  const sample = await one(`SELECT summary_ar, entity_label_ar, (metadata->>'days')::numeric AS days FROM audit_log WHERE metadata->>'event' = 'leave_requested' ORDER BY created_at DESC LIMIT 1`);
  check('history', 'السطر عربي واضح باسم الموظف ونوع الإجازة وأيام العمل', sample.summary_ar.startsWith('طلب إجازة') && sample.summary_ar.includes(`(${L.workingDaysLabel(n(sample.days))})`) && sample.entity_label_ar.includes('موظف'), sample.summary_ar);
  // every line the module wrote says its count the way the screen does ("1 أيام عمل" never appears), and a single day is not "from X to X"
  const lines = await rows(`SELECT summary_ar, (metadata->>'days')::numeric AS days FROM audit_log WHERE metadata->>'event' IN ('leave_requested', 'leave_approved') AND metadata ? 'days'`);
  const badCount = lines.filter((r) => /(^|[^0-9.])[12] أيام عمل/.test(r.summary_ar) || /\d{2,} أيام عمل/.test(r.summary_ar) && n(r.days) > 10);
  check('history', 'عدد الأيام في كل سطر مطابق لمفرده ومثناه وجمعه', lines.length > 0 && lines.every((r) => r.summary_ar.includes(`(${L.workingDaysLabel(n(r.days))})`)) && badCount.length === 0, JSON.stringify(badCount.slice(0, 2)));
  check('history', 'إجازة يوم واحد تُكتب «بتاريخ» لا «من… إلى…» بالتاريخ نفسه', !lines.some((r) => /من (\d\d\/\d\d\/\d{4}) إلى \1/.test(r.summary_ar)));
  const move = await one(`SELECT summary_ar FROM audit_log WHERE metadata->>'event' = 'employee_details' AND summary_ar LIKE '%الإجازة السنوية%' ORDER BY created_at DESC LIMIT 1`);
  check('history', 'تغيير الاستحقاق السنوي يُسجَّل بقيمته القديمة والجديدة (ليس سراً، ويحدّد الرصيد)', Boolean(move) && /الإجازة السنوية \(من \d+ إلى \d+\)/.test(move.summary_ar), move?.summary_ar);
  check('history', 'تجاوز الرصيد مكتوب في السجل', n(await val(`SELECT count(*) FROM audit_log WHERE metadata->>'event' LIKE 'leave_%' AND (metadata->>'over_balance')::boolean`)) >= 2);
  check('history', 'قيود الدفتر لم تتأثر بأي إجازة', n(await val(`SELECT count(*) FROM journal_entries WHERE description ILIKE '%إجازة%'`)) === 0);
  check('history', 'الإجازة بلا راتب لا تُنشئ حركة رواتب بنفسها', n(await val(`SELECT count(*) FROM payroll_adjustments`)) === 0);
}

// ── the migration comes off and goes back on ────────────────────────────────
{
  await actAs(db, 'superuser');
  const refused = await attempt(() => db.exec(sqlOf('083_employee_leave.ROLLBACK.sql')));
  if (!refused.ok) { try { await db.exec('ROLLBACK'); } catch {} }
  check('rollback', 'التراجع يرفض ما دامت في الجداول بيانات', !refused.ok && String(refused.error).includes('export'), refused.error);
  check('rollback', 'الرفض لا يترك شيئاً ناقصاً (الجدولان والدوال سليمة)', n(await val(`SELECT count(*) FROM employee_leave_requests`)) > 0 && n(await val(`SELECT count(*) FROM pg_proc WHERE proname = 'employee_leave_request'`)) === 1);
  await db.query(`DELETE FROM employee_leave_requests`);
  const refusedDetails = await attempt(() => db.exec(sqlOf('083_employee_leave.ROLLBACK.sql')));
  if (!refusedDetails.ok) { try { await db.exec('ROLLBACK'); } catch {} }
  check('rollback', 'ويرفض كذلك وفي الجداول ملفات موظفين', !refusedDetails.ok && String(refusedDetails.error).includes('Employee files'), refusedDetails.error);
  await db.query(`DELETE FROM employee_details`);
  const back = await attempt(() => db.exec(sqlOf('083_employee_leave.ROLLBACK.sql')));
  if (!back.ok) { try { await db.exec('ROLLBACK'); } catch {} }
  check('rollback', 'وبعد تفريغها يُزال كل أثر', back.ok && (await val(`SELECT to_regclass('public.employee_details')`)) === null && (await val(`SELECT to_regclass('public.employee_leave_requests')`)) === null
    && n(await val(`SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND (proname LIKE 'leave\\_%' OR proname LIKE 'employee\\_leave%' OR proname IN ('employee_details_upsert', 'employees_on_leave'))`)) === 0, back.error);
  const again = await attempt(() => db.exec(sqlOf('083_employee_leave.sql')));
  if (!again.ok) { try { await db.exec('ROLLBACK'); } catch {} }
  check('rollback', 'ويُعاد التطبيق بلا أخطاء، وهو آمن فوق نفسه', again.ok && (await attempt(() => db.exec(sqlOf('083_employee_leave.sql')))).ok, again.error);
}

// ── rent claim start (084) ──────────────────────────────────────────────────
{
  await actAs(db, 'superuser');
  const Y = Number(TODAY.slice(0, 4));
  const ym = (m) => `${Y}-${String(m).padStart(2, '0')}`;
  const CASH = await val(`SELECT id FROM cashboxes WHERE kind = 'CASH' AND active ORDER BY code LIMIT 1`);
  await as('owner');
  const tenant = async (name, extra = {}) => {
    const r = await val(`SELECT create_contact($1::jsonb)`, [JSON.stringify({ kind: 'TENANT', name, shop_number: name.slice(-4), monthly_rent: 1000, ...extra })]);
    return r?.id ?? r;
  };
  const T = {
    late: await tenant('مستأجر بدأ متأخراً A-01', { contract_start: `${Y}-04-10` }),
    paid: await tenant('مستأجر دفع قبل بدايته B-02', { contract_start: `${Y}-04-10` }),
    early: await tenant('مستأجر قديم C-03', { contract_start: `${Y - 1}-06-01` }),
    plain: await tenant('مستأجر بلا تاريخ D-04'),
    sameMonth: await tenant('مستأجر بدأ في شهر العقد E-05', { contract_start: `${Y}-01-20` }),
    noLease: await tenant('مستأجر بلا عقد F-06', { contract_start: `${Y}-03-05` }),
    charged: await tenant('مستأجر له مطالبة غير مسددة G-07', { contract_start: `${Y}-04-10` }),
  };
  for (const id of [T.late, T.paid, T.early, T.plain, T.sameMonth, T.charged]) await val(`SELECT ensure_tenant_lease_contract($1)`, [id]);
  // a payment that predates the card's start (back-entered history), and an unpaid charge for an earlier month
  const pay = await attempt(() => val(`SELECT record_rent_payment($1, 1000, $2::date, $3, NULL, $4::text[], 'CASH')`, [T.paid, `${ym(2)}-05`, CASH, `{${ym(2)}}`]));
  const ens = await attempt(() => val(`SELECT ensure_tenant_rent_charges($1, $2::text[])`, [T.charged, `{${ym(2)}}`]));
  check('claim start', 'تجهيز المستأجرين: دفعة وإنشاء مطالبة لشهر سابق', pay.ok && ens.ok, `${pay.error ?? ''} ${ens.error ?? ''}`);

  const claim = async (id) => val(`SELECT tenant_rent_claim_start($1)::text`, [id]);
  const status = async (id, m) => (await one(`SELECT current_month_status AS s, current_month_amount AS a FROM tenant_rent_summary_for_month($1) WHERE id = $2`, [ym(m), id]));
  const missing = async (id) => (await rows(`SELECT month_key FROM rent_missing_charges($1) WHERE tenant_id = $2 ORDER BY 1`, [ym(9), id])).map((r) => r.month_key);

  await actAs(db, 'superuser');
  const before = {};
  for (const [k, id] of Object.entries(T)) before[k] = await claim(id);
  await as('owner');
  const lateBefore = await status(T.late, 2);
  const missingBefore = await missing(T.late);
  check('claim start', `قبل 084: المستأجر الذي بدأ في أبريل يبدأ مطالبته في 1 يناير ويظهر فبراير غير مسدّد`, before.late === `${Y}-01-01` && lateBefore.s === 'unpaid' && missingBefore.includes(ym(1)), `${before.late} ${lateBefore.s} ${missingBefore.join(',')}`);

  const dry = sqlOf('084_rent_summary_respects_claim_start.sql').split('-- DRY-RUN-BEGIN\n')[1].split('-- DRY-RUN-END')[0].split('\n').map((l) => l.replace(/^-- ?/, '')).join('\n');
  await actAs(db, 'superuser');
  const planned = (await rows(dry)).map((r) => r.name);

  const applied = await attempt(() => db.exec(sqlOf('084_rent_summary_respects_claim_start.sql')));
  if (!applied.ok) { try { await db.exec('ROLLBACK'); } catch {} }
  check('claim start', 'تطبيق 084', applied.ok, applied.error);

  const after = {};
  for (const [k, id] of Object.entries(T)) after[k] = await claim(id);
  check('claim start', 'بعد 084: بداية المطالبة = بداية العقد على البطاقة (10 أبريل)', after.late === `${Y}-04-10`, after.late);
  await as('owner');
  const st = Object.fromEntries(await Promise.all([1, 2, 3, 4, 5].map(async (m) => [m, await status(T.late, m)])));
  check('claim start', 'يناير إلى مارس «بدون مطالبة» بمبلغ صفر، وأبريل فصاعداً مطلوب', [1, 2, 3].every((m) => st[m].s === 'exempt' && n(st[m].a) === 0) && st[4].s === 'unpaid' && n(st[4].a) === 1000 && st[5].s === 'unpaid');
  check('claim start', 'قائمة الأشهر الناقصة لا تعدّ الأشهر قبل البداية', (await missing(T.late)).join(',') === [4, 5, 6, 7, 8, 9].map(ym).join(','), (await missing(T.late)).join(','));
  const view = await one(`SELECT rent_claim_start::text AS s, current_month_status AS st FROM tenant_rent_summary WHERE id = $1`, [T.late]);
  check('claim start', 'العرض tenant_rent_summary يعرض البداية الجديدة نفسها', view.s === `${Y}-04-10`, view.s);
  const cal = await val(`SELECT get_tenant_rent_calendar($1, $2)`, [T.late, Y]);
  const calStatus = Object.fromEntries(cal.months.map((m) => [m.month, m.status]));
  check('claim start', 'تقويم المستأجر يوافق القائمة: يناير إلى مارس معفاة', [1, 2, 3].every((m) => calStatus[ym(m)] === 'exempt') && calStatus[ym(4)] !== 'exempt', JSON.stringify(calStatus));
  check('claim start', 'والتقويم يعيد بداية المطالبة نفسها', String(cal.claim_start).startsWith(`${Y}-04-10`), cal.claim_start);

  check('claim start', 'ما سُجّل قبل البداية لا يُخفى: دفعة فبراير تُبقي البداية 1 يناير', after.paid === `${Y}-01-01`, after.paid);
  check('claim start', 'ومطالبة غير مسددة لفبراير تُبقي البداية كذلك (لا يُخفى ما في الدفتر)', after.charged === `${Y}-01-01`, after.charged);
  await as('owner');
  const paidFeb = await status(T.paid, 2);
  check('claim start', 'شهر فبراير المسدّد يبقى «مسدّد» لا «بدون مطالبة»', paidFeb.s === 'paid_full', paidFeb.s);
  check('claim start', 'من لم يتغيّر: بداية العقد أقدم من العقد، أو لا بداية على البطاقة، أو في شهر العقد نفسه', after.early === before.early && after.plain === before.plain && after.sameMonth === before.sameMonth, JSON.stringify({ b: [before.early, before.plain, before.sameMonth], a: [after.early, after.plain, after.sameMonth] }));
  check('claim start', 'بلا عقد: بداية البطاقة كما كانت', after.noLease === before.noLease && after.noLease === `${Y}-03-05`, after.noLease);
  check('claim start', 'التشغيل التجريبي في الرأس يسمّي المستأجر الذي سيتحرك فقط', planned.length === 1 && planned[0] === 'مستأجر بدأ متأخراً A-01', planned.join(' | '));

  // the rent-months dialog: a later claim start now takes effect once the earlier unpaid charges are cleared
  await as('owner');
  const dlg = await attempt(() => val(`SELECT set_tenant_rent_exempt_months($1, $2::text[], true, $3::date)`, [T.charged, `{${ym(1)},${ym(2)},${ym(3)}}`, `${Y}-04-10`]));
  const afterDialog = await claim(T.charged);
  check('claim start', 'نافذة أشهر الإيجار: بداية متأخرة مع إعفاء الأشهر السابقة تصبح سارية', dlg.ok && afterDialog === `${Y}-04-10`, `${dlg.error ?? ''} ${afterDialog}`);
  check('claim start', 'ولا يبقى لذلك المستأجر شهر غير مسدّد قبل أبريل', (await missing(T.charged)).every((m) => m >= ym(4)), (await missing(T.charged)).join(','));

  // the guards on the function itself
  await actAs(db, 'superuser');
  const acl = await val(`SELECT proacl::text FROM pg_proc WHERE proname = 'tenant_rent_claim_start'`);
  check('claim start', 'الصلاحيات كما كانت: لا وصول للزائر المجهول', !String(acl).includes('anon') && !String(acl).startsWith('{=X'), acl);

  // rollback restores the previous behaviour exactly
  const rb = await attempt(() => db.exec(sqlOf('084_rent_summary_respects_claim_start.ROLLBACK.sql')));
  if (!rb.ok) { try { await db.exec('ROLLBACK'); } catch {} }
  const restored = await claim(T.late);
  check('claim start', 'التراجع عن 084 يعيد بداية المطالبة 1 يناير', rb.ok && restored === `${Y}-01-01`, `${rb.error ?? ''} ${restored}`);
  const reapply = await attempt(() => db.exec(sqlOf('084_rent_summary_respects_claim_start.sql')));
  if (!reapply.ok) { try { await db.exec('ROLLBACK'); } catch {} }
  check('claim start', 'ويُعاد تطبيقه فوق نفسه', reapply.ok && (await claim(T.late)) === `${Y}-04-10`, reapply.error);
}

await db.close();
console.log('\nEmployee leave (083) and rent claim start (084) — repository migrations + 078 + 080 + 081 + 082\n');
let area = '';
for (const r of results) {
  if (r.area !== area) { area = r.area; console.log(`[${area}]`); }
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `\n        ↳ ${r.detail}`}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed (${results.length} checks)`);
process.exitCode = failed ? 1 : 0;
