// @ts-nocheck
/**
 * أحجام خط متكيّفة للمبالغ الكبيرة في PDF — تمنع تجاوز الخلية.
 */
import { pdfFormatAmountRaw } from './pdfMoney';

export type PdfAdaptiveMoneySizes = {
  amountSize: number;
  currencySize: number;
};

/** يُحسب حجم الخط من طول الرقم المُنسّق (بما في ذلك فواصل الآلاف) */
export function pdfAdaptiveMoneySizes(
  amount: number,
  baseAmount = 18,
): PdfAdaptiveMoneySizes {
  const formatted = pdfFormatAmountRaw(amount);
  const len = formatted.length;

  if (len <= 8) {
    return { amountSize: baseAmount, currencySize: Math.max(8, Math.round(baseAmount * 0.68)) };
  }
  if (len <= 10) {
    return {
      amountSize: Math.round(baseAmount * 0.78),
      currencySize: Math.max(7, Math.round(baseAmount * 0.52)),
    };
  }
  if (len <= 13) {
    return {
      amountSize: Math.round(baseAmount * 0.62),
      currencySize: Math.max(6.5, Math.round(baseAmount * 0.44)),
    };
  }
  if (len <= 16) {
    return {
      amountSize: Math.round(baseAmount * 0.5),
      currencySize: Math.max(6, Math.round(baseAmount * 0.38)),
    };
  }
  return {
    amountSize: Math.max(6.5, Math.round(baseAmount * 0.42)),
    currencySize: Math.max(5.5, Math.round(baseAmount * 0.32)),
  };
}
