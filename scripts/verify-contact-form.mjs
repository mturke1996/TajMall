/**
 * The add and edit form for vendors, customers, landlords, tenants and employees: phone numbers, duplicate
 * matching, what the form saves for each kind and role, what it refuses (field by field), moving a file between
 * kinds, and what an employee's pay and file turn into. No database and no React.
 *   npx tsx scripts/verify-contact-form.mjs
 */
import assert from 'node:assert/strict';

const phone = await import('../src/lib/contacts/phone.ts');
const dup = await import('../src/lib/contacts/duplicates.ts');
const utils = await import('../src/lib/contacts/form-utils.ts');
const rules = await import('../src/lib/contacts/form-rules.ts');
const roles = await import('../src/lib/contacts/contact-roles.ts');
const tags = await import('../src/lib/contacts/contact-tags.ts');
const profile = await import('../src/lib/people/party-profile.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const base = (o = {}) => ({
  id: 'x', code: 'X', kind: 'VENDOR', name: 'مورد', name_en: null, phone: null, phone2: null, email: null, address: null,
  id_number: null, tax_number: null, shop_number: null, floor: null, area_sqm: null, contract_start: null, contract_end: null,
  monthly_rent: null, job_title: null, department: null, hire_date: null, salary: null, is_active: true, notes: null,
  portal_token: null, created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z', ...o,
});
const form = (role, o = {}, kind) => ({ ...utils.defaultContactFormState(role, kind), name: 'اسم', ...o });

// ───────────────────────────────────────────── phone numbers

check('a Libyan mobile is recognised however it is written and always stored the same way', () => {
  for (const raw of ['0912345678', '091 2345678', '091-234-5678', '+218912345678', '+218 91 2345678', '00218912345678',
    '912345678', '+218 0912345678', '٠٩١٢٣٤٥٦٧٨', '(091) 2345678']) {
    const p = phone.parsePhone(raw);
    assert.equal(p.kind, 'mobile', raw);
    assert.equal(p.canonical, '0912345678', raw);
    assert.equal(p.display, '091 2345678', raw);
    assert.equal(p.problem, null, raw);
  }
});

check('every spelling of one number has the same key; different numbers have different keys', () => {
  assert.equal(phone.phoneKey('0912345678'), phone.phoneKey('+218 91 234 5678'));
  assert.equal(phone.phoneKey('٠٩١٢٣٤٥٦٧٨'), phone.phoneKey('912345678'));
  assert.notEqual(phone.phoneKey('0912345678'), phone.phoneKey('0922345678'));
  assert.equal(phone.phoneKey(''), null);
  assert.equal(phone.phoneKey('0912'), null, 'an incomplete number is not a key');
});

check('a landline is accepted and spaced after the area code', () => {
  const p = phone.parsePhone('0214801234');
  assert.equal(p.kind, 'landline');
  assert.equal(p.canonical, '0214801234');
  assert.equal(p.display, '021 4801234');
  assert.equal(phone.parsePhone('+218 21 4801234').canonical, '0214801234');
});

check('a number from another country is kept as it is', () => {
  const p = phone.parsePhone('+90 555 123 4567');
  assert.equal(p.kind, 'international');
  assert.equal(p.canonical, '+905551234567');
  assert.equal(phone.parsePhone('00905551234567').canonical, '+905551234567');
  assert.equal(phone.parsePhone('+12').kind, 'invalid');
});

check('a wrong mobile says what a mobile looks like; letters are refused; an empty phone is fine', () => {
  const short = phone.parsePhone('091234567');
  assert.equal(short.kind, 'invalid');
  assert.match(short.problem, /10 أرقام/);
  assert.equal(phone.parsePhone('09123456789').kind, 'invalid');
  assert.equal(phone.parsePhone('123').kind, 'invalid');
  assert.match(phone.parsePhone('091x234567').problem, /أرقاماً/);
  assert.equal(phone.parsePhone('').kind, 'empty');
  assert.equal(phone.parsePhone('   ').problem, null);
  assert.equal(phone.parsePhone(null).kind, 'empty');
});

check('saving never destroys an old value: complete numbers are standardised, anything else is kept as typed', () => {
  assert.equal(phone.normalizePhoneForSave('+218 91 2345678'), '0912345678');
  assert.equal(phone.normalizePhoneForSave(''), null);
  assert.equal(phone.normalizePhoneForSave('   '), null);
  assert.equal(phone.normalizePhoneForSave('مكتب 0912'), 'مكتب 0912');
  assert.equal(phone.displayPhone('0912345678'), '091 2345678');
  assert.equal(phone.displayPhone('0912'), '0912');
});

check('the input keeps digits and the characters a number is written with', () => {
  assert.equal(phone.cleanPhoneInput('٠٩١ abc 234-5678'), '091  234-5678');
  assert.equal(phone.cleanPhoneInput('+218'), '+218');
});

check('odd input never throws and never reads as a number: nothing, only symbols, too many digits, a null', () => {
  for (const raw of [undefined, null, '', ' ', '+', '00', '()', '---', '+++', '١٢٣٤٥٦٧٨٩٠١٢٣٤٥٦٧٨٩٠', '😀', {}, 5]) {
    const p = phone.parsePhone(raw);
    assert.ok(['empty', 'invalid'].includes(p.kind), String(raw));
    assert.equal(p.key, '', String(raw));
  }
  assert.equal(phone.parsePhone('+1234567890123456').kind, 'invalid', 'more than 15 digits is not a number');
  assert.equal(phone.parsePhone('0912345678').key, phone.parsePhone(912345678).key, 'a number given as a number reads the same');
  assert.equal(phone.normalizePhoneForSave('+++'), '+++', 'an entry that is not a number is kept as typed');
  assert.equal(phone.displayPhone('+++'), '+++');
});

check('names are compared through diacritics, the elongation mark, hamza and ta marbuta', () => {
  const list = dup.prepareContacts([base({ id: 'z', name: 'مُؤَسَّسَة الأمـل', kind: 'CUSTOMER' }), base({ id: 'y', name: null, kind: 'CUSTOMER' })]);
  assert.deepEqual(dup.findContactMatches(list, { name: 'مؤسسه الامل' }).map((m) => m.contact.id), ['z']);
  assert.deepEqual(dup.findContactMatches([], { name: 'أي اسم', phones: ['0912345678'] }), [], 'an empty directory finds nothing');
  assert.deepEqual(dup.findContactMatches(list, { name: null, phones: [null, undefined, ''] }), []);
});

// ───────────────────────────────────────────── duplicates

const directory = [
  base({ id: 'a', name: 'عبد الله المصراتي', phone: '0919000111', kind: 'VENDOR' }),
  base({ id: 'b', name: 'شركة النور للتجارة', phone: '+218 92 1112223', kind: 'CUSTOMER' }),
  base({ id: 'c', name: 'محمد الطاهر', phone2: '0944445555', kind: 'EMPLOYEE', is_active: false }),
  base({ id: 'd', name: 'محمد الطاهر بن علي', phone: null, kind: 'CUSTOMER' }),
  base({ id: 'e', name: 'أحمد سالم', phone: '0911110000', kind: 'EMPLOYEE' }),
  base({ id: 'f', name: 'احمد', phone: null, kind: 'CUSTOMER' }),
];
const prepared = dup.prepareContacts(directory);
const find = (probe, opts) => dup.findContactMatches(prepared, probe, opts);
const ids = (m) => m.map((x) => x.contact.id);

check('the same name is found through spelling, spacing, the article and word order', () => {
  assert.deepEqual(ids(find({ name: 'عبدالله المصراتي' })), ['a']);
  assert.deepEqual(ids(find({ name: 'المصراتي عبد الله' })), ['a']);
  assert.deepEqual(ids(find({ name: 'شركة نور للتجارة' })), ['b']);
  assert.deepEqual(ids(find({ name: 'احمد سالم' })), ['e']);
  assert.equal(find({ name: 'عبدالله المصراتي' })[0].reasons[0], 'same_name');
});

check('the same phone is found whatever its spelling, also on the second number', () => {
  const m = find({ phones: ['٠٩١٩٠٠٠١١١'] });
  assert.deepEqual(ids(m), ['a']);
  assert.deepEqual(m[0].reasons, ['phone']);
  assert.deepEqual(ids(find({ phones: ['+218 92 1112223'] })), ['b']);
  assert.deepEqual(ids(find({ phones: ['0944445555'] })), ['c']);
});

check('a phone and a name that point at one contact are one match with both reasons, ranked first', () => {
  const m = find({ name: 'محمد الطاهر', phones: ['0944445555'] });
  assert.equal(m[0].contact.id, 'c');
  assert.deepEqual(m[0].reasons, ['phone', 'same_name']);
  assert.ok(ids(m).includes('d'), 'the longer name that holds this one is similar');
  assert.equal(m.find((x) => x.contact.id === 'd').reasons[0], 'similar_name');
});

check('half a word, a lone common word and an incomplete number warn about nothing', () => {
  assert.deepEqual(find({ name: 'مح' }), []);
  assert.deepEqual(find({ name: 'محمد' }), [], 'one word does not make every محمد a copy');
  assert.deepEqual(find({ name: 'عبد' }), []);
  assert.deepEqual(find({ phones: ['091900'] }), []);
  assert.deepEqual(find({}), []);
});

check('one slip of a letter in a long name is similar; a different name is not', () => {
  assert.deepEqual(ids(find({ name: 'عبدالله المصراتى' })), ['a']);
  assert.deepEqual(find({ name: 'خالد عمر' }), []);
});

check('a contact does not match itself, inactive ones are still found, and the list is capped', () => {
  assert.deepEqual(ids(find({ name: 'عبد الله المصراتي' }, { excludeId: 'a' })), []);
  assert.ok(find({ phones: ['0944445555'] })[0].contact.is_active === false);
  const many = dup.prepareContacts(Array.from({ length: 12 }, (_, i) => base({ id: `m${i}`, name: 'سالم الشريف', phone: '0913000222' })));
  assert.equal(dup.findContactMatches(many, { name: 'سالم الشريف' }).length, 4);
  assert.equal(dup.findContactMatches(many, { name: 'سالم الشريف' }, { limit: 2 }).length, 2);
});

// ───────────────────────────────────────────── kinds and roles

check('the kinds on offer are the four, and a landlord is a role of vendors and of customers', () => {
  assert.deepEqual([...rules.KIND_CHOICES], ['VENDOR', 'CUSTOMER', 'EMPLOYEE', 'TENANT']);
  assert.ok(rules.ROLES_BY_KIND.VENDOR.includes('LANDLORD'));
  assert.ok(rules.ROLES_BY_KIND.CUSTOMER.includes('LANDLORD'));
  assert.ok(!rules.ROLES_BY_KIND.EMPLOYEE.includes('LANDLORD'));
  assert.deepEqual([...rules.ROLES_BY_KIND.CUSTOMER], ['CUSTOMER', 'LANDLORD']);
});

check('choosing another kind keeps what was typed and keeps the landlord role between vendors and customers', () => {
  const f = form('LANDLORD', { phone: '0912345678', notes: 'ملاحظة', since: '2026-06' }, 'VENDOR');
  const toCustomers = rules.switchKind(f, 'CUSTOMER');
  assert.equal(toCustomers.kind, 'CUSTOMER');
  assert.equal(toCustomers.businessRole, 'LANDLORD');
  assert.equal(toCustomers.phone, '0912345678');
  assert.equal(toCustomers.since, '2026-06');
  const toEmployee = rules.switchKind(f, 'EMPLOYEE');
  assert.equal(toEmployee.businessRole, 'EMPLOYEE');
  assert.equal(toEmployee.notes, 'ملاحظة');
  const back = rules.switchKind(form('SUPPLIER_WATER'), 'CUSTOMER');
  assert.equal(back.businessRole, 'CUSTOMER', 'a supplier role is not a customer role');
  assert.equal(rules.switchKind(form('CUSTOMER'), 'VENDOR').businessRole, 'SUPPLIER_GOODS');
  assert.equal(rules.switchKind(form('CUSTOMER'), 'TENANT').businessRole, 'TENANT');
});

check('choosing a role sets the kind it needs, and a landlord stays in the list it was filed in', () => {
  assert.equal(rules.switchRole(form('SUPPLIER_GOODS'), 'SUPPLIER_WATER').kind, 'VENDOR');
  assert.equal(rules.switchRole(form('CUSTOMER', {}, 'CUSTOMER'), 'LANDLORD').kind, 'CUSTOMER');
  assert.equal(rules.switchRole(form('SUPPLIER_GOODS', {}, 'VENDOR'), 'LANDLORD').kind, 'VENDOR');
  assert.equal(rules.switchRole(form('LANDLORD', {}, 'CUSTOMER'), 'CUSTOMER').kind, 'CUSTOMER');
});

check('a new landlord from the customers list is filed as a customer; from the vendors list as a vendor', () => {
  assert.equal(rules.startingKind('LANDLORD'), 'CUSTOMER');
  assert.equal(rules.startingKind('LANDLORD', 'CUSTOMER'), 'CUSTOMER');
  assert.equal(rules.startingKind('LANDLORD', 'VENDOR'), 'VENDOR');
  assert.equal(rules.startingKind('SUPPLIER_WATER'), 'VENDOR');
  assert.equal(rules.startingKind('TENANT'), 'TENANT');
});

check('an existing file moves between vendors and customers; a tenant and an employee keep their kind', () => {
  assert.equal(rules.canMoveTo('VENDOR', 'CUSTOMER'), true);
  assert.equal(rules.canMoveTo('CUSTOMER', 'VENDOR'), true);
  assert.equal(rules.canMoveTo('OTHER', 'CUSTOMER'), true);
  assert.equal(rules.canMoveTo('VENDOR', 'EMPLOYEE'), false);
  assert.equal(rules.canMoveTo('CUSTOMER', 'TENANT'), false);
  assert.equal(rules.canMoveTo('TENANT', 'VENDOR'), false);
  assert.equal(rules.canMoveTo('EMPLOYEE', 'CUSTOMER'), false);
  assert.equal(rules.canMoveTo('TENANT', 'TENANT'), true);
  assert.equal(rules.canMoveTo(null, 'EMPLOYEE'), true, 'a new file may be anything');
});

check('messages and warnings name the file correctly: a landlord is a landlord whatever list it is filed in', () => {
  assert.equal(rules.nounFor('LANDLORD', 'CUSTOMER'), 'المؤجر');
  assert.equal(rules.nounFor('LANDLORD', 'VENDOR'), 'المؤجر');
  assert.equal(rules.nounFor('SUPPLIER_WATER', 'VENDOR'), 'المورد');
  assert.equal(rules.nounFor('CUSTOMER', 'CUSTOMER'), 'العميل');
  assert.equal(rules.nounFor('EMPLOYEE', 'EMPLOYEE'), 'الموظف');
  assert.equal(rules.nounFor('TENANT', 'TENANT'), 'المستأجر');
  assert.equal(rules.nounFor('OTHER', 'OTHER'), 'الجهة');
  assert.equal(rules.kindOrRoleLabel({ kind: 'CUSTOMER' }, 'LANDLORD'), 'مؤجر للمول');
  assert.equal(rules.kindOrRoleLabel({ kind: 'VENDOR' }, 'SUPPLIER_GOODS'), 'مورد');
  assert.equal(rules.kindOrRoleLabel({ kind: 'OTHER' }, 'OTHER'), 'جهة أخرى');
});

// ───────────────────────────────────────────── what is saved

check('a vendor: kind, category, tag and the cleared fields', () => {
  const p = utils.buildContactPayload(form('SUPPLIER_ELECTRICITY', { tax_number: ' 123 ', shop_number: '104', monthly_rent: '500', salary: '900', phone: '٠٩١٢٣٤٥٦٧٨' }));
  assert.equal(p.kind, 'VENDOR');
  assert.equal(p.department, 'كهرباء وطاقة');
  assert.equal(p.tax_number, '123');
  assert.equal(p.shop_number, '104');
  assert.equal(p.monthly_rent, null, 'a supplier with a rent would read as a landlord');
  assert.equal(p.salary, null);
  assert.equal(p.phone, '0912345678');
  assert.match(p.notes, /\[role:supplier_electricity\]/);
});

check('a typed category is kept; one the form filled in follows the role', () => {
  assert.equal(utils.buildContactPayload(form('SUPPLIER_GOODS', { department: 'ديزل مولدات' })).department, 'ديزل مولدات');
  assert.equal(utils.buildContactPayload(form('SERVICE_PROVIDER', { department: 'بضاعة ومواد' })).department, 'خدمات ومقاولات');
  assert.equal(utils.buildContactPayload(form('CUSTOMER', { department: 'بضاعة ومواد' })).department, null, 'a customer does not keep a supply category');
  assert.equal(utils.buildContactPayload(form('EMPLOYEE', { department: 'خدمات ومقاولات' })).department, 'خدمات ومقاولات', 'an employee department is never replaced');
});

check('a customer: type goes to the job title, what it buys to the department, a monthly amount is kept', () => {
  const p = utils.buildContactPayload(form('CUSTOMER', { customerType: 'company', department: 'إعلانات', email: ' a@b.ly ', monthly_rent: '1500', contract_start: '2026-01-01' }));
  assert.equal(p.kind, 'CUSTOMER');
  assert.equal(p.job_title, 'شركة');
  assert.equal(p.department, 'إعلانات');
  assert.equal(p.email, 'a@b.ly');
  assert.equal(p.monthly_rent, '1500');
  assert.equal(p.contract_start, '2026-01-01');
  assert.equal(utils.buildContactPayload(form('CUSTOMER', { customerType: 'individual' })).job_title, 'فرد');
  assert.equal(utils.buildContactPayload(form('CUSTOMER', { customerType: '', job_title: 'فرد' })).job_title, null, 'choosing no type clears it');
  assert.equal(utils.buildContactPayload(form('CUSTOMER', { customerType: '', job_title: 'مدير معرض' })).job_title, 'مدير معرض', 'a typed title is not touched');
});

check('the customer type is read back from the job title and does not leak to other roles', () => {
  const back = utils.contactToFormState(base({ kind: 'CUSTOMER', job_title: 'شركة', notes: '[role:customer]' }));
  assert.equal(back.customerType, 'company');
  assert.equal(utils.contactToFormState(base({ kind: 'CUSTOMER', job_title: 'مدير' })).customerType, '');
  const moved = utils.buildContactPayload({ ...back, kind: 'VENDOR', businessRole: 'SUPPLIER_GOODS' });
  assert.equal(moved.job_title, null, 'a vendor is not a company or an individual');
});

check('a landlord keeps the list it was filed in, gets its title, rent and place, and the tracking month', () => {
  const asCustomer = utils.buildContactPayload(form('LANDLORD', { monthly_rent: '25000', shop_number: 'أرض المواقف', floor: 'الأرضي', area_sqm: '300', since: '2026-07', contract_start: '2026-01-01', contract_end: '2026-12-31' }, 'CUSTOMER'));
  assert.equal(asCustomer.kind, 'CUSTOMER');
  assert.equal(asCustomer.job_title, 'مؤجر للمول');
  assert.equal(asCustomer.monthly_rent, '25000');
  assert.equal(asCustomer.area_sqm, '300');
  assert.deepEqual(tags.readTags(asCustomer.notes), { role: 'LANDLORD', since: '2026-07' });
  assert.equal(utils.buildContactPayload(form('LANDLORD', {}, 'VENDOR')).kind, 'VENDOR');
  assert.equal(roles.extractContactBusinessRole({ ...base({ kind: 'CUSTOMER' }), ...asCustomer }), 'LANDLORD');
  assert.equal(tags.isLandlord({ ...base({ kind: 'CUSTOMER' }), ...asCustomer }), true);
});

check('an empty or malformed tracking month saves no tag; a valid one in any spelling is normalised', () => {
  assert.equal(tags.readTags(utils.buildContactPayload(form('LANDLORD', { since: '' })).notes).since, null);
  assert.equal(tags.readTags(utils.buildContactPayload(form('LANDLORD', { since: 'soon' })).notes).since, null);
  assert.equal(tags.readTags(utils.buildContactPayload(form('LANDLORD', { since: '2026-7' })).notes).since, '2026-07');
});

check('a tenant keeps shop, floor, area, rent and contract dates', () => {
  const p = utils.buildContactPayload(form('TENANT', { shop_number: '12', floor: 'الأول', area_sqm: '45', monthly_rent: '3500', contract_start: '2026-02-01', contract_end: '2027-01-31', tax_number: '77' }));
  assert.equal(p.kind, 'TENANT');
  assert.equal(p.shop_number, '12');
  assert.equal(p.floor, 'الأول');
  assert.equal(p.area_sqm, '45');
  assert.equal(p.monthly_rent, '3500');
  assert.equal(p.contract_end, '2027-01-31');
  assert.equal(p.tax_number, '77');
});

check('an employee: the card keeps the whole monthly pay (basic plus housing plus transport)', () => {
  const p = utils.buildContactPayload(form('EMPLOYEE', { salary: '2000', job_title: 'محاسب', department: 'المالية', hire_date: '2026-09-01', id_number: '119900112233', employee: { ...utils.defaultEmployeeFields(), housing: '300', transport: '150.5' } }));
  assert.equal(p.kind, 'EMPLOYEE');
  assert.equal(p.salary, '2450.5');
  assert.equal(p.job_title, 'محاسب');
  assert.equal(p.hire_date, '2026-09-01');
  assert.equal(p.id_number, '119900112233');
  assert.equal(utils.buildContactPayload(form('EMPLOYEE', {})).salary, null, 'no pay typed saves no salary');
  assert.equal(utils.salaryTotal(form('EMPLOYEE', { salary: '٢٠٠٠', employee: { ...utils.defaultEmployeeFields(), housing: '١٢٫٥' } })), 2012.5);
});

check('the form names the notes without machine tags and the saved notes carry them once', () => {
  const stored = base({ kind: 'CUSTOMER', notes: 'عقد سنوي\n[role:landlord]\n[since:2026-06]\n[role:landlord]' });
  const f = utils.contactToFormState(stored);
  assert.equal(f.notes, 'عقد سنوي');
  assert.equal(f.since, '2026-06');
  assert.equal(f.businessRole, 'LANDLORD');
  const p = utils.buildContactPayload({ ...f, notes: 'عقد سنوي، يُجدد في يناير' });
  assert.equal(p.notes, 'عقد سنوي، يُجدد في يناير\n[role:landlord]\n[since:2026-06]');
  assert.equal(p.kind, 'CUSTOMER', 'a landlord filed under customers stays there');
});

check('moving a vendor to customers and back keeps the text, the role tag of a landlord and the tracking month', () => {
  const vendor = base({ id: 'v3', kind: 'VENDOR', name: 'عبدالله المصراتي', notes: 'ملاحظة العقد\n[role:landlord]\n[since:2026-07]', job_title: 'مؤجر للمول', monthly_rent: '25000' });
  const state = utils.contactToFormState(vendor);
  const moved = utils.buildContactPayload(rules.switchKind(state, 'CUSTOMER'));
  assert.equal(moved.kind, 'CUSTOMER');
  assert.equal(moved.notes, 'ملاحظة العقد\n[role:landlord]\n[since:2026-07]');
  assert.equal(moved.monthly_rent, '25000');
  assert.equal(moved.job_title, 'مؤجر للمول');
  const again = utils.buildContactPayload(rules.switchKind(utils.contactToFormState({ ...vendor, ...moved }), 'VENDOR'));
  assert.equal(again.kind, 'VENDOR');
  assert.equal(again.notes, moved.notes);
});

check('an ordinary vendor that moves to customers becomes a plain customer with no supply tag', () => {
  const vendor = base({ kind: 'VENDOR', name: 'الشركة العامة للكهرباء', department: 'كهرباء وطاقة', notes: '[role:supplier_electricity]', shop_number: '104' });
  const p = utils.buildContactPayload(rules.switchKind(utils.contactToFormState(vendor), 'CUSTOMER'));
  assert.equal(p.kind, 'CUSTOMER');
  assert.equal(p.department, null);
  assert.deepEqual(tags.readTags(p.notes), { role: 'CUSTOMER', since: null });
  assert.equal(p.shop_number, '104', 'nothing else is wiped');
});

check('editing without touching the phone saves it exactly as it was; touching it standardises it', () => {
  const stored = base({ kind: 'VENDOR', phone: '+218 91 2345678', phone2: 'مكتب 021-480' });
  const opened = utils.contactToFormState(stored);
  const untouched = utils.buildContactPayload(opened, opened);
  assert.equal(untouched.phone, '+218 91 2345678');
  assert.equal(untouched.phone2, 'مكتب 021-480');
  const typed = utils.buildContactPayload({ ...opened, phone: '+218 91 2345679' }, opened);
  assert.equal(typed.phone, '0912345679');
  assert.equal(utils.buildContactPayload({ ...opened, phone: '' }, opened).phone, null);
});

check('the form of an old contact round-trips every column the form shows (nothing wiped by an edit)', () => {
  const stored = base({
    kind: 'VENDOR', name: 'مؤسسة الشروق', name_en: 'Shorouk', phone: '0912345678', phone2: '0922345678', email: 'a@b.ly', address: 'طرابلس',
    id_number: '1', tax_number: '2', shop_number: '3', floor: '4', area_sqm: '5', contract_start: '2026-01-01', contract_end: '2026-12-31',
    hire_date: '2022-04-03', is_active: false, department: 'مياه وصرف', notes: 'نص\n[role:supplier_water]',
  });
  const opened = utils.contactToFormState(stored);
  const p = utils.buildContactPayload(opened, opened);
  for (const key of ['name', 'name_en', 'phone', 'phone2', 'email', 'address', 'id_number', 'tax_number', 'shop_number', 'floor', 'area_sqm', 'contract_start', 'contract_end', 'hire_date', 'department']) {
    assert.equal(p[key], stored[key], key);
  }
  assert.equal(p.is_active, false);
  assert.equal(p.notes, 'نص\n[role:supplier_water]');
  assert.equal(p.kind, 'VENDOR');
});

check('the payload agrees with what the profile page would have corrected (its fix is a no-op on ours)', () => {
  const landlordCustomer = base({ id: 'c3', kind: 'CUSTOMER', notes: '[role:landlord]\n[since:2026-06]' });
  const f = utils.contactToFormState(landlordCustomer);
  const payload = utils.buildContactPayload(f, f);
  assert.deepEqual(profile.reconcileSavePayload(payload, landlordCustomer, f), payload);
});

// ───────────────────────────────────────────── what is refused

const v = (f, o) => rules.validateContactForm(f, o);

check('only the name is required, and a form with just a name is valid', () => {
  assert.deepEqual(v(form('CUSTOMER', { name: 'سالم' })), {});
  assert.equal(v(form('CUSTOMER', { name: '   ' })).name, 'اكتب الاسم');
  assert.equal(v(form('SUPPLIER_WATER', { name: '' })).name, 'اكتب الاسم');
  assert.equal(v(form('CUSTOMER', { name: 'ا'.repeat(151) })).name, 'الاسم طويل جداً');
});

check('a wrong phone or e-mail is reported where it is; both phones are checked', () => {
  const e = v(form('CUSTOMER', { phone: '09123', phone2: '0912345678', email: 'not-mail' }));
  assert.match(e.phone, /10 أرقام/);
  assert.equal(e.phone2, undefined);
  assert.equal(e.email, 'البريد الإلكتروني غير صحيح');
  assert.deepEqual(v(form('CUSTOMER', { phone: '+90 555 123 4567', email: 'x@y.ly' })), {});
});

check('an old phone or e-mail that was accepted before is not reported when it was not touched', () => {
  const opened = form('CUSTOMER', { phone: 'مكتب 021', email: 'old@@mail' });
  assert.deepEqual(v(opened, { baseline: opened }), {});
  assert.ok(v({ ...opened, phone: 'مكتب 0213' }, { baseline: opened }).phone);
});

check('amounts are checked only where the role shows them', () => {
  assert.equal(v(form('LANDLORD', { monthly_rent: '12abc' })).monthly_rent, 'اكتب مبلغاً صحيحاً');
  assert.equal(v(form('LANDLORD', { monthly_rent: '25,000.5' })).monthly_rent, undefined);
  assert.equal(v(form('LANDLORD', { monthly_rent: '٢٥٠٠٠' })).monthly_rent, undefined);
  assert.equal(v(form('LANDLORD', { monthly_rent: '-5' })).monthly_rent, 'اكتب مبلغاً صحيحاً');
  assert.equal(v(form('SUPPLIER_GOODS', { monthly_rent: 'xx', salary: 'yy' })).monthly_rent, undefined, 'hidden for a vendor');
  assert.equal(v(form('TENANT', { area_sqm: 'a' })).area_sqm, 'اكتب مبلغاً صحيحاً');
});

check('a contract that ends before it starts is refused for landlords, tenants and customers', () => {
  const dates = { contract_start: '2026-06-01', contract_end: '2026-05-31' };
  for (const role of ['LANDLORD', 'TENANT', 'CUSTOMER']) assert.equal(v(form(role, dates)).contract_end, 'نهاية العقد قبل بدايته', role);
  assert.deepEqual(v(form('LANDLORD', { contract_start: '2026-06-01', contract_end: '2026-06-01' })), {});
  assert.deepEqual(v(form('LANDLORD', { contract_start: '2026-06-01' })), {});
  assert.equal(v(form('SUPPLIER_GOODS', dates)).contract_end, undefined);
});

check('an employee: amounts, a missing basic salary, a contract that ends before the hire date', () => {
  const withEmployee = (o, e) => ({ ...form('EMPLOYEE', o), employee: { ...utils.defaultEmployeeFields(), ...e } });
  assert.deepEqual(v(withEmployee({ salary: '2000' }, { housing: '300', transport: '100' })), {});
  assert.equal(v(withEmployee({ salary: 'abc' }, {})).salary, 'اكتب مبلغاً صحيحاً');
  assert.equal(v(withEmployee({ salary: '' }, { housing: '300' })).salary, 'اكتب الراتب الأساسي');
  assert.equal(v(withEmployee({ salary: '1000' }, { transport: '1x' })).transport, 'اكتب مبلغاً صحيحاً');
  assert.equal(v(withEmployee({ hire_date: '2026-09-01' }, { employmentType: 'CONTRACT', contractEnd: '2026-08-31' })).employeeContractEnd, 'نهاية العقد قبل تاريخ التعيين');
  assert.equal(v(withEmployee({ hire_date: '2026-09-01' }, { employmentType: 'FULL_TIME', contractEnd: '2026-08-31' })).employeeContractEnd, undefined, 'only a time-bound employment has an end');
});

check('the employee file is checked only when its fields are on screen: IBAN, emergency phone, leave days', () => {
  const f = { ...form('EMPLOYEE'), employee: { ...utils.defaultEmployeeFields(), iban: 'XX', emergencyPhone: '123', annualLeaveDays: '400' } };
  assert.deepEqual(v(f), {});
  const e = v(f, { employeeFile: true });
  assert.equal(e.iban, rules.IBAN_PROBLEM);
  assert.match(e.emergencyPhone, /غير مكتمل/);
  assert.equal(e.annualLeaveDays, 'اكتب عدد أيام بين 0 و365');
  const ok = { ...f, employee: { ...f.employee, iban: 'LY83 0020 0012 3456 7890 1234 5', emergencyPhone: '0911112233', annualLeaveDays: '21' } };
  assert.deepEqual(v(ok, { employeeFile: true }), {});
});

check('the first wrong field is the one drawn first', () => {
  const e = v(form('CUSTOMER', { name: '', phone: '1', email: 'x' }));
  assert.equal(rules.firstInvalidField(e), 'name');
  assert.equal(rules.firstInvalidField({ phone: 'x', email: 'y' }), 'phone');
  assert.equal(rules.firstInvalidField({}), null);
});

check('a hand-built or older form state still saves: no tracking month key, a numeric salary, an unknown kind', () => {
  const { since, employee, ...older } = form('LANDLORD', { monthly_rent: '100' }, 'CUSTOMER');
  void since;
  void employee;
  const p = utils.buildContactPayload(older);
  assert.deepEqual(rules.validateContactForm(older), {}, 'a state without the employee part validates');
  const staff = { ...older, kind: 'EMPLOYEE', businessRole: 'EMPLOYEE', salary: '900' };
  assert.equal(utils.buildContactPayload(staff).salary, '900');
  assert.equal(rules.planSalaryStructure(staff, '2026-10-19').total, 900);
  assert.equal(rules.planEmployeeFile(staff), null);
  assert.deepEqual(rules.validateContactForm(staff, { employeeFile: true }), {});
  assert.equal(p.kind, 'CUSTOMER');
  assert.equal(tags.readTags(p.notes).since, null);
  const numeric = utils.contactToFormState(base({ kind: 'EMPLOYEE', salary: 2250, monthly_rent: 5, hire_date: '2024-03-01T00:00:00Z', notes: '[role:employee]' }));
  assert.equal(numeric.salary, '2250');
  assert.equal(numeric.hire_date, '2024-03-01');
  const other = utils.buildContactPayload(utils.contactToFormState(base({ kind: 'OTHER', name: 'جهة حكومية', notes: null })));
  assert.equal(other.kind, 'OTHER', 'saving a file of another kind does not file it as something else');
  assert.equal(rules.formKindOf({ kind: 'OTHER' }), 'OTHER');
  assert.equal(rules.switchKind(utils.contactToFormState(base({ kind: 'OTHER', notes: null })), 'CUSTOMER').businessRole, 'CUSTOMER');
});

// ───────────────────────────────────────────── an employee's pay and file

const emp = (o = {}, e = {}) => ({ ...form('EMPLOYEE', o, 'EMPLOYEE'), employee: { ...utils.defaultEmployeeFields(), ...e } });

check('the salary structure starts in the hire month, else this month, and carries each part', () => {
  const plan = rules.planSalaryStructure(emp({ salary: '2000', hire_date: '2026-09-15' }, { housing: '300', transport: '150' }), '2026-10-19');
  assert.deepEqual(plan, { effectiveFrom: '2026-09-01', fromHireDate: true, base: 2000, housing: 300, transport: 150, other: 0, total: 2450 });
  assert.equal(rules.planSalaryStructure(emp({ salary: '1800' }), '2026-10-19').effectiveFrom, '2026-10-01');
  assert.equal(rules.planSalaryStructure(emp({ salary: '1800' }), '2026-10-19').fromHireDate, false, 'the screen says «هذا الشهر» only when the hire date is missing');
  assert.equal(rules.planSalaryStructure(emp({ salary: '1800', hire_date: 'soon' }), '2026-10-19').fromHireDate, false);
  assert.equal(rules.planSalaryStructure(emp({ salary: '1800', hire_date: '2027-02-01' }), '2026-10-19').effectiveFrom, '2027-02-01', 'a hire next year starts then');
});

check('no pay and not an employee: no structure', () => {
  assert.equal(rules.planSalaryStructure(emp(), '2026-10-19'), null);
  assert.equal(rules.planSalaryStructure(emp({ salary: '0' }), '2026-10-19'), null);
  assert.equal(rules.planSalaryStructure(form('CUSTOMER', { salary: '5000' }), '2026-10-19'), null);
});

check('the employee file is built only when it holds something beyond the defaults', () => {
  assert.equal(rules.planEmployeeFile(emp({ id_number: '123' })), null, 'an ID alone is on the contact card');
  assert.equal(rules.planEmployeeFile(form('CUSTOMER')), null);
  const file = rules.planEmployeeFile(emp({ id_number: ' 119900112233 ' }, {
    employmentType: 'CONTRACT', contractEnd: '2027-03-31', bankName: 'مصرف الواحة', bankAccount: '001-22', iban: 'ly83 0020 0012 3456 7890 1234 5',
    emergencyName: 'سالم', emergencyPhone: '+218 91 1112233', annualLeaveDays: '21',
  }));
  assert.deepEqual(file, {
    employmentType: 'CONTRACT', nationalId: '119900112233', contractEnd: '2027-03-31', bankName: 'مصرف الواحة', bankAccount: '001-22',
    iban: 'LY83002000123456789012345', emergencyName: 'سالم', emergencyPhone: '0911112233', annualLeaveDays: 21,
  });
});

check('each part of the file alone opens it; a contract end is dropped for a permanent job', () => {
  assert.notEqual(rules.planEmployeeFile(emp({}, { bankName: 'مصرف' })), null);
  assert.notEqual(rules.planEmployeeFile(emp({}, { emergencyName: 'س' })), null);
  assert.notEqual(rules.planEmployeeFile(emp({}, { annualLeaveDays: '25' })), null);
  assert.notEqual(rules.planEmployeeFile(emp({}, { employmentType: 'PART_TIME' })), null);
  assert.equal(rules.planEmployeeFile(emp({}, { contractEnd: '2027-01-01' })), null, 'a full-time job has no contract end');
  assert.equal(rules.planEmployeeFile(emp({}, { employmentType: 'TEMPORARY', contractEnd: '2027-01-01' })).contractEnd, '2027-01-01');
  assert.equal(rules.planEmployeeFile(emp({}, { annualLeaveDays: '' })), null, 'blank days mean the usual 30');
  assert.equal(rules.planEmployeeFile(emp({}, { bankName: 'م', annualLeaveDays: '' })).annualLeaveDays, 30);
});

check('an employee that has no payroll yet can still be saved: pay on the card, no structure when it is zero', () => {
  const p = utils.buildContactPayload(emp({ salary: '1500' }, { housing: '0', transport: '' }));
  assert.equal(p.salary, '1500');
  assert.equal(utils.buildContactPayload(emp({ salary: '0' })).salary, '0', 'a zero entered on purpose is kept, not turned into a missing salary');
  assert.equal(rules.planSalaryStructure(emp({ salary: '1500', hire_date: 'soon' }), '2026-10-19').effectiveFrom, '2026-10-01', 'an unreadable hire date falls back to this month');
});

// ───────────────────────────────────────────── payment terms in the notes

check('payment terms are one line in the notes: set, replaced, removed, and the rest of the note is untouched', () => {
  const t = rules.PAYMENT_TERMS;
  assert.equal(rules.applyPaymentTerms('', t[1]), 'شروط الدفع: آجل 30 يوماً');
  assert.equal(rules.applyPaymentTerms('يورّد كل أسبوع', t[1]), 'يورّد كل أسبوع\nشروط الدفع: آجل 30 يوماً');
  const set = rules.applyPaymentTerms('يورّد كل أسبوع', t[1]);
  assert.equal(rules.paymentTermsOf(set), 'آجل 30 يوماً');
  assert.equal(rules.applyPaymentTerms(set, t[0]), 'يورّد كل أسبوع\nشروط الدفع: نقداً عند التسليم');
  assert.equal(rules.applyPaymentTerms(set, t[1]), 'يورّد كل أسبوع', 'chosen again it is taken away');
  assert.equal(rules.paymentTermsOf('لا شيء'), null);
  assert.equal(rules.applyPaymentTerms('سطر\nشروط الدفع: يدوي\nسطر آخر', t[2]), 'سطر\nشروط الدفع: نهاية كل شهر\nسطر آخر');
});

// ───────────────────────────────────────────── drafts

check('a form is dirty only when something was typed or chosen beyond its starting kind and role', () => {
  assert.equal(utils.isFormDirty(utils.defaultContactFormState('CUSTOMER')), false);
  assert.equal(utils.isFormDirty(rules.switchKind(utils.defaultContactFormState('CUSTOMER'), 'VENDOR')), false, 'only the kind changed');
  assert.equal(utils.isFormDirty({ ...utils.defaultContactFormState('CUSTOMER'), name: 'س' }), true);
  assert.equal(utils.isFormDirty({ ...utils.defaultContactFormState('CUSTOMER'), customerType: 'company' }), true);
  const e = utils.defaultContactFormState('EMPLOYEE');
  assert.equal(utils.isFormDirty({ ...e, employee: { ...e.employee, iban: 'LY' } }), true);
  assert.equal(utils.isFormDirty(utils.defaultContactFormState('EMPLOYEE')), false);
});

// ───────────────────────────────────────────── amounts typed the way people write them

check('a rent or an area typed with a thousands comma, Arabic digits or spaces is saved, never dropped', () => {
  const land = (o) => form('LANDLORD', o, 'CUSTOMER');
  assert.deepEqual(rules.validateContactForm(land({ monthly_rent: '3,200' })), {}, 'the form accepts it');
  assert.equal(utils.buildContactPayload(land({ monthly_rent: '3,200' })).monthly_rent, '3200', 'so it must be saved');
  assert.equal(utils.buildContactPayload(land({ monthly_rent: '25,000.5' })).monthly_rent, '25000.5');
  assert.equal(utils.buildContactPayload(land({ monthly_rent: '٢٧٠٠٠' })).monthly_rent, '27000');
  assert.equal(utils.buildContactPayload(land({ monthly_rent: '3 200' })).monthly_rent, '3200');
  assert.equal(utils.buildContactPayload(land({ area_sqm: '1,250.5' })).area_sqm, '1250.5');
  // a plain number is kept exactly as it was written, so an untouched value round-trips
  assert.equal(utils.buildContactPayload(land({ monthly_rent: '2500.000' })).monthly_rent, '2500.000');
  assert.equal(utils.buildContactPayload(land({ monthly_rent: '2500' })).monthly_rent, '2500');
  assert.equal(utils.buildContactPayload(land({ monthly_rent: '' })).monthly_rent, null);
  assert.equal(utils.buildContactPayload(land({ monthly_rent: '   ' })).monthly_rent, null);
  // what is not an amount is refused by the form before it can be saved
  for (const bad of ['abc', '1.2.3', '25000.', '12,34,567', '1e5', '0x10']) {
    assert.ok(rules.validateContactForm(land({ monthly_rent: bad })).monthly_rent, bad);
    assert.equal(utils.buildContactPayload(land({ monthly_rent: bad })).monthly_rent, null, `${bad} is never written`);
  }
  assert.equal(utils.amountOrNull(null), null);
  assert.equal(utils.amountOrNull(undefined), null);
  assert.equal(utils.amountOrNull(0), '0');
});

// ───────────────────────────────────────────── the role a party added from an entry starts with

check('a party added from a transaction entry opens on what the entry is about', () => {
  const r = (kind, partyFilter, categoryCode) => rules.roleForEntry({ kind, partyFilter, categoryCode });
  assert.equal(r('EXPENSE', 'VENDOR', 'EXP-RNT'), 'LANDLORD', 'rent paid is a landlord even under the vendors filter');
  assert.equal(r('EXPENSE', 'CUSTOMER', 'EXP-RNT'), 'LANDLORD', 'and under the customers filter, where landlords are listed');
  assert.equal(r('EXPENSE', 'ALL', 'exp-rnt'), 'LANDLORD', 'the code is read in any case');
  assert.equal(r('EXPENSE', 'VENDOR', 'EXP-ELC'), 'SUPPLIER_ELECTRICITY');
  assert.equal(r('EXPENSE', 'VENDOR', 'EXP-WTR'), 'SUPPLIER_WATER');
  assert.equal(r('EXPENSE', 'ALL', 'EXP-MNT'), 'SERVICE_PROVIDER');
  assert.equal(r('EXPENSE', 'CUSTOMER', 'EXP-WTR'), 'CUSTOMER', 'a utility is never filed under the customers filter');
  assert.equal(r('EXPENSE', 'VENDOR', 'EXP-OTH'), 'SUPPLIER_GOODS');
  assert.equal(r('EXPENSE', 'VENDOR', null), 'SUPPLIER_GOODS');
  assert.equal(r('EXPENSE', 'ALL', undefined), 'SUPPLIER_GOODS');
  assert.equal(r('EXPENSE', 'EMPLOYEE', 'EXP-SAL'), 'EMPLOYEE');
  assert.equal(r('EXPENSE', 'TENANT', 'EXP-RNT'), 'TENANT', 'a tenant filter is exact');
  assert.equal(r('REVENUE', 'ALL', 'REV-SVC'), 'CUSTOMER');
  assert.equal(r('REVENUE', 'TENANT', 'REV-RNT'), 'TENANT');
  assert.equal(r('REVENUE', 'CUSTOMER', 'EXP-RNT'), 'CUSTOMER', 'an income never starts a landlord');
  // a landlord starts under customers, where every list shows landlords
  assert.equal(rules.startingKind(r('EXPENSE', 'VENDOR', 'EXP-RNT')), 'CUSTOMER');
});

check('a name a screen put in the form is not a draft; anything the person typed is', () => {
  const given = 'مؤسسة النخيل';
  const fresh = { ...utils.defaultContactFormState('CUSTOMER'), name: given };
  assert.equal(utils.hasTypedContent(fresh, given), false, 'only the name the search box passed on');
  assert.equal(utils.hasTypedContent({ ...fresh, name: 'مؤسسة النخيل للتجارة' }, given), true, 'the person changed the name');
  assert.equal(utils.hasTypedContent({ ...fresh, phone: '0912345678' }, given), true);
  assert.equal(utils.hasTypedContent({ ...fresh, customerType: 'company' }, given), true);
  assert.equal(utils.hasTypedContent({ ...utils.defaultContactFormState('CUSTOMER'), name: '' }, ''), false, 'an empty form');
  assert.equal(utils.hasTypedContent({ ...utils.defaultContactFormState('CUSTOMER'), name: 'س' }, ''), true, 'a name typed by hand');
  assert.equal(utils.hasTypedContent(rules.switchKind(fresh, 'VENDOR'), given), false, 'choosing a kind is not typing');
});

// ───────────────────────────────────────────── error text

check('a save error is one plain sentence; the database\'s own Arabic sentence passes through', () => {
  assert.match(utils.formatContactSaveError({ message: 'new row violates row-level security policy' }), /مشاهد/);
  assert.match(utils.formatContactSaveError({ message: 'duplicate key value' }), /مكرر/);
  assert.equal(utils.formatContactSaveError({ message: 'غير مصرح: الرواتب تتطلب محاسباً أو مديراً', code: '42501' }).includes('محاسباً'), true);
  assert.equal(utils.formatContactSaveError(null), 'تعذّر الحفظ. حاول مرة أخرى.');
});

console.log(`\n✓ verify-contact-form: ${passed} checks passed`);
