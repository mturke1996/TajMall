// @ts-nocheck
/**
 * تقرير تجميع أطراف (عملاء / موردين / موظفين) — PDF موحّد عبر ReportShell.
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum } from './pdfBrandKit';
import { PDF_TABLE_ROW } from './pdfTable';
import type { PartyAggRow } from '@/lib/party-contacts';

const col = StyleSheet.create({
  head: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.headerBg,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  row: {
    ...PDF_TABLE_ROW,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
    alignItems: 'center',
  },
  rowAlt: { backgroundColor: PDF.rowAlt },
  th: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold', textAlign: 'center' },
  thAr: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold', textAlign: 'right' },
  td: { fontSize: 8.5, color: PDF.text, textAlign: 'right' },
  tdMuted: { fontSize: 8, color: PDF.muted, textAlign: 'center' },
  name: { width: '34%', paddingLeft: 4 },
  phone: { width: '18%' },
  cats: { width: '22%' },
  count: { width: '10%' },
  amt: { width: '16%' },
  foot: {
    ...PDF_TABLE_ROW,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
    alignItems: 'center',
  },
  footLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
  },
});

/**
 * Page-break rules (the table itself is unchanged; rows already never split):
 * - the section title and the column header never sit alone at the foot of a page;
 * - the last row travels with the totals row and the caption, so the totals row is never
 *   alone at the top of a new page.
 */
const KEEP_TITLE_WITH_TABLE = 90;
const KEEP_LAST_ROW_WITH_TOTALS = 100;

export type PartyTotalsReportPdfProps = {
  titleAr: string;
  subtitleAr?: string;
  partyLabelAr: string;
  amountLabelAr: string;
  periodLabelAr: string;
  rows: PartyAggRow[];
  tone?: 'revenue' | 'expense';
};

export function PartyTotalsReportPDF({
  titleAr,
  subtitleAr,
  partyLabelAr,
  amountLabelAr,
  periodLabelAr,
  rows,
  tone = 'expense',
}: PartyTotalsReportPdfProps) {
  const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const txCount = rows.reduce((s, r) => s + Number(r.txCount || 0), 0);

  return (
    <ReportShell
      title={titleAr}
      subtitle={subtitleAr ?? periodLabelAr}
      documentTitle={`${titleAr} — ${periodLabelAr}`}
      periodSummary={{
        eyebrow: tone === 'revenue' ? 'Customer revenue' : 'Party spend',
        title: periodLabelAr,
        subtitle: `${rows.length} ${partyLabelAr}`,
        hint: `${pdfFmtNum(txCount)} معاملة مرتبطة`,
        badge: tone === 'revenue' ? 'إيراد' : 'إنفاق',
      }}
      metaCells={[
        { label: `عدد ${partyLabelAr}`, value: pdfFmtNum(rows.length) },
        { label: 'عدد المعاملات', value: pdfFmtNum(txCount) },
        { label: amountLabelAr, moneyAmount: total, adaptiveMoney: true },
      ]}
    >
      <Text style={pdfBase.sectionTitle} minPresenceAhead={KEEP_TITLE_WITH_TABLE}>
        {ar(`تفاصيل ${partyLabelAr}`)}
      </Text>

      {rows.length === 0 ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ fontSize: 9, color: PDF.muted, textAlign: 'center' }}>
            {ar('لا توجد حركات مربوطة بجهات في هذه الفترة')}
          </Text>
        </View>
      ) : (
        <>
          <View style={col.head} wrap={false}>
            <Text style={[col.thAr, col.name]}>{ar(partyLabelAr)}</Text>
            <Text style={[col.th, col.phone]}>{ar('الهاتف')}</Text>
            <Text style={[col.thAr, col.cats]}>{ar('أهم البنود')}</Text>
            <Text style={[col.th, col.count]}>{ar('عدد')}</Text>
            <Text style={[col.th, col.amt]}>{ar(amountLabelAr)}</Text>
          </View>

          {rows.map((row, i) => (
            <View
              key={row.contactId}
              style={[col.row, i % 2 === 1 ? col.rowAlt : {}]}
              wrap={false}
              minPresenceAhead={i === rows.length - 1 ? KEEP_LAST_ROW_WITH_TOTALS : 0}
            >
              <Text style={[col.td, col.name]}>{ar(row.contactName)}</Text>
              <Text style={[col.tdMuted, col.phone]}>{row.phone || '—'}</Text>
              <Text style={[col.td, col.cats]}>
                {ar(
                  row.byCategory
                    .slice(0, 2)
                    .map((c) => c.nameAr)
                    .join(' · ') || '—',
                )}
              </Text>
              <Text style={[col.tdMuted, col.count]}>{pdfFmtNum(row.txCount)}</Text>
              <View style={col.amt}>
                <PdfMoneyText amount={Number(row.total)} />
              </View>
            </View>
          ))}

          <View style={col.foot} wrap={false}>
            <Text style={[col.footLabel, col.name]}>{ar('الإجمالي')}</Text>
            <Text style={col.phone} />
            <Text style={col.cats} />
            <Text style={[col.tdMuted, col.count]}>{pdfFmtNum(txCount)}</Text>
            <View style={col.amt}>
              <PdfMoneyText
                amount={total}
                style={{ fontSize: 11, fontWeight: 'bold' }}
              />
            </View>
          </View>
        </>
      )}

      <Text style={pdfBase.caption}>
        {ar('وثيقة مُولَّدة آلياً من منظومة تاج مول — تجميع حسب الجهة المرتبطة')}
      </Text>
    </ReportShell>
  );
}
