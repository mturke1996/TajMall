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

console.log('PASS: contact fields, inactive-state policy, complete pagination, and counted (posted and reconciled) totals');
