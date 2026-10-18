// @ts-nocheck — react-pdf JSX styles; runtime-validated via scripts/verify-payroll-pdf.mjs
/**
 * كشف الرواتب الشهري المجمّع — سطر لكل موظف وإجمالي في الأسفل.
 * الأعمدة بترتيب LTR في JSX: المبالغ يسار الورقة، اسم الموظف يمينها.
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum } from './pdfBrandKit';
import { PDF_TABLE_ROW } from './pdfTable';
import { formatMonthKeyAr } from '@/lib/utils';
import type { PayrollRunLine, PayrollRunStatus } from '@/lib/db/payroll-queries';

const n = (v) => Number(v) || 0;

const s = StyleSheet.create({
  head: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.headerBg,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  row: {
    ...PDF_TABLE_ROW,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  rowAlt: { backgroundColor: PDF.rowAlt },
  th: { color: PDF.white, fontSize: 7.5, fontWeight: 'bold', textAlign: 'center' },
  thAr: { color: PDF.white, fontSize: 7.5, fontWeight: 'bold', textAlign: 'right' },
  name: { width: '22%', paddingRight: 4 },
  nameText: { fontSize: 8.5, color: PDF.text, textAlign: 'right' },
  sub: { fontSize: 7, color: PDF.muted, textAlign: 'right', marginTop: 1 },
  num: { width: '13%', alignItems: 'center' },
  foot: {
    ...PDF_TABLE_ROW,
    marginTop: 8,
    paddingVertical: 9,
    paddingHorizontal: 4,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
  },
  footLabel: { fontSize: 9, fontWeight: 'bold', color: PDF.text, textAlign: 'right' },
  sign: {
    ...PDF_TABLE_ROW,
    justifyContent: 'space-between',
    marginTop: 36,
    paddingHorizontal: 12,
  },
  signBox: { width: '28%', borderTopWidth: 0.8, borderTopColor: PDF.border, paddingTop: 5 },
  signText: { fontSize: 8, color: PDF.muted, textAlign: 'center' },
});

const STATUS_AR: Record<PayrollRunStatus, string> = { DRAFT: 'مسودة', APPROVED: 'معتمد', POSTED: 'مُرحَّل' };

function Money({ amount, bold }: { amount: number; bold?: boolean }) {
  if (Math.abs(amount) < 0.0005) return <Text style={{ fontSize: 8, color: PDF.muted, textAlign: 'center' }}>—</Text>;
  return <PdfMoneyText amount={amount} style={{ fontSize: bold ? 9 : 8, fontWeight: bold ? 'bold' : 'normal' }} />;
}

export function PayrollRegisterPDF({
  month,
  status,
  lines,
}: {
  month: string;
  status: PayrollRunStatus | null;
  lines: PayrollRunLine[];
}) {
  const total = (pick) => lines.reduce((acc, l) => acc + pick(l), 0);
  const base = total((l) => n(l.base_salary));
  const allowances = total((l) => n(l.allowances));
  const additions = total((l) => n(l.bonuses) + n(l.overtime));
  const deductions = total((l) => n(l.absence_deduction) + n(l.penalties) + n(l.other_deductions));
  const advances = total((l) => n(l.advance_repayment));
  const net = total((l) => n(l.net));
  const monthAr = formatMonthKeyAr(month);

  return (
    <ReportShell
      title="كشف الرواتب الشهري"
      subtitle={monthAr}
      documentTitle={`كشف رواتب ${monthAr}`}
      periodSummary={{
        eyebrow: 'Payroll register',
        title: monthAr,
        subtitle: `${lines.length} موظف`,
        hint: status ? `حالة الكشف: ${STATUS_AR[status]}` : '',
        badge: status ? STATUS_AR[status] : undefined,
      }}
      metaCells={[
        { label: 'عدد الموظفين', value: pdfFmtNum(lines.length) },
        { label: 'إجمالي المستحق', moneyAmount: base + allowances + additions - total((l) => n(l.absence_deduction)), adaptiveMoney: true },
        { label: 'صافي الرواتب', moneyAmount: net, adaptiveMoney: true },
      ]}
    >
      <Text style={pdfBase.sectionTitle}>{ar('تفاصيل الكشف')}</Text>

      <View style={s.head} fixed>
        <Text style={[s.th, s.num]}>{ar('الصافي')}</Text>
        <Text style={[s.th, s.num]}>{ar('قسط سلفة')}</Text>
        <Text style={[s.th, s.num]}>{ar('خصومات وغياب')}</Text>
        <Text style={[s.th, s.num]}>{ar('مكافآت وإضافي')}</Text>
        <Text style={[s.th, s.num]}>{ar('البدلات')}</Text>
        <Text style={[s.th, s.num]}>{ar('الأساسي')}</Text>
        <Text style={[s.thAr, s.name]}>{ar('الموظف')}</Text>
      </View>

      {lines.map((l, i) => (
        <View key={l.id} style={[s.row, i % 2 === 1 ? s.rowAlt : {}]} wrap={false}>
          <View style={s.num}><Money amount={n(l.net)} bold /></View>
          <View style={s.num}><Money amount={n(l.advance_repayment)} /></View>
          <View style={s.num}><Money amount={n(l.absence_deduction) + n(l.penalties) + n(l.other_deductions)} /></View>
          <View style={s.num}><Money amount={n(l.bonuses) + n(l.overtime)} /></View>
          <View style={s.num}><Money amount={n(l.allowances)} /></View>
          <View style={s.num}><Money amount={n(l.base_salary)} /></View>
          <View style={s.name}>
            <Text style={s.nameText}>{ar(l.employee_name)}</Text>
            {l.job_title ? <Text style={s.sub}>{ar(l.job_title)}</Text> : null}
          </View>
        </View>
      ))}

      <View style={s.foot} wrap={false}>
        <View style={s.num}><Money amount={net} bold /></View>
        <View style={s.num}><Money amount={advances} /></View>
        <View style={s.num}><Money amount={deductions} /></View>
        <View style={s.num}><Money amount={additions} /></View>
        <View style={s.num}><Money amount={allowances} /></View>
        <View style={s.num}><Money amount={base} /></View>
        <View style={s.name}><Text style={s.footLabel}>{ar('الإجمالي')}</Text></View>
      </View>

      <View style={s.sign} wrap={false}>
        <View style={s.signBox}><Text style={s.signText}>{ar('المعتمد')}</Text></View>
        <View style={s.signBox}><Text style={s.signText}>{ar('المراجع')}</Text></View>
        <View style={s.signBox}><Text style={s.signText}>{ar('المُعِدّ')}</Text></View>
      </View>
    </ReportShell>
  );
}
