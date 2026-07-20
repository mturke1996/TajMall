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
  coverStrip: {
    ...PDF_TABLE_ROW,
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: PDF.logoGreenSoft,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRightWidth: 4,
    borderRightColor: PDF.logoGreen,
    borderRadius: 4,
  },
  coverStat: {
    alignItems: 'center',
    minWidth: 70,
  },
  coverStatLabel: {
    fontSize: 7,
    color: PDF.muted,
    marginBottom: 2,
    textAlign: 'center',
  },
  coverStatValue: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    color: PDF.text,
  },
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

  const grandDebit = entries.reduce((sum, e) => sum + e.total_debit, 0);
  const grandCredit = entries.reduce((sum, e) => sum + e.total_credit, 0);
  const lineCount = entries.reduce((sum, e) => sum + e.lines.length, 0);
  const bookBalanced = nearlyEqual(grandDebit, grandCredit);
  const unbalancedCount = entries.filter(
    (e) => !nearlyEqual(e.total_debit, e.total_credit),
  ).length;

  return (
    <ReportShell
      title={title}
      subtitle={periodLabel}
      metaCells={[
        { label: 'الفترة', value: periodLabel },
        { label: 'عدد القيود', value: String(entries.length) },
        { label: 'عدد البنود', value: String(lineCount) },
        {
          label: 'إجمالي المدين',
          moneyAmount: grandDebit,
          adaptiveMoney: true,
        },
        {
          label: 'إجمالي الدائن',
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
        subtitle: `${entries.length} قيد · ${lineCount} بند`,
        hint: bookBalanced
          ? 'المدين = الدائن — الدفتر متوازن محاسبياً'
          : 'تنبيه: إجمالي المدين لا يساوي إجمالي الدائن',
        badge: bookBalanced ? 'متوازن' : 'مراجعة',
      }}
      headerProps={{
        titleEn,
        subtitleAr: title,
        refLine: `JY-${periodLabel.replace(/\s+/g, '-')}`,
      }}
    >
      {entries.length === 0 ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={pdfBase.tdMuted}>{ar('لا توجد قيود للعرض في هذه الفترة')}</Text>
        </View>
      ) : (
        <>
          <View style={s.coverStrip} wrap={false}>
            <View style={s.coverStat}>
              <Text style={s.coverStatLabel}>{ar('القيود')}</Text>
              <Text style={s.coverStatValue}>{ar(String(entries.length))}</Text>
            </View>
            <View style={s.coverStat}>
              <Text style={s.coverStatLabel}>{ar('البنود')}</Text>
              <Text style={s.coverStatValue}>{ar(String(lineCount))}</Text>
            </View>
            <View style={s.coverStat}>
              <Text style={s.coverStatLabel}>{ar('مدين')}</Text>
              <PdfMoneyText amount={grandDebit} style={s.coverStatValue} />
            </View>
            <View style={s.coverStat}>
              <Text style={s.coverStatLabel}>{ar('دائن')}</Text>
              <PdfMoneyText amount={grandCredit} style={s.coverStatValue} />
            </View>
          </View>

          {showIndex && entries.length > 1 ? (
            <View style={s.sectionGap}>
              <Text style={s.indexTitle}>{ar('فهرس القيود')}</Text>
              {entries.map((entry) => (
                <View key={`idx-${entry.id}`} style={s.indexRow} wrap={false}>
                  <View style={s.indexAmount}>
                    <PdfMoneyText
                      amount={entry.total_debit}
                      style={{ fontSize: 8, textAlign: 'left' }}
                    />
                  </View>
                  <Text style={s.indexDesc}>
                    {ar(entry.description || entry.reference || '—')}
                  </Text>
                  <Text style={s.indexDate}>{arDateMedium(entry.entry_date)}</Text>
                  <Text style={s.indexNum}>{ar(`#${entry.number}`)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {entries.map((entry) => {
            const status = statusConfig[entry.status];
            const isBalanced = nearlyEqual(entry.total_debit, entry.total_credit);

            return (
              <View key={entry.id} style={s.entry}>
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

                {entry.lines.map((line, i) => (
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
                        <Text
                          style={[s.td, { color: PDF.muted, textAlign: 'center' }]}
                        >
                          {ar('—')}
                        </Text>
                      )}
                    </View>
                    <View style={s.colDebit}>
                      {line.debit ? (
                        <PdfMoneyText amount={line.debit} style={s.td} />
                      ) : (
                        <Text
                          style={[s.td, { color: PDF.muted, textAlign: 'center' }]}
                        >
                          {ar('—')}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[s.td, s.colDesc, { color: PDF.muted, fontSize: 8 }]}
                    >
                      {ar(line.description || '—')}
                    </Text>
                    <View style={s.colCategory}>
                      <Text style={[s.td, { textAlign: 'right' }]}>
                        {ar(line.category_name)}
                      </Text>
                      {line.category_code ? (
                        <Text
                          style={[
                            s.td,
                            { fontSize: 7, color: PDF.muted, textAlign: 'right' },
                          ]}
                        >
                          {ar(line.category_code)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}

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
              </View>
            );
          })}

          <View style={s.grandBox} wrap={false}>
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
        </>
      )}

      <Text style={s.caption}>
        {ar(
          'دفتر يومية محاسبي مزدوج القيد: كل عملية تظهر بمدين ودائن متساويين. المستند صادر من منظومة تاج مول.',
        )}
      </Text>
    </ReportShell>
  );
}
