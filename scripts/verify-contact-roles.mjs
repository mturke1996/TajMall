/**
 * Verification script for Contact Roles & Landlord Schedule
 */
import {
  extractContactBusinessRole,
  buildLandlordRentSchedule,
  encodeContactRoleFields,
} from '../src/lib/contacts/contact-roles.ts';

console.log('--- Testing Contact Business Roles Engine ---');

// 1. Test Mall Landlord (المول مستأجر منه)
const landlordContact = {
  id: 'c-landlord-1',
  kind: 'VENDOR',
  name: 'شركة الأفق للاستثمار العقاري (مؤجر أرضية المولدات)',
  shop_number: 'أرضية المولدات والمواقف الخارجية',
  floor: 'خارجي',
  area_sqm: '600',
  monthly_rent: '5000',
  job_title: 'مؤجر للمول',
  department: 'عقارات مؤجرة',
  notes: '[role:landlord] عقد إيجار موقع المولدات والمخازن',
};

const landlordRole = extractContactBusinessRole(landlordContact);
console.log('Landlord role detected:', landlordRole);
if (landlordRole !== 'LANDLORD') {
  throw new Error(`Expected LANDLORD, got ${landlordRole}`);
}

// 2. Test Landlord Rent Schedule for 2026
const dummyTxs = [
  {
    id: 'tx-1',
    contact_id: 'c-landlord-1',
    kind: 'EXPENSE',
    amount: '5000',
    tx_date: '2026-01-15',
    description: 'سداد إيجار شهر يناير 2026',
    status: 'POSTED',
  },
  {
    id: 'tx-2',
    contact_id: 'c-landlord-1',
    kind: 'EXPENSE',
    amount: '2500',
    tx_date: '2026-02-10',
    description: 'دفعة من إيجار شهر فبراير 2026',
    status: 'POSTED',
  },
  {
    id: 'tx-3',
    contact_id: 'c-landlord-1',
    kind: 'EXPENSE',
    amount: '5000',
    tx_date: '2026-07-01',
    description: 'سداد إيجار شهر يوليو 2026 مقدماً',
    status: 'POSTED',
  },
];

const schedule = buildLandlordRentSchedule(landlordContact, dummyTxs, 2026);
console.log('Schedule Summary:', {
  monthlyRent: schedule.monthlyRent,
  totalExpected: schedule.totalExpected,
  totalPaid: schedule.totalPaid,
  totalOutstanding: schedule.totalOutstanding,
  paidMonthsCount: schedule.paidMonthsCount,
  partialMonthsCount: schedule.partialMonthsCount,
  unpaidMonthsCount: schedule.unpaidMonthsCount,
});

if (schedule.monthlyRent !== 5000) throw new Error('Invalid monthly rent');
if (schedule.totalExpected !== 60000) throw new Error('Expected 60000 for 12 months');
if (schedule.totalPaid !== 12500) throw new Error('Expected 12500 paid');
if (schedule.paidMonthsCount !== 2) throw new Error('Expected 2 fully paid months (Jan & Jul)');
if (schedule.partialMonthsCount !== 1) throw new Error('Expected 1 partial month (Feb)');
if (schedule.unpaidMonthsCount !== 9) throw new Error('Expected 9 unpaid months');

// 3. Test Electricity Supplier
const electricitySupplier = {
  id: 'c-elec-1',
  kind: 'VENDOR',
  name: 'الشركة العامة للكهرباء ومحطات التوليد',
  shop_number: 'عداد 104 - المحطة الرئيسية',
  department: 'كهرباء وطاقة',
  notes: '[role:supplier_electricity] تزويد الطاقة وصيانة المولدات',
};
const elecRole = extractContactBusinessRole(electricitySupplier);
console.log('Electricity supplier role:', elecRole);
if (elecRole !== 'SUPPLIER_ELECTRICITY') throw new Error(`Expected SUPPLIER_ELECTRICITY, got ${elecRole}`);

// 4. Test Water Supplier
const waterSupplier = {
  id: 'c-water-1',
  kind: 'VENDOR',
  name: 'مؤسسة النقاء لتوريد صهاريج المياه',
  shop_number: 'خزان المياه العلوي',
  department: 'مياه وصرف',
  notes: '[role:supplier_water] توريد صهاريج مياه للشرب والنظافة',
};
const waterRole = extractContactBusinessRole(waterSupplier);
console.log('Water supplier role:', waterRole);
if (waterRole !== 'SUPPLIER_WATER') throw new Error(`Expected SUPPLIER_WATER, got ${waterRole}`);

console.log('✓ ALL CONTACT ROLES & LANDLORD SCHEDULE TESTS PASSED SUCCESSFULLY!');
