// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arDateMedium } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PDF_TABLE_ROW } from './pdfTable';
import { PdfMoneyText } from './pdfBrandKit';

export type JournalEntryPdfModel = {
  id: string;
  number: number;
  reference: string | null;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  entry_date: string;
  description: string | null;
  lines: Array<{
    category_name: string;
    category_code: string;
    debit: number;
    credit: number;
    description: string | null;
  }>;
  total_debit: number;
  total_credit: number;
};

/**
 * أعمدة الجدول (يسار ← يمين فيزيائياً):
 * دائن | مدين | بيان | حساب
 * → الحساب على يمين الورقة
 */
const s = StyleSheet.create({
  indexTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 6,
    color: PDF.text,
  },
  indexRow: {
    ...PDF_TABLE_ROW,
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderBottomWidth: 0.4,
    borderBottomColor: PDF.border,
  },
  indexNum: {
    fontSize: 8,
    fontWeight: 'bold',
    width: 56,
    textAlign: 'right',
  },
  indexDate: {
    fontSize: 8,
    color: PDF.muted,
    width: 72,
    // «26 يوليو 2026»: without an explicit rtl the day, year and month come out jumbled
    direction: 'rtl',
    textAlign: 'left',
  },
  indexDesc: {
    flex: 1,
    fontSize: 8,
    textAlign: 'right',
    paddingHorizontal: 6,
    color: PDF.text,
  },
  indexAmount: {
    width: 88,
    alignItems: 'flex-end',
  },
  sectionGap: {
    marginBottom: 14,
  },
  entry: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  entryHeader: {
    ...PDF_TABLE_ROW,
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: PDF.logoGreenSoft,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
    borderRightWidth: 3,
    borderRightColor: PDF.logoGreen,
  },
  entryMeta: {
    ...PDF_TABLE_ROW,
    gap: 8,
  },
  entryNumber: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  entryDate: {
    fontSize: 9,
    color: PDF.muted,
    direction: 'rtl',
    textAlign: 'left',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 8,
  },
  statusPosted: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusDraft: {
    backgroundColor: '#fef9c3',
    color: '#854d0e',
  },
  statusReversed: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  description: {
    fontSize: 9,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
    color: PDF.text,
    textAlign: 'right',
  },
  reference: {
    fontSize: 8,
    paddingHorizontal: 12,
    paddingBottom: 6,
    color: PDF.muted,
    direction: 'rtl',
    textAlign: 'right',
  },
  tableHead: {
    ...PDF_TABLE_ROW,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: PDF.headerBg,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  tableRow: {
    ...PDF_TABLE_ROW,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
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
    fontSize: 9,
    color: PDF.text,
  },
  colCredit: { width: 88, textAlign: 'center' },
  colDebit: { width: 88, textAlign: 'center' },
  colDesc: { flex: 1.4, textAlign: 'right', paddingHorizontal: 6 },
  colCategory: { flex: 2, textAlign: 'right' },
  totalRow: {
    ...PDF_TABLE_ROW,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1.5,
    borderTopColor: PDF.border,
  },
  totalHint: {
    fontSize: 7,
    color: PDF.muted,
    textAlign: 'center',
    marginBottom: 2,
  },
  totalValue: {
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  totalLabel: {
    flex: 3.4,
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'right',
    paddingHorizontal: 6,
  },
  grandBox: {
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: PDF.logoGreen,
    borderRadius: 4,
    overflow: 'hidden',
  },
  caption: {
    fontSize: 8.5,
    color: PDF.muted,
    marginTop: 8,
    textAlign: 'center',
  },
});

function nearlyEqual(a: number, b: number, eps = 0.005) {
  return Math.abs(a - b) <= eps;
}

/** an entry with up to this many lines is kept whole on one page; a longer one may break, but only between lines */
const WHOLE_ENTRY_MAX_LINES = 3;
/** room the closing block needs after the last entry (book total + caption; the caption alone for a single entry), so it is never left alone on a page */
const CLOSING_BLOCK_HEIGHT = 90;
const CLOSING_CAPTION_HEIGHT = 24;
const ENTRY_OPEN_BOTTOM = {
  borderBottomWidth: 0,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  marginBottom: 0,
};
const ENTRY_OPEN_TOP = {
  borderTopWidth: 0,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
};

export function JournalPDF({
  entries,
  periodLabel,
  title = 'دفتر اليومية',
  titleEn = 'General Journal',
  showIndex = true,
  statusFilterLabel,
}: {
  entries: JournalEntryPdfModel[];
  periodLabel: string;
  title?: string;
  titleEn?: string;
  /** فهرس القيود في الصفحة الأولى */
  showIndex?: boolean;
  statusFilterLabel?: string;
}) {
  const statusConfig = {
    POSTED: { label: 'مرحل', style: s.statusPosted },
    DRAFT: { label: 'مسودة', style: s.statusDraft },
    REVERSED: { label: 'معكوس', style: s.statusReversed },
  };

  // drafts and reversed entries are listed with their status but are not in the books' totals
  const countedEntries = entries.filter((e) => e.status === 'POSTED');
  const grandDebit = countedEntries.reduce((sum, e) => sum + e.total_debit, 0);
  const grandCredit = countedEntries.reduce((sum, e) => sum + e.total_credit, 0);
  const lineCount = entries.reduce((sum, e) => sum + e.lines.length, 0);
  const bookBalanced = nearlyEqual(grandDebit, grandCredit);
  const unbalancedCount = entries.filter(
    (e) => !nearlyEqual(e.total_debit, e.total_credit),
  ).length;

  // a single entry already ends with its own total row, which is the book total: no second box for it
  const showBookTotal = entries.length > 1;
  const closingHeight = showBookTotal ? CLOSING_BLOCK_HEIGHT : CLOSING_CAPTION_HEIGHT;

  const renderIndexRow = (entry: JournalEntryPdfModel) => (
    <View key={`idx-${entry.id}`} style={s.indexRow} wrap={false}>
      <View style={s.indexAmount}>
        <PdfMoneyText amount={entry.total_debit} style={{ fontSize: 8, textAlign: 'left' }} />
      </View>
      <Text style={s.indexDesc}>{ar(entry.description || entry.reference || '—')}</Text>
      <Text style={s.indexDate}>{arDateMedium(entry.entry_date)}</Text>
      <Text style={s.indexNum}>{ar(`#${entry.number}`)}</Text>
    </View>
  );

  const caption = (
    <Text style={s.caption}>
      {ar(
        'دفتر يومية محاسبي مزدوج القيد: كل عملية تظهر بمدين ودائن متساويين. المستند صادر من منظومة تاج مول.',
      )}
    </Text>
  );

  return (
    <ReportShell
      title={title}
      subtitle={periodLabel}
      metaCells={[
        { label: 'عدد القيود', value: String(entries.length) },
        { label: 'عدد البنود', value: String(lineCount) },
        {
          label: countedEntries.length < entries.length ? 'إجمالي المدين (المرحّل)' : 'إجمالي المدين',
          moneyAmount: grandDebit,
          adaptiveMoney: true,
        },
        {
          label: countedEntries.length < entries.length ? 'إجمالي الدائن (المرحّل)' : 'إجمالي الدائن',
          moneyAmount: grandCredit,
          adaptiveMoney: true,
        },
        ...(statusFilterLabel
          ? [{ label: 'الحالة', value: statusFilterLabel }]
          : []),
        {
          label: 'التوازن',
          value: bookBalanced
            ? 'متوازن'
            : unbalancedCount > 0
              ? `${unbalancedCount} قيد غير متوازن`
              : 'فرق بسيط',
        },
      ]}
      periodSummary={{
        eyebrow: titleEn,
        title: periodLabel,
        subtitle: `${entries.length} قيد`,
        hint: bookBalanced
          ? 'المدين = الدائن — الدفتر متوازن محاسبياً'
          : 'تنبيه: إجمالي المدين لا يساوي إجمالي الدائن',
        badge: bookBalanced ? 'متوازن' : 'مراجعة',
      }}
      titleEn={titleEn}
    >
      {entries.length === 0 ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={pdfBase.tdMuted}>{ar('لا توجد قيود للعرض في هذه الفترة')}</Text>
        </View>
      ) : (
        <>
          {showIndex && entries.length > 1 ? (
            <View style={s.sectionGap}>
              {/* the title travels with the first rows: never a lone heading at the foot of a page */}
              <View wrap={false}>
                <Text style={s.indexTitle}>{ar('فهرس القيود')}</Text>
                {entries.slice(0, 2).map(renderIndexRow)}
              </View>
              {entries.slice(2).map(renderIndexRow)}
            </View>
          ) : null}

          {entries.map((entry, entryIdx) => {
            const status = statusConfig[entry.status];
            const isBalanced = nearlyEqual(entry.total_debit, entry.total_credit);
            const n = entry.lines.length;
            const whole = n <= WHOLE_ENTRY_MAX_LINES;
            const isLast = entryIdx === entries.length - 1;

            const head = (
              <>
                <View style={s.entryHeader}>
                  <Text style={s.entryDate}>{arDateMedium(entry.entry_date)}</Text>
                  <View style={s.entryMeta}>
                    {!isBalanced && (
                      <Text style={[s.statusBadge, s.statusReversed]}>
                        {ar('غير متوازن')}
                      </Text>
                    )}
                    <Text style={[s.statusBadge, status.style]}>
                      {ar(status.label)}
                    </Text>
                    <Text style={s.entryNumber}>{ar(`قيد رقم ${entry.number}`)}</Text>
                  </View>
                </View>

                {entry.description ? (
                  <Text style={s.description}>{ar(entry.description)}</Text>
                ) : null}

                {entry.reference ? (
                  <Text style={s.reference}>{ar(`المرجع: ${entry.reference}`)}</Text>
                ) : null}

                <View style={s.tableHead} wrap={false}>
                  <Text style={[s.th, s.colCredit]}>{ar('دائن')}</Text>
                  <Text style={[s.th, s.colDebit]}>{ar('مدين')}</Text>
                  <Text style={[s.thAr, s.colDesc]}>{ar('البيان')}</Text>
                  <Text style={[s.thAr, s.colCategory]}>{ar('الحساب')}</Text>
                </View>
              </>
            );

            const totalRow = (
              <View
                style={[
                  s.totalRow,
                  isBalanced
                    ? { backgroundColor: '#ecfdf5' }
                    : { backgroundColor: '#fef2f2' },
                ]}
                wrap={false}
              >
                <View style={s.colCredit}>
                  <Text style={s.totalHint}>{ar('دائن')}</Text>
                  <PdfMoneyText
                    amount={entry.total_credit}
                    style={[s.totalValue, { color: PDF.danger }]}
                  />
                </View>
                <View style={s.colDebit}>
                  <Text style={s.totalHint}>{ar('مدين')}</Text>
                  <PdfMoneyText
                    amount={entry.total_debit}
                    style={[s.totalValue, { color: PDF.success }]}
                  />
                </View>
                <Text style={s.totalLabel}>
                  {ar(isBalanced ? 'الإجمالي (متوازن)' : 'الإجمالي (غير متوازن)')}
                </Text>
              </View>
            );

            const rows = entry.lines.map((line, i) => (
              <View
                key={i}
                style={[
                  s.tableRow,
                  i % 2 !== 0 ? { backgroundColor: '#fafafa' } : {},
                ]}
                wrap={false}
              >
                <View style={s.colCredit}>
                  {line.credit ? (
                    <PdfMoneyText amount={line.credit} style={s.td} />
                  ) : (
                    <Text style={[s.td, { color: PDF.muted, textAlign: 'center' }]}>
                      {ar('—')}
                    </Text>
                  )}
                </View>
                <View style={s.colDebit}>
                  {line.debit ? (
                    <PdfMoneyText amount={line.debit} style={s.td} />
                  ) : (
                    <Text style={[s.td, { color: PDF.muted, textAlign: 'center' }]}>
                      {ar('—')}
                    </Text>
                  )}
                </View>
                <Text style={[s.td, s.colDesc, { color: PDF.muted, fontSize: 8 }]}>
                  {ar(line.description || '—')}
                </Text>
                <View style={s.colCategory}>
                  <Text style={[s.td, { textAlign: 'right' }]}>
                    {ar(line.category_name)}
                  </Text>
                  {line.category_code ? (
                    <Text
                      style={[s.td, { fontSize: 7, color: PDF.muted, textAlign: 'right' }]}
                    >
                      {ar(line.category_code)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ));

            if (whole) {
              return (
                <View
                  key={entry.id}
                  style={s.entry}
                  wrap={false}
                  // the last entry keeps the book total (and caption) with it
                  {...(isLast ? { minPresenceAhead: closingHeight } : {})}
                >
                  {head}
                  {rows}
                  {totalRow}
                </View>
              );
            }

            // a long entry may break between lines, never right after its header or right before its total
            if (!isLast) {
              return (
                <View key={entry.id} style={s.entry}>
                  <View wrap={false}>
                    {head}
                    {rows[0]}
                  </View>
                  {rows.slice(1, -1)}
                  <View wrap={false}>
                    {rows[n - 1]}
                    {totalRow}
                  </View>
                </View>
              );
            }

            // the last long entry is drawn as one card in two seamless halves: its closing lines can then
            // travel to the next page with the book total, even when the entry itself would fit on this page
            return (
              <React.Fragment key={entry.id}>
                <View style={[s.entry, ENTRY_OPEN_BOTTOM]}>
                  <View wrap={false}>
                    {head}
                    {rows[0]}
                  </View>
                  {rows.slice(1, -1)}
                </View>
                <View
                  style={[s.entry, ENTRY_OPEN_TOP]}
                  wrap={false}
                  minPresenceAhead={closingHeight}
                >
                  {rows[n - 1]}
                  {totalRow}
                </View>
              </React.Fragment>
            );
          })}

          <View wrap={false}>
            {showBookTotal ? (
              <View style={s.grandBox}>
                <View
                  style={[
                    s.totalRow,
                    bookBalanced
                      ? { backgroundColor: '#ecfdf5' }
                      : { backgroundColor: '#fef2f2' },
                  ]}
                >
                  <View style={s.colCredit}>
                    <Text style={s.totalHint}>{ar('دائن')}</Text>
                    <PdfMoneyText
                      amount={grandCredit}
                      style={[s.totalValue, { color: PDF.danger }]}
                    />
                  </View>
                  <View style={s.colDebit}>
                    <Text style={s.totalHint}>{ar('مدين')}</Text>
                    <PdfMoneyText
                      amount={grandDebit}
                      style={[s.totalValue, { color: PDF.success }]}
                    />
                  </View>
                  <Text style={s.totalLabel}>
                    {ar(
                      bookBalanced
                        ? 'إجمالي دفتر الفترة (متوازن)'
                        : 'إجمالي دفتر الفترة (غير متوازن)',
                    )}
                  </Text>
                </View>
              </View>
            ) : null}
            {caption}
          </View>
        </>
      )}

      {entries.length === 0 ? caption : null}
    </ReportShell>
  );
}
