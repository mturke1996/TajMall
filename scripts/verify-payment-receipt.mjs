/**
 * The receipt handed over after a payment: only a posted (or reconciled) transaction gets one, its number
 * traces to the transaction, the months and the balance left are worded exactly, nothing the PDF engine
 * mishandles reaches it, and the three PDFs (rent, other revenue, history) render.
 *   npx tsx scripts/verify-payment-receipt.mjs
 */
import assert from 'node:assert/strict';
import React from 'react';

const {
  buildRentReceipt,
  buildRevenueReceipt,
  rentReceiptFromHistory,
  canIssueReceipt,
  receiptNumber,
  monthsCountText,
  RECEIPT_STATUS_NOTE,
  RECEIPT_FAILURE_TEXT,
} = await import('../src/lib/payment-receipt.ts');
const { buildPaymentReceiptMessage, buildMessageShareLink } = await import('../src/lib/whatsapp.ts');
const { renderPdfBlob } = await import('../src/features/pdf/pdf-blob-utils.ts');

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const tx = (o = {}) => ({
  number: 1042,
  status: 'POSTED',
  kind: 'REVENUE',
  amount: '1500',
  tx_date: '2026-10-18',
  method: 'CASH',
  reference: null,
  description: 'تحصيل إيجار: أكتوبر 2026، نوفمبر 2026',
  cheque_number: null,
  cheque_bank: null,
  category: { name_ar: 'إيجار محلات' },
  cashbox: { name_ar: 'الخزينة الرئيسية', kind: 'CASH', bank_name: null },
  contact: { name: 'مؤسسة النور', shop_number: '12' },
  ...o,
});
// plan lines as allocateRentPayment gives them
const line = (month, amount, paidBefore, applied, status) => ({ month, amount, paidBefore, applied, paidAfter: Math.round((paidBefore + applied) * 1000) / 1000, status });
const rent = (o = {}) =>
  buildRentReceipt({
    tx: tx(),
    tenant: { name: 'مؤسسة النور', shopNumber: '12' },
    lines: [line('2026-10', 1000, 0, 1000, 'paid'), line('2026-11', 1000, 0, 500, 'partial')],
    ...o,
  });
const ok = (r) => {
  assert.equal(r.ok, true, r.ok ? '' : r.message);
  return r.receipt;
};

// Characters that make react-pdf print boxes, or reorder a line: direction marks and isolates.
const DIRECTION_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
const startsWithDigitOrLatin = (s) => /^\s*[0-9A-Za-z\u0660-\u0669]/.test(s);
const pdfStrings = (r) => [
  r.number, r.title, r.statusNote, r.payer.name, r.payer.shopNumber, r.methodLabel, r.methodDetail, r.sourceLabel, r.source, r.reference, r.purpose, r.category,
  r.balance && (r.balance.kind === 'remaining' ? r.balance.label : r.balance.text),
  r.otherOwed?.label, r.otherOwed?.detail,
  ...r.lines.flatMap((l) => [l.label, l.statusLabel]),
].filter((s) => typeof s === 'string');

await check('number: the transaction number behind an Arabic prefix, and nothing for a bad one', () => {
  assert.equal(receiptNumber(1042), 'إيص-1042');
  assert.equal(receiptNumber('7'), 'إيص-7');
  for (const bad of [0, -3, 1.5, NaN, null, undefined, '', 'abc']) assert.equal(receiptNumber(bad), null, String(bad));
  assert.equal(startsWithDigitOrLatin(receiptNumber(1042)), false);
});

await check('only posted and reconciled transactions may be receipted', () => {
  assert.equal(canIssueReceipt('POSTED'), true);
  assert.equal(canIssueReceipt('RECONCILED'), true);
  for (const s of ['DRAFT', 'VOIDED', '', null, undefined, 'posted']) assert.equal(canIssueReceipt(s), false, String(s));
});

await check('rent: a paid month and a part-paid month, with the exact amount left', () => {
  const r = ok(rent());
  assert.equal(r.kind, 'rent');
  assert.equal(r.number, 'إيص-1042');
  assert.equal(r.txNumber, 1042);
  assert.equal(r.statusNote, 'إيصال عن معاملة مرحّلة');
  assert.equal(r.total, 1500);
  assert.deepEqual(r.lines.map((l) => [l.label, l.state, l.statusLabel, l.value, l.paid, l.remaining]), [
    ['أكتوبر 2026', 'settled', 'مُسدَّد', 1000, 1000, 0],
    ['نوفمبر 2026', 'partial', 'جزئي', 1000, 500, 500],
  ]);
  // one open month: the balance names it
  assert.deepEqual(r.balance, { kind: 'remaining', label: 'المتبقي من إيجار نوفمبر 2026', amount: 500 });
  assert.equal(r.otherOwed, null);
});

await check('rent: every month paid in full says so, with the noun form for one, two and many', () => {
  const one = ok(rent({ tx: tx({ amount: '1000' }), lines: [line('2026-10', 1000, 0, 1000, 'paid')] }));
  assert.deepEqual(one.balance, { kind: 'settled', text: 'الشهر مُسدَّد بالكامل. لا مبلغ متبقٍ عليه.' });
  const two = ok(rent({ tx: tx({ amount: '2000' }), lines: [line('2026-10', 1000, 0, 1000, 'paid'), line('2026-11', 1000, 0, 1000, 'paid')] }));
  assert.equal(two.balance.text, 'الشهران مُسدَّدان بالكامل. لا مبلغ متبقٍ عليهما.');
  const three = ok(rent({ tx: tx({ amount: '3000' }), lines: ['2026-10', '2026-11', '2026-12'].map((m) => line(m, 1000, 0, 1000, 'paid')) }));
  assert.equal(three.balance.text, 'الأشهر مُسدَّدة بالكامل. لا مبلغ متبقٍ عليها.');
});

await check('rent: a month part-paid before and finished now is settled and keeps what was paid before', () => {
  const r = ok(rent({ tx: tx({ amount: '700' }), lines: [line('2026-10', 1000, 300, 700, 'paid')] }));
  assert.equal(r.lines[0].state, 'settled');
  assert.equal(r.lines[0].paidBefore, 300);
  assert.equal(r.lines[0].paid, 700);
  assert.equal(r.balance.kind, 'settled');
});

await check('rent: two part-paid months are one balance, summed without float noise', () => {
  const r = ok(rent({
    tx: tx({ amount: '0.3' }),
    lines: [line('2026-10', 0.2, 0, 0.1, 'partial'), line('2026-11', 0.4, 0, 0.2, 'partial')],
  }));
  assert.deepEqual(r.balance, { kind: 'remaining', label: 'المتبقي على الأشهر المذكورة', amount: 0.3 });
});

await check('rent: a line that took no money is left out', () => {
  const r = ok(rent({ tx: tx({ amount: '1000' }), lines: [line('2026-09', 1000, 1000, 0, 'skipped'), line('2026-10', 1000, 0, 1000, 'paid')] }));
  assert.deepEqual(r.lines.map((l) => l.label), ['أكتوبر 2026']);
});

await check('rent: money the months do not cover is shown as its own line, never hidden', () => {
  const r = ok(rent({ tx: tx({ amount: '1250.5' }), lines: [line('2026-10', 1000, 0, 1000, 'paid')] }));
  const extra = r.lines[1];
  assert.equal(extra.label, 'مبلغ غير موزَّع على شهر');
  assert.equal(extra.state, 'other');
  assert.equal(extra.paid, 250.5);
  assert.equal(extra.remaining, null);
  // the gap does not count as a month: a paid month and a gap still settle the months
  assert.equal(r.balance.kind, 'settled');
});

await check('rent: months that add up to more than the recorded amount refuse a receipt', () => {
  const r = rent({ tx: tx({ amount: '900' }), lines: [line('2026-10', 1000, 0, 1000, 'paid')] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'mismatch');
  assert.equal(r.message, RECEIPT_FAILURE_TEXT.mismatch);
});

await check('rent: months owed outside this payment are listed, oldest first, with their total', () => {
  const owing = [
    { month: '2026-09', amount: 1000 },
    { month: '2026-08', amount: 750.5 },
    { month: '2026-10', amount: 1000 }, // covered by this receipt: not "other"
    { month: '2026-07', amount: 0 }, // nothing owed
  ];
  const r = ok(rent({ otherOwing: owing }));
  assert.equal(r.otherOwed.label, 'شهران آخران مستحقان لم يشملهما هذا الإيصال');
  assert.equal(r.otherOwed.detail, 'أغسطس 2026، سبتمبر 2026');
  assert.equal(r.otherOwed.amount, 1750.5);

  const one = ok(rent({ otherOwing: [{ month: '2026-09', amount: 100 }] }));
  assert.equal(one.otherOwed.label, 'شهر آخر مستحق لم يشمله هذا الإيصال');

  const many = ok(rent({ otherOwing: ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map((month) => ({ month, amount: 100 })) }));
  assert.equal(many.otherOwed.label, 'أشهر أخرى مستحقة لم يشملها هذا الإيصال');
  assert.equal(many.otherOwed.detail, 'أقدمها مارس 2026 (5 أشهر)');
  assert.equal(many.otherOwed.amount, 500);
});

await check('rent: an account that was not read leaves the line out instead of saying nothing is owed', () => {
  for (const otherOwing of [undefined, null, []]) assert.equal(ok(rent({ otherOwing })).otherOwed, null);
});

await check('rent: owed months that are covered here, empty or not numbers say nothing', () => {
  // every owed month is one this receipt covers: there is no "other" line, not a line with a zero
  assert.equal(ok(rent({ otherOwing: [{ month: '2026-10', amount: 1000 }, { month: '2026-11', amount: 500 }] })).otherOwed, null);
  // a figure that is not a number is never counted as owed
  const mixed = ok(rent({ otherOwing: [{ month: '2026-08', amount: Number.NaN }, { month: '2026-09', amount: Infinity }, { month: '2026-07', amount: 40 }] }));
  assert.equal(mixed.otherOwed.detail, 'يوليو 2026');
  assert.equal(mixed.otherOwed.amount, 40);
});

await check('refused: a draft or voided transaction never gets a receipt; a reconciled one does', () => {
  for (const status of ['DRAFT', 'VOIDED']) {
    const r = rent({ tx: tx({ status }) });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'not_posted');
    assert.equal(buildRevenueReceipt({ tx: tx({ status }) }).ok, false);
  }
  assert.equal(rent({ tx: tx({ status: 'RECONCILED' }) }).ok, true);
  assert.equal(buildRevenueReceipt({ tx: tx({ status: 'RECONCILED' }) }).ok, true);
});

await check('refused: an expense, a missing number, a zero or broken amount', () => {
  assert.equal(buildRevenueReceipt({ tx: tx({ kind: 'EXPENSE' }) }).reason, 'not_revenue');
  assert.equal(buildRevenueReceipt({ tx: tx({ number: null }) }).reason, 'no_number');
  assert.equal(buildRevenueReceipt({ tx: tx({ number: 0 }) }).reason, 'no_number');
  for (const amount of ['0', 0, 'abc', null, '-5']) assert.equal(buildRevenueReceipt({ tx: tx({ amount }) }).reason, 'no_amount', String(amount));
  // the first reason wins: a draft expense is a draft first
  assert.equal(buildRevenueReceipt({ tx: tx({ status: 'DRAFT', kind: 'EXPENSE' }) }).reason, 'not_posted');
});

await check('other revenue: payer, purpose, account and where the money went', () => {
  const r = ok(buildRevenueReceipt({ tx: tx({ description: 'مواقف شهر أكتوبر', category: { name_ar: 'إيراد مواقف' }, amount: '300.250' }) }));
  assert.equal(r.kind, 'revenue');
  assert.equal(r.title, 'إيصال استلام مبلغ');
  assert.equal(r.total, 300.25);
  assert.equal(r.purpose, 'مواقف شهر أكتوبر');
  assert.equal(r.category, 'إيراد مواقف');
  assert.deepEqual(r.lines, []);
  assert.equal(r.balance, null);
  assert.equal(r.sourceLabel, 'الاستلام في');
  assert.equal(r.source, 'الخزينة الرئيسية');
  assert.equal(r.methodLabel, 'نقدي');
});

await check('other revenue: no payer, no description and no cashbox are blank, not invented', () => {
  const r = ok(buildRevenueReceipt({ tx: tx({ contact: null, description: '  ', cashbox: null, category: null }) }));
  assert.equal(r.payer.name, null);
  assert.equal(r.purpose, null);
  assert.equal(r.source, null);
  assert.equal(r.category, null);
  assert.equal(r.fileName, 'إيص-1042');
});

await check('payment method: a cheque keeps its number and bank apart from the short label, a transfer its reference', () => {
  const cheque = ok(buildRevenueReceipt({ tx: tx({ method: 'CHEQUE', cheque_number: '8841', cheque_bank: 'مصرف الجمهورية' }) }));
  assert.equal(cheque.methodLabel, 'صك');
  assert.equal(cheque.methodDetail, 'رقم 8841 · مصرف الجمهورية');
  const bare = ok(buildRevenueReceipt({ tx: tx({ method: 'CHEQUE' }) }));
  assert.equal(bare.methodLabel, 'صك');
  assert.equal(bare.methodDetail, null);
  assert.equal(ok(buildRevenueReceipt({ tx: tx({ method: 'CHEQUE', cheque_number: '77' }) })).methodDetail, 'رقم 77');
  assert.equal(ok(buildRevenueReceipt({ tx: tx() })).methodDetail, null);
  const transfer = ok(buildRevenueReceipt({ tx: tx({ method: 'TRANSFER', reference: 'TR-5521', cashbox: { name_ar: 'مصرف الواحة', kind: 'BANK', bank_name: 'مصرف الواحة' } }) }));
  assert.equal(transfer.methodLabel, 'حوالة مصرفية');
  assert.equal(transfer.source, 'مصرف الواحة');
  assert.equal(transfer.reference, 'TR-5521');
  const named = ok(buildRevenueReceipt({ tx: tx({ cashbox: { name_ar: 'الحساب الجاري', kind: 'BANK', bank_name: 'مصرف التجارة' } }) }));
  assert.equal(named.source, 'الحساب الجاري · مصرف التجارة');
});

await check('the tenant on the screen wins over the join, and the file name starts with the receipt number', () => {
  const r = ok(rent({ tx: tx({ contact: null }), tenant: { name: 'مؤسسة / النور', shopNumber: '12' } }));
  assert.equal(r.payer.name, 'مؤسسة / النور');
  assert.equal(r.fileName, 'إيص-1042-مؤسسة النور');
  const fallback = ok(rent({ tenant: undefined }));
  assert.equal(fallback.payer.name, 'مؤسسة النور');
  assert.equal(fallback.payer.shopNumber, '12');
});

await check('history: rebuilt from the screen, no balance, and a number only when one is given', () => {
  const input = {
    tenantName: 'مؤسسة النور',
    shopNumber: '12',
    paymentDate: '2026-09-02',
    months: [{ monthLabel: 'سبتمبر 2026', amount: 1000, statusLabel: 'مدفوع' }, { monthLabel: 'أكتوبر 2026', amount: 200, statusLabel: 'جزئي' }, { monthLabel: 'غير مربوط بشهر', amount: 50, statusLabel: 'رصيد' }],
    totalAmount: 1250,
    paymentMethod: 'نقدي',
    paymentSource: 'نقدي — الخزينة الرئيسية',
  };
  const old = rentReceiptFromHistory(input);
  assert.equal(old.number, null);
  assert.equal(old.balance, null);
  assert.deepEqual(old.lines.map((l) => [l.state, l.value, l.remaining]), [['settled', null, null], ['partial', null, null], ['other', null, null]]);
  assert.equal(old.statusNote, RECEIPT_STATUS_NOTE);
  assert.equal(old.fileName, 'إيصال-مؤسسة النور');
  const numbered = rentReceiptFromHistory({ ...input, receiptNumber: 'إيص-9' });
  assert.equal(numbered.number, 'إيص-9');
  assert.equal(numbered.fileName, 'إيص-9-مؤسسة النور');
  assert.equal(rentReceiptFromHistory({ ...input, paymentMethod: undefined }).methodLabel, '—');
});

await check('PDF strings: no direction marks and no line that begins with a digit or a Latin letter', () => {
  const receipts = [
    ok(rent({ otherOwing: [{ month: '2026-09', amount: 100 }] })),
    ok(buildRevenueReceipt({ tx: tx({ method: 'CHEQUE', cheque_number: '8841' }) })),
    rentReceiptFromHistory({ tenantName: 'x', paymentDate: '2026-09-02', months: [{ monthLabel: 'سبتمبر 2026', amount: 1, statusLabel: 'مدفوع' }], totalAmount: 1 }),
  ];
  // the references and shop numbers are data and are drawn in a direction-fixed style; every label we write is checked
  for (const r of receipts) {
    for (const s of pdfStrings(r)) {
      assert.equal(DIRECTION_MARKS.test(s), false, `direction mark in «${s}»`);
    }
    for (const s of [r.number, r.title, r.statusNote, r.methodLabel, r.sourceLabel, r.balance && (r.balance.label ?? r.balance.text), r.otherOwed?.label, r.otherOwed?.detail, ...r.lines.flatMap((l) => [l.label, l.statusLabel])].filter(Boolean)) {
      assert.equal(startsWithDigitOrLatin(s), false, `«${s}» starts with a digit or a Latin letter`);
    }
  }
});

await check('counts agree: one month, two months, many', () => {
  assert.equal(monthsCountText(1), 'شهر واحد');
  assert.equal(monthsCountText(2), 'شهرين');
  assert.equal(monthsCountText(3), '3 أشهر');
  assert.equal(monthsCountText(11), '11 شهراً');
});

// formatMoney isolates the figure and joins it to the currency with a no-break space: compare what is read
const plain = (s) => s.replace(/[\u2066-\u2069]/g, '').replace(/\u00a0/g, ' ');

await check('WhatsApp: rent message has the amount, the months, the balance left and the number', () => {
  const m = plain(buildPaymentReceiptMessage(ok(rent())));
  assert.equal(
    m,
    [
      'السيد/ة مؤسسة النور،',
      '',
      'استلمنا منكم 1,500 د.ل بتاريخ 18 أكتوبر 2026 للمحل رقم 12.',
      '',
      'أكتوبر 2026: مُسدَّد',
      'نوفمبر 2026: جزئي',
      '',
      'المتبقي من إيجار نوفمبر 2026: 500 د.ل',
      '',
      'رقم الإيصال: إيص-1042',
      'إيصال عن معاملة مرحّلة',
      'نشكر لكم تعاونكم.',
      '',
      'إدارة تاج مول',
    ].join('\n'),
  );
});

await check('WhatsApp: a settled rent, other owed months, and no money line typed with a sign', () => {
  const settled = plain(buildPaymentReceiptMessage(ok(rent({ tx: tx({ amount: '1000' }), lines: [line('2026-10', 1000, 0, 1000, 'paid')] }))));
  assert.match(settled, /الشهر مُسدَّد بالكامل\. لا مبلغ متبقٍ عليه\./);
  assert.doesNotMatch(settled, /المتبقي من/);
  const owed = plain(buildPaymentReceiptMessage(ok(rent({ otherOwing: [{ month: '2026-09', amount: 1000 }] }))));
  assert.match(owed, /شهر آخر مستحق لم يشمله هذا الإيصال: سبتمبر 2026، 1,000 د\.ل\./);
  assert.doesNotMatch(owed, /[+−]\s*\d/);
});

await check('WhatsApp: other revenue names the purpose; without a payer the greeting is general', () => {
  const m = plain(buildPaymentReceiptMessage(ok(buildRevenueReceipt({ tx: tx({ contact: null, description: 'مواقف شهر أكتوبر', amount: '300.25' }) }))));
  assert.ok(m.startsWith('تحية طيبة،\n\nاستلمنا منكم 300.25 د.ل بتاريخ 18 أكتوبر 2026.\nالبيان: مواقف شهر أكتوبر'));
  assert.match(m, /رقم الإيصال: إيص-1042/);
  // a tenant paying something other than rent: the message does not say it was for the shop
  const fromTenant = plain(buildPaymentReceiptMessage(ok(buildRevenueReceipt({ tx: tx({ description: 'مواقف' }) }))));
  assert.doesNotMatch(fromTenant, /للمحل/);
  assert.match(fromTenant, /^السيد\/ة مؤسسة النور،/);
  const noPurpose = plain(buildPaymentReceiptMessage(ok(buildRevenueReceipt({ tx: tx({ description: null, category: { name_ar: 'إيراد مواقف' } }) }))));
  assert.match(noPurpose, /البيان: إيراد مواقف/);
});

await check('WhatsApp link: to the tenant when the number is valid, otherwise WhatsApp asks who', () => {
  const msg = 'مرحباً\nاختبار';
  assert.equal(buildMessageShareLink('0912345678', msg), `https://wa.me/218912345678?text=${encodeURIComponent(msg)}`);
  assert.equal(buildMessageShareLink('+218 91 234 5678', msg), `https://wa.me/218912345678?text=${encodeURIComponent(msg)}`);
  for (const phone of [null, undefined, '', 'لا يوجد', '---']) {
    assert.equal(buildMessageShareLink(phone, msg), `https://wa.me/?text=${encodeURIComponent(msg)}`, String(phone));
  }
});

const pdfOf = (receipt, Doc) => renderPdfBlob(async () => React.createElement(Doc, { receipt }));

await check('PDF: the rent, other revenue and history receipts all render', async () => {
  const { PaymentReceiptPDF } = await import('../src/features/pdf/PaymentReceiptPDF.tsx');
  const { TenantRentReceiptPDF } = await import('../src/features/pdf/TenantRentReceiptPDF.tsx');
  const rentBlob = await pdfOf(ok(rent({ otherOwing: [{ month: '2026-09', amount: 1000 }] })), PaymentReceiptPDF);
  const revenueBlob = await pdfOf(ok(buildRevenueReceipt({ tx: tx({ description: 'مواقف', contact: null }) })), PaymentReceiptPDF);
  const historyBlob = await renderPdfBlob(async () =>
    React.createElement(TenantRentReceiptPDF, {
      tenantName: '7 نجوم للتجارة',
      shopNumber: '12',
      paymentDate: '2026-09-02',
      totalAmount: 1000,
      paymentMethod: 'نقدي',
      paymentSource: 'نقدي — الخزينة الرئيسية',
      months: [{ monthLabel: 'سبتمبر 2026', amount: 1000, statusLabel: 'مدفوع' }],
    }),
  );
  for (const [name, blob] of [['rent', rentBlob], ['revenue', revenueBlob], ['history', historyBlob]]) {
    assert.ok(blob.size > 4000, `${name} PDF too small (${blob.size} bytes)`);
    assert.equal(blob.type, 'application/pdf');
  }
  const one = await pdfOf(ok(rent()), PaymentReceiptPDF);
  assert.ok(one.size > 4000);
  // a whole year of months (the tighter rows) and a payer whose name starts with a digit both render
  const months = Array.from({ length: 12 }, (_, i) => line(`2026-${String(i + 1).padStart(2, '0')}`, 1000, 0, 1000, 'paid'));
  const year = await pdfOf(ok(rent({ tx: tx({ amount: '12000', contact: { name: '7 نجوم للتجارة', shop_number: '3أ' } }), tenant: { name: '7 نجوم للتجارة', shopNumber: '3أ' }, lines: months })), PaymentReceiptPDF);
  assert.ok(year.size > 4000);
});

console.log(`\n${passed} checks passed`);
