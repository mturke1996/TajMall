/**
 * The daily cashbox sheet: opening and closing balances taken from the ledger's running balance, what
 * came in and went out, transfers kept apart, the day adding up, and the WhatsApp summary.
 *   npx tsx scripts/verify-daily-cashbox.mjs
 */
import assert from 'node:assert/strict';

const { buildDailyStatement, isDayKey, dayLabel } = await import('../src/lib/daily-cashbox.ts');
const { buildDailyStatementMessage, buildShareLink } = await import('../src/lib/daily-cashbox-text.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const TODAY = '2026-10-18';
// rows are newest first, as get_cashbox_ledger returns them
const row = (id, date, signed, balance, source = 'transaction', extra = {}) => ({ event_id: id, event_date: date, signed_amount: signed, balance_after: balance, source_type: source, ...extra });
const cash = {
  id: 'b1',
  name_ar: 'الخزينة النقدية',
  kind: 'CASH',
  active: true,
  opening_balance: 1000,
  current_balance: 48250.5,
  rows: [
    row('e5', '2026-10-18', -9800, 48250.5, 'transaction', { description: 'كهرباء', reference: 'EXP-12' }),
    row('e4', '2026-10-18', 31250, 58050.5, 'transaction', { description: 'إيجار محل 101', reference: 'REV-40' }),
    row('e3', '2026-10-18', -20000, 26800.5, 'cash_transfer', { counter_name_ar: 'مصرف الواحة' }),
    row('e2', '2026-10-17', 36500, 46800.5),
    row('e1', '2026-10-10', -3000, 10300.5),
  ],
};
const bank = {
  id: 'b2',
  name_ar: 'مصرف الواحة',
  kind: 'BANK',
  active: true,
  opening_balance: 0,
  current_balance: 213900,
  rows: [row('t1', '2026-10-18', 20000, 213900, 'cash_transfer', { counter_name_ar: 'الخزينة النقدية' }), row('t0', '2026-10-04', 193900, 193900)],
};

check('opening and closing come from the running balance, not from re-adding', () => {
  const s = buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [cash] });
  const b = s.boxes[0];
  assert.equal(b.opening, 46800.5);
  assert.equal(b.closing, 48250.5);
  assert.equal(b.receipts, 31250);
  assert.equal(b.payments, 9800);
  assert.equal(b.transfersOut, 20000);
  assert.equal(b.transfersIn, 0);
  assert.equal(b.reconciles, true);
});

check('a box with nothing before the day opens at its opening balance', () => {
  const s = buildDailyStatement({ date: '2026-10-04', today: TODAY, cashboxes: [bank] });
  assert.equal(s.boxes[0].opening, 0);
  assert.equal(s.boxes[0].closing, 193900);
  assert.equal(s.boxes[0].receipts, 193900);
});

check('a day with no movement carries the balance through', () => {
  const s = buildDailyStatement({ date: '2026-10-15', today: TODAY, cashboxes: [cash] });
  const b = s.boxes[0];
  assert.equal(b.opening, 10300.5);
  assert.equal(b.closing, 10300.5);
  assert.equal(b.lines.length, 0);
  assert.equal(s.movements, 0);
  assert.equal(b.reconciles, true);
});

check('a day before the box had any history opens at the box opening balance', () => {
  const s = buildDailyStatement({ date: '2026-09-01', today: TODAY, cashboxes: [cash] });
  assert.equal(s.boxes[0].opening, 1000);
  assert.equal(s.boxes[0].closing, 1000);
});

check('lines are listed oldest first, with a transfer marked and naming the other box', () => {
  const b = buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [cash] }).boxes[0];
  assert.deepEqual(b.lines.map((l) => l.id), ['e3', 'e4', 'e5']);
  assert.deepEqual(b.lines.map((l) => l.kind), ['transfer_out', 'receipt', 'payment']);
  assert.equal(b.lines[0].counter, 'مصرف الواحة');
  assert.equal(b.lines[1].ref, 'REV-40');
  assert.equal(b.lines[1].amount, 31250);
  assert.equal(b.lines[2].balanceAfter, 48250.5);
});

check('a transfer between two boxes cancels out of the totals', () => {
  const s = buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [cash, bank] });
  assert.equal(s.totals.transfersOut, 20000);
  assert.equal(s.totals.transfersIn, 20000);
  assert.equal(s.totals.opening, 46800.5 + 193900);
  assert.equal(s.totals.closing, 48250.5 + 213900);
  assert.equal(s.totals.opening + s.totals.receipts - s.totals.payments + s.totals.transfersIn - s.totals.transfersOut, s.totals.closing);
  assert.equal(s.allReconcile, true);
});

check('today is checked against the box current balance', () => {
  assert.equal(buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [cash] }).boxes[0].matchesCurrent, true);
  const off = buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [{ ...cash, current_balance: 50000 }] });
  assert.equal(off.boxes[0].matchesCurrent, false);
  assert.equal(off.allReconcile, false);
  // a past day has no "current" to match
  assert.equal(buildDailyStatement({ date: '2026-10-17', today: TODAY, cashboxes: [{ ...cash, current_balance: 50000 }] }).boxes[0].matchesCurrent, null);
});

check('a ledger whose running balance does not follow its movements is flagged, not hidden', () => {
  const broken = { ...cash, rows: [row('x', TODAY, 500, 99999), row('y', '2026-10-10', 100, 100)] };
  const s = buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [broken] });
  assert.equal(s.boxes[0].reconciles, false);
  assert.equal(s.allReconcile, false);
});

check('an inactive box with no movement and no balance is left off; one with money or movement stays', () => {
  const idle = { id: 'z', name_ar: 'قديمة', kind: 'CASH', active: false, opening_balance: 0, current_balance: 0, rows: [] };
  assert.equal(buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [idle] }).boxes.length, 0);
  assert.equal(buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [{ ...idle, opening_balance: 50 }] }).boxes.length, 1);
  assert.equal(buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [{ ...idle, rows: [row('q', TODAY, 10, 10)], current_balance: 10 }] }).boxes.length, 1);
});

check('amounts arriving as strings and timestamps with a time part are read correctly', () => {
  const s = buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [{ ...cash, opening_balance: '1000', rows: [row('s1', '2026-10-18T09:30:00+00:00', '250.5', '1250.5')], current_balance: '1250.5' }] });
  assert.equal(s.boxes[0].receipts, 250.5);
  assert.equal(s.boxes[0].closing, 1250.5);
  assert.equal(s.boxes[0].opening, 1000);
});

check('a row without an id still gets a unique one', () => {
  const rows = [{ event_date: TODAY, signed_amount: 5, balance_after: 15, source_type: 'transaction' }, { event_date: TODAY, signed_amount: 10, balance_after: 10, source_type: 'transaction' }];
  const ids = buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [{ id: 'q', name_ar: 'خ', kind: 'CASH', active: true, opening_balance: 0, current_balance: 15, rows }] }).boxes[0].lines.map((l) => l.id);
  assert.equal(new Set(ids).size, 2);
});

check('day keys: valid calendar-shaped days only', () => {
  assert.equal(isDayKey('2026-10-18'), true);
  assert.equal(isDayKey('2026-13-01'), false);
  assert.equal(isDayKey('2026-10-32'), false);
  assert.equal(isDayKey('abc'), false);
  assert.equal(isDayKey(null), false);
  assert.equal(dayLabel('2026-10-18'), '18/10/2026');
});

check('the WhatsApp summary names each box and the totals, and warns when the sheet does not add up', () => {
  const ok = buildDailyStatementMessage(buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [cash, bank] }));
  assert.match(ok, /ليوم 18\/10\/2026/);
  assert.match(ok, /الخزينة النقدية/);
  assert.match(ok, /مصرف الواحة/);
  assert.match(ok, /الحركات: 4 حركات/);
  assert.doesNotMatch(ok, /تنبيه/);
  const bad = buildDailyStatementMessage(buildDailyStatement({ date: TODAY, today: TODAY, cashboxes: [{ ...cash, current_balance: 1 }] }));
  assert.match(bad, /تنبيه: أرقام هذا الكشف لا تطابق دفتر الخزينة/);
  const quiet = buildDailyStatementMessage(buildDailyStatement({ date: '2026-10-15', today: TODAY, cashboxes: [cash] }));
  assert.match(quiet, /لا حركة في هذا اليوم/);
  assert.match(buildShareLink('مرحبا'), /^https:\/\/wa\.me\/\?text=%D9%85/);
});

console.log(`\n${passed} checks passed`);
