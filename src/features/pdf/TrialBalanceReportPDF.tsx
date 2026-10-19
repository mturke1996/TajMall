// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { accountTypeLabelAr } from '@/lib/accounting-labels';

const W = {
  balance: '14%',
  credit: '13%',
  debit: '13%',
  type: '12%',
  name: '36%',
  code: '12%',
};

/** room needed after the last rows: the table's bottom margin, the grand total bar and the caption */
const CLOSING_AFTER_ROWS = 70;
/** the last rows sit in a second card, seamless with the first, so they can travel to the next page together with the grand total bar */
const TAIL_ROWS = 2;
const CARD_OPEN_BOTTOM = {
  borderBottomWidth: 0,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  marginBottom: 0,
};
const CARD_OPEN_TOP = {
  borderTopWidth: 0,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
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
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.0005;
  const periodLabel = `السنة المالية ${year}`;

  const renderRow = (r: TrialBalanceReportPdfProps['rows'][number], i: number) => (
      <View
        key={r.code}
        style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]}
        wrap={false}
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
          {ar(accountTypeLabelAr(r.type))}
        </Text>
        <Text style={[pdfReportTable.tdAr, { width: W.name }]}>{ar(r.name_ar)}</Text>
        <Text style={[pdfReportTable.tdMuted, { width: W.code }]}>{r.code}</Text>
      </View>
  );

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

      {/* one card, split in two seamless halves: the last rows can then travel with the grand total bar */}
      <View style={[pdfReportTable.tableWrap, rows.length > TAIL_ROWS ? CARD_OPEN_BOTTOM : null]}>
        <View style={pdfReportTable.tableHead} wrap={false}>
          <Text style={[pdfReportTable.th, { width: W.balance }]}>{ar('الرصيد')}</Text>
          <Text style={[pdfReportTable.th, { width: W.credit }]}>{ar('دائن')}</Text>
          <Text style={[pdfReportTable.th, { width: W.debit }]}>{ar('مدين')}</Text>
          <Text style={[pdfReportTable.th, { width: W.type }]}>{ar('النوع')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.name }]}>{ar('الحساب')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.code }]}>{ar('الرمز')}</Text>
        </View>

        {rows.slice(0, Math.max(rows.length - TAIL_ROWS, 0)).map(renderRow)}
        {rows.length <= TAIL_ROWS ? rows.map(renderRow) : null}
      </View>
      {rows.length > TAIL_ROWS ? (
        <View
          style={[pdfReportTable.tableWrap, CARD_OPEN_TOP]}
          wrap={false}
          minPresenceAhead={CLOSING_AFTER_ROWS}
        >
          {rows.slice(rows.length - TAIL_ROWS).map((r, k) => renderRow(r, rows.length - TAIL_ROWS + k))}
        </View>
      ) : null}

      <View wrap={false}>
        <View
          style={[pdfReportTable.totalBar, !isBalanced ? pdfReportTable.totalBarWarn : {}]}
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
      </View>
    </ReportShell>
  );
}
