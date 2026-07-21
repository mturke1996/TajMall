// @ts-nocheck
/**
 * أنماط ومكوّنات مشتركة لتقارير PDF المحاسبية — تخطيط موحّد عالي الجودة.
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { PDF } from './pdfBase';
import { PDF_TABLE_ROW, PDF_AR_CELL, PDF_NUM_CELL } from './pdfTable';
import { PdfMoneyText } from './pdfBrandKit';
import { ar } from './arabicPDF';

export const pdfReportTable = StyleSheet.create({
  tableWrap: {
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 3,
    marginBottom: 16,
  },
  /** رأس أعمدة — استخدم fixed لتكراره في الصفحة التالية عند انقسام الجدول */
  tableHead: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.headerBg,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  tableRow: {
    ...PDF_TABLE_ROW,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
    alignItems: 'flex-start',
    minHeight: 28,
  },
  rowAlt: {
    backgroundColor: PDF.rowAlt,
  },
  th: {
    fontSize: 8,
    fontWeight: 'bold',
    color: PDF.white,
    textAlign: 'center',
  },
  thAr: {
    fontSize: 8,
    fontWeight: 'bold',
    color: PDF.white,
    textAlign: 'right',
  },
  td: {
    fontSize: 8.5,
    color: PDF.text,
  },
  tdAr: {
    ...PDF_AR_CELL,
    fontSize: 8.5,
    color: PDF.text,
    lineHeight: 1.35,
  },
  tdMuted: {
    fontSize: 8,
    color: PDF.muted,
    textAlign: 'center',
  },
  tdNum: {
    ...PDF_NUM_CELL,
    paddingTop: 1,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
    marginBottom: 10,
    marginTop: 8,
    paddingBottom: 5,
    borderBottomWidth: 1.5,
    borderBottomColor: PDF.border,
  },
  sectionBand: {
    backgroundColor: PDF.headerBg,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 10,
    marginBottom: 0,
  },
  sectionBandText: {
    color: PDF.white,
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  totalBar: {
    direction: 'ltr',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: PDF.primary,
    borderRadius: 3,
  },
  totalBarWarn: {
    backgroundColor: '#991b1b',
  },
  totalLabel: {
    direction: 'rtl',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FBF8F1',
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '55%',
  },
  totalCluster: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    gap: 14,
    flexShrink: 0,
  },
  totalMini: {
    direction: 'rtl',
    alignItems: 'center',
    minWidth: 68,
  },
  totalMiniLabel: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.78)',
    marginBottom: 2,
    textAlign: 'center',
  },
  caption: {
    fontSize: 8,
    color: PDF.muted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 1.5,
  },
  hero: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: PDF.logoGreenSoft,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRightWidth: 3,
    borderRightColor: PDF.logoGreen,
    borderRadius: 3,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  heroCell: {
    direction: 'rtl',
    flex: 1,
    minWidth: 0,
  },
  heroLabel: {
    fontSize: 7.5,
    color: PDF.muted,
    fontWeight: 'bold',
    marginBottom: 3,
    textAlign: 'right',
  },
  heroValue: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
    lineHeight: 1.35,
  },
  /** صف إجماليات محاسبي — خط مزدوج كميزان المراجعة */
  totalsRow: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.logoGreenSoft,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
    borderBottomWidth: 2,
    borderBottomColor: PDF.primary,
  },
  totalsRowLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
  },
  docInfoStrip: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: PDF.border,
    backgroundColor: PDF.mutedBg,
    borderRadius: 3,
  },
  docInfoCell: {
    direction: 'rtl',
    width: '32%',
  },
  docInfoLabel: {
    fontSize: 7,
    color: PDF.muted,
    fontWeight: 'bold',
    marginBottom: 3,
    textAlign: 'right',
  },
  docInfoValue: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
    lineHeight: 1.35,
  },
});

export function PdfReportMoney({
  amount,
  color,
  bold,
  light,
  /** عند true يُعرض 0 بدل الشرطة — مناسب لأعمدة مدين/دائن */
  showZero = false,
}: {
  amount: number;
  color?: string;
  bold?: boolean;
  light?: boolean;
  showZero?: boolean;
}) {
  if (!amount || Math.abs(amount) < 0.0005) {
    if (showZero) {
      return (
        <PdfMoneyText
          amount={0}
          align="center"
          adaptive
          adaptiveBase={9}
          color={color}
          light={light}
          style={{
            fontSize: 8.5,
            fontWeight: bold ? 'bold' : 'normal',
            textAlign: 'center',
            ...(light ? { color: '#FBF8F1' } : {}),
          }}
          currStyle={light ? { fontSize: 7.5, color: 'rgba(255,255,255,0.9)' } : undefined}
          containerStyle={{ justifyContent: 'center', width: '100%' }}
        />
      );
    }
    return (
      <Text style={[pdfReportTable.tdMuted, light && { color: 'rgba(255,255,255,0.65)' }]}>
        {ar('—')}
      </Text>
    );
  }
  return (
    <PdfMoneyText
      amount={amount}
      align="center"
      adaptive
      adaptiveBase={9}
      color={color}
      light={light}
      style={{
        fontSize: 8.5,
        fontWeight: bold ? 'bold' : 'normal',
        textAlign: 'center',
        ...(light ? { color: '#FBF8F1' } : {}),
      }}
      currStyle={light ? { fontSize: 7.5, color: 'rgba(255,255,255,0.9)' } : undefined}
      containerStyle={{ justifyContent: 'center', width: '100%' }}
    />
  );
}

export function PdfReportCaption() {
  return (
    <Text style={pdfReportTable.caption}>
      {ar('وثيقة محاسبية مُولَّدة من منظومة تاج مول — للاستخدام الإداري')}
    </Text>
  );
}
