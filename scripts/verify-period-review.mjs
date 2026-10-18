/**
 * The pre-close review flags what an accountant must fix before closing a period.
 *   npx tsx scripts/verify-period-review.mjs
 */
import assert from 'node:assert/strict';

const { buildPeriodReview } = await import('../src/lib/period-review.ts');

const tx = (id, extra = {}) => ({
  id, number: Number(id.slice(1)), kind: 'REVENUE', status: 'POSTED', amount: 100, method: 'CASH', reference: null,
  description: 'إيجار', contact_id: 'c1', category_id: 'cat-rent', tx_date: '2026-09-10', category: { code: 'REV-RNT' }, ...extra,
});
const byKey = (checks) => Object.fromEntries(checks.map((c) => [c.key, c]));

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const clean = byKey(
  buildPeriodReview({
    transactions: [tx('t1'), tx('t2', { amount: 200 }), tx('t3', { kind: 'EXPENSE', category_id: 'cat-x', contact_id: 'v1' })],
    unlinkedReceipts: [],
    draftJournalCount: 0,
    pendingVoucherCount: 0,
    cashboxCountRuns: 1,
  }),
);
check('a clean period has no warnings', () => assert.ok(Object.values(clean).every((c) => c.status === 'ok')));

const messy = byKey(
  buildPeriodReview({
    transactions: [
      tx('t10', { description: '  ' }),
      tx('t11', { method: 'CHEQUE' }),
      tx('t12', { method: 'TRANSFER', reference: 'TRX-1' }),
      tx('t13', { kind: 'EXPENSE', contact_id: null, amount: 250.5, category_id: 'cat-x' }),
      tx('t14', { amount: 300 }),
      tx('t15', { amount: 300 }),
      tx('t16', { amount: 300, status: 'VOIDED' }),
      tx('t17', { description: null, status: 'DRAFT' }),
    ],
    unlinkedReceipts: [{ transactionId: 't14', free: 300 }],
    draftJournalCount: 2,
    pendingVoucherCount: 1,
    cashboxCountRuns: 0,
  }),
);
check('missing description (posted only)', () => {
  assert.equal(messy.description.status, 'warn');
  assert.match(messy.description.detail, /رقم 10/);
  assert.doesNotMatch(messy.description.detail, /17/);
});
check('cheque without number; transfer with number is fine', () => {
  assert.equal(messy.reference.status, 'warn');
  assert.match(messy.reference.detail, /رقم 11/);
  assert.doesNotMatch(messy.reference.detail, /12/);
});
check('expense without party, with its total', () => assert.match(messy.party.detail, /250\.5/));
check('same-day duplicates, voided rows ignored', () => {
  assert.equal(messy.duplicates.status, 'warn');
  assert.match(messy.duplicates.detail, /أرقام 14، 15/);
  assert.doesNotMatch(messy.duplicates.detail, /16/);
});
check('unlinked rent receipts', () => assert.match(messy['rent-links'].detail, /300/));
check('draft journals, pending vouchers, missing cash count', () => {
  assert.equal(messy['draft-journals'].status, 'warn');
  assert.equal(messy.vouchers.status, 'warn');
  assert.equal(messy['cash-count'].status, 'warn');
  assert.equal(messy['cash-count'].href, '/settings/cashbox-count');
});

console.log(`\n${passed} checks passed`);
