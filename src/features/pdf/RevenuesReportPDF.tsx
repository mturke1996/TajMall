// @ts-nocheck
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportPageFrame } from './ReportPageFrame';
import { ar } from './arabicPDF';
import { PDF, pdfBase, PDF_PAGINATION } from './pdfBase';
import { PDF_TABLE_ROW, PDF_AR_CELL, PDF_NUM_CELL } from './pdfTable';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { TajMallPdfFooter, PdfReportHeaderFlow } from './pdfBrandKit';
import { BRAND } from '@/lib/brand';
import type { TransactionWithRelations } from '@/lib/db/types';
import { arabicCount } from '@/lib/utils';
import { PdfPrintLine, PdfScopeNote, PdfSignatureBlock } from './options/PdfReportExtras';

const W_REV = {
  amount: '16%',
  bank: '18%',
  category: '20%',
  contact: '20%',
  date: '14%',
  number: '12%',
} as const;

const W_CAT_SUMMARY = {
  percent: '15%',
  total: '25%',
  count: '15%',
  code: '15%',
  name: '30%',
} as const;

const W_BANK_SUMMARY = {
  percent: '18%',
  total: '32%',
  count: '18%',
  name: '32%',
} as const;

const s = StyleSheet.create({
  scopeStrip: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    backgroundColor: PDF.mutedBg,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 3,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  scopeItem: {
    direction: 'rtl',
    alignItems: 'flex-start',
  },
  scopeLabel: {
    fontSize: 7,
    color: PDF.muted,
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign: 'right',
  },
  scopeValue: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
  },
  kpiStrip: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: PDF.logoGreenSoft,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRightWidth: 3.5,
    borderRightColor: PDF.logoGreen,
    borderRadius: 3,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  kpiCell: {
    direction: 'rtl',
    flex: 1,
    minWidth: 0,
  },
  kpiLabel: {
    fontSize: 7,
    color: PDF.muted,
    fontWeight: 'bold',
    marginBottom: 3,
    textAlign: 'right',
  },
  kpiValue: {
    fontSize: 10,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
  },
  categoryBand: {
    ...PDF_TABLE_ROW,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: PDF.headerBg,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 3,
    marginTop: 10,
    marginBottom: 8,
  },
  summaryBand: {
    ...PDF_TABLE_ROW,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 3,
    marginTop: 12,
    marginBottom: 8,
  },
  badgeOk: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: '#dcfce7',
  },
  badgeTextOk: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#166534',
    textAlign: 'center',
  },
  emptyBox: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    textAlign: 'center',
    fontSize: 9,
    color: PDF.muted,
    backgroundColor: PDF.rowAlt,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 3,
    marginVertical: 12,
  },
});

export type RevenuesReportPdfProps = {
  titleAr?: string;
  subtitleAr?: string;
  documentTitle?: string;
  periodLabel?: string;
  categoryLabel?: string;
  categoriesLabel?: string;
  rows?: TransactionWithRelations[];
  transactions?: TransactionWithRelations[];
  grandTotal?: number;
  totalTransactionsCount?: number;
  groupByPaymentMethod?: boolean;
  includeSummaries?: boolean;
  paymentMethodGroups?: Array<{
    method: string;
    labelAr: string;
    totalAmount: number;
    count: number;
    items: TransactionWithRelations[];
  }>;
  categoriesSummary?: Array<{
    name: string;
    code: string;
    count: number;
    total: number;
  }>;
  banksSummary?: Array<{
    name: string;
    count: number;
    total: number;
  }>;
  /**
   * Added for the options dialog; every one is optional and a report that sets none of them renders as before.
   * The small line above each group's name (default: the payment-method caption), for groups that are not payment methods.
   */
  groupCaptionAr?: string;
  /** false leaves out each group's subtotal row (with one group it only repeats the grand total) */
  groupSubtotals?: boolean;
  /** one muted line under the scope strip saying which filters were applied */
  scopeNote?: string;
  /** who made the report and when, printed under the totals */
  printedBy?: string;
  printedAt?: string;
  /** the «أعدّه / اعتمده» lines after the totals */
  signature?: boolean;
};

type RevenuesReportPdfGroup = NonNullable<RevenuesReportPdfProps['paymentMethodGroups']>[number];

/**
 * Page-break rules (the tables themselves are unchanged):
 * - a payment-method band and a summary band never sit alone at the foot of a page, away from
 *   their table (they are direct children of the page flow, so react-pdf can move them);
 * - a row never splits across pages;
 * - the last row travels with the group subtotal;
 * - the last group's final rows, its subtotal and the grand-total bar are one block, so the
 *   grand-total bar is never alone on a page (the frame is kept continuous across the cut);
 * - a long category summary flows across pages instead of being pushed whole to a new page
 *   (it used to be one unbreakable block: with many categories it overflowed the page).
 */
const KEEP_BAND_WITH_TABLE = 100;
/** band of a group whose whole table is one unbreakable block: it stays only if that block fits after it */
const KEEP_WHOLE_BLOCK = 2000;
/**
 * Spacing between two tables is the next band's top margin, never a bottom margin on a table:
 * react-pdf counts a block's bottom margin as part of its "presence", so a long table that ends
 * within its own margin of the page foot is moved whole to the next page (a huge blank area).
 */
const GAP_AFTER_TABLE = 40;
const GAP_AFTER_STRIP = 10;
const KEEP_LAST_ROW_WITH_SUBTOTAL = 40;
const TAIL_ROWS = 2;
const SMALL_SUMMARY_ROWS = 4;
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
/** the page's bottom padding must clear the fixed footer (its top edge is ~66pt above the sheet's bottom) */
const FOOTER_CLEARANCE = 72;

function CategorySummary({
  categoriesSummary,
  grandTotal,
}: {
  categoriesSummary: NonNullable<RevenuesReportPdfProps['categoriesSummary']>;
  grandTotal: number;
}) {
  // a short summary stays in one piece; a long one flows across pages
  const small = categoriesSummary.length <= SMALL_SUMMARY_ROWS;
  const band = (
    <View style={s.summaryBand} wrap={false} minPresenceAhead={small ? 0 : KEEP_BAND_WITH_TABLE}>
      <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#fff', textAlign: 'right' }}>
        {ar('ملخص إجمالي الإيرادات حسب البنود المحاسبية')}
      </Text>
    </View>
  );
  const table = (
    <View style={small ? pdfReportTable.tableWrap : [pdfReportTable.tableWrap, { marginBottom: 0 }]}>
      <View style={pdfReportTable.tableHead} wrap={false} {...(small ? {} : { fixed: true })}>
        <Text style={[pdfReportTable.th, { width: W_CAT_SUMMARY.percent }]}>{ar('النسبة %')}</Text>
        <Text style={[pdfReportTable.th, { width: W_CAT_SUMMARY.total }]}>{ar('إجمالي المحصل')}</Text>
        <Text style={[pdfReportTable.th, { width: W_CAT_SUMMARY.count }]}>{ar('عدد السندات')}</Text>
        <Text style={[pdfReportTable.th, { width: W_CAT_SUMMARY.code }]}>{ar('رمز البند')}</Text>
        <Text style={[pdfReportTable.thAr, { width: W_CAT_SUMMARY.name }]}>{ar('البند المحاسبي')}</Text>
      </View>
      {categoriesSummary.map((cat, idx) => {
        const pct = grandTotal > 0 ? ((cat.total / grandTotal) * 100).toFixed(1) : '0.0';
        return (
          <View
            key={cat.name || idx}
            style={[pdfReportTable.tableRow, idx % 2 === 1 ? pdfReportTable.rowAlt : {}]}
            wrap={false}
          >
            <Text style={[pdfReportTable.tdMuted, { width: W_CAT_SUMMARY.percent, direction: 'ltr' }]}>
              {`${pct}%`}
            </Text>
            <View style={[pdfReportTable.tdNum, { width: W_CAT_SUMMARY.total }]}>
              <PdfReportMoney amount={cat.total} bold color={PDF.primary} />
            </View>
            <Text style={[pdfReportTable.tdMuted, { width: W_CAT_SUMMARY.count, direction: 'ltr' }]}>
              {cat.count}
            </Text>
            <Text style={[pdfReportTable.tdMuted, { width: W_CAT_SUMMARY.code, direction: 'ltr' }]}>
              {cat.code}
            </Text>
            <Text style={[pdfReportTable.tdAr, { width: W_CAT_SUMMARY.name, fontWeight: 'bold' }]}>
              {ar(cat.name)}
            </Text>
          </View>
        );
      })}
    </View>
  );
  if (small) {
    return (
      <View style={{ marginBottom: 14 }} wrap={false}>
        {band}
        {table}
      </View>
    );
  }
  return (
    <>
      {band}
      {table}
    </>
  );
}

function MethodRow({
  tx,
  idx,
  keepWithSubtotal,
}: {
  tx: TransactionWithRelations;
  idx: number;
  keepWithSubtotal: boolean;
}) {
  const isAlt = idx % 2 === 1;
  return (
    <View
      style={[pdfReportTable.tableRow, isAlt ? pdfReportTable.rowAlt : {}]}
      wrap={false}
      minPresenceAhead={keepWithSubtotal ? KEEP_LAST_ROW_WITH_SUBTOTAL : 0}
    >
      <View style={[pdfReportTable.tdNum, { width: W_REV.amount }]}>
        <PdfReportMoney amount={Number(tx.amount || 0)} bold color={PDF.primary} />
      </View>

      <Text style={[pdfReportTable.tdAr, { width: W_REV.bank, fontSize: 8 }]}>
        {ar(tx.cashbox?.name_ar || '—')}
      </Text>

      <View style={{ width: W_REV.category, ...pdfReportTable.tdAr }}>
        <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: PDF.text }}>
          {ar(tx.category?.name_ar || 'إيراد عام')}
        </Text>
        <Text style={{ fontSize: 7, color: PDF.muted, direction: 'ltr', textAlign: 'right' }}>
          {tx.category?.code || '—'}
        </Text>
      </View>

      <View style={{ width: W_REV.contact, ...pdfReportTable.tdAr }}>
        <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: PDF.text }}>
          {ar(tx.contact?.name || 'عميل عام')}
        </Text>
        {tx.contact?.shop_number ? (
          <Text style={{ fontSize: 7, color: PDF.muted }}>
            {ar(`محل رقم: ${tx.contact.shop_number}`)}
          </Text>
        ) : null}
      </View>

      <Text style={[pdfReportTable.tdMuted, { width: W_REV.date, direction: 'ltr', textAlign: 'center' }]}>
        {tx.tx_date ? tx.tx_date.slice(0, 10) : '—'}
      </Text>

      <Text
        style={[
          pdfReportTable.tdMuted,
          { width: W_REV.number, fontWeight: 'bold', color: PDF.primary, direction: 'ltr', textAlign: 'center' },
        ]}
      >
        {`#${tx.number ?? '—'}`}
      </Text>
    </View>
  );
}

function MethodGroup({
  group,
  bandGap,
  closing,
  captionAr,
  showSubtotal = true,
}: {
  group: RevenuesReportPdfGroup;
  /** top margin of the band (larger when the group follows a table) */
  bandGap: number;
  /** passed to the last group only: the grand-total bar, kept together with this group's tail */
  closing?: React.ReactNode;
  /** the small line above the group's name; default: the payment-method caption */
  captionAr?: string;
  showSubtotal?: boolean;
}) {
  const items = group.items;
  const renderBand = (keepAhead: number) => (
    <View
      style={[s.categoryBand, { marginTop: bandGap }]}
      wrap={false}
      minPresenceAhead={keepAhead}
    >
      <View style={s.badgeOk}>
        <Text style={s.badgeTextOk}>
          {ar(`${group.count} سند · `)}
          <PdfReportMoney
            amount={group.totalAmount}
            bold
            style={{ fontSize: 7.5, color: '#166534' }}
          />
        </Text>
      </View>
      <View style={{ flex: 1, paddingLeft: 8 }}>
        <Text style={{ fontSize: 7, color: 'rgba(255,255,255,0.75)', textAlign: 'right' }}>
          {ar(captionAr || 'جدول إيرادات طريقة الدفع')}
        </Text>
        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', textAlign: 'right' }}>
          {ar(group.labelAr)}
        </Text>
      </View>
    </View>
  );
  const renderHead = (fixed: boolean) => (
    <View style={pdfReportTable.tableHead} {...(fixed ? { fixed: true } : {})}>
      <Text style={[pdfReportTable.th, { width: W_REV.amount }]}>{ar('المبلغ')}</Text>
      <Text style={[pdfReportTable.thAr, { width: W_REV.bank }]}>{ar('الخزينة / المصرف')}</Text>
      <Text style={[pdfReportTable.thAr, { width: W_REV.category }]}>{ar('البند المحاسبي')}</Text>
      <Text style={[pdfReportTable.thAr, { width: W_REV.contact }]}>{ar('المستأجر / العميل')}</Text>
      <Text style={[pdfReportTable.th, { width: W_REV.date }]}>{ar('التاريخ')}</Text>
      <Text style={[pdfReportTable.th, { width: W_REV.number }]}>{ar('رقم السند')}</Text>
    </View>
  );
  const subtotal = (
    <View style={pdfReportTable.totalsRow} wrap={false}>
      <View style={[pdfReportTable.tdNum, { width: W_REV.amount }]}>
        <PdfReportMoney amount={group.totalAmount} bold color={PDF.primary} />
      </View>
      <Text style={[pdfReportTable.totalsRowLabel, { width: '84%', textAlign: 'right' }]}>
        {ar(`مجموع ${group.labelAr} (${group.count} سند)`)}
      </Text>
    </View>
  );
  const renderRows = (from: number, to: number, keepLastWithSubtotal: boolean) =>
    items
      .slice(from, to)
      .map((tx, i) => (
        <MethodRow
          key={tx.id || from + i}
          tx={tx}
          idx={from + i}
          keepWithSubtotal={keepLastWithSubtotal && from + i === items.length - 1}
        />
      ));

  // band and table are direct children of the page flow (not wrapped in a group View):
  // react-pdf only moves an element that has something before it, so a wrapped band would
  // stay alone at the foot of the page
  if (!closing) {
    return (
      <>
        {renderBand(KEEP_BAND_WITH_TABLE)}
        <View style={[pdfReportTable.tableWrap, { marginBottom: 0 }]}>
          {renderHead(true)}
          {renderRows(0, items.length, true)}
          {showSubtotal ? subtotal : null}
        </View>
      </>
    );
  }

  // last group: [head + rows before the tail] + [last rows, subtotal, grand-total bar] as one block
  const tailFrom = items.length > TAIL_ROWS ? items.length - TAIL_ROWS : 0;
  return (
    <>
      {renderBand(tailFrom > 0 ? KEEP_BAND_WITH_TABLE : KEEP_WHOLE_BLOCK)}
      {tailFrom > 0 ? (
        <View style={[pdfReportTable.tableWrap, FRAME_OPEN_BOTTOM]}>
          {renderHead(true)}
          {renderRows(0, tailFrom, false)}
        </View>
      ) : null}
      <View wrap={false}>
        <View style={[pdfReportTable.tableWrap, tailFrom > 0 ? FRAME_OPEN_TOP : {}]}>
          {tailFrom > 0 ? null : renderHead(false)}
          {renderRows(tailFrom, items.length, false)}
          {showSubtotal ? subtotal : null}
        </View>
        <View style={{ marginTop: 14 }}>{closing}</View>
      </View>
    </>
  );
}

export function RevenuesReportPDF(props: RevenuesReportPdfProps) {
  const items = props.rows || props.transactions || [];
  const periodLabel = props.periodLabel || 'الفترة المحددة';
  const categoryLabel = props.categoryLabel || props.categoriesLabel || 'كافة بنود الإيرادات';
  const titleAr = props.titleAr || 'تقرير الإيرادات المعتمد';
  const subtitle = props.subtitleAr || `${periodLabel} · ${categoryLabel}`;
  const docTitle = props.documentTitle || `${BRAND.name} - ${titleAr} - ${periodLabel}`;

  const totalCount = props.totalTransactionsCount ?? items.length;
  const calculatedGrandTotal =
    props.grandTotal ?? items.reduce((sum, t) => sum + Number(t.amount || 0), 0);

  // Group by payment method if not supplied
  const methodGroups =
    props.paymentMethodGroups && props.paymentMethodGroups.length > 0
      ? props.paymentMethodGroups
      : (() => {
          const map = new Map<
            string,
            {
              method: string;
              labelAr: string;
              totalAmount: number;
              count: number;
              items: TransactionWithRelations[];
            }
          >();
          const labels: Record<string, string> = {
            CASH: 'الإيرادات النقدية (CASH)',
            CARD: 'إيرادات البطاقة المصرفية (POS)',
            TRANSFER: 'إيرادات الحوالات المصرفية (TRANSFER)',
            CHEQUE: 'إيرادات الصكوك المصرفية (CHEQUE)',
          };
          for (const it of items) {
            const m = it.method || 'CASH';
            const amt = Number(it.amount || 0);
            let g = map.get(m);
            if (!g) {
              g = {
                method: m,
                labelAr: labels[m] || m,
                totalAmount: 0,
                count: 0,
                items: [],
              };
              map.set(m, g);
            }
            g.count += 1;
            g.totalAmount += amt;
            g.items.push(it);
          }
          return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
        })();

  const grandTotal = calculatedGrandTotal;
  const totalTransactionsCount = totalCount;
  const paymentMethodGroups = methodGroups;
  // the groups can be something other than payment methods (the options dialog), so the methods used are counted from the rows
  const methodsUsed = new Set(items.map((it) => it.method || 'CASH')).size;

  const categoriesSummary =
    props.categoriesSummary && props.categoriesSummary.length > 0
      ? props.categoriesSummary
      : (() => {
          const map = new Map<
            string,
            { name: string; code: string; count: number; total: number }
          >();
          for (const it of items) {
            const name = it.category?.name_ar || 'إيرادات عامة';
            const code = it.category?.code || 'REV';
            const amt = Number(it.amount || 0);
            let c = map.get(name);
            if (!c) {
              c = { name, code, count: 0, total: 0 };
              map.set(name, c);
            }
            c.count += 1;
            c.total += amt;
          }
          return Array.from(map.values()).sort((a, b) => b.total - a.total);
        })();

  const banksSummary =
    props.banksSummary && props.banksSummary.length > 0
      ? props.banksSummary
      : (() => {
          const map = new Map<
            string,
            { name: string; count: number; total: number }
          >();
          for (const it of items) {
            const name = it.cashbox?.name_ar || 'الخزينة الرئيسية';
            const amt = Number(it.amount || 0);
            let b = map.get(name);
            if (!b) {
              b = { name, count: 0, total: 0 };
              map.set(name, b);
            }
            b.count += 1;
            b.total += amt;
          }
          return Array.from(map.values()).sort((a, b) => b.total - a.total);
        })();

  // a long category summary is a table that flows across pages (a short one is a small block)
  const summaryFlows =
    props.includeSummaries !== false &&
    categoriesSummary.length > 1 &&
    categoriesSummary.length > SMALL_SUMMARY_ROWS;

  // grand-total bar + caption: one block, printed with the last group's tail
  const closing = (
    <>
      <View style={pdfReportTable.totalBar} wrap={false}>
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('إجمالي الإيرادات المعتمد')}</Text>
            <PdfReportMoney amount={grandTotal} bold light />
          </View>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('إجمالي عدد السندات')}</Text>
            <Text style={{ fontSize: 9.5, fontWeight: 'bold', color: '#fff', textAlign: 'center', direction: 'ltr' }}>
              {totalTransactionsCount}
            </Text>
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>
          {ar(`الإجمالي العام للإيرادات — ${periodLabel}`)}
        </Text>
      </View>

      <PdfReportCaption />
      <PdfPrintLine printedBy={props.printedBy} printedAt={props.printedAt} />
      {props.signature ? <PdfSignatureBlock preparedBy={props.printedBy} /> : null}
    </>
  );

  return (
    <Document title={docTitle} author={BRAND.fullName}>
      <Page
        size="A4"
        style={[pdfBase.page, { paddingBottom: Math.max(PDF_PAGINATION.footerReserve, FOOTER_CLEARANCE) }]}
        wrap
      >
        <View style={pdfBase.pageAccentBar} fixed />
        <View style={pdfBase.pageFlow}>
          <PdfReportHeaderFlow title={titleAr} subtitle={subtitle} titleEn="REVENUES REPORT" />

          {/* 1. Scope & Meta Strip */}
          <View style={[s.scopeStrip, props.scopeNote ? { marginBottom: 4 } : null]} wrap={false}>
            <View style={s.scopeItem}>
              <Text style={s.scopeLabel}>{ar('الفترة الزمنية')}</Text>
              <Text style={s.scopeValue}>{ar(periodLabel)}</Text>
            </View>
            <View style={s.scopeItem}>
              <Text style={s.scopeLabel}>{ar('البند المحدد')}</Text>
              <Text style={s.scopeValue}>{ar(categoryLabel)}</Text>
            </View>
            <View style={s.scopeItem}>
              <Text style={s.scopeLabel}>{ar('عدد السندات')}</Text>
              <Text style={s.scopeValue}>{ar(arabicCount(totalTransactionsCount, ['معاملة واحدة', 'معاملتان', 'معاملات', 'معاملة']))}</Text>
            </View>
            <View style={s.scopeItem}>
              <Text style={s.scopeLabel}>{ar('إجمالي الإيرادات')}</Text>
              <PdfReportMoney amount={grandTotal} bold color={PDF.primary} />
            </View>
          </View>

          {props.scopeNote ? <PdfScopeNote text={props.scopeNote} /> : null}

          {/* 2. KPI Summary Cards */}
          <View style={s.kpiStrip} wrap={false}>
            <View style={s.kpiCell}>
              <Text style={s.kpiLabel}>{ar('إجمالي الإيرادات المحصلة')}</Text>
              <PdfReportMoney amount={grandTotal} bold color={PDF.primary} />
              <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right', marginTop: 2 }}>
                {ar(`${totalTransactionsCount} سند إيراد`)}
              </Text>
            </View>

            <View style={s.kpiCell}>
              <Text style={s.kpiLabel}>{ar('طرق الدفع المستخدمة')}</Text>
              <Text style={s.kpiValue}>{ar(arabicCount(methodsUsed, ['طريقة دفع واحدة', 'طريقتا دفع', 'طرق دفع', 'طريقة دفع']))}</Text>
              <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right', marginTop: 2 }}>
                {ar('نقدي، بطاقة، حوالة، صك')}
              </Text>
            </View>

            <View style={s.kpiCell}>
              <Text style={s.kpiLabel}>{ar('الحسابات والمصارف')}</Text>
              <Text style={s.kpiValue}>{ar(arabicCount(banksSummary.length, ['حساب واحد', 'حسابان', 'حسابات', 'حساباً']))}</Text>
              <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right', marginTop: 2 }}>
                {ar('خزائن نقدية ومصارف')}
              </Text>
            </View>

            <View style={s.kpiCell}>
              <Text style={s.kpiLabel}>{ar('بنود الإيرادات')}</Text>
              <Text style={s.kpiValue}>{ar(arabicCount(categoriesSummary.length, ['بند واحد', 'بندان', 'بنود', 'بنداً']))}</Text>
              <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right', marginTop: 2 }}>
                {ar('إيجارات وخدمات')}
              </Text>
            </View>
          </View>

          {/* 3. Categories Summary (if multiple categories) */}
          {props.includeSummaries !== false && categoriesSummary.length > 1 && (
            <CategorySummary categoriesSummary={categoriesSummary} grandTotal={grandTotal} />
          )}

          {/* 4. Payment Method Grouped Tables — the last group also carries the grand-total bar */}
          {paymentMethodGroups.length === 0 ? (
            <>
              <Text style={s.emptyBox}>{ar('لا توجد إيرادات مسجلة مطابقة للخيارات المحددة')}</Text>
              {closing}
            </>
          ) : (
            paymentMethodGroups.map((group, gi) => (
              <MethodGroup
                key={group.method}
                group={group}
                bandGap={gi > 0 || summaryFlows ? GAP_AFTER_TABLE : GAP_AFTER_STRIP}
                closing={gi === paymentMethodGroups.length - 1 ? closing : undefined}
                captionAr={props.groupCaptionAr}
                showSubtotal={props.groupSubtotals !== false}
              />
            ))
          )}
        </View>

        <TajMallPdfFooter fixed />
        <Text
          style={pdfBase.pageNumber}
          render={({ pageNumber, totalPages }) =>
            ar(`صفحة ${pageNumber ?? 1} من ${totalPages ?? 1}`)
          }
          fixed
        />
      </Page>
    </Document>
  );
}
