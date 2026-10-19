/**
 * The guard rails and shortcuts of the new-transaction dialog, as rules:
 *  - ranked search over names, shop numbers, phones and codes with Arabic normalisation;
 *  - the soft duplicate check (same kind and amount, same party or account, ±3 days, counted rows only)
 *    that never blocks two genuinely identical payments once they are confirmed;
 *  - cheque and transfer details, the description nudge, and repeating a transaction;
 *  - suggestions from a party's history and from recent use.
 *   npx tsx scripts/verify-entry-guards.mjs
 */
import assert from 'node:assert/strict';

const { normalizeArabic, scoreSearch, prepareSearchFields, rankBySearch, digitsOnly } = await import('../src/lib/arabic-search.ts');
const dup = await import('../src/lib/duplicate-check.ts');
const sug = await import('../src/lib/entry-suggestions.ts');
const guards = await import('../src/lib/entry-guards.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

// ── search ──────────────────────────────────────────────────────────────────────────────────────

check('search: an empty query matches everything; a word that matches nothing makes the whole query fail', () => {
  assert.equal(scoreSearch('', ['أحمد']), 1);
  assert.equal(scoreSearch('   ', ['أحمد']), 1);
  assert.equal(scoreSearch('زيد', ['أحمد علي']), 0);
  assert.equal(scoreSearch('أحمد زيد', ['أحمد علي']), 0);
  assert.ok(scoreSearch('أحمد علي', ['أحمد علي']) > 0);
});

check('search: hamza, taa marbuta, alef maqsura and Arabic-Indic digits are ignored', () => {
  assert.ok(scoreSearch('احمد', ['أحمد']) > 0);
  assert.ok(scoreSearch('مدرسه', ['مدرسة النور']) > 0);
  assert.ok(scoreSearch('على', ['علي']) > 0);
  assert.ok(scoreSearch('١٢', [{ text: 'محل 12' }]) > 0);
  assert.equal(normalizeArabic('٠٩١٢'), '0912');
});

check('search: exact beats prefix beats the start of a later word beats the middle of a word', () => {
  const exact = scoreSearch('نور', ['نور']);
  const prefix = scoreSearch('نور', ['نورا للتجارة']);
  const later = scoreSearch('نور', ['شركة نور']);
  const middle = scoreSearch('نور', ['مؤسسة الحنور']);
  assert.ok(exact > prefix, 'exact > prefix');
  assert.ok(prefix > later, 'prefix > later word');
  assert.ok(later > middle, 'later word > middle');
  assert.ok(middle > 0);
});

check('search: «نور» finds «النور» (the article is not part of the name) above a match in the middle of a word', () => {
  const article = scoreSearch('نور', ['شركة النور']);
  const middle = scoreSearch('نور', ['شركة الحنور']);
  assert.ok(article > middle);
});

check('search: every word of the query must match, in any field', () => {
  const fields = ['أحمد علي', { text: 'محل 12' }];
  assert.ok(scoreSearch('احمد محل 12', fields) > 0);
  assert.equal(scoreSearch('احمد محل 99', fields), 0);
});

check('search: phones match by digits however they are written', () => {
  const phone = (t) => [{ text: 'سالم', weight: 1 }, { text: t, digits: true, weight: 0.8 }];
  assert.ok(scoreSearch('0912345678', phone('0912345678')) > 0);
  assert.ok(scoreSearch('091 234 5678', phone('0912345678')) > 0);
  assert.ok(scoreSearch('912345678', phone('+218 91-2345678')) > 0, 'without the trunk 0, against an international number');
  assert.ok(scoreSearch('0912345678', phone('+218 91-2345678')) > 0, 'with the trunk 0, against an international number');
  assert.equal(scoreSearch('0933', phone('0912345678')), 0);
  assert.equal(digitsOnly('+218 (91) 234-5678'), '218912345678');
});

check('search: an exact shop number outranks a longer number it starts', () => {
  const shop = (n) => [{ text: 'مستأجر' }, n, { text: `محل ${n}`, weight: 0.8 }];
  assert.ok(scoreSearch('12', shop('12')) > scoreSearch('12', shop('120')));
  assert.ok(scoreSearch('محل 12', shop('12')) > 0);
});

check('search: a secondary field ranks below the same text in the name', () => {
  const asName = scoreSearch('كهرباء', [{ text: 'كهرباء', weight: 1 }]);
  const asCode = scoreSearch('كهرباء', [{ text: 'كهرباء', weight: 0.6 }]);
  assert.ok(asName > asCode);
});

check('search: rankBySearch orders by score, then use, then the order given; an empty query keeps the order', () => {
  const items = [
    { id: 'a', name: 'مؤسسة الحنور' },
    { id: 'b', name: 'نور' },
    { id: 'c', name: 'نورا للتجارة' },
    { id: 'd', name: 'نورا للمقاولات' },
    { id: 'e', name: 'سالم' },
  ];
  const fieldsOf = (i) => prepareSearchFields([i.name]);
  const usage = { c: 1, d: 5 };
  const ranked = rankBySearch(items, 'نور', fieldsOf, (i) => usage[i.id] ?? 0).map((i) => i.id);
  assert.deepEqual(ranked, ['b', 'd', 'c', 'a'], 'exact first; among equal prefixes the more used; the middle match last; non-matches dropped');
  assert.deepEqual(rankBySearch(items, '', fieldsOf).map((i) => i.id), ['a', 'b', 'c', 'd', 'e']);
  assert.notEqual(rankBySearch(items, '', fieldsOf), items, 'a copy, never the input array');
  assert.deepEqual(rankBySearch(items, 'زززز', fieldsOf), []);
});

check('search: fields that are empty or missing are skipped, not matched', () => {
  assert.equal(scoreSearch('x', [null, undefined, '', { text: null }]), 0);
  assert.equal(prepareSearchFields([null, undefined, '', { text: '  ' }, 'ok']).length, 1);
});

// ── duplicate check ─────────────────────────────────────────────────────────────────────────────

const tx = (id, number, date, over = {}) => ({
  id,
  number,
  kind: 'EXPENSE',
  status: 'POSTED',
  amount: '1250.000',
  tx_date: date,
  description: 'كهرباء',
  contact_id: 'c1',
  category_id: 'k1',
  ...over,
});
const probe = (over = {}) => ({ kind: 'EXPENSE', amount: 1250, contactId: 'c1', categoryId: 'k1', date: '2026-10-18', ...over });
const find = (rows, p = probe()) => dup.findPossibleDuplicates(p, rows);

check('dates: whole-day differences ignore month, year and daylight-saving boundaries; impossible dates are rejected', () => {
  assert.equal(dup.daysBetween('2026-10-18', '2026-10-18'), 0);
  assert.equal(dup.daysBetween('2026-12-31', '2027-01-02'), 2);
  assert.equal(dup.daysBetween('2027-01-02', '2026-12-31'), 2);
  assert.equal(dup.daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(dup.daysBetween('2026-02-30', '2026-03-01'), null);
  assert.equal(dup.daysBetween('18/10/2026', '2026-10-18'), null);
  assert.equal(dup.daysBetween('', '2026-10-18'), null);
});

check('dates: the query window is the entry date ± 3 days, across months and leap years', () => {
  assert.deepEqual(dup.dateWindow('2026-10-18'), { from: '2026-10-15', to: '2026-10-21' });
  assert.deepEqual(dup.dateWindow('2026-03-02'), { from: '2026-02-27', to: '2026-03-05' });
  assert.deepEqual(dup.dateWindow('2028-03-01'), { from: '2028-02-27', to: '2028-03-04' });
  assert.deepEqual(dup.dateWindow('2026-12-30'), { from: '2026-12-27', to: '2027-01-02' });
  assert.equal(dup.dateWindow('2026-13-01'), null);
  assert.equal(dup.dateWindow('soon'), null);
});

check('amounts: compared in thousandths, so float noise and string forms meet', () => {
  assert.equal(dup.amountKey(1250.5), 1250500);
  assert.equal(dup.amountKey('1250.500'), 1250500);
  assert.equal(dup.amountKey(0.1 + 0.2), 300);
  assert.equal(dup.amountKey(1249.5500000000002), 1249550);
  for (const bad of [0, -5, NaN, Infinity, '', null, undefined, 'abc']) assert.equal(dup.amountKey(bad), null, String(bad));
});

check('duplicates: same kind, amount, party and account on the same day is found and called identical', () => {
  const [m] = find([tx('t1', 501, '2026-10-18')]);
  assert.equal(m.id, 't1');
  assert.equal(m.number, 501);
  assert.equal(m.daysApart, 0);
  assert.equal(m.sameContact, true);
  assert.equal(m.sameCategory, true);
  assert.equal(m.identical, true);
});

check('duplicates: the window is ±3 days, both ways', () => {
  const ids = (rows) => find(rows).map((m) => m.id);
  assert.deepEqual(ids([tx('a', 1, '2026-10-15'), tx('b', 2, '2026-10-21')]).sort(), ['a', 'b']);
  assert.deepEqual(ids([tx('c', 3, '2026-10-14'), tx('d', 4, '2026-10-22')]), []);
});

check('duplicates: only counted rows — draft and voided are ignored, posted and reconciled count', () => {
  const rows = ['DRAFT', 'VOIDED', 'POSTED', 'RECONCILED'].map((status, i) => tx(`s${i}`, i, '2026-10-18', { status }));
  assert.deepEqual(find(rows).map((m) => m.id).sort(), ['s2', 's3']);
});

check('duplicates: another kind or another amount (even by 0.001) is not a duplicate', () => {
  assert.deepEqual(find([tx('r', 1, '2026-10-18', { kind: 'REVENUE' })]), []);
  assert.deepEqual(find([tx('x', 2, '2026-10-18', { amount: '1250.001' })]), []);
  assert.equal(find([tx('y', 3, '2026-10-18', { amount: 1250 })]).length, 1, 'a numeric amount works as well as a string');
});

check('duplicates: two different parties paying the same amount to the same account are not duplicates', () => {
  assert.deepEqual(find([tx('o', 1, '2026-10-18', { contact_id: 'c2' })]), []);
});

check('duplicates: the same party on another account is still flagged (but not identical)', () => {
  const [m] = find([tx('p', 1, '2026-10-18', { category_id: 'k2' })]);
  assert.equal(m.sameContact, true);
  assert.equal(m.sameCategory, false);
  assert.equal(m.identical, false);
});

check('duplicates: with no party chosen, the same account and amount is flagged — whoever the other row names', () => {
  const [m] = find([tx('q', 1, '2026-10-17', { contact_id: 'c9' })], probe({ contactId: '' }));
  assert.equal(m.sameContact, false);
  assert.equal(m.sameCategory, true);
  assert.equal(m.identical, false, 'the other row has a party this one lacks');
  const [n] = find([tx('q2', 2, '2026-10-18', { contact_id: null })], probe({ contactId: null }));
  assert.equal(n.identical, true, 'neither has a party, same account, same day');
});

check('duplicates: a row with no party but the same account is flagged against a party entry', () => {
  const [m] = find([tx('np', 1, '2026-10-18', { contact_id: null })]);
  assert.equal(m.sameContact, false);
  assert.equal(m.sameCategory, true);
});

check('duplicates: nothing in common but the amount is not a duplicate', () => {
  assert.deepEqual(find([tx('z', 1, '2026-10-18', { contact_id: null, category_id: 'k2' })], probe({ contactId: null })), []);
  assert.deepEqual(find([tx('z2', 2, '2026-10-18', { contact_id: null, category_id: null })], probe({ contactId: null, categoryId: null })), []);
});

check('duplicates: nearest date first, then the newest number; the list is capped', () => {
  const rows = [tx('far', 1, '2026-10-15'), tx('near-old', 2, '2026-10-17'), tx('near-new', 9, '2026-10-17'), tx('same', 5, '2026-10-18')];
  assert.deepEqual(find(rows).map((m) => m.id), ['same', 'near-new', 'near-old', 'far']);
  const many = Array.from({ length: 12 }, (_, i) => tx(`m${i}`, i, '2026-10-18'));
  assert.equal(find(many).length, 5);
  assert.equal(dup.findPossibleDuplicates(probe(), many, 3).length, 3);
});

check('duplicates: an unusable amount or date finds nothing instead of throwing', () => {
  const rows = [tx('t', 1, '2026-10-18')];
  assert.deepEqual(find(rows, probe({ amount: 0 })), []);
  assert.deepEqual(find(rows, probe({ amount: NaN })), []);
  assert.deepEqual(find(rows, probe({ date: '' })), []);
  assert.deepEqual(find(rows, probe({ date: '2026-02-31' })), []);
  assert.deepEqual(find([], probe()), []);
});

check('duplicates: a description that is blank is reported as none', () => {
  assert.equal(find([tx('d', 1, '2026-10-18', { description: '   ' })])[0].description, null);
  assert.equal(find([tx('d2', 2, '2026-10-18', { description: ' كهرباء ' })])[0].description, 'كهرباء');
});

check('confirmation: two genuinely identical payments stay postable once the tick is given', () => {
  const matches = find([tx('t1', 501, '2026-10-18')]);
  assert.equal(dup.duplicatesConfirmed(matches, null), false, 'asked before posting');
  assert.equal(dup.duplicatesConfirmed(matches, dup.duplicateSignature(matches)), true, 'ticked: goes through');
  assert.equal(dup.duplicatesConfirmed([], null), true, 'nothing to confirm');
});

check('confirmation: a tick belongs to the matches it was given for', () => {
  const first = find([tx('t1', 501, '2026-10-18')]);
  const tick = dup.duplicateSignature(first);
  const later = find([tx('t1', 501, '2026-10-18'), tx('t2', 502, '2026-10-17')]);
  assert.notEqual(dup.duplicateSignature(later), tick);
  assert.equal(dup.duplicatesConfirmed(later, tick), false, 'a new look-alike asks again');
  assert.equal(dup.duplicateSignature([...later].reverse()), dup.duplicateSignature(later), 'order does not matter');
});

check('wording: the headline agrees with the count, the reason names what matched', () => {
  const one = find([tx('a', 1, '2026-10-18')]);
  assert.equal(dup.duplicateHeadlineAr(one), 'يوجد معاملة مشابهة');
  const two = find([tx('a', 1, '2026-10-18'), tx('b', 2, '2026-10-17')]);
  assert.equal(dup.duplicateHeadlineAr(two), 'يوجد معاملتان مشابهتان');
  const many = (n) => Array.from({ length: n }, (_, i) => ({ ...one[0], id: `i${i}` }));
  assert.equal(dup.duplicateHeadlineAr(many(3)), 'يوجد 3 معاملات مشابهة');
  assert.equal(dup.duplicateHeadlineAr(many(11)), 'يوجد 11 معاملة مشابهة');
  assert.equal(dup.duplicateReasonAr(one), 'نفس المبلغ والجهة والبند، بفارق 3 أيام على الأكثر');
  assert.equal(dup.duplicateReasonAr(find([tx('c', 1, '2026-10-18', { contact_id: null })])), 'نفس المبلغ والبند، بفارق 3 أيام على الأكثر');
  assert.equal(dup.duplicateReasonAr(find([tx('d', 1, '2026-10-18', { category_id: 'k2' })])), 'نفس المبلغ والجهة، بفارق 3 أيام على الأكثر');
});

check('wording: the reason never claims for every row what only some rows share', () => {
  // one row matches by party only, another by account only: both are named as "or", not "and"
  const mixed = find([tx('p', 1, '2026-10-18', { category_id: 'k2' }), tx('q', 2, '2026-10-18', { contact_id: null })]);
  assert.equal(mixed.length, 2);
  assert.equal(dup.duplicateReasonAr(mixed), 'نفس المبلغ مع نفس الجهة أو البند، بفارق 3 أيام على الأكثر');
  // every row shares the party (the accounts differ among them): the account is not claimed
  const sameParty = find([tx('r', 1, '2026-10-18', { category_id: 'k2' }), tx('s', 2, '2026-10-17', { category_id: 'k3' })]);
  assert.equal(dup.duplicateReasonAr(sameParty), 'نفس المبلغ والجهة، بفارق 3 أيام على الأكثر');
  // every row is on the same account and some also share the party: only the account holds for all
  const sameAccount = find([tx('t', 1, '2026-10-18'), tx('u', 2, '2026-10-17', { contact_id: null })]);
  assert.equal(dup.duplicateReasonAr(sameAccount), 'نفس المبلغ والبند، بفارق 3 أيام على الأكثر');
});

// ── the entry date ──────────────────────────────────────────────────────────────────────────────

check('entry date: today and earlier days are fine, the first day of the books included', () => {
  assert.equal(guards.entryDateError('2026-10-19', '2026-10-19'), null);
  assert.equal(guards.entryDateError('2026-10-18', '2026-10-19'), null);
  assert.equal(guards.entryDateError('2020-01-01', '2026-10-19'), null);
  assert.equal(guards.EARLIEST_ENTRY_DATE, '2020-01-01');
});

check('entry date: a day that has not come yet is refused, even by one day (a typed year must not post to the future)', () => {
  assert.match(guards.entryDateError('2026-10-20', '2026-10-19'), /لم يحن بعد/);
  assert.match(guards.entryDateError('2062-10-19', '2026-10-19'), /لم يحن بعد/);
  // the comparison is by calendar day, so the end of a month is not mistaken for the next one
  assert.equal(guards.entryDateError('2026-10-31', '2026-10-31'), null);
  assert.match(guards.entryDateError('2026-11-01', '2026-10-31'), /لم يحن بعد/);
});

check('entry date: before the books start, or not a real day, is refused with its own sentence', () => {
  assert.match(guards.entryDateError('2019-12-31', '2026-10-19'), /قبل 2020/);
  assert.match(guards.entryDateError('0202-10-19', '2026-10-19'), /قبل 2020/);
  for (const bad of ['', 'soon', '2026-13-01', '2026-02-30', '19/10/2026', '275760-09-13']) {
    assert.equal(guards.entryDateError(bad, '2026-10-19'), 'حدّد تاريخ العملية', JSON.stringify(bad));
  }
  assert.equal(guards.entryDateError('2028-02-29', '2028-03-01'), null, 'a leap day is a real day');
  assert.equal(guards.entryDateError('2027-02-29', '2028-03-01'), 'حدّد تاريخ العملية', 'but not in a common year');
});

// ── cheque and transfer details ─────────────────────────────────────────────────────────────────

const pay = (over) => guards.validatePaymentDetails({ method: 'CHEQUE', ...over });

check('cheque: the number is required; nothing else is', () => {
  const r = pay({ chequeNumber: '' });
  assert.equal(r.ok, false);
  assert.equal(r.errors.chequeNumber, 'أدخل رقم الصك.');
  assert.equal(pay({ chequeNumber: '   ' }).ok, false);
  const ok = pay({ chequeNumber: '004512' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.fields, { cheque_number: '004512' });
});

check('cheque: number, bank and date are kept tidy; Arabic-Indic digits become digits', () => {
  const r = pay({ chequeNumber: ' ٠٠٤٥١٢ ', chequeBank: '  مصرف   الجمهورية ', chequeDate: '2026-12-31' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.fields, { cheque_number: '004512', cheque_bank: 'مصرف الجمهورية', cheque_date: '2026-12-31' });
});

check('cheque: a post-dated cheque is fine; an impossible or absurd date is refused', () => {
  assert.equal(pay({ chequeNumber: '1', chequeDate: '2027-06-30' }).ok, true);
  assert.equal(pay({ chequeNumber: '1', chequeDate: '2026-02-30' }).errors.chequeDate, 'تاريخ الصك غير صالح.');
  assert.equal(pay({ chequeNumber: '1', chequeDate: '1999-01-01' }).ok, false);
  assert.equal(pay({ chequeNumber: '1', chequeDate: 'غداً' }).ok, false);
  assert.equal(pay({ chequeNumber: '1', chequeDate: '' }).ok, true, 'an empty date means «the transaction date»');
});

check('cheque: punctuation alone and over-long numbers are refused, letters and dashes are allowed', () => {
  assert.equal(pay({ chequeNumber: '---' }).errors.chequeNumber, 'رقم الصك غير صالح.');
  assert.equal(pay({ chequeNumber: '1'.repeat(41) }).ok, false);
  assert.equal(pay({ chequeNumber: '1'.repeat(40) }).ok, true);
  assert.equal(pay({ chequeNumber: 'AB-123/4' }).fields.cheque_number, 'AB-123/4');
});

check('cheque: both errors are reported together', () => {
  const r = pay({ chequeNumber: '', chequeDate: '2026-02-30' });
  assert.deepEqual(Object.keys(r.errors).sort(), ['chequeDate', 'chequeNumber']);
  assert.deepEqual(r.fields, {}, 'nothing half-valid is passed on');
});

check('transfer: the reference is optional and kept; cash and card carry nothing, whatever was typed before', () => {
  assert.deepEqual(guards.validatePaymentDetails({ method: 'TRANSFER', reference: ' TRX-77 ' }).fields, { reference: 'TRX-77' });
  assert.equal(guards.validatePaymentDetails({ method: 'TRANSFER', reference: '' }).ok, true);
  const stale = { chequeNumber: '99', chequeBank: 'x', chequeDate: '2026-01-01', reference: 'r' };
  assert.deepEqual(guards.validatePaymentDetails({ method: 'CASH', ...stale }).fields, {});
  assert.deepEqual(guards.validatePaymentDetails({ method: 'CARD', ...stale }).fields, {});
  assert.deepEqual(guards.validatePaymentDetails({ method: 'TRANSFER', ...stale }).fields, { reference: 'r' }, 'no cheque columns on a transfer');
  assert.deepEqual(guards.validatePaymentDetails({ method: 'CHEQUE', ...stale }).fields, { cheque_number: '99', cheque_bank: 'x', cheque_date: '2026-01-01' }, 'no reference on a cheque');
});

check('rent collections carry the cheque or transfer in the description', () => {
  assert.equal(guards.paymentNoteAr('CHEQUE', { cheque_number: '4512', cheque_bank: 'مصرف الجمهورية' }), 'صك رقم 4512 · مصرف الجمهورية');
  assert.equal(guards.paymentNoteAr('CHEQUE', { cheque_number: '4512' }), 'صك رقم 4512');
  assert.equal(guards.paymentNoteAr('TRANSFER', { reference: 'TRX-77' }), 'حوالة رقم TRX-77');
  assert.equal(guards.paymentNoteAr('TRANSFER', {}), null);
  assert.equal(guards.paymentNoteAr('CASH', { cheque_number: '1' }), null);
  assert.equal(guards.withPaymentNote('تحصيل إيجار: أكتوبر 2026', 'صك رقم 4512'), 'تحصيل إيجار: أكتوبر 2026 · صك رقم 4512');
  assert.equal(guards.withPaymentNote('تحصيل إيجار: أكتوبر 2026 · صك رقم 4512', 'صك رقم 4512'), 'تحصيل إيجار: أكتوبر 2026 · صك رقم 4512', 'never written twice');
  assert.equal(guards.withPaymentNote('  ', 'صك رقم 1'), 'صك رقم 1');
  assert.equal(guards.withPaymentNote(' نص ', null), 'نص');
});

// ── description nudge ───────────────────────────────────────────────────────────────────────────

check('description: nudged once when empty, never when written, already nudged, or written by the system', () => {
  assert.equal(guards.needsDescriptionNudge({ description: '', alreadyNudged: false }), true);
  assert.equal(guards.needsDescriptionNudge({ description: '   ', alreadyNudged: false }), true);
  assert.equal(guards.needsDescriptionNudge({ description: 'كهرباء', alreadyNudged: false }), false);
  assert.equal(guards.needsDescriptionNudge({ description: '', alreadyNudged: true }), false, 'the second press goes through');
  assert.equal(guards.needsDescriptionNudge({ description: '', alreadyNudged: false, autoDescribed: true }), false);
});

check('description: the suggestion joins account, party and month, and only needs one of the first two', () => {
  assert.equal(sug.suggestDescription({ categoryName: 'كهرباء', contactName: 'مؤسسة النور', date: '2026-10-18' }), 'كهرباء · مؤسسة النور · أكتوبر 2026');
  assert.equal(sug.suggestDescription({ categoryName: 'كهرباء', date: '2026-10-18' }), 'كهرباء · أكتوبر 2026');
  assert.equal(sug.suggestDescription({ contactName: ' مؤسسة النور ', date: '2026-01-02' }), 'مؤسسة النور · يناير 2026');
  assert.equal(sug.suggestDescription({ categoryName: 'كهرباء', contactName: 'س', date: 'bad' }), 'كهرباء · س');
  assert.equal(sug.suggestDescription({ date: '2026-10-18' }), null);
  assert.equal(sug.suggestDescription({ categoryName: '  ', contactName: null }), null);
});

// ── repeat a transaction ────────────────────────────────────────────────────────────────────────

const source = (over = {}) => ({
  kind: 'EXPENSE',
  status: 'POSTED',
  number: 812,
  amount: '1250.000',
  method: 'CHEQUE',
  description: '  كهرباء سبتمبر ',
  category_id: 'k1',
  cashbox_id: 'b1',
  category: { code: 'EXP-ELC' },
  contact: { id: 'c1', name: 'مؤسسة النور', kind: 'VENDOR' },
  cheque_number: '4512',
  tx_date: '2026-09-02',
  ...over,
});

check('repeat: starts from the row — party, account, box, method, amount and description; not the date or the cheque', () => {
  const p = guards.repeatPrefillFrom(source());
  assert.deepEqual(p, {
    kind: 'EXPENSE',
    amount: 1250,
    contactId: 'c1',
    contactKind: 'VENDOR',
    description: 'كهرباء سبتمبر',
    categoryId: 'k1',
    cashboxId: 'b1',
    method: 'CHEQUE',
    repeatOf: { number: 812, contactName: 'مؤسسة النور' },
  });
  assert.equal('date' in p || 'tx_date' in p || 'cheque_number' in p, false);
});

check('repeat: a draft or voided row can be repeated (it makes a new posted one)', () => {
  assert.ok(guards.repeatPrefillFrom(source({ status: 'DRAFT' })));
  assert.ok(guards.repeatPrefillFrom(source({ status: 'VOIDED' })));
});

check('repeat: only revenue and expense; transfers, openings and adjustments are not', () => {
  for (const kind of ['TRANSFER', 'OPENING', 'ADJUSTMENT', '']) assert.equal(guards.repeatPrefillFrom(source({ kind })), null, kind);
  assert.equal(guards.repeatPrefillFrom(source({ kind: 'REVENUE' })).kind, 'REVENUE');
});

check('repeat: a rent collection leaves the description to the months chosen', () => {
  const p = guards.repeatPrefillFrom(source({ kind: 'REVENUE', category: { code: 'REV-RNT' }, description: 'تحصيل إيجار: مارس 2026', contact: { id: 't1', name: 'مستأجر', kind: 'TENANT' } }));
  assert.equal(p.description, undefined);
  assert.equal(p.contactKind, 'TENANT');
});

check('repeat: missing or odd values are left out, not invented', () => {
  const p = guards.repeatPrefillFrom(source({ amount: '0', description: null, category_id: null, cashbox_id: null, method: 'BARTER', contact: null }));
  assert.equal(p.amount, undefined);
  assert.equal(p.description, undefined);
  assert.equal(p.categoryId, undefined);
  assert.equal(p.cashboxId, undefined);
  assert.equal(p.method, undefined);
  assert.equal(p.contactId, undefined);
  assert.equal(p.contactKind, undefined);
  assert.deepEqual(p.repeatOf, { number: 812, contactName: undefined });
  assert.equal(guards.repeatPrefillFrom(source({ contact: { id: 'o1', name: 'س', kind: 'OTHER' } })).contactKind, 'ALL');
  assert.equal(guards.repeatPrefillFrom(source({ amount: '1249.5500000000002' })).amount, 1249.55);
});

check('repeat: allowed to whoever may create that kind', () => {
  assert.equal(guards.repeatPermissionKey('REVENUE'), 'revenue.create');
  assert.equal(guards.repeatPermissionKey('EXPENSE'), 'expense.create');
  assert.equal(guards.repeatPermissionKey('TRANSFER'), null);
});

// ── suggestions ─────────────────────────────────────────────────────────────────────────────────

const h = (id, number, date, category, over = {}) => ({ id, number, kind: 'EXPENSE', status: 'POSTED', amount: '100', tx_date: date, created_at: `${date}T09:00:00Z`, category_id: category, ...over });

check('history: the usual account is the most used one; a tie goes to the most recent', () => {
  const rows = [h('1', 1, '2026-01-10', 'k1'), h('2', 2, '2026-02-10', 'k2'), h('3', 3, '2026-03-10', 'k2'), h('4', 4, '2026-04-10', 'k1'), h('5', 5, '2026-05-10', 'k3')];
  assert.deepEqual(sug.suggestCategoryFromHistory(rows, 'EXPENSE'), { categoryId: 'k1', count: 2 }, 'k1 and k2 tie at 2; k1 is newer');
  assert.deepEqual(sug.suggestCategoryFromHistory([...rows, h('6', 6, '2026-06-10', 'k2')], 'EXPENSE'), { categoryId: 'k2', count: 3 });
});

check('history: other kinds, draft and voided rows, unknown accounts and rows without one do not count', () => {
  const rows = [
    h('1', 1, '2026-01-10', 'k1', { kind: 'REVENUE' }),
    h('2', 2, '2026-01-11', 'k1', { status: 'VOIDED' }),
    h('3', 3, '2026-01-12', 'k1', { status: 'DRAFT' }),
    h('4', 4, '2026-01-13', null),
    h('5', 5, '2026-01-14', 'gone'),
    h('6', 6, '2026-01-15', 'k2', { status: 'RECONCILED' }),
  ];
  assert.deepEqual(sug.suggestCategoryFromHistory(rows, 'EXPENSE', new Set(['k1', 'k2'])), { categoryId: 'k2', count: 1 });
  assert.equal(sug.suggestCategoryFromHistory(rows, 'EXPENSE', new Set(['k9'])), null);
  assert.equal(sug.suggestCategoryFromHistory([], 'EXPENSE'), null);
  assert.deepEqual(sug.suggestCategoryFromHistory(rows, 'REVENUE'), { categoryId: 'k1', count: 1 }, 'revenue history is read for a revenue');
});

check('history: the last payment is the newest by date, then entry time, then number', () => {
  const rows = [h('a', 1, '2026-03-01', 'k1', { amount: '10' }), h('b', 2, '2026-03-05', 'k1', { amount: '20' }), h('c', 3, '2026-03-05', 'k1', { amount: '30', created_at: '2026-03-05T18:00:00Z' })];
  assert.deepEqual(sug.lastPaymentFromHistory(rows, 'EXPENSE'), { id: 'c', number: 3, amount: 30, date: '2026-03-05' });
  const sameInstant = [h('x', 7, '2026-03-05', 'k1', { amount: '5' }), h('y', 9, '2026-03-05', 'k1', { amount: '6' })];
  assert.equal(sug.lastPaymentFromHistory(sameInstant, 'EXPENSE').id, 'y', 'the higher number');
});

check('history: the last payment ignores voided rows, zero amounts and other kinds; none is null', () => {
  const rows = [h('a', 1, '2026-03-01', 'k1', { amount: '10' }), h('v', 2, '2026-04-01', 'k1', { status: 'VOIDED' }), h('z', 3, '2026-04-02', 'k1', { amount: '0' }), h('r', 4, '2026-04-03', 'k1', { kind: 'REVENUE' })];
  assert.equal(sug.lastPaymentFromHistory(rows, 'EXPENSE').id, 'a');
  assert.equal(sug.lastPaymentFromHistory([], 'EXPENSE'), null);
  assert.equal(sug.lastPaymentFromHistory([rows[1]], 'EXPENSE'), null);
  assert.equal(sug.lastPaymentFromHistory([h('f', 5, '2026-05-01', 'k1', { amount: '1249.5500000000002' })], 'EXPENSE').amount, 1249.55);
});

check('history: the chips read as sentences', () => {
  const last = { id: 'a', number: 1, amount: 1250, date: '2026-10-03' };
  const text = sug.lastPaymentLabelAr('EXPENSE', last);
  assert.ok(text.startsWith('آخر دفعة '), text);
  assert.ok(text.includes('1,250'), text);
  assert.ok(text.endsWith('بتاريخ 03 أكتوبر 2026'), text);
  assert.ok(sug.lastPaymentLabelAr('REVENUE', last).startsWith('آخر تحصيل '));
  assert.equal(sug.usedTimesAr(1), 'استُخدم مرة واحدة');
  assert.equal(sug.usedTimesAr(2), 'استُخدم مرتين');
  assert.equal(sug.usedTimesAr(8), 'استُخدم 8 مرات');
  assert.equal(sug.usedTimesAr(12), 'استُخدم 12 مرة');
});

// ── recent and frequent first ───────────────────────────────────────────────────────────────────

const use = (contact, category, date) => ({ contact_id: contact, category_id: category, tx_date: date });

check('usage: recent uses weigh more than old ones — three last month beat ten two years ago', () => {
  const rows = [
    use('recent', 'k1', '2026-10-01'),
    use('recent', 'k1', '2026-09-25'),
    use('recent', 'k1', '2026-09-20'),
    ...Array.from({ length: 10 }, () => use('old', 'k2', '2024-10-01')),
  ];
  const u = sug.buildUsage(rows, '2026-10-18');
  assert.ok(u.contacts.get('recent') > u.contacts.get('old'));
  assert.ok(u.categories.get('k1') > u.categories.get('k2'));
});

check('usage: one use today counts 1, and counts half after the half-life', () => {
  const today = sug.buildUsage([use('c', null, '2026-10-18')], '2026-10-18');
  assert.ok(Math.abs(today.contacts.get('c') - 1) < 1e-9);
  const older = sug.buildUsage([use('c', null, '2026-08-19')], '2026-10-18', 60);
  assert.ok(Math.abs(older.contacts.get('c') - 0.5) < 1e-9);
});

check('usage: a future or unreadable date still counts a little, and missing ids are skipped', () => {
  const u = sug.buildUsage([use('f', 'k', '2027-01-01'), use('bad', 'k', 'oops'), use(null, null, '2026-10-18')], '2026-10-18');
  assert.ok(Math.abs(u.contacts.get('f') - 1) < 1e-9, 'a future date counts as today');
  assert.ok(u.contacts.get('bad') > 0 && u.contacts.get('bad') < 0.5);
  assert.equal(u.contacts.size, 2);
  assert.equal(sug.buildUsage([], '2026-10-18').contacts.size, 0);
});

check('usage: the most used come first, capped, with the rest in their own order and nothing lost', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id }));
  const usage = new Map([['c', 3], ['e', 5], ['a', 0.1], ['g', 2]]);
  const { frequent, rest } = sug.splitFrequent(items, (i) => i.id, usage, { max: 2 });
  assert.deepEqual(frequent.map((i) => i.id), ['e', 'c']);
  assert.deepEqual(rest.map((i) => i.id), ['a', 'b', 'd', 'f', 'g']);
  assert.equal(frequent.length + rest.length, items.length);
});

check('usage: below the minimum score is not "frequent"; no usage at all leaves the list untouched', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(sug.splitFrequent(items, (i) => i.id, new Map([['a', 0.05]])).frequent, []);
  const none = sug.splitFrequent(items, (i) => i.id, new Map());
  assert.deepEqual(none.frequent, []);
  assert.deepEqual(none.rest, items);
  const tie = sug.splitFrequent([{ id: 'x' }, { id: 'y' }], (i) => i.id, new Map([['x', 1], ['y', 1]]));
  assert.deepEqual(tie.frequent.map((i) => i.id), ['x', 'y'], 'equal use keeps the given order');
});

console.log(`\n${passed} checks passed`);
