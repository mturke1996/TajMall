// @ts-nocheck
/**
 * عرض المبالغ في PDF — نفس أسلوب مشروع Etlala (debtflow-pro)
 *
 * مكوّن من Textين منفصلين + flexDirection: 'row-reverse'
 * → الرقم يُقرأ أولاً ثم «د.ل» في السياق العربي.
 * لا تستخدم سلسلة نصية واحدة (تنقلب البيدي).
 */
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { PDF_FONT_FAMILY } from './pdfFonts';
import { PDF } from './pdfBase';

export const PDF_CURRENCY_AR = 'د.ل';

export function pdfFormatAmountRaw(n: number): string {
  const v = Number(n);
  const safe = Number.isFinite(v) ? Math.abs(v) : 0;
  const hasFraction = Math.abs(v % 1) > 1e-9;
  return new Intl.NumberFormat('en-US', {
    useGrouping: true,
    maximumFractionDigits: hasFraction ? 6 : 0,
    minimumFractionDigits: 0,
  }).format(safe);
}

export function pdfFormatAmountLtr(n: number): string {
  const sign = Number(n) < 0 ? '-' : '';
  return `${sign}${pdfFormatAmountRaw(n)}`;
}

/** للطوارئ فقط — يفضّل PdfMoneyText دائماً داخل PDF */
export function pdfFormatMoneyLtr(amount: number, currency: string = PDF_CURRENCY_AR): string {
  const sign = Number(amount) < 0 ? '-' : '';
  const curr = String(currency ?? PDF_CURRENCY_AR).trim() || PDF_CURRENCY_AR;
  return `${sign}${curr}\u00A0${pdfFormatAmountRaw(amount)}`;
}

type PdfMoneyTextProps = {
  amount: number;
  currency?: string;
  style?: any;
  currStyle?: any;
  align?: 'left' | 'center' | 'right';
  containerStyle?: any;
  color?: string;
  light?: boolean;
};

/** مكوّن يعرض المبلغ ثم العملة — مطابق لـ Etlala pdfKit.tsx */
export function PdfMoneyText({
  amount,
  currency = PDF_CURRENCY_AR,
  style,
  currStyle,
  align = 'center',
  containerStyle,
  color,
  light = false,
}: PdfMoneyTextProps) {
  const formatted = pdfFormatAmountRaw(amount);
  const sign = Number(amount) < 0 ? '-' : '';
  const curr = String(currency ?? PDF_CURRENCY_AR).trim() || PDF_CURRENCY_AR;
  const currColor = light ? 'rgba(255,255,255,0.92)' : PDF.muted;
  const amtColor = color || (light ? '#FBF8F1' : PDF.text);

  const justify =
    align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center';

  return (
    <View
      wrap={false}
      style={[
        {
          flexDirection: 'row-reverse',
          alignItems: 'baseline',
          justifyContent: justify,
          width: '100%',
        },
        containerStyle,
      ]}
    >
      <Text
        style={[
          {
            fontFamily: PDF_FONT_FAMILY,
            fontSize: 9,
            fontWeight: 'bold',
            color: amtColor,
          },
          style,
        ]}
      >
        {`${sign}${formatted}`}
      </Text>
      <Text
        style={[
          {
            fontFamily: PDF_FONT_FAMILY,
            fontSize: 8,
            color: currColor,
            fontWeight: 'bold',
            marginRight: 3,
          },
          currStyle,
        ]}
      >
        {curr}
      </Text>
    </View>
  );
}

export function PdfNumberText({
  value,
  style,
  align = 'center',
}: {
  value: number | string;
  style?: any;
  align?: 'left' | 'center' | 'right';
}) {
  const raw =
    typeof value === 'number' ? pdfFormatAmountLtr(value) : String(value ?? '');
  return (
    <Text
      style={[
        { fontFamily: PDF_FONT_FAMILY, textAlign: align, direction: 'ltr' },
        style,
      ]}
    >
      {raw}
    </Text>
  );
}
