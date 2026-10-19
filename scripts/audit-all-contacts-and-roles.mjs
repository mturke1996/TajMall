import {
  CONTACT_ROLES,
  extractContactBusinessRole,
  encodeContactRoleFields,
  buildLandlordRentSchedule,
} from '../src/lib/contacts/contact-roles.js';
import {
  contactToFormState,
  buildContactPayload,
} from '../src/lib/contacts/form-utils.js';

console.log('=== 1. Testing All 8 Business Roles Encoding & Detection ===');

const allRoles = [
  'TENANT',
  'LANDLORD',
  'SUPPLIER_ELECTRICITY',
  'SUPPLIER_WATER',
  'SUPPLIER_GOODS',
  'SERVICE_PROVIDER',
  'EMPLOYEE',
  'CUSTOMER',
];

for (const role of allRoles) {
  const meta = CONTACT_ROLES[role];
  if (!meta) throw new Error(`Missing metadata for role ${role}`);

  const form = {
    name: `اختبار ${meta.label}`,
    businessRole: role,
    phone: '0912345678',
    notes: 'ملاحظة أولية',
    monthly_rent: role === 'LANDLORD' || role === 'TENANT' ? '4500' : '',
    salary: role === 'EMPLOYEE' ? '3000' : '',
    shop_number: '101',
    floor: 'الأول',
  };

  const payload = buildContactPayload(form);
  const simulatedSavedContact = {
    id: `id-${role}`,
    name: payload.name,
    kind: payload.kind,
    job_title: payload.job_title,
    department: payload.department,
    monthly_rent: payload.monthly_rent,
    salary: payload.salary,
    shop_number: payload.shop_number,
    floor: payload.floor,
    notes: payload.notes,
    contract_start: payload.contract_start,
    contract_end: payload.contract_end,
    phone: payload.phone,
    is_active: true,
  };

  const detectedRole = extractContactBusinessRole(simulatedSavedContact);
  if (detectedRole !== role) {
    throw new Error(`Role mismatch for ${role}: detected ${detectedRole}`);
  }
  console.log(`✓ Role [${role}] encoded and detected with 100% precision.`);
}

console.log('\n=== 2. Testing Sequential Conversions on a Single Contact ===');
let currentContact = {
  id: 'dynamic-contact-1',
  name: 'شركة الطارق العالمية',
  kind: 'CUSTOMER',
  notes: 'عميل مسجل منذ 2024',
  job_title: null,
  department: null,
  monthly_rent: null,
  salary: null,
  shop_number: null,
  floor: null,
  contract_start: null,
  contract_end: null,
  phone: '0920001122',
  is_active: true,
};

// Conversion chain: CUSTOMER -> SUPPLIER_GOODS -> LANDLORD -> SUPPLIER_ELECTRICITY -> CUSTOMER
const conversionChain = [
  'SUPPLIER_GOODS',
  'LANDLORD',
  'SUPPLIER_ELECTRICITY',
  'EMPLOYEE',
  'TENANT',
  'CUSTOMER',
];

for (const targetRole of conversionChain) {
  const formState = contactToFormState(currentContact);
  formState.businessRole = targetRole;
  if (targetRole === 'LANDLORD') {
    formState.monthly_rent = '6000';
    formState.shop_number = 'مقر الإدارة والمخازن';
  } else if (targetRole === 'EMPLOYEE') {
    formState.salary = '2800';
    formState.job_title = 'محاسب مالي';
  }

  const payload = buildContactPayload(formState);
  currentContact = {
    ...currentContact,
    kind: payload.kind,
    job_title: payload.job_title,
    department: payload.department,
    monthly_rent: payload.monthly_rent,
    salary: payload.salary,
    shop_number: payload.shop_number,
    notes: payload.notes,
  };

  const detected = extractContactBusinessRole(currentContact);
  if (detected !== targetRole) {
    throw new Error(`Chain conversion failed for ${targetRole}: detected ${detected}`);
  }
  console.log(`✓ Converted seamlessly to [${targetRole}] -> Detected as [${detected}]`);
}

console.log('\n=== 3. Testing Landlord Rent Schedule Under Varied Transactions ===');
const testLandlord = {
  id: 'landlord-alpha',
  name: 'الحاج مصطفى السويحلي',
  kind: 'VENDOR',
  job_title: 'مؤجر للمول',
  monthly_rent: 10000,
  shop_number: 'قطعة الأرض رقم 14',
  contract_start: '2026-01-01',
  contract_end: '2026-12-31',
  notes: '[role:landlord]',
};

const sampleTransactions = [
  // Jan paid in full (10,000)
  {
    id: 'tx-1',
    tx_date: '2026-01-10',
    kind: 'EXPENSE',
    status: 'POSTED',
    amount: 10000,
    contact_id: 'landlord-alpha',
  },
  // Feb paid in 2 installments (6,000 + 4,000)
  {
    id: 'tx-2',
    tx_date: '2026-02-05',
    kind: 'EXPENSE',
    status: 'POSTED',
    amount: 6000,
    contact_id: 'landlord-alpha',
  },
  {
    id: 'tx-3',
    tx_date: '2026-02-20',
    kind: 'EXPENSE',
    status: 'POSTED',
    amount: 4000,
    contact_id: 'landlord-alpha',
  },
  // Mar partial (3,500 out of 10,000)
  {
    id: 'tx-4',
    tx_date: '2026-03-15',
    kind: 'EXPENSE',
    status: 'POSTED',
    amount: 3500,
    contact_id: 'landlord-alpha',
  },
  // Draft cash plan must not count as money paid.
  {
    id: 'tx-5-draft',
    tx_date: '2026-04-15',
    kind: 'EXPENSE',
    status: 'DRAFT',
    amount: 20000,
    contact_id: 'landlord-alpha',
  },
];

// read as of the end of the year: every one of the 12 months has started
const schedule = buildLandlordRentSchedule(testLandlord, sampleTransactions, 2026, { today: '2026-12-31' });
if (schedule.totalExpected !== 120000) throw new Error('Schedule expected total mismatch');
if (schedule.totalPaid !== 23500) throw new Error('Schedule paid total mismatch');
if (schedule.totalOutstanding !== 96500) throw new Error('Schedule outstanding mismatch');
if (schedule.paidMonthsCount !== 2) throw new Error('Paid months count mismatch');
if (schedule.partialMonthsCount !== 1) throw new Error('Partial months count mismatch');
if (schedule.unpaidMonthsCount !== 9) throw new Error('Unpaid months count mismatch');

console.log('✓ Landlord rent calculations verified with 100% precision:');
console.log(`  - Total Expected: ${schedule.totalExpected} LYD`);
console.log(`  - Total Paid: ${schedule.totalPaid} LYD`);
console.log(`  - Total Outstanding: ${schedule.totalOutstanding} LYD`);
console.log(`  - Paid Months: ${schedule.paidMonthsCount}, Partial: ${schedule.partialMonthsCount}, Unpaid: ${schedule.unpaidMonthsCount}`);

console.log('\n=== ALL SYSTEM-WIDE CHECKS & RE-VERIFICATIONS PASSED 100%! ===');
