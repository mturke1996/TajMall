/**
 * Occupancy of the shops and the lease-expiry list: the calculations behind the units tab, the mall
 * overview and the contract alerts.
 *   npx tsx scripts/verify-mall-occupancy.mjs
 */
import assert from 'node:assert/strict';

const { daysBetween, addDaysISO, addMonthsISO } = await import('../src/lib/mall-dates.ts');
const { buildMallOccupancy, floorRank } = await import('../src/lib/mall-occupancy.ts');
const { buildContractExpiry, expiryBucket } = await import('../src/lib/contract-expiry.ts');
const { buildContractExpiryMessage } = await import('../src/lib/whatsapp.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const TODAY = '2026-10-18';
const day = (offset) => addDaysISO(TODAY, offset);

// ── dates ───────────────────────────────────────────────────────────────────
check('whole days between calendar days, across a daylight-saving change', () => {
  assert.equal(daysBetween('2026-10-18', '2026-10-28'), 10);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysBetween('2026-10-18', '2026-10-08'), -10);
  assert.equal(daysBetween('2026-10-18', '2026-10-18T23:59:59Z'), 0);
  assert.equal(daysBetween('nonsense', '2026-10-18'), null);
});
check('adding days and months stays on real calendar days', () => {
  assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysISO('2026-03-01', -1), '2026-02-28');
  assert.equal(addMonthsISO('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonthsISO('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonthsISO('2026-01-31', 13), '2027-02-28');
  assert.equal(addMonthsISO('2026-10-18', 12), '2027-10-18');
  assert.equal(addMonthsISO('2026-11-30', 3), '2027-02-28');
});
check('floors sort in building order', () => {
  const sorted = ['الثاني', '3', 'الأرضي', 'القبو', 'الأول', 'ميزانين', '٤'].sort((a, b) => floorRank(a) - floorRank(b));
  assert.deepEqual(sorted.slice(0, 6), ['القبو', 'الأرضي', 'الأول', 'الثاني', '3', '٤']);
  assert.equal(sorted[6], 'ميزانين');
});

// ── occupancy ───────────────────────────────────────────────────────────────
const unit = (id, floor, area, status, createdDaysAgo = 400) => ({
  id, unit_number: id.toUpperCase(), floor, area_sqm: String(area), status, created_at: `${day(-createdDaysAgo)}T10:00:00Z`,
});
const lease = (id, unitId, tenantId, status, startOffset, endOffset, rent, name = `مستأجر ${tenantId}`) => ({
  id, unit_id: unitId, tenant_id: tenantId, status, start_date: day(startOffset), end_date: day(endOffset), monthly_rent: String(rent),
  tenant: { id: tenantId, name, phone: '0911111111' },
});

const units = [
  unit('a101', 'الأرضي', 50, 'OCCUPIED'),
  unit('a102', 'الأرضي', 40, 'AVAILABLE'),
  unit('a106', 'الأرضي', 35, 'AVAILABLE'), // lease running but flag says free
  unit('b103', 'الأول', 30, 'AVAILABLE', 10), // never leased, added 10 days ago
  unit('b104', 'الأول', 60, 'MAINTENANCE'),
  unit('b105', 'الأول', 45, 'OCCUPIED'), // flag says rented, no lease
  unit('c107', 'الثاني', 25, 'AVAILABLE'), // lease signed, starts in 20 days
  unit('c108', 'الثاني', 20, 'OCCUPIED'), // lease past its end date, still active
  unit('s100', 'القبو', 0, 'AVAILABLE'), // no area recorded
];
const contracts = [
  lease('k1', 'a101', 't1', 'ACTIVE', -300, 100, 1000),
  lease('k0', 'a102', 't0', 'TERMINATED', -500, -120, 800), // ended 120 days ago
  lease('k6', 'a106', 't6', 'ACTIVE', -50, 200, 700),
  lease('k7', 'c107', 't7', 'ACTIVE', 20, 385, 500),
  lease('k8', 'c108', 't8', 'ACTIVE', -400, -10, 400),
  lease('k9', 'a102', 't9', 'EXPIRED', -700, -520, 750), // older ended lease on the same unit
];
const occ = buildMallOccupancy({ units, contracts, today: TODAY });
const row = (id) => occ.rows.find((r) => r.unit.id === id);

check('each unit gets the state its leases say', () => {
  assert.equal(row('a101').state, 'rented');
  assert.equal(row('a102').state, 'vacant');
  assert.equal(row('a106').state, 'rented');
  assert.equal(row('b103').state, 'vacant');
  assert.equal(row('b104').state, 'maintenance');
  assert.equal(row('b105').state, 'vacant');
  assert.equal(row('c107').state, 'reserved');
  assert.equal(row('c108').state, 'rented');
});
check('totals and the rate leave out units under maintenance', () => {
  const t = occ.totals;
  assert.equal(t.units, 9);
  assert.equal(t.rented, 3);
  assert.equal(t.reserved, 1);
  assert.equal(t.vacant, 4);
  assert.equal(t.maintenance, 1);
  assert.equal(t.leasable, 8);
  assert.equal(t.rate, 37.5);
});
check('the rent roll counts running leases only (not a lease that has not started)', () => {
  assert.equal(occ.totals.rentRoll, 1000 + 700 + 400);
  assert.equal(row('c107').rent, 0);
  assert.equal(row('a101').rent, 1000);
});
check('days to the end of a running lease; negative once past', () => {
  assert.equal(row('a101').endsInDays, 100);
  assert.equal(row('c108').endsInDays, -10);
  assert.equal(row('a102').endsInDays, null);
});
check('vacant since: the last ended lease, else the day the unit was added', () => {
  assert.equal(row('a102').vacantSince, day(-120));
  assert.equal(row('a102').vacantDays, 120);
  assert.equal(row('b103').vacantDays, 10);
  assert.equal(row('b103').neverLeased, true);
  assert.equal(row('a102').neverLeased, false);
  assert.equal(row('a101').vacantDays, null);
});
check('only units free for 90+ days are long vacant, longest first', () => {
  // b105 and s100 were added 400 days ago and never leased; a102's last lease ended 120 days ago
  assert.deepEqual(occ.longVacant.map((r) => r.unit.id), ['b105', 's100', 'a102']);
  assert.ok(occ.longVacant.every((r) => r.state === 'vacant'));
  assert.ok(!occ.longVacant.some((r) => r.unit.id === 'b103'));
});
check('a status flag that disagrees with the leases is reported', () => {
  assert.deepEqual(row('b105').flags, ['occupied_without_contract']);
  assert.deepEqual(row('a106').flags, ['free_with_contract']);
  assert.deepEqual(row('a101').flags, []);
  assert.deepEqual(row('c107').flags, []); // reserved with a free flag is normal until it starts
  assert.deepEqual(occ.flagged.map((r) => r.unit.id).sort(), ['a106', 'b105']);
});
check('floors in building order with their own rate, rent and area', () => {
  assert.deepEqual(occ.floors.map((f) => f.floor), ['القبو', 'الأرضي', 'الأول', 'الثاني']);
  const ground = occ.floors.find((f) => f.floor === 'الأرضي');
  assert.equal(ground.units, 3);
  assert.equal(ground.rented, 2);
  assert.equal(ground.vacant, 1);
  assert.equal(ground.rate, 66.7);
  assert.equal(ground.rent, 1700);
  assert.equal(ground.area, 125);
  assert.equal(ground.rentedArea, 85);
  const first = occ.floors.find((f) => f.floor === 'الأول');
  assert.equal(first.maintenance, 1);
  assert.equal(first.rate, 0); // 0 of the 2 that can be let
});
check('rent per m² uses rented units that have both an area and a rent; the vacant estimate is built from it', () => {
  // rented with area and rent: a101 (50 m², 1000), a106 (35 m², 700), c108 (20 m², 400) → 2100 / 105
  assert.equal(occ.totals.rentPerSqm, 20);
  // free area: a102 40 + b103 30 + b105 45 + s100 0 + reserved c107 25 = 140
  assert.equal(occ.totals.vacantArea, 140);
  assert.equal(occ.totals.vacantPotential, 2800);
});
check('the average and the estimate are rounded to what they can claim', () => {
  const odd = buildMallOccupancy({
    units: [unit('r1', 'الأرضي', 30, 'OCCUPIED'), unit('r2', 'الأرضي', 7, 'OCCUPIED'), unit('f1', 'الأرضي', 13, 'AVAILABLE')],
    contracts: [lease('q1', 'r1', 'x1', 'ACTIVE', -10, 300, 1000), lease('q2', 'r2', 'x2', 'ACTIVE', -10, 300, 333)],
    today: TODAY,
  });
  // 1333 / 37 = 36.0270… → 36.03; × 13 free m² = 468.39 → 468
  assert.equal(odd.totals.rentPerSqm, 36.03);
  assert.equal(odd.totals.vacantPotential, 468);
});
check('no estimate without a priced rented unit', () => {
  const none = buildMallOccupancy({ units: [unit('x1', 'الأرضي', 40, 'AVAILABLE')], contracts: [], today: TODAY });
  assert.equal(none.totals.rentPerSqm, null);
  assert.equal(none.totals.vacantPotential, null);
  assert.equal(none.totals.rate, 0);
  const empty = buildMallOccupancy({ units: [], contracts: [], today: TODAY });
  assert.equal(empty.totals.units, 0);
  assert.deepEqual(empty.floors, []);
});

// ── expiry ──────────────────────────────────────────────────────────────────
const exp = (id, endOffset, extra = {}) => ({
  id, unit_id: `u-${id}`, tenant_id: `t-${id}`, status: 'ACTIVE', start_date: day(-400), end_date: day(endOffset), monthly_rent: '500',
  tenant: { id: `t-${id}`, name: `مستأجر ${id}`, phone: '0912222222' }, unit: { id: `u-${id}`, unit_number: id.toUpperCase(), floor: 'الأرضي' }, ...extra,
});
const expiry = buildContractExpiry({
  today: TODAY,
  contracts: [
    exp('past', -5), exp('today', 0), exp('d30', 30), exp('d31', 31), exp('d60', 60), exp('d61', 61), exp('d90', 90), exp('d91', 91),
    exp('gone', -3, { status: 'TERMINATED' }),
    exp('old', 10, { unit_id: 'shared', tenant_id: 'same' }),
    exp('renewal', 400, { unit_id: 'shared', tenant_id: 'same', start_date: day(11) }),
  ],
});
check('leases fall into the right urgency bucket at each boundary', () => {
  const bucket = (id) => expiry.items.find((i) => i.contract.id === id)?.bucket;
  assert.equal(bucket('past'), 'expired');
  assert.equal(bucket('today'), 'within30');
  assert.equal(bucket('d30'), 'within30');
  assert.equal(bucket('d31'), 'within60');
  assert.equal(bucket('d60'), 'within60');
  assert.equal(bucket('d61'), 'within90');
  assert.equal(bucket('d90'), 'within90');
  assert.equal(bucket('d91'), undefined);
  assert.equal(expiryBucket(-1), 'expired');
  assert.equal(expiryBucket(91), null);
});
check('ended leases and renewed leases are not listed', () => {
  const ids = expiry.items.map((i) => i.contract.id);
  assert.ok(!ids.includes('gone'));
  assert.ok(!ids.includes('old')); // followed by an active lease for the same tenant and unit
  assert.ok(!ids.includes('renewal')); // 400 days away
});
check('most urgent first; only a past end date is flagged as past', () => {
  assert.deepEqual(expiry.items.map((i) => i.contract.id), ['past', 'today', 'd30', 'd31', 'd60', 'd61', 'd90']);
  assert.equal(expiry.items[0].daysLeft, -5);
  assert.equal(expiry.items[0].pastEnd, true);
  assert.ok(expiry.items.slice(1).every((i) => !i.pastEnd));
});
check('counts, urgent count and the monthly rent at risk', () => {
  assert.deepEqual(expiry.counts, { expired: 1, within30: 2, within60: 2, within90: 2 });
  assert.equal(expiry.total, 7);
  assert.equal(expiry.urgent, 3);
  assert.equal(expiry.monthlyRentAtRisk, 3500);
});
check('tenant, shop and phone come through for the reminder', () => {
  const i = expiry.items[0];
  assert.equal(i.tenantName, 'مستأجر past');
  assert.equal(i.unitNumber, 'PAST');
  assert.equal(i.phone, '0912222222');
});

// ── the WhatsApp text ───────────────────────────────────────────────────────
check('the reminder says what happened and what to do, in the right tense', () => {
  const soon = buildContractExpiryMessage({ tenantName: 'أحمد', shopNumber: '12', endDate: day(15), daysLeft: 15 });
  assert.match(soon, /السيد\/ة أحمد/);
  assert.match(soon, /المحل رقم 12/);
  assert.match(soon, /ينتهي بتاريخ/);
  assert.match(soon, /بعد 15 يوماً/);
  const todayMsg = buildContractExpiryMessage({ tenantName: 'أحمد', shopNumber: '12', endDate: TODAY, daysLeft: 0 });
  assert.match(todayMsg, /ينتهي اليوم/);
  const past = buildContractExpiryMessage({ tenantName: 'أحمد', shopNumber: null, endDate: day(-5), daysLeft: -5 });
  assert.match(past, /انتهى بتاريخ/);
  assert.match(past, /ترتيب تسليم المحل/);
  assert.doesNotMatch(past, /رقم null/);
  const two = buildContractExpiryMessage({ tenantName: 'أحمد', endDate: day(2), daysLeft: 2 });
  assert.match(two, /بعد يومين/);
});

console.log(`\n${passed} checks passed`);
