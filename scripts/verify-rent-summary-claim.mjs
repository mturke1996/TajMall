/**
 * A month before a tenant's rent claim start is never owed in a period list, whatever produced the row.
 *   npx tsx scripts/verify-rent-summary-claim.mjs
 */
import assert from 'node:assert/strict';

const { claimStartMonth, clampSummaryToClaimStart } = await import('../src/lib/rent-summary-claim-start.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const row = (over = {}) => ({ id: 't', name: 'محل', current_month_status: 'unpaid', current_month_amount: '2500', current_month_paid: '0', rent_claim_start: '2026-04-01', ...over });

check('claim start: a date, a timestamp and a month all read as a month; junk reads as none', () => {
  assert.equal(claimStartMonth('2026-04-01'), '2026-04');
  assert.equal(claimStartMonth('2026-04-15T00:00:00Z'), '2026-04');
  assert.equal(claimStartMonth('2026-04'), '2026-04');
  assert.equal(claimStartMonth(' 2026-04-01 '), '2026-04');
  for (const bad of [null, undefined, '', 'abc', '2026-13-01', '04-2026']) assert.equal(claimStartMonth(bad), null, String(bad));
});

check('an unpaid month before the claim start is exempt: no amount, nothing paid, nothing owed', () => {
  const r = clampSummaryToClaimStart(row(), '2026-03');
  assert.equal(r.current_month_status, 'exempt');
  assert.equal(r.current_month_amount, '0');
  assert.equal(r.current_month_paid, '0');
  assert.equal(clampSummaryToClaimStart(row({ current_month_status: 'no_rent_set', current_month_amount: '0' }), '2026-01').current_month_status, 'exempt');
});

check('the claim month itself and later months are untouched', () => {
  const r = row();
  assert.equal(clampSummaryToClaimStart(r, '2026-04'), r);
  assert.equal(clampSummaryToClaimStart(r, '2026-09'), r);
});

check('money recorded for the month is evidence: a paid or part-paid month stays as it is', () => {
  for (const status of ['paid_full', 'paid_partial']) {
    const r = row({ current_month_status: status, current_month_paid: '2500' });
    assert.equal(clampSummaryToClaimStart(r, '2026-02'), r);
  }
  const odd = row({ current_month_status: 'unpaid', current_month_paid: '100' });
  assert.equal(clampSummaryToClaimStart(odd, '2026-02'), odd);
});

check('an already exempt month and a row with no claim start are returned as they came', () => {
  const exempt = row({ current_month_status: 'exempt', current_month_amount: '0' });
  assert.equal(clampSummaryToClaimStart(exempt, '2026-01'), exempt);
  const none = row({ rent_claim_start: null });
  assert.equal(clampSummaryToClaimStart(none, '2020-01'), none);
  const missing = row();
  delete missing.rent_claim_start;
  assert.equal(clampSummaryToClaimStart(missing, '2020-01'), missing);
});

check('the row it was given is not changed', () => {
  const r = row();
  const before = JSON.stringify(r);
  clampSummaryToClaimStart(r, '2026-01');
  assert.equal(JSON.stringify(r), before);
});

console.log(`\n✓ verify-rent-summary-claim: ${passed} checks passed`);
