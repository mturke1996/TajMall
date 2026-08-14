/**
 * Verification script for Contact Role Conversion
 */
import {
  buildContactPayload,
  contactToFormState,
  defaultContactFormState,
} from '../src/lib/contacts/form-utils.ts';
import { extractContactBusinessRole } from '../src/lib/contacts/contact-roles.ts';

console.log('--- Testing Contact Role Conversion ---');

// 1. Existing general vendor
const existingVendor = {
  id: 'c-100',
  kind: 'VENDOR',
  name: 'مؤسسة الشروق',
  phone: '0912345678',
  job_title: null,
  department: null,
  notes: 'مورد قديم مسجل من البداية',
  monthly_rent: null,
};

console.log('Initial role of existing vendor:', extractContactBusinessRole(existingVendor));

// 2. User edits existing vendor and converts them to LANDLORD (مؤجر للمول)
const formState = contactToFormState(existingVendor);
formState.businessRole = 'LANDLORD';
formState.monthly_rent = '7500';
formState.shop_number = 'مخازن المنطقة الغربية';
formState.contract_start = '2026-01-01';
formState.contract_end = '2026-12-31';

const updatePayload = buildContactPayload(formState);
console.log('Payload after converting to LANDLORD:', {
  kind: updatePayload.kind,
  job_title: updatePayload.job_title,
  monthly_rent: updatePayload.monthly_rent,
  shop_number: updatePayload.shop_number,
  notes: updatePayload.notes,
});

if (updatePayload.kind !== 'VENDOR') throw new Error('Landlord DB kind must be VENDOR');
if (updatePayload.monthly_rent !== '7500') throw new Error('Monthly rent must be 7500');
if (!updatePayload.notes?.includes('role:landlord')) throw new Error('Notes must include role:landlord tag');

// Simulated updated contact in DB
const updatedLandlord = {
  ...existingVendor,
  ...updatePayload,
};

const detectedRole = extractContactBusinessRole(updatedLandlord);
console.log('Detected role after conversion to LANDLORD:', detectedRole);
if (detectedRole !== 'LANDLORD') throw new Error(`Expected LANDLORD, got ${detectedRole}`);

// 3. User now converts this landlord to Electricity Supplier (مورد كهرباء)
const formState2 = contactToFormState(updatedLandlord);
formState2.businessRole = 'SUPPLIER_ELECTRICITY';
formState2.department = 'محطة التوليد الرئيسية';
formState2.shop_number = 'عداد رقم 88';

const updatePayload2 = buildContactPayload(formState2);
console.log('Payload after converting to SUPPLIER_ELECTRICITY:', {
  kind: updatePayload2.kind,
  department: updatePayload2.department,
  notes: updatePayload2.notes,
});

if (!updatePayload2.notes?.includes('role:supplier_electricity')) {
  throw new Error('Notes must contain role:supplier_electricity');
}
if (updatePayload2.notes?.includes('role:landlord')) {
  throw new Error('Old role tag must be cleared');
}

const updatedElectricity = {
  ...updatedLandlord,
  ...updatePayload2,
  monthly_rent: null, // cleared
};
const detectedRole2 = extractContactBusinessRole(updatedElectricity);
console.log('Detected role after conversion to ELECTRICITY:', detectedRole2);
if (detectedRole2 !== 'SUPPLIER_ELECTRICITY') throw new Error(`Expected SUPPLIER_ELECTRICITY, got ${detectedRole2}`);

console.log('✓ CONTACT ROLE CONVERSION VERIFIED WITH 100% SUCCESS!');
