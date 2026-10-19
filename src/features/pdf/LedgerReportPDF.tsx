// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { accountTypeLabelAr } from '@/lib/accounting-labels';
import { arabicCount } from '@/lib/utils';

const W = {
  balance: '15%',
  credit: '13%',
  debit: '13%',
  desc: '41%',
  meta: '18%',
};

/** room needed after the table for the caption (the table's own bottom margin is counted separately) */
const CLOSING_AFTER_TABLE = 24;
/**
 * The table is drawn as one card in two seamless halves: the last rows and the totals row sit in the second half,
 * so they can travel to the next page together (never a lone caption or totals row). One row only: the column head is repeated on every continuation page of the first half, and the second half rarely stands alone.
 */
const TAIL_ROWS = 1;
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

export type LedgerReportPdfProps = {
  category: { name_ar: string; code: string; type: string };
  startDate?: string;
  endDate?: string;
  openingBalance?: number;
  closingBalance?: number;
  totalDebit: number;
  totalCredit: number;
  /** oldest first, each with the balance after it (as on screen) */
  lines: Array<{
    entry_date: string;
    journal_number: number;
    journal_reference: string | null;
    description: string | null;
    debit: number;
    credit: number;
    runningBalance?: number;
  }>;
  documentTitle?: string;
};

/** Same figures as the ledger screen: opening balance, each line with the balance after it, closing balance. */
export function LedgerReportPDF({
  category,
  startDate,
  endDate,
  openingBalance = 0,
  closingBalance,
  totalDebit,
  totalCredit,
  lines,
  documentTitle,
}: LedgerReportPdfProps) {
  const periodLabel =
    startDate || endDate ? `${startDate ?? '…'} — ${endDate ?? '…'}` : 'كل الفترات';
  const closing = closingBalance ?? lines[lines.length - 1]?.runningBalance ?? openingBalance;
  const count = arabicCount(lines.length, ['حركة واحدة', 'حركتان', 'حركات', 'حركة']);

  const renderLine = (l: LedgerReportPdfProps['lines'][number], i: number) => (
    <View
      key={`${l.journal_number}-${i}`}
      style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]}
      wrap={false}
    >
      <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
        <PdfReportMoney amount={Number(l.runningBalance) || 0} showZero />
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
          <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right' }}>{ar(l.journal_reference)}</Text>
        ) : null}
      </View>
      <View style={{ width: W.meta, alignItems: 'center' }}>
        <Text style={{ fontSize: 8, color: PDF.text, textAlign: 'center' }}>{l.entry_date}</Text>
        <Text style={{ fontSize: 7.5, color: PDF.muted, textAlign: 'center' }}>#{l.journal_number}</Text>
      </View>
    </View>
  );

  const totalsRow = (
    <View style={pdfReportTable.totalsRow} wrap={false}>
      <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
        <PdfReportMoney amount={closing} bold showZero />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.credit }]}>
        <PdfReportMoney amount={Number(totalCredit) || 0} bold showZero />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.debit }]}>
        <PdfReportMoney amount={Number(totalDebit) || 0} bold showZero />
      </View>
      <View style={{ width: W.desc }}>
        <Text style={pdfReportTable.totalsRowLabel}>{ar(`المجموع والرصيد الختامي (${count})`)}</Text>
      </View>
      <View style={{ width: W.meta }} />
    </View>
  );

  const split = lines.length > TAIL_ROWS;
  const topLines = split ? lines.slice(0, lines.length - TAIL_ROWS) : lines;
  const tailLines = split ? lines.slice(lines.length - TAIL_ROWS) : [];

  return (
    <ReportShell
      title={`دفتر الأستاذ — ${category.name_ar}`}
      subtitle={`${category.code} · ${periodLabel}`}
      documentTitle={documentTitle}
      periodSummary={{
        eyebrow: 'General Ledger',
        title: category.name_ar,
        subtitle: `${count} · ${category.code}`,
        hint: periodLabel,
      }}
      metaCells={[
        { label: 'الرصيد الافتتاحي', moneyAmount: openingBalance, adaptiveMoney: true },
        { label: 'إجمالي المدين', moneyAmount: Number(totalDebit) || 0, adaptiveMoney: true },
        { label: 'إجمالي الدائن', moneyAmount: Number(totalCredit) || 0, adaptiveMoney: true },
        { label: 'الرصيد الختامي', moneyAmount: closing, adaptiveMoney: true },
      ]}
    >
      <View style={pdfReportTable.hero} wrap={false}>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('نوع الحساب')}</Text>
          <Text style={pdfReportTable.heroValue}>{ar(accountTypeLabelAr(category.type))}</Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('الفترة')}</Text>
          <Text style={pdfReportTable.heroValue}>{ar(periodLabel)}</Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('الحركات')}</Text>
          <Text style={pdfReportTable.heroValue}>{ar(count)}</Text>
        </View>
      </View>

      <View style={[pdfReportTable.tableWrap, split ? CARD_OPEN_BOTTOM : null]}>
        <View style={pdfReportTable.tableHead} wrap={false} fixed>
          <Text style={[pdfReportTable.th, { width: W.balance }]}>{ar('الرصيد')}</Text>
          <Text style={[pdfReportTable.th, { width: W.credit }]}>{ar('دائن')}</Text>
          <Text style={[pdfReportTable.th, { width: W.debit }]}>{ar('مدين')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.desc }]}>{ar('البيان')}</Text>
          <Text style={[pdfReportTable.th, { width: W.meta }]}>{ar('تاريخ / قيد')}</Text>
        </View>

        <View style={[pdfReportTable.tableRow, pdfReportTable.rowAlt]} wrap={false}>
          <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
            <PdfReportMoney amount={openingBalance} bold showZero />
          </View>
          <View style={{ width: W.credit }} />
          <View style={{ width: W.debit }} />
          <View style={{ width: W.desc }}>
            <Text style={[pdfReportTable.tdAr, { fontWeight: 'bold' }]}>{ar('الرصيد الافتتاحي')}</Text>
          </View>
          <View style={{ width: W.meta }} />
        </View>

        {lines.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={pdfReportTable.tdMuted}>{ar('لا توجد حركات مرحّلة في الفترة')}</Text>
          </View>
        ) : (
          topLines.map((l, i) => renderLine(l, i))
        )}
        {split ? null : totalsRow}
      </View>

      {/* the last rows and the totals row: one unit, kept with the caption that follows */}
      {split ? (
        <View
          style={[pdfReportTable.tableWrap, CARD_OPEN_TOP]}
          wrap={false}
          minPresenceAhead={CLOSING_AFTER_TABLE}
        >
          {tailLines.map((l, k) => renderLine(l, topLines.length + k))}
          {totalsRow}
        </View>
      ) : null}

      <PdfReportCaption />
    </ReportShell>
  );
}
