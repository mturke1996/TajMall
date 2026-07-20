// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';

const W = {
  balance: '14%',
  credit: '13%',
  debit: '13%',
  type: '12%',
  name: '36%',
  code: '12%',
};

export type TrialBalanceReportPdfProps = {
  year: number;
  rows: Array<{
    code: string;
    name_ar: string;
    type: string;
    total_debit: number;
    total_credit: number;
    balance: number;
  }>;
  documentTitle?: string;
};

export function TrialBalanceReportPDF({
  year,
  rows,
  documentTitle,
}: TrialBalanceReportPdfProps) {
  let totalDebits = 0;
  let totalCredits = 0;
  rows.forEach((r) => {
    totalDebits += Number(r.total_debit || 0);
    totalCredits += Number(r.total_credit || 0);
  });
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
  const periodLabel = `السنة المالية ${year}`;

  return (
    <ReportShell
      title="ميزان المراجعة"
      subtitle={periodLabel}
      documentTitle={documentTitle}
      periodSummary={{
        eyebrow: 'Trial Balance',
        title: periodLabel,
        subtitle: `${rows.length} بند محاسبي`,
        hint: isBalanced ? 'المدين = الدائن' : 'فرق في التوازن — مراجعة',
        badge: isBalanced ? 'متوازن' : 'مراجعة',
      }}
      metaCells={[
        { label: 'إجمالي المدين', moneyAmount: totalDebits, adaptiveMoney: true },
        { label: 'إجمالي الدائن', moneyAmount: totalCredits, adaptiveMoney: true },
      ]}
    >
      <View style={pdfReportTable.hero} wrap={false}>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('عدد البنود')}</Text>
          <Text style={pdfReportTable.heroValue}>{ar(String(rows.length))}</Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('حالة الميزان')}</Text>
          <Text style={pdfReportTable.heroValue}>
            {ar(isBalanced ? 'متوازن' : 'غير متوازن')}
          </Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('الفرق')}</Text>
          <PdfReportMoney amount={Math.abs(totalDebits - totalCredits)} bold />
        </View>
      </View>

      <View style={pdfReportTable.tableWrap}>
        <View style={pdfReportTable.tableHead} wrap={false}>
          <Text style={[pdfReportTable.th, { width: W.balance }]}>{ar('الرصيد')}</Text>
          <Text style={[pdfReportTable.th, { width: W.credit }]}>{ar('دائن')}</Text>
          <Text style={[pdfReportTable.th, { width: W.debit }]}>{ar('مدين')}</Text>
          <Text style={[pdfReportTable.th, { width: W.type }]}>{ar('النوع')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.name }]}>{ar('الحساب')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.code }]}>{ar('الرمز')}</Text>
        </View>

        {rows.map((r, i) => (
          <View
            key={r.code}
            style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]}
          >
            <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
              <PdfReportMoney amount={Number(r.balance)} bold />
            </View>
            <View style={[pdfReportTable.tdNum, { width: W.credit }]}>
              <PdfReportMoney amount={Number(r.total_credit)} color={PDF.danger} />
            </View>
            <View style={[pdfReportTable.tdNum, { width: W.debit }]}>
              <PdfReportMoney amount={Number(r.total_debit)} color={PDF.success} />
            </View>
            <Text style={[pdfReportTable.tdMuted, { width: W.type, fontSize: 7.5 }]}>
              {ar(r.type)}
            </Text>
            <Text style={[pdfReportTable.tdAr, { width: W.name }]}>{ar(r.name_ar)}</Text>
            <Text style={[pdfReportTable.tdMuted, { width: W.code }]}>{r.code}</Text>
          </View>
        ))}
      </View>

      <View
        style={[pdfReportTable.totalBar, !isBalanced ? pdfReportTable.totalBarWarn : {}]}
        wrap={false}
      >
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('دائن')}</Text>
            <PdfReportMoney amount={totalCredits} bold />
          </View>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('مدين')}</Text>
            <PdfReportMoney amount={totalDebits} bold />
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>{ar('إجمالي ميزان المراجعة')}</Text>
      </View>

      <PdfReportCaption />
    </ReportShell>
  );
}
