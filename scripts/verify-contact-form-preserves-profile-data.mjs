import assert from 'node:assert/strict';
import * as contactFormUtils from '../src/lib/contacts/form-utils';
const { buildContactPayload, contactToFormState } = contactFormUtils;

const contact = {
  id: 'contact-test-id',
  code: 'C-TEST',
  kind: 'VENDOR',
  name: 'مورد الاختبار',
  name_en: 'Test Supplier',
  phone: '0910000000',
  phone2: null,
  email: 'supplier@example.test',
  address: 'طرابلس',
  id_number: 'ID-12345',
  tax_number: 'TAX-54321',
  shop_number: null,
  floor: null,
  area_sqm: null,
  contract_start: null,
  contract_end: null,
  monthly_rent: null,
  job_title: null,
  department: null,
  hire_date: '2022-04-03',
  salary: null,
  is_active: false,
  notes: '[role:SUPPLIER_GOODS] مورد اختبار',
  portal_token: null,
  created_at: '2022-01-01T00:00:00.000Z',
  updated_at: '2022-01-01T00:00:00.000Z',
};

const payload = buildContactPayload(contactToFormState(contact));

assert.equal(payload.name_en, contact.name_en, 'editing must preserve the English name');
assert.equal(payload.id_number, contact.id_number, 'editing must preserve the identity number');
assert.equal(payload.tax_number, contact.tax_number, 'editing must preserve the tax number');
assert.equal(payload.hire_date, contact.hire_date, 'editing must preserve the hire date');
assert.equal(payload.is_active, false, 'editing must preserve an inactive contact');
assert.equal(typeof contactFormUtils.canCreateContactTransaction, 'function', 'contact transaction policy should be testable');
assert.equal(contactFormUtils.canCreateContactTransaction(true, true), true, 'active contact with permission may transact');
assert.equal(contactFormUtils.canCreateContactTransaction(false, true), false, 'inactive contact cannot start a transaction');
assert.equal(contactFormUtils.canCreateContactTransaction(true, false), false, 'missing permission cannot start a transaction');

const contactLedgerUtils = await import('../src/lib/contacts/contact-transactions.ts').catch(() => null);
assert.ok(contactLedgerUtils, 'contact transaction history must use a testable complete-page loader');
const requestedPages = [];
const rows = await contactLedgerUtils.fetchAllContactPages(async (offset, pageSize) => {
  requestedPages.push([offset, pageSize]);
  return Array.from({ length: Math.max(0, Math.min(pageSize, 250 - offset)) }, (_, index) => offset + index);
}, 100);
assert.equal(rows.length, 250, 'profile ledger must include rows beyond the first 200 transactions');
assert.deepEqual(requestedPages, [[0, 100], [100, 100], [200, 100]], 'pagination must stop after the final short page');
assert.equal(typeof contactLedgerUtils.getCountedContactTransactions, 'function', 'financial summaries should count posted and reconciled transactions');
assert.deepEqual(
  contactLedgerUtils.getCountedContactTransactions([
    { id: 'posted', status: 'POSTED' },
    { id: 'draft', status: 'DRAFT' },
    { id: 'voided', status: 'VOIDED' },
    { id: 'reconciled', status: 'RECONCILED' },
    { id: 'none' },
  ]).map((transaction) => transaction.id),
  ['posted', 'reconciled'],
  'draft and voided entries must not inflate profile totals, while reconciled entries are real money and must count',
);
assert.deepEqual(contactLedgerUtils.getCountedContactTransactions([]), [], 'a contact with no transactions counts nothing');

// ── what an edit must never wipe: the machine tags in the notes, the tracking month, the kind a landlord is filed under ──

const landlord = {
  ...contact,
  id: 'landlord-test-id',
  kind: 'CUSTOMER',
  name: 'ميلاد الورفلي',
  phone: '+218 91 3000222',
  phone2: 'مكتب 021-480',
  email: null,
  job_title: 'مؤجر للمول',
  monthly_rent: '27000',
  shop_number: 'أرض المواقف',
  contract_start: '2026-01-01',
  contract_end: '2026-12-31',
  is_active: true,
  notes: 'عقد سنوي يُجدد في يناير\n[role:landlord]\n[since:2026-06]',
};
const opened = contactFormUtils.contactToFormState(landlord);
assert.equal(opened.notes, 'عقد سنوي يُجدد في يناير', 'the form shows the note without its machine tags');
assert.equal(opened.since, '2026-06', 'the tracking month is carried by the form, not shown as text');
assert.equal(opened.businessRole, 'LANDLORD');

const untouched = contactFormUtils.buildContactPayload(opened, opened);
assert.equal(untouched.notes, landlord.notes, 'saving an unchanged form rewrites the notes exactly');
assert.equal(untouched.kind, 'CUSTOMER', 'a landlord filed under customers stays there (the role alone would say vendor)');
assert.equal(untouched.phone, '+218 91 3000222', 'a phone number that was not touched is saved as it was');
assert.equal(untouched.phone2, 'مكتب 021-480', 'text that is not a number is never thrown away');
for (const key of ['job_title', 'monthly_rent', 'shop_number', 'contract_start', 'contract_end']) {
  assert.equal(untouched[key], landlord[key], `editing must preserve ${key}`);
}

const edited = contactFormUtils.buildContactPayload({ ...opened, notes: 'عقد سنوي، تغيّر الإيجار', phone: '٠٩١٣٠٠٠٢٢٢' }, opened);
assert.equal(edited.notes, 'عقد سنوي، تغيّر الإيجار\n[role:landlord]\n[since:2026-06]', 'a changed note keeps both tags');
assert.equal(edited.phone, '0913000222', 'a phone that was typed is written the standard way');

const cleared = contactFormUtils.buildContactPayload({ ...opened, notes: '' }, opened);
assert.equal(cleared.notes, '[role:landlord]\n[since:2026-06]', 'emptying the note leaves the tags, not a role-less file');

const profileLib = await import('../src/lib/people/party-profile.ts');
assert.deepEqual(
  profileLib.reconcileSavePayload(untouched, landlord, opened),
  untouched,
  'the profile page correction has nothing left to fix on a payload built by this form',
);

console.log('PASS: contact fields, inactive-state policy, complete pagination, counted (posted and reconciled) totals, and notes tags, tracking month and kind surviving an edit');
