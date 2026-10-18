/**
 * Regression checks for list behaviour shared by every table screen.
 *   npx tsx scripts/verify-list-utilities.mjs
 */
import assert from 'node:assert/strict';

process.env.TZ = 'Africa/Tripoli'; // UTC+2: where the last-day-of-period bug appeared

const { normalizeArabic, matchesSearch } = await import('../src/lib/arabic-search.ts');
const { isInDatePreset } = await import('../src/components/data/toolbar.tsx');
const { buildCsv } = await import('../src/lib/csv-export.ts');
const { transactionMatches } = await import('../src/lib/transactions-filter.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

// Date presets include the last day of the period (2026-09-30 was dropped from «الشهر الماضي»).
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : ['2026-10-18T10:00:00']));
  }
  static now() {
    return new RealDate('2026-10-18T10:00:00').getTime();
  }
};
check('last month includes its last day', () => assert.equal(isInDatePreset('2026-09-30', 'last_month'), true));
check('last month includes its first day', () => assert.equal(isInDatePreset('2026-09-01', 'last_month'), true));
check('last month excludes the next day', () => assert.equal(isInDatePreset('2026-10-01', 'last_month'), false));
check('this month includes today', () => assert.equal(isInDatePreset('2026-10-18', 'this_month'), true));
check('this year includes 31 December', () => assert.equal(isInDatePreset('2026-12-31', 'this_year'), true));
check('"all" includes everything', () => assert.equal(isInDatePreset('2019-01-01', 'all'), true));
globalThis.Date = RealDate;

// Arabic search normalisation.
check('hamza forms match', () => assert.equal(normalizeArabic('أحمد إبراهيم آمال'), 'احمد ابراهيم امال'));
check('taa marbuta and alef maqsura match', () => assert.equal(matchesSearch('مدرسه علي', ['المدرسة', 'على']), true));
check('Arabic-Indic digits match Latin digits', () => assert.equal(matchesSearch('١٠٥', ['محل 105']), true));
check('every word must match somewhere', () => assert.equal(matchesSearch('محل 999', ['محل 105']), false));
check('tashkeel is ignored', () => assert.equal(matchesSearch('مُحَمَّد', ['محمد']), true));

// Transaction search covers the number even when a reference exists (old bug).
const tx = {
  number: 1042, reference: 'REF-9', description: 'تحصيل إيجار', amount: '4250.000',
  category: { name_ar: 'إيجارات المحلات', code: 'REV-RNT' }, contact: { name: 'محل الأمل', shop_number: '12' },
  cashbox: { name_ar: 'الخزينة النقدية' }, cheque_number: null,
};
check('search by number with a reference present', () => assert.equal(transactionMatches(tx, '1042'), true));
check('search by #number', () => assert.equal(transactionMatches(tx, '#1042'), true));
check('search by party without hamza', () => assert.equal(transactionMatches(tx, 'الامل'), true));
check('search by amount', () => assert.equal(transactionMatches(tx, '4250'), true));

// CSV export: formulas are neutralised, numbers untouched, BOM kept for Excel.
const csv = buildCsv(['a', 'b', 'c'], [['=HYPERLINK("x")', -50, '-12.5'], ['+cmd', '@sum', 'عادي']]);
check('formula text is prefixed', () => assert.match(csv, /'=HYPERLINK/));
check('negative number stays numeric', () => assert.match(csv, /,-50,/));
check('negative numeric text stays numeric', () => assert.match(csv, /,-12\.5/));
check('+ and @ are prefixed', () => assert.match(csv, /'\+cmd,'@sum/));
check('UTF-8 BOM for Excel', () => assert.equal(csv.charCodeAt(0), 0xfeff));

// Typed amounts: Arabic digits and the Arabic decimal mark, thousands separators, 3 decimals at most.
const { parseAmountInput, formatMoney, formatDate } = await import('../src/lib/utils.ts');
check('amount: Arabic digits and decimal mark', () => assert.equal(parseAmountInput('١٥٠٫٥'), 150.5));
check('amount: thousands separator', () => assert.equal(parseAmountInput('1,250.5'), 1250.5));
check('amount: comma as decimal mark', () => assert.equal(parseAmountInput('150,5'), 150.5));
check('amount: 4 decimals rejected', () => assert.ok(Number.isNaN(parseAmountInput('0.0004'))));
check('amount: negative rejected', () => assert.ok(Number.isNaN(parseAmountInput('-30'))));
check('amount: empty is zero', () => assert.equal(parseAmountInput(''), 0));

// Money: a negative balance always shows its minus; a value that rounds to 0 never shows "−0".
check('money: negative keeps its sign', () => assert.match(formatMoney(-500, 'LYD'), /\u2212500/));
check('money: rounding to zero has no sign', () => assert.doesNotMatch(formatMoney(100.1 + 200.2 - 300.3, 'LYD'), /\u2212/));
check('money: signed positive', () => assert.match(formatMoney(5, 'LYD', { signed: true }), /\+5/));

// A calendar day is shown as that day, whatever the time zone.
check('date: YYYY-MM-DD stays on its day', () => assert.match(formatDate('2026-03-01'), /^01 /));

// WhatsApp: Libyan numbers written every common way reach the same wa.me number.
const { normalizeLibyanPhone } = await import('../src/lib/whatsapp.ts');
for (const raw of ['0912345678', '+218 91 234 5678', '+218 091 234 5678', '00218912345678', '٠٩١٢٣٤٥٦٧٨']) {
  check(`phone: ${raw}`, () => assert.equal(normalizeLibyanPhone(raw), '218912345678'));
}

console.log(`\n${passed} checks passed`);
