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
  desc: '42%',
  meta: '18%',
};

export type LedgerReportPdfProps = {
  category: { name_ar: string; code: string; type: string };
  startDate?: string;
  endDate?: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  lines: Array<{
    entry_date: string;
    journal_number: number;
    journal_reference: string | null;
    description: string | null;
    debit: number;
    credit: number;
    runningBalance: number;
  }>;
  documentTitle?: string;
};

export function LedgerReportPDF({
  category,
  startDate,
  endDate,
  openingBalance,
  closingBalance,
  totalDebit,
  totalCredit,
  lines,
  documentTitle,
}: LedgerReportPdfProps) {
  const periodLabel =
    startDate || endDate
      ? `${startDate ?? '…'} — ${endDate ?? '…'}`
      : 'كل الفترات';

  return (
    <ReportShell
      title={`دفتر الأستاذ — ${category.name_ar}`}
      subtitle={`${category.code} · ${periodLabel}`}
      documentTitle={documentTitle}
      periodSummary={{
        eyebrow: 'General Ledger',
        title: category.name_ar,
        subtitle: `${lines.length} حركة · ${category.code}`,
        hint: periodLabel,
      }}
      metaCells={[
        { label: 'الرصيد الافتتاحي', moneyAmount: openingBalance, adaptiveMoney: true },
        { label: 'الرصيد الختامي', moneyAmount: closingBalance, adaptiveMoney: true },
      ]}
    >
      <View style={pdfReportTable.hero} wrap={false}>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('نوع البند')}</Text>
          <Text style={pdfReportTable.heroValue}>{ar(category.type)}</Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('الفترة')}</Text>
          <Text style={pdfReportTable.heroValue}>{periodLabel}</Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('الحركات')}</Text>
          <Text style={pdfReportTable.heroValue}>{ar(String(lines.length))}</Text>
        </View>
      </View>

      <View style={pdfReportTable.tableWrap}>
        <View style={pdfReportTable.tableHead} wrap={false}>
          <Text style={[pdfReportTable.th, { width: W.balance }]}>{ar('الرصيد')}</Text>
          <Text style={[pdfReportTable.th, { width: W.credit }]}>{ar('دائن')}</Text>
          <Text style={[pdfReportTable.th, { width: W.debit }]}>{ar('مدين')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.desc }]}>{ar('البيان')}</Text>
          <Text style={[pdfReportTable.th, { width: W.meta }]}>{ar('تاريخ / قيد')}</Text>
        </View>

        <View
          style={[pdfReportTable.tableRow, { backgroundColor: PDF.logoGreenSoft }]}
          wrap={false}
        >
          <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
            <PdfReportMoney amount={openingBalance} bold />
          </View>
          <Text style={[pdfReportTable.tdMuted, { width: W.credit }]}>—</Text>
          <Text style={[pdfReportTable.tdMuted, { width: W.debit }]}>—</Text>
          <Text style={[pdfReportTable.tdAr, { width: W.desc, fontWeight: 'bold' }]}>
            {ar('الرصيد الافتتاحي')}
          </Text>
          <Text style={[pdfReportTable.tdMuted, { width: W.meta }]}>—</Text>
        </View>

        {lines.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={pdfReportTable.tdMuted}>
              {ar('لا توجد حركات مرحّلة في الفترة')}
            </Text>
          </View>
        ) : (
          lines.map((l, i) => (
            <View
              key={`${l.journal_number}-${i}`}
              style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]}
            >
              <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
                <PdfReportMoney amount={Number(l.runningBalance)} />
              </View>
              <View style={[pdfReportTable.tdNum, { width: W.credit }]}>
                <PdfReportMoney amount={Number(l.credit)} color={PDF.danger} />
              </View>
              <View style={[pdfReportTable.tdNum, { width: W.debit }]}>
                <PdfReportMoney amount={Number(l.debit)} color={PDF.success} />
              </View>
              <View style={{ width: W.desc, ...pdfReportTable.tdAr }}>
                <Text style={pdfReportTable.tdAr}>{ar(l.description ?? '—')}</Text>
                {l.journal_reference ? (
                  <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right' }}>
                    {ar(l.journal_reference)}
                  </Text>
                ) : null}
              </View>
              <View style={{ width: W.meta, alignItems: 'center' }}>
                <Text style={{ fontSize: 8, color: PDF.text, textAlign: 'center' }}>
                  {l.entry_date}
                </Text>
                <Text style={{ fontSize: 7.5, color: PDF.muted, textAlign: 'center' }}>
                  #{l.journal_number}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={pdfReportTable.totalBar} wrap={false}>
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('دائن')}</Text>
            <PdfReportMoney amount={totalCredit} bold />
          </View>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('مدين')}</Text>
            <PdfReportMoney amount={totalDebit} bold />
          </View>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('ختامي')}</Text>
            <PdfReportMoney amount={closingBalance} bold />
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>{ar('إجمالي دفتر الأستاذ')}</Text>
      </View>

      <PdfReportCaption />
    </ReportShell>
  );
}
