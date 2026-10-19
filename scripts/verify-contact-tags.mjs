/**
 * The machine tags kept in contacts.notes ([role:x], [since:YYYY-MM]): reading in every spelling people and
 * older versions produced, writing one canonical form, hiding them from screens, and the landlord helpers
 * (a landlord is the role tag, not the contact kind; the suggestion only reads).
 *   npx tsx scripts/verify-contact-tags.mjs
 */
import assert from 'node:assert/strict';

const tags = await import('../src/lib/contacts/contact-tags.ts');
const roles = await import('../src/lib/contacts/contact-roles.ts');
const { readTags, visibleNotes, withRole, withSince, composeNotes, isLandlord, suggestLandlord, landlordSuggestionText, toSinceMonth } = tags;
const { extractContactBusinessRole, visibleContactNotes, encodeContactRoleFields } = roles;

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

// ---- reading ----

check('nothing in, nothing out', () => {
  for (const v of [null, undefined, '', '   ', '\n\r\n']) {
    assert.deepEqual(readTags(v), { role: null, since: null });
    assert.equal(visibleNotes(v), '');
  }
});

check('the role tag in every spelling', () => {
  for (const notes of ['[role:landlord]', '[ROLE:LANDLORD]', '[ role : landlord ]', 'role:landlord', 'سطر\r\n[role:Landlord]\r\n', '[role:landlord] عقد الموقع']) {
    assert.equal(readTags(notes).role, 'LANDLORD', notes);
  }
  assert.equal(readTags('[role:SUPPLIER_GOODS] مورد اختبار').role, 'SUPPLIER_GOODS');
  assert.equal(readTags('[role:other]').role, 'OTHER');
});

check('a role that does not exist is not a role', () => {
  assert.equal(readTags('[role:wizard]').role, null);
  assert.equal(readTags('the role: manager').role, null);
});

check('several role tags: the strongest wins, in the order contact-roles always used', () => {
  assert.equal(readTags('[role:customer]\n[role:landlord]').role, 'LANDLORD');
  assert.equal(readTags('[role:landlord]\n[role:customer]').role, 'LANDLORD');
  assert.equal(readTags('[role:customer] [role:tenant]').role, 'TENANT');
  assert.equal(readTags('[role:other] [role:customer]').role, 'CUSTOMER');
});

check('the since tag in every spelling', () => {
  for (const notes of ['[since:2026-06]', '[SINCE:2026-06]', '[ since : 2026-6 ]', '[since:2026/06]', '[since:2026-06-15]', '[since:٢٠٢٦-٠٦]', 'نص\r\n[since:2026-06]']) {
    assert.equal(readTags(notes).since, '2026-06', notes);
  }
});

check('a since tag that is not a month is ignored, and still hidden', () => {
  for (const notes of ['[since:2026-13]', '[since:2026-00]', '[since:soon]', '[since:]', '[since:26-06]']) {
    assert.equal(readTags(notes).since, null, notes);
    assert.equal(visibleNotes(`ملاحظة ${notes}`), 'ملاحظة', notes);
  }
});

check('repeated since tags: the last real month wins; a bad one after it does not erase it', () => {
  assert.equal(readTags('[since:2026-01]\n[since:2026-06]').since, '2026-06');
  assert.equal(readTags('[since:2026-06]\n[since:oops]').since, '2026-06');
});

check('toSinceMonth reads what a month field or a date gives', () => {
  assert.equal(toSinceMonth('2026-07'), '2026-07');
  assert.equal(toSinceMonth('2026-07-31'), '2026-07');
  assert.equal(toSinceMonth(' 2026-7 '), '2026-07');
  assert.equal(toSinceMonth('٢٠٢٦-٠٧'), '2026-07');
  for (const bad of ['', null, undefined, 'july', '2026-13', '2026-00', '2026-07-40', '2026-07-00', '2026', '07-2026']) assert.equal(toSinceMonth(bad), null);
});

// ---- hiding ----

check('visible notes: Arabic text stays exactly, tags go, line breaks come back as \\n', () => {
  assert.equal(visibleNotes('عقد إيجار موقع المولدات\n[role:landlord]\n[since:2026-06]'), 'عقد إيجار موقع المولدات');
  assert.equal(visibleNotes('[role:landlord] عقد إيجار موقع المولدات'), 'عقد إيجار موقع المولدات');
  assert.equal(visibleNotes('سطر أول\r\n[role:customer]\r\nسطر ثانٍ\r\n[since:2026-06]\r\n'), 'سطر أول\nسطر ثانٍ');
  assert.equal(visibleNotes('قبل [role:landlord] بعد'), 'قبل بعد');
  assert.equal(visibleNotes('[role:landlord][since:2026-06]'), '');
  assert.equal(visibleNotes('[role:landlord] [role:customer] [since:2026-01]'), '');
});

check('visible notes keep the blank lines a person typed', () => {
  assert.equal(visibleNotes('فقرة\n\nفقرة ثانية\n[role:tenant]'), 'فقرة\n\nفقرة ثانية');
});

check('visibleContactNotes is the same function', () => {
  for (const n of ['x [role:landlord]', '[since:2026-06]\nملاحظة', null, '']) assert.equal(visibleContactNotes(n), visibleNotes(n));
});

check('no tag survives in the visible text, whatever the input', () => {
  const nasty = 'a [ROLE : Landlord ]\r\n[ since:2026-6 ] b role:customer\n[since:???]\n[role:service_provider]';
  const v = visibleNotes(nasty);
  assert.ok(!/role\s*:|since\s*:/i.test(v), v);
  assert.equal(v, 'a\nb');
});

// ---- writing ----

check('withRole writes text, then the role tag', () => {
  assert.equal(withRole('ملاحظة', 'LANDLORD'), 'ملاحظة\n[role:landlord]');
  assert.equal(withRole('', 'CUSTOMER'), '[role:customer]');
  assert.equal(withRole(null, 'SUPPLIER_WATER'), '[role:supplier_water]');
});

check('withRole replaces whatever role was there and keeps the since tag', () => {
  assert.equal(withRole('ملاحظة\n[role:customer]\n[since:2026-06]', 'LANDLORD'), 'ملاحظة\n[role:landlord]\n[since:2026-06]');
  assert.equal(withRole('[role:customer] x role:tenant', 'EMPLOYEE'), 'x\n[role:employee]');
  assert.equal(withRole('ملاحظة\n[role:customer]', null), 'ملاحظة');
});

check('withSince writes the month after the role tag and keeps the rest', () => {
  assert.equal(withSince('ملاحظة\n[role:landlord]', '2026-06'), 'ملاحظة\n[role:landlord]\n[since:2026-06]');
  assert.equal(withSince('ملاحظة', '2026-06'), 'ملاحظة\n[since:2026-06]');
  assert.equal(withSince(null, '2026-06'), '[since:2026-06]');
  assert.equal(withSince('ملاحظة\n[role:landlord]\n[since:2026-01]', '2026-06'), 'ملاحظة\n[role:landlord]\n[since:2026-06]');
});

check('withSince null or empty removes it; a bad month throws instead of vanishing', () => {
  assert.equal(withSince('ملاحظة\n[role:landlord]\n[since:2026-06]', null), 'ملاحظة\n[role:landlord]');
  assert.equal(withSince('[since:2026-06]', ''), '');
  assert.equal(withSince('ملاحظة', undefined), 'ملاحظة');
  for (const bad of ['2026-13', '2026', 'يونيو', '2026-6', '2026-06-01']) assert.throws(() => withSince('x', bad), RangeError, bad);
});

check('composeNotes refuses a bad month too', () => {
  assert.throws(() => composeNotes({ since: '2026-1' }), RangeError);
  assert.equal(composeNotes({}), '');
  assert.equal(composeNotes({ text: '  x  ', role: 'TENANT', since: '2026-02' }), 'x\n[role:tenant]\n[since:2026-02]');
});

check('round trips: the person text never changes, tags are idempotent', () => {
  const samples = [
    'ملاحظة بسيطة',
    'سطر 1\nسطر 2',
    'سطر 1\r\nسطر 2\r\n',
    'قبل [role:customer] بعد',
    '[role:landlord] عقد\n[since:2025-12]',
    '',
    null,
    'فقرة\n\nفقرة ثانية',
  ];
  for (const s of samples) {
    const text = visibleNotes(s);
    for (const role of ['LANDLORD', 'CUSTOMER', 'SUPPLIER_ELECTRICITY', 'EMPLOYEE', 'OTHER']) {
      const once = withRole(s, role);
      assert.equal(visibleNotes(once), text, `${JSON.stringify(s)} → ${role}`);
      assert.equal(readTags(once).role, role);
      assert.equal(withRole(once, role), once, 'withRole is idempotent');
      const dated = withSince(once, '2026-06');
      assert.equal(visibleNotes(dated), text);
      assert.deepEqual(readTags(dated), { role, since: '2026-06' });
      assert.equal(withSince(dated, '2026-06'), dated, 'withSince is idempotent');
      assert.equal(withRole(dated, role), dated, 'order does not matter');
      assert.equal(withSince(withRole(withSince(s, '2026-06'), role), '2026-06'), dated, 'any order gives one form');
    }
  }
});

check('the edit form round trip keeps the tracking start: encodeContactRoleFields reads it from the stored note', () => {
  const stored = 'عقد الموقع\n[role:landlord]\n[since:2026-06]';
  // the form shows the visible text and saves it back
  const shown = visibleContactNotes(stored);
  assert.equal(shown, 'عقد الموقع');
  const { updatedNotes, kind, roleTag } = encodeContactRoleFields('LANDLORD', stored);
  assert.equal(updatedNotes, stored);
  assert.equal(kind, 'VENDOR');
  assert.equal(roleTag, 'role:landlord');
  // saving only the visible text would drop the tag unless the caller carries it
  assert.equal(encodeContactRoleFields('LANDLORD', shown).updatedNotes, 'عقد الموقع\n[role:landlord]');
  assert.equal(encodeContactRoleFields('LANDLORD', shown, { since: '2026-06' }).updatedNotes, stored);
  assert.equal(encodeContactRoleFields('LANDLORD', stored, { since: null }).updatedNotes, 'عقد الموقع\n[role:landlord]');
  assert.equal(encodeContactRoleFields('LANDLORD', stored, { since: '2026-09' }).updatedNotes, 'عقد الموقع\n[role:landlord]\n[since:2026-09]');
  assert.equal(encodeContactRoleFields('CUSTOMER', null).updatedNotes, '[role:customer]');
  assert.throws(() => encodeContactRoleFields('CUSTOMER', 'x', { since: 'bad' }), RangeError);
});

// ---- roles read through the tags ----

check('extractContactBusinessRole is unchanged by the move: tag first, then kind, then the older rules', () => {
  assert.equal(extractContactBusinessRole({ kind: 'CUSTOMER', notes: '[role:landlord]' }), 'LANDLORD');
  assert.equal(extractContactBusinessRole({ kind: 'VENDOR', notes: '[role:SUPPLIER_ELECTRICITY]' }), 'SUPPLIER_ELECTRICITY');
  assert.equal(extractContactBusinessRole({ kind: 'VENDOR', notes: 'سطر\r\n[role:service_provider]' }), 'SERVICE_PROVIDER');
  assert.equal(extractContactBusinessRole({ kind: 'CUSTOMER', notes: null }), 'CUSTOMER');
  assert.equal(extractContactBusinessRole({ kind: 'TENANT', notes: '' }), 'TENANT');
  assert.equal(extractContactBusinessRole({ kind: 'VENDOR', notes: '', monthly_rent: '500' }), 'LANDLORD');
  assert.equal(extractContactBusinessRole({ kind: 'VENDOR', notes: '' }), 'SUPPLIER_GOODS');
  assert.equal(extractContactBusinessRole({ kind: 'VENDOR', notes: '[role:other]' }), 'SUPPLIER_GOODS', 'role:other never decided anything');
  assert.equal(extractContactBusinessRole({ kind: 'OTHER', notes: '' }), 'OTHER');
  assert.equal(extractContactBusinessRole(null), 'OTHER');
  // the tag wins over the kind and over a landlord job title
  assert.equal(extractContactBusinessRole({ kind: 'VENDOR', job_title: 'مؤجر للمول', notes: '[role:supplier_water]' }), 'SUPPLIER_WATER');
});

// ---- landlords ----

check('a landlord is the tag, under vendors or customers', () => {
  assert.equal(isLandlord({ kind: 'VENDOR', notes: '[role:landlord]' }), true);
  assert.equal(isLandlord({ kind: 'CUSTOMER', notes: 'x\n[role:landlord]\n[since:2026-07]' }), true);
  assert.equal(isLandlord({ kind: 'CUSTOMER', notes: '' }), false);
  assert.equal(isLandlord({ kind: 'CUSTOMER', notes: '[role:customer]', monthly_rent: '9000' }), false);
  assert.equal(isLandlord({ kind: 'VENDOR', notes: '[role:supplier_water]' }), false);
  assert.equal(isLandlord({ kind: 'VENDOR', notes: '', monthly_rent: '25000' }), true, 'a vendor with a monthly rent is read as a landlord, as before');
  assert.equal(isLandlord({ kind: 'TENANT', notes: '[role:landlord]' }), false);
  assert.equal(isLandlord({ kind: 'EMPLOYEE', notes: '[role:landlord]' }), false);
  assert.equal(isLandlord({ notes: '[role:landlord]' }), false, 'no kind, no answer');
  assert.equal(isLandlord(null), false);
  assert.equal(isLandlord(undefined), false);
});

const rentTx = (over = {}) => ({ kind: 'EXPENSE', status: 'POSTED', amount: '25000', tx_date: '2026-07-30', category: { code: 'EXP-RNT' }, ...over });

check('suggestion: rent paid, no revenue, a customer file', () => {
  const s = suggestLandlord([rentTx(), rentTx({ tx_date: '2026-07-31', amount: '27000' }), rentTx({ tx_date: '2026-08-31', status: 'RECONCILED' })], { kind: 'CUSTOMER', notes: '' });
  assert.equal(s.suggest, true);
  assert.equal(s.reason, 'rent_without_revenue');
  assert.equal(s.rentPayments, 3);
  assert.equal(s.rentTotal, 77000);
  assert.equal(s.revenueCount, 0);
  assert.equal(s.firstPaidOn, '2026-07-30');
  assert.equal(s.lastPaidOn, '2026-08-31');
  assert.equal(landlordSuggestionText(s), 'دُفع له إيجار في 3 دفعات، ولا يوجد إيراد منه.');
});

check('suggestion: text agrees with the count', () => {
  const one = suggestLandlord([rentTx()]);
  assert.equal(landlordSuggestionText(one), 'دُفع له إيجار في دفعة واحدة، ولا يوجد إيراد منه.');
  const two = suggestLandlord([rentTx(), rentTx()]);
  assert.equal(landlordSuggestionText(two), 'دُفع له إيجار في دفعتين، ولا يوجد إيراد منه.');
  const eleven = suggestLandlord(Array.from({ length: 11 }, () => rentTx()));
  assert.equal(landlordSuggestionText(eleven), 'دُفع له إيجار في 11 دفعة، ولا يوجد إيراد منه.');
  assert.equal(landlordSuggestionText(suggestLandlord([])), null);
});

check('suggestion: only counted rows; drafts and voided rows do not make a landlord', () => {
  const s = suggestLandlord([rentTx({ status: 'DRAFT' }), rentTx({ status: 'VOIDED' })]);
  assert.equal(s.suggest, false);
  assert.equal(s.reason, 'no_rent_payments');
  assert.equal(s.rentPayments, 0);
});

check('suggestion: other expenses are not rent (a water utility, an electricity company)', () => {
  assert.equal(suggestLandlord([rentTx({ category: { code: 'EXP-WTR' } })]).suggest, false);
  assert.equal(suggestLandlord([rentTx({ category: { code: 'EXP-ELC' } })]).suggest, false);
  assert.equal(suggestLandlord([rentTx({ category: null })]).suggest, false);
  assert.equal(suggestLandlord([rentTx({ category: { code: ' exp-rnt ' } })]).suggest, true, 'code spelling is forgiven');
});

check('suggestion: any revenue from the contact means it is not only a landlord', () => {
  const s = suggestLandlord([rentTx(), { ...rentTx(), kind: 'REVENUE', category: { code: 'REV-RNT' } }]);
  assert.equal(s.suggest, false);
  assert.equal(s.reason, 'has_revenue');
  assert.equal(s.revenueCount, 1);
  // an uncounted revenue is not revenue
  assert.equal(suggestLandlord([rentTx(), { ...rentTx(), kind: 'REVENUE', status: 'VOIDED' }]).suggest, true);
});

check('suggestion: quiet for a contact that already is one or can not be one', () => {
  const tx = [rentTx()];
  assert.equal(suggestLandlord(tx, { kind: 'VENDOR', notes: '[role:landlord]' }).reason, 'already_landlord');
  assert.equal(suggestLandlord(tx, { kind: 'TENANT', notes: '' }).reason, 'not_vendor_or_customer');
  assert.equal(suggestLandlord(tx, { kind: 'EMPLOYEE', notes: '' }).suggest, false);
  assert.equal(suggestLandlord(tx, { kind: 'VENDOR', notes: '[role:supplier_goods]' }).suggest, true);
});

check('suggestion: string amounts, junk amounts and an empty list', () => {
  const s = suggestLandlord([rentTx({ amount: '1,5' }), rentTx({ amount: null }), rentTx({ amount: '100.5' })]);
  assert.equal(s.rentPayments, 3);
  assert.equal(s.rentTotal, 100.5);
  const none = suggestLandlord([]);
  assert.deepEqual([none.suggest, none.reason, none.rentPayments, none.firstPaidOn, none.lastPaidOn], [false, 'no_rent_payments', 0, null, null]);
});

check('the suggestion changes nothing it was given', () => {
  const tx = [rentTx()];
  const contact = Object.freeze({ kind: 'CUSTOMER', notes: 'x' });
  const before = JSON.stringify(tx);
  suggestLandlord(tx, contact);
  assert.equal(JSON.stringify(tx), before);
});

console.log(`\n✓ verify-contact-tags: ${passed} checks passed`);
