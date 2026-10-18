// @ts-nocheck — react-pdf JSX styles; runtime-validated via scripts/verify-payroll-pdf.mjs
/**
 * قسيمة راتب موظف لشهر واحد: المستحقات يميناً، الاستقطاعات تحتها، والصافي في الأسفل.
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText } from './pdfBrandKit';
import { PDF_TABLE_ROW } from './pdfTable';
import { formatMonthKeyAr } from '@/lib/utils';
import type { PayrollAdjustment, PayrollRunLine } from '@/lib/db/payroll-queries';

const n = (v) => Number(v) || 0;

const KIND_AR = {
  BONUS: 'مكافأة',
  OVERTIME: 'عمل إضافي',
  ABSENCE: 'خصم غياب',
  PENALTY: 'جزاء',
  OTHER_DEDUCTION: 'خصم آخر',
};

const s = StyleSheet.create({
  table: { borderWidth: 0.8, borderColor: PDF.border, borderRadius: 3 },
  row: {
    ...PDF_TABLE_ROW,
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  last: { borderBottomWidth: 0 },
  amount: { width: '35%' },
  label: { fontSize: 9, color: PDF.text, textAlign: 'right' },
  hint: { fontSize: 7.5, color: PDF.muted, textAlign: 'right', marginTop: 1 },
  subtotal: { backgroundColor: PDF.rowAlt },
  subtotalLabel: { fontSize: 9, fontWeight: 'bold', color: PDF.text, textAlign: 'right' },
  net: {
    ...PDF_TABLE_ROW,
    justifyContent: 'space-between',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
  },
  netLabel: { fontSize: 11, fontWeight: 'bold', color: PDF.text, textAlign: 'right' },
  sign: { ...PDF_TABLE_ROW, justifyContent: 'space-between', marginTop: 40, paddingHorizontal: 12 },
  signBox: { width: '40%', borderTopWidth: 0.8, borderTopColor: PDF.border, paddingTop: 5 },
  signText: { fontSize: 8, color: PDF.muted, textAlign: 'center' },
});

function Line({ label, hint, amount, last, strong }: { label: string; hint?: string; amount: number; last?: boolean; strong?: boolean }) {
  return (
    <View style={[s.row, last ? s.last : {}, strong ? s.subtotal : {}]} wrap={false}>
      <View style={s.amount}>
        <PdfMoneyText amount={amount} align="left" style={{ fontSize: 9, fontWeight: strong ? 'bold' : 'normal' }} />
      </View>
      <View>
        <Text style={strong ? s.subtotalLabel : s.label}>{ar(label)}</Text>
        {hint ? <Text style={s.hint}>{ar(hint)}</Text> : null}
      </View>
    </View>
  );
}

export function PayslipPDF({
  line,
  adjustments = [],
}: {
  line: PayrollRunLine;
  /** The approved adjustments of this month, listed under their totals for the reason. */
  adjustments?: PayrollAdjustment[];
}) {
  const monthAr = formatMonthKeyAr(line.period_month);
  const reasons = (kinds: string[]) =>
    adjustments
      .filter((a) => kinds.includes(a.kind) && a.status === 'APPROVED')
      .map((a) => `${KIND_AR[a.kind]}: ${a.reason}`)
      .join(' · ');

  const earnings = [
    { label: 'الراتب الأساسي', amount: n(line.base_salary) },
    { label: 'البدلات', amount: n(line.allowances) },
    { label: 'المكافآت', amount: n(line.bonuses), hint: reasons(['BONUS']) },
    { label: 'العمل الإضافي', amount: n(line.overtime), hint: reasons(['OVERTIME']) },
  ].filter((r) => r.amount > 0.0005 || r.label === 'الراتب الأساسي');

  const deductions = [
    { label: 'خصم الغياب', amount: n(line.absence_deduction), hint: reasons(['ABSENCE']) },
    { label: 'الجزاءات', amount: n(line.penalties), hint: reasons(['PENALTY']) },
    { label: 'خصومات أخرى', amount: n(line.other_deductions), hint: reasons(['OTHER_DEDUCTION']) },
    { label: 'قسط السلفة', amount: n(line.advance_repayment) },
  ].filter((r) => r.amount > 0.0005);

  const earned = n(line.base_salary) + n(line.allowances) + n(line.bonuses) + n(line.overtime);
  const deducted = deductions.reduce((acc, r) => acc + r.amount, 0);

  return (
    <ReportShell
      title="قسيمة راتب"
      subtitle={`${line.employee_name} — ${monthAr}`}
      documentTitle={`قسيمة راتب ${line.employee_name} ${monthAr}`}
      periodSummary={{
        eyebrow: 'Payslip',
        title: monthAr,
        subtitle: line.employee_name,
        hint: [line.job_title, line.department].filter(Boolean).join(' · '),
      }}
      metaCells={[
        { label: 'الموظف', value: line.employee_name },
        { label: 'صافي الراتب', moneyAmount: n(line.net), adaptiveMoney: true },
        { label: 'صُرف', moneyAmount: n(line.paid), adaptiveMoney: true },
      ]}
    >
      <Text style={pdfBase.sectionTitle}>{ar('المستحقات')}</Text>
      <View style={s.table}>
        {earnings.map((r) => (
          <Line key={r.label} label={r.label} hint={r.hint} amount={r.amount} />
        ))}
        <Line label="إجمالي المستحقات" amount={earned} strong last />
      </View>

      {deductions.length > 0 && (
        <>
          <Text style={pdfBase.sectionTitle}>{ar('الاستقطاعات')}</Text>
          <View style={s.table}>
            {deductions.map((r) => (
              <Line key={r.label} label={r.label} hint={r.hint} amount={r.amount} />
            ))}
            <Line label="إجمالي الاستقطاعات" amount={deducted} strong last />
          </View>
        </>
      )}

      <View style={s.net} wrap={false}>
        <View style={s.amount}>
          <PdfMoneyText amount={n(line.net)} align="left" style={{ fontSize: 13, fontWeight: 'bold' }} />
        </View>
        <Text style={s.netLabel}>{ar('صافي الراتب')}</Text>
      </View>

      {n(line.outstanding) > 0.0005 && line.run_status === 'POSTED' && (
        <View style={[s.row, { marginTop: 6, borderBottomWidth: 0 }]} wrap={false}>
          <View style={s.amount}>
            <PdfMoneyText amount={n(line.outstanding)} align="left" style={{ fontSize: 9 }} />
          </View>
          <Text style={s.label}>{ar('المتبقي للصرف')}</Text>
        </View>
      )}

      <View style={s.sign} wrap={false}>
        <View style={s.signBox}><Text style={s.signText}>{ar('توقيع المحاسب')}</Text></View>
        <View style={s.signBox}><Text style={s.signText}>{ar('توقيع الموظف بالاستلام')}</Text></View>
      </View>
    </ReportShell>
  );
}
