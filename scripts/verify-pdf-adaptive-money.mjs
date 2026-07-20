/**
 * تحقق من أحجام الخط المتكيّفة للمبالغ الكبيرة
 * التشغيل: npm run verify:pdf-adaptive
 */
import { pdfAdaptiveMoneySizes } from '../src/features/pdf/pdfAdaptiveMoney.ts';
import { pdfFormatAmountRaw } from '../src/features/pdf/pdfMoney.tsx';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cases = [
  { amount: 500, minSize: 16 },
  { amount: 999_999, minSize: 14 },
  { amount: 12_345_678, minSize: 9 },
  { amount: 123_456_789_012, minSize: 6 },
];

for (const { amount, minSize } of cases) {
  const sizes = pdfAdaptiveMoneySizes(amount, 18);
  const formatted = pdfFormatAmountRaw(amount);
  assert(
    sizes.amountSize <= 18 && sizes.amountSize >= minSize,
    `amount ${formatted} size ${sizes.amountSize} expected >= ${minSize}`,
  );
  assert(sizes.currencySize < sizes.amountSize, 'currency smaller than amount');
}

console.log('✓ verify-pdf-adaptive-money: all checks passed');
