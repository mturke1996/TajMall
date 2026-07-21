/**
 * تحقق سريع من مساعدات ربط الموردين/العملاء (بدون بناء Next).
 * التشغيل: node scripts/verify-party-contacts.mjs
 */
import assert from 'node:assert/strict';

const CUSTOMER_SERVICE_REVENUE_CODES = [
  'REV-PRK',
  'REV-SVC',
  'REV-ADV',
  'REV-KSK',
  'REV-EVT',
  'REV-LIC',
  'REV-PEN',
];
const VENDOR_SERVICE_EXPENSE_CODES = [
  'EXP-MNT',
  'EXP-CLN',
  'EXP-SEC',
  'EXP-EQP',
  'EXP-MAT',
  'EXP-CON',
];
const EMPLOYEE_SALARY_CODES = ['EXP-SAL', 'EXP-SLR'];

function isCustomerServiceRevenueCode(code) {
  return CUSTOMER_SERVICE_REVENUE_CODES.includes(code);
}
function isVendorServiceExpenseCode(code) {
  return VENDOR_SERVICE_EXPENSE_CODES.includes(code);
}
function isEmployeeSalaryCode(code) {
  return EMPLOYEE_SALARY_CODES.includes(code);
}
function isRentRevenueCode(code) {
  return code === 'REV-RNT' || code === 'REV-SRV';
}

function suggestedContactKindForTx(txKind, categoryCode) {
  if (txKind === 'REVENUE') {
    if (isRentRevenueCode(categoryCode)) return 'TENANT';
    if (isCustomerServiceRevenueCode(categoryCode)) return 'CUSTOMER';
    return 'ALL';
  }
  if (isEmployeeSalaryCode(categoryCode)) return 'EMPLOYEE';
  if (isVendorServiceExpenseCode(categoryCode)) return 'VENDOR';
  return 'VENDOR';
}

function aggregatePartyTotals(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.contactId) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    let agg = map.get(row.contactId);
    if (!agg) {
      agg = {
        contactId: row.contactId,
        contactName: row.contactName || '—',
        phone: row.phone ?? null,
        total: 0,
        txCount: 0,
        byCategory: [],
      };
      map.set(row.contactId, agg);
    }
    agg.total += amount;
    agg.txCount += 1;
    const code = row.categoryCode ?? '—';
    const nameAr = row.categoryNameAr ?? code;
    let cat = agg.byCategory.find((c) => c.code === code);
    if (!cat) {
      cat = { code, nameAr, total: 0, count: 0 };
      agg.byCategory.push(cat);
    }
    cat.total += amount;
    cat.count += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

assert.equal(suggestedContactKindForTx('REVENUE', 'REV-RNT'), 'TENANT');
assert.equal(suggestedContactKindForTx('REVENUE', 'REV-PRK'), 'CUSTOMER');
assert.equal(suggestedContactKindForTx('REVENUE', 'REV-SVC'), 'CUSTOMER');
assert.equal(suggestedContactKindForTx('REVENUE', 'REV-GEN'), 'ALL');
assert.equal(suggestedContactKindForTx('EXPENSE', 'EXP-CLN'), 'VENDOR');
assert.equal(suggestedContactKindForTx('EXPENSE', 'EXP-SAL'), 'EMPLOYEE');
assert.equal(suggestedContactKindForTx('EXPENSE', 'EXP-SLR'), 'EMPLOYEE');
assert.equal(isCustomerServiceRevenueCode('REV-ADV'), true);
assert.equal(isVendorServiceExpenseCode('EXP-SEC'), true);
assert.equal(isEmployeeSalaryCode('EXP-SAL'), true);

const agg = aggregatePartyTotals([
  {
    contactId: 'a',
    contactName: 'مورد أ',
    amount: 100,
    categoryCode: 'EXP-CLN',
    categoryNameAr: 'نظافة',
  },
  {
    contactId: 'a',
    contactName: 'مورد أ',
    amount: 50,
    categoryCode: 'EXP-CLN',
    categoryNameAr: 'نظافة',
  },
  {
    contactId: 'b',
    contactName: 'عميل ب',
    amount: 200,
    categoryCode: 'REV-PRK',
    categoryNameAr: 'مواقف',
  },
]);

assert.equal(agg.length, 2);
assert.equal(agg[0].contactId, 'b');
assert.equal(agg[0].total, 200);
assert.equal(agg[1].contactId, 'a');
assert.equal(agg[1].total, 150);
assert.equal(agg[1].txCount, 2);
assert.equal(agg[1].byCategory[0].total, 150);

console.log('✓ verify-party-contacts: all assertions passed');
