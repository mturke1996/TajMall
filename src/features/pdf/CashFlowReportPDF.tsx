// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { pdfFmtNum } from './pdfBrandKit';

const W = { amount: '24%', label: '76%' };

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

export type CashFlowReportPdfProps = {
  year: number;
  data: {
    operating: Array<{ description: string; amount: number; isPositive: boolean }>;
    investing: Array<{ description: string; amount: number; isPositive: boolean }>;
    financing: Array<{ description: string; amount: number; isPositive: boolean }>;
    summary: {
      openingBalance: number;
      closingBalance: number;
      netOperating: number;
      netInvesting: number;
      netFinancing: number;
      netChange: number;
    };
  };
  documentTitle?: string;
};

function FlowSection({
  title,
  items,
  net,
  bandGap,
  closing,
}: {
  title: string;
  items: Array<{ description: string; amount: number; isPositive: boolean }>;
  net: number;
  /** top margin of the band when the section follows another table */
  bandGap?: number;
  /** passed to the last section only: the closing bar, kept together with this section's tail */
  closing?: React.ReactNode;
}) {
  const renderRow = (item, idx, keepWithTotal) => (
    <View
      key={idx}
      style={[pdfReportTable.tableRow, idx % 2 === 1 ? pdfReportTable.rowAlt : {}]}
      wrap={false}
      minPresenceAhead={keepWithTotal && idx === items.length - 1 ? KEEP_LAST_ROW_WITH_TOTAL : 0}
    >
      <View style={[pdfReportTable.tdNum, { width: W.amount }]}>
        <PdfReportMoney
          amount={item.amount}
          color={item.isPositive ? PDF.success : PDF.danger}
        />
      </View>
      <Text style={[pdfReportTable.tdAr, { width: W.label }]}>
        {ar(item.description)}
      </Text>
    </View>
  );

  const emptyBox = (
    <View style={{ padding: 14, alignItems: 'center' }} wrap={false}>
      <Text style={pdfReportTable.tdMuted}>{ar('لا توجد بنود')}</Text>
    </View>
  );

  const totalRow = (
    <View style={[pdfReportTable.tableRow, { backgroundColor: PDF.logoGreenSoft }]} wrap={false}>
      <View style={[pdfReportTable.tdNum, { width: W.amount }]}>
        <PdfReportMoney
          amount={net}
          color={net >= 0 ? PDF.success : PDF.danger}
          bold
        />
      </View>
      <Text style={[pdfReportTable.tdAr, { width: W.label, fontWeight: 'bold' }]}>
        {ar(`صافي ${title}`)}
      </Text>
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
          {items.length === 0 ? emptyBox : items.map((item, idx) => renderRow(item, idx, true))}
          {totalRow}
        </View>
      </>
    );
  }

  // last section: [rows before the tail] + [last rows, total, closing bar] as one block
  const tailFrom = Math.max(items.length - TAIL_ROWS, 0);
  return (
    <>
      {renderBand(tailFrom > 0 ? KEEP_BAND_WITH_TABLE : KEEP_WHOLE_BLOCK)}
      {tailFrom > 0 ? (
        <View style={[pdfReportTable.tableWrap, FRAME_OPEN_BOTTOM]}>
          {items.slice(0, tailFrom).map((item, idx) => renderRow(item, idx, false))}
        </View>
      ) : null}
      <View wrap={false}>
        <View style={[pdfReportTable.tableWrap, tailFrom > 0 ? FRAME_OPEN_TOP : {}]}>
          {items.length === 0
            ? emptyBox
            : items.slice(tailFrom).map((item, idx) => renderRow(item, tailFrom + idx, false))}
          {totalRow}
        </View>
        <View style={{ marginTop: 8 }}>{closing}</View>
      </View>
    </>
  );
}

export function CashFlowReportPDF({ year, data, documentTitle }: CashFlowReportPdfProps) {
  const s = data.summary || {
    openingBalance: 0,
    closingBalance: 0,
    netOperating: 0,
    netInvesting: 0,
    netFinancing: 0,
    netChange: 0,
  };
  const periodLabel = `السنة المالية ${year}`;

  const closing = (
    <>
      <View style={pdfReportTable.totalBar} wrap={false}>
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('ختامي')}</Text>
            {/* light: dark digits on the dark bar were unreadable */}
            <PdfReportMoney amount={s.closingBalance} bold light />
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>{ar('النقد — نهاية الفترة')}</Text>
      </View>

      <PdfReportCaption />
    </>
  );

  return (
    <ReportShell
      title="قائمة التدفقات النقدية"
      subtitle={periodLabel}
      documentTitle={documentTitle}
      periodSummary={{
        eyebrow: 'Cash Flow',
        title: periodLabel,
        subtitle: `صافي التغير: ${s.netChange > 0 ? '+' : s.netChange < 0 ? '−' : ''}${pdfFmtNum(Math.abs(s.netChange))} د.ل`,
        hint: 'مصادر واستخدامات النقد',
      }}
      metaCells={[
        { label: 'رصيد افتتاحي', moneyAmount: s.openingBalance, adaptiveMoney: true },
        { label: 'رصيد ختامي', moneyAmount: s.closingBalance, adaptiveMoney: true },
      ]}
    >
      <View style={pdfReportTable.hero} wrap={false}>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('افتتاحي')}</Text>
          <PdfReportMoney amount={s.openingBalance} bold />
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('صافي التغير')}</Text>
          <PdfReportMoney amount={s.netChange} bold />
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('ختامي')}</Text>
          <PdfReportMoney amount={s.closingBalance} bold />
        </View>
      </View>

      <FlowSection title="الأنشطة التشغيلية" items={data.operating} net={s.netOperating} />
      <FlowSection
        title="الأنشطة الاستثمارية"
        items={data.investing}
        net={s.netInvesting}
        bandGap={GAP_AFTER_TABLE}
      />
      <FlowSection
        title="الأنشطة التمويلية"
        items={data.financing}
        net={s.netFinancing}
        bandGap={GAP_AFTER_TABLE}
        closing={closing}
      />
    </ReportShell>
  );
}
