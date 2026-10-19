// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { arabicCount } from '@/lib/utils';

const W = { amount: '22%', name: '58%', code: '20%' };

/**
 * Page-break rules (the tables themselves are unchanged):
 * - a row never splits across pages (a split row used to swallow the rows after it);
 * - a section band never sits alone at the foot of a page, away from its table;
 * - the last row travels with the section total;
 * - the last section's final rows, its total and the closing bar are one block, so the
 *   closing bar is never alone on a page (the frame is kept continuous across the cut).
 */
const KEEP_BAND_WITH_TABLE = 80;
/** band of a section whose whole table is one unbreakable block: it stays only if that block fits after it */
const KEEP_WHOLE_BLOCK = 2000;
/**
 * Spacing between two tables is the next band's top margin, never a bottom margin on a table:
 * react-pdf counts a block's bottom margin as part of its "presence", so a long table that ends
 * within its own margin of the page foot is moved whole to the next page (a huge blank area).
 */
const GAP_AFTER_TABLE = 34;
const KEEP_LAST_ROW_WITH_TOTAL = 40;
const TAIL_ROWS = 2;
const FRAME_OPEN_BOTTOM = {
  borderBottomWidth: 0,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  marginBottom: 0,
};
const FRAME_OPEN_TOP = {
  borderTopWidth: 0,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
};

export type ProfitLossReportPdfProps = {
  year: number;
  periodText: string;
  revenues: Array<{ name_ar: string; code: string; amount: number }>;
  expenses: Array<{ name_ar: string; code: string; amount: number }>;
  documentTitle?: string;
};

function LineSection({
  title,
  rows,
  tone,
  bandGap,
  closing,
}: {
  title: string;
  rows: Array<{ name_ar: string; code: string; amount: number }>;
  tone: 'revenue' | 'expense';
  /** top margin of the band when the section follows another table */
  bandGap?: number;
  /** passed to the last section only: the closing bar, kept together with this section's tail */
  closing?: React.ReactNode;
}) {
  const color = tone === 'revenue' ? PDF.success : PDF.danger;
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const renderRow = (item, idx, keepWithTotal) => (
    <View
      key={item.code}
      style={[pdfReportTable.tableRow, idx % 2 === 1 ? pdfReportTable.rowAlt : {}]}
      wrap={false}
      minPresenceAhead={keepWithTotal && idx === rows.length - 1 ? KEEP_LAST_ROW_WITH_TOTAL : 0}
    >
      <View style={[pdfReportTable.tdNum, { width: W.amount }]}>
        <PdfReportMoney amount={Number(item.amount)} color={color} />
      </View>
      <Text style={[pdfReportTable.tdAr, { width: W.name }]}>{ar(item.name_ar)}</Text>
      <Text style={[pdfReportTable.tdMuted, { width: W.code }]}>{item.code}</Text>
    </View>
  );

  const emptyBox = (
    <View style={{ padding: 16, alignItems: 'center' }} wrap={false}>
      <Text style={pdfReportTable.tdMuted}>{ar('لا توجد بنود')}</Text>
    </View>
  );

  const totalRow = (
    <View style={[pdfReportTable.tableRow, { backgroundColor: PDF.logoGreenSoft }]} wrap={false}>
      <View style={[pdfReportTable.tdNum, { width: W.amount }]}>
        <PdfReportMoney amount={total} color={color} bold />
      </View>
      <Text style={[pdfReportTable.tdAr, { width: W.name, fontWeight: 'bold' }]}>
        {ar(`إجمالي ${title}`)}
      </Text>
      <Text style={{ width: W.code }} />
    </View>
  );

  const renderBand = (keepAhead: number) => (
    <View
      style={[pdfReportTable.sectionBand, bandGap ? { marginTop: bandGap } : {}]}
      minPresenceAhead={keepAhead}
    >
      <Text style={pdfReportTable.sectionBandText}>{ar(title)}</Text>
    </View>
  );

  // band and table are direct children of the page flow (not wrapped in a section View):
  // react-pdf only moves an element that has something before it, so a wrapped band would
  // stay alone at the foot of the page
  if (!closing) {
    return (
      <>
        {renderBand(KEEP_BAND_WITH_TABLE)}
        <View style={[pdfReportTable.tableWrap, { marginBottom: 0 }]}>
          {rows.length === 0 ? emptyBox : rows.map((item, idx) => renderRow(item, idx, true))}
          {totalRow}
        </View>
      </>
    );
  }

  // last section: [rows before the tail] + [last rows, total, closing bar] as one block
  const tailFrom = Math.max(rows.length - TAIL_ROWS, 0);
  return (
    <>
      {renderBand(tailFrom > 0 ? KEEP_BAND_WITH_TABLE : KEEP_WHOLE_BLOCK)}
      {tailFrom > 0 ? (
        <View style={[pdfReportTable.tableWrap, FRAME_OPEN_BOTTOM]}>
          {rows.slice(0, tailFrom).map((item, idx) => renderRow(item, idx, false))}
        </View>
      ) : null}
      <View wrap={false}>
        <View style={[pdfReportTable.tableWrap, tailFrom > 0 ? FRAME_OPEN_TOP : {}]}>
          {rows.length === 0
            ? emptyBox
            : rows.slice(tailFrom).map((item, idx) => renderRow(item, tailFrom + idx, false))}
          {totalRow}
        </View>
        <View style={{ marginTop: 8 }}>{closing}</View>
      </View>
    </>
  );
}

export function ProfitLossReportPDF({
  year,
  periodText,
  revenues,
  expenses,
  documentTitle,
}: ProfitLossReportPdfProps) {
  const totalRevenues = revenues.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
  const netIncome = totalRevenues - totalExpenses;
  const isProfit = netIncome >= 0;

  const closing = (
    <>
      <View
        style={[
          pdfReportTable.totalBar,
          !isProfit ? pdfReportTable.totalBarWarn : {},
        ]}
        wrap={false}
      >
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('صافي')}</Text>
            {/* light: dark digits on the dark bar were unreadable */}
            <PdfReportMoney amount={Math.abs(netIncome)} bold light />
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>
          {ar(isProfit ? 'صافي الربح التشغيلي' : 'صافي الخسارة التشغيلية')}
        </Text>
      </View>

      <PdfReportCaption />
    </>
  );

  return (
    <ReportShell
      title="قائمة الأرباح والخسائر"
      // the period text already names the year ("عام 2026", "الربع 3 من 2026")
      subtitle={periodText.includes(String(year)) ? periodText : `${periodText} · ${year}`}
      documentTitle={documentTitle}
      periodSummary={{
        eyebrow: 'Profit & Loss',
        title: periodText,
        subtitle: arabicCount(revenues.length + expenses.length, ['بند واحد', 'بندان', 'بنود', 'بنداً']),
        hint: isProfit ? 'صافي ربح' : 'صافي خسارة',
        badge: isProfit ? 'ربح' : 'خسارة',
      }}
      metaCells={[
        { label: 'إجمالي الإيرادات', moneyAmount: totalRevenues, adaptiveMoney: true },
        { label: 'إجمالي المصروفات', moneyAmount: totalExpenses, adaptiveMoney: true },
      ]}
    >
      <LineSection title="الإيرادات" rows={revenues} tone="revenue" />
      <LineSection
        title="المصروفات"
        rows={expenses}
        tone="expense"
        bandGap={GAP_AFTER_TABLE}
        closing={closing}
      />
    </ReportShell>
  );
}
