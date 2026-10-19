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
import type { CashboxKind } from '@/lib/db/types';

/**
 * تقرير قيد الفترة المحاسبي والتنفيذي المتقدم — طراز تاج مول الأصلي الفاخر
 */

const W_SUMMARY = {
  net: '12%',
  credit: '15%',
  debit: '15%',
  role: '20%',
  name: '26%',
  code: '12%',
} as const;

const W_DETAILED = {
  amount: '16%',
  desc: '22%',
  tenant: '22%',
  targetMonth: '18%',
  date: '13%',
  number: '9%',
} as const;

/** room a bank band needs below it: the column head and two rows, so a band is never left alone at the foot of a page */
const DETAIL_HEAD_ROOM = 96;
/** room the grand total bar and the caption need after the last table */
const CLOSING_AFTER_TABLE = 92;
const CLOSING_AFTER_GROUP = 72;

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
  categoryBandCash: {
    backgroundColor: '#1e3a2f',
  },
  categoryBandBank: {
    backgroundColor: '#1a365d',
  },
  categoryBandTitle: {
    flex: 1,
    paddingLeft: 8,
  },
  categoryBandEyebrow: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'right',
    marginBottom: 2,
  },
  categoryBandName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: PDF.white,
    textAlign: 'right',
    lineHeight: 1.3,
  },
  categoryBandMeta: {
    fontSize: 7.5,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'right',
    marginTop: 2,
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
  badgeWarn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: '#fef3c7',
  },
  badgeTextWarn: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#92400e',
    textAlign: 'center',
  },
  rentBadgePrior: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 7,
    fontWeight: 'bold',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 2,
    textAlign: 'center',
  },
  rentBadgeCurrent: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    fontSize: 7,
    fontWeight: 'bold',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 2,
    textAlign: 'center',
  },
  rentBadgeFuture: {
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
    fontSize: 7,
    fontWeight: 'bold',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 2,
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

export type PeriodJournalBankGroup = {
  cashboxId: string;
  name: string;
  kind: CashboxKind | null;
  totalDebit: number;
  totalCredit: number;
  entryCount: number;
  focusLineName: string;
  focusLineCode: string;
  focusAmount: number;
  contraLineName: string;
  contraAmount: number;
  isCredit: boolean;
  items: Array<{
    id: string;
    number: number;
    date: string;
    description: string | null;
    tenantName: string | null;
    shopNumber: string | null;
    targetRentMonth: string | null;
    targetMonthStatus: 'PRIOR' | 'CURRENT' | 'FUTURE' | 'GENERAL';
    debit: number;
    credit: number;
    amount: number;
  }>;
};

export type PeriodJournalExecutivePdfProps = {
  titleAr?: string;
  subtitleAr?: string;
  documentTitle?: string;
  periodLabel: string;
  categoryLabel?: string;
  basisLabel?: string;
  viewLevel?: 'SUMMARY_ONLY' | 'DETAILED';
  grandTotal: number;
  totalEntries: number;
  priorPeriodTotal?: number;
  priorPeriodCount?: number;
  currentPeriodTotal?: number;
  currentPeriodCount?: number;
  futurePeriodTotal?: number;
  futurePeriodCount?: number;
  bankGroups: PeriodJournalBankGroup[];
  categoriesSummary?: Array<{ name: string; code: string; count: number; total: number }>;
  paymentMethodsSummary?: Array<{ method: string; labelAr: string; count: number; total: number }>;
};

export function PeriodJournalExecutivePDF({
  titleAr = 'قيد الفترة المحاسبي المعتمد',
  subtitleAr,
  documentTitle,
  periodLabel,
  categoryLabel = 'كافة البنود المحاسبية',
  basisLabel = 'التحصيل والتسجيل الفعلي',
  viewLevel = 'SUMMARY_ONLY',
  grandTotal,
  totalEntries,
  priorPeriodTotal = 0,
  priorPeriodCount = 0,
  currentPeriodTotal = 0,
  currentPeriodCount = 0,
  futurePeriodTotal = 0,
  futurePeriodCount = 0,
  bankGroups,
  categoriesSummary = [],
  paymentMethodsSummary = [],
}: PeriodJournalExecutivePdfProps) {
  const subtitle = subtitleAr || `${periodLabel} · ${categoryLabel} · ${basisLabel}`;
  const docTitle = documentTitle || `${BRAND.name} - ${titleAr} - ${periodLabel}`;

  return (
    <Document title={docTitle} author={BRAND.fullName}>
      <Page size="A4" style={pdfBase.page} wrap>
        <View style={pdfBase.pageAccentBar} fixed />
        <View style={pdfBase.pageFlow}>
          <PdfReportHeaderFlow title={titleAr} subtitle={subtitle} titleEn="JOURNAL ENTRY" />

          {/* 1. Scope & Meta Strip */}
          <View style={s.scopeStrip} wrap={false}>
            <View style={s.scopeItem}>
              <Text style={s.scopeLabel}>{ar('الفترة المحاسبية')}</Text>
              <Text style={s.scopeValue}>{ar(periodLabel)}</Text>
            </View>
            <View style={s.scopeItem}>
              <Text style={s.scopeLabel}>{ar('البند المحاسبي')}</Text>
              <Text style={s.scopeValue}>{ar(categoryLabel)}</Text>
            </View>
            <View style={s.scopeItem}>
              <Text style={s.scopeLabel}>{ar('مستوى العرض')}</Text>
              <Text style={s.scopeValue}>
                {ar(viewLevel === 'SUMMARY_ONLY' ? 'مجموع فقط (لكل مصرف)' : 'تفصيلي بكافة القيود')}
              </Text>
            </View>
            <View style={s.scopeItem}>
              <Text style={s.scopeLabel}>{ar('الأساس والفرز')}</Text>
              <Text style={s.scopeValue}>{ar(basisLabel)}</Text>
            </View>
            <View style={s.scopeItem}>
              <Text style={s.scopeLabel}>{ar('إجمالي الحركة')}</Text>
              <PdfReportMoney amount={grandTotal} bold color={PDF.primary} />
            </View>
          </View>

          {/* 2. KPI Summary Cards */}
          <View style={s.kpiStrip} wrap={false}>
            <View style={s.kpiCell}>
              <Text style={s.kpiLabel}>{ar('إجمالي الحركات المسجلة')}</Text>
              <PdfReportMoney amount={grandTotal} bold color={PDF.primary} />
              <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right', marginTop: 2 }}>
                {ar(`${totalEntries} حركة / قيد`)}
              </Text>
            </View>

            {priorPeriodTotal > 0 ? (
              <View style={s.kpiCell}>
                <Text style={s.kpiLabel}>{ar('متأخرات شهور سابقة')}</Text>
                <PdfReportMoney amount={priorPeriodTotal} bold color="#b45309" />
                <Text style={{ fontSize: 7, color: '#b45309', textAlign: 'right', marginTop: 2 }}>
                  {ar(`${priorPeriodCount} حركة سابقة`)}
                </Text>
              </View>
            ) : null}

            <View style={s.kpiCell}>
              <Text style={s.kpiLabel}>{ar('حركات الشهر الحالي')}</Text>
              <PdfReportMoney
                amount={currentPeriodTotal > 0 ? currentPeriodTotal : grandTotal}
                bold
                color={PDF.success}
              />
              <Text style={{ fontSize: 7, color: PDF.success, textAlign: 'right', marginTop: 2 }}>
                {ar(`${currentPeriodCount > 0 ? currentPeriodCount : totalEntries} حركة حالية`)}
              </Text>
            </View>

            <View style={s.kpiCell}>
              <Text style={s.kpiLabel}>{ar('الحسابات والمصارف')}</Text>
              <Text style={s.kpiValue}>{ar(`${bankGroups.length} حسابات`)}</Text>
              <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right', marginTop: 2 }}>
                {ar('خزائن ومصارف مفصولة')}
              </Text>
            </View>
          </View>

          {/* 3. Bank / Cashbox Tables */}
          {bankGroups.length === 0 ? (
            <Text style={s.emptyBox}>{ar('لا توجد حركات أو قيود مطابقة للخيارات المحددة')}</Text>
          ) : (
            bankGroups.map((bg, bgIdx) => {
              const isCash = bg.kind === 'CASH';
              const bandStyle = isCash
                ? [s.categoryBand, s.categoryBandCash]
                : [s.categoryBand, s.categoryBandBank];
              const sectionAmount = bg.totalDebit > 0 ? bg.totalDebit : bg.totalCredit;

              const detailed = viewLevel !== 'SUMMARY_ONLY';
              const isLastGroup = bgIdx === bankGroups.length - 1;

              /* Category Band Bar — in the detailed view it carries a keep-with-next rule for its table head */
              const band = (
              <View
                style={detailed && bgIdx > 0 ? [...bandStyle, { marginTop: 24 }] : bandStyle}
                wrap={false}
                {...(detailed ? { minPresenceAhead: DETAIL_HEAD_ROOM } : {})}
              >
                <View style={s.badgeOk}>
                  <Text style={s.badgeTextOk}>
                    {ar(viewLevel === 'SUMMARY_ONLY' ? 'قيد مجمّع متوازن' : `${bg.entryCount} حركة`)}
                  </Text>
                </View>
                <View style={s.categoryBandTitle}>
                  <Text style={s.categoryBandEyebrow}>
                    {ar(
                      isCash
                        ? 'الخزينة النقدية الرئيسية · قيد المقبوضات النقدية'
                        : `الحساب المصرفي · ${bg.name}`
                    )}
                  </Text>
                  <Text style={s.categoryBandName}>{ar(bg.name)}</Text>
                  <Text style={s.categoryBandMeta}>
                    {ar(
                      `إجمالي حركة الحساب: ${sectionAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} د.ل · عدد الحركات: ${bg.entryCount}`
                    )}
                  </Text>
                </View>
              </View>
              );

              // ================= 3A: SUMMARY ONLY (مجموع البند فقط) =================
              const summaryTable = (
                <View style={pdfReportTable.tableWrap}>
                  <View style={pdfReportTable.tableHead} fixed>
                    <Text style={[pdfReportTable.th, { width: W_SUMMARY.net }]}>{ar('الصافي')}</Text>
                    <Text style={[pdfReportTable.th, { width: W_SUMMARY.credit }]}>{ar('دائن')}</Text>
                    <Text style={[pdfReportTable.th, { width: W_SUMMARY.debit }]}>{ar('مدين')}</Text>
                    <Text style={[pdfReportTable.thAr, { width: W_SUMMARY.role }]}>{ar('الدور المحاسبي')}</Text>
                    <Text style={[pdfReportTable.thAr, { width: W_SUMMARY.name }]}>{ar('الطرف / الحساب')}</Text>
                    <Text style={[pdfReportTable.th, { width: W_SUMMARY.code }]}>{ar('الرمز')}</Text>
                  </View>

                  {/* Line 1: Focus Category (البند المحدد) */}
                  <View
                    style={[pdfReportTable.tableRow, { backgroundColor: PDF.logoGreenSoft }]}
                    wrap={false}
                  >
                    <View style={[pdfReportTable.tdNum, { width: W_SUMMARY.net }]}>
                      <PdfReportMoney amount={bg.focusAmount} bold showZero />
                    </View>
                    <View style={[pdfReportTable.tdNum, { width: W_SUMMARY.credit }]}>
                      <PdfReportMoney
                        amount={bg.isCredit ? bg.focusAmount : 0}
                        bold
                        color={bg.isCredit ? PDF.danger : undefined}
                        showZero
                      />
                    </View>
                    <View style={[pdfReportTable.tdNum, { width: W_SUMMARY.debit }]}>
                      <PdfReportMoney
                        amount={!bg.isCredit ? bg.focusAmount : 0}
                        bold
                        color={!bg.isCredit ? PDF.success : undefined}
                        showZero
                      />
                    </View>
                    <Text
                      style={[
                        pdfReportTable.tdAr,
                        { width: W_SUMMARY.role, fontWeight: 'bold', color: PDF.primary },
                      ]}
                    >
                      {ar(bg.isCredit ? 'دائن — إجمالي البند' : 'مدين — إجمالي البند')}
                    </Text>
                    <View style={{ width: W_SUMMARY.name, ...pdfReportTable.tdAr }}>
                      <Text style={{ fontSize: 9, fontWeight: 'bold', color: PDF.text }}>
                        {ar(bg.focusLineName)}
                      </Text>
                      <Text style={{ fontSize: 7, color: PDF.muted }}>
                        {ar('إجمالي حركة الفترة للبند')}
                      </Text>
                    </View>
                    <Text style={[pdfReportTable.tdMuted, { width: W_SUMMARY.code, fontWeight: 'bold' }]}>
                      {ar(bg.focusLineCode || '—')}
                    </Text>
                  </View>

                  {/* Line 2: Contra Account (الخزينة/المصرف) */}
                  <View style={pdfReportTable.tableRow} wrap={false}>
                    <View style={[pdfReportTable.tdNum, { width: W_SUMMARY.net }]}>
                      <PdfReportMoney amount={bg.contraAmount} showZero />
                    </View>
                    <View style={[pdfReportTable.tdNum, { width: W_SUMMARY.credit }]}>
                      <PdfReportMoney
                        amount={!bg.isCredit ? bg.contraAmount : 0}
                        color={!bg.isCredit ? PDF.danger : undefined}
                        showZero
                      />
                    </View>
                    <View style={[pdfReportTable.tdNum, { width: W_SUMMARY.debit }]}>
                      <PdfReportMoney
                        amount={bg.isCredit ? bg.contraAmount : 0}
                        color={bg.isCredit ? PDF.success : undefined}
                        showZero
                      />
                    </View>
                    <Text style={[pdfReportTable.tdAr, { width: W_SUMMARY.role }]}>
                      {ar(!bg.isCredit ? `دائن ${bg.name}` : `مدين ${bg.name}`)}
                    </Text>
                    <View style={{ width: W_SUMMARY.name, ...pdfReportTable.tdAr }}>
                      <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: PDF.text }}>
                        {ar(bg.name)}
                      </Text>
                      <Text style={{ fontSize: 7, color: PDF.muted }}>
                        {ar(isCash ? 'خزينة نقدية' : 'حساب بنكي')}
                      </Text>
                    </View>
                    <Text style={[pdfReportTable.tdMuted, { width: W_SUMMARY.code }]}>
                      {ar(isCash ? '1101' : '1102')}
                    </Text>
                  </View>

                  {/* Total Double-Entry Row */}
                  <View style={pdfReportTable.totalsRow} wrap={false}>
                    <View style={[pdfReportTable.tdNum, { width: W_SUMMARY.net }]}>
                      <PdfReportMoney amount={0} bold showZero />
                    </View>
                    <View style={[pdfReportTable.tdNum, { width: W_SUMMARY.credit }]}>
                      <PdfReportMoney
                        amount={bg.totalCredit}
                        bold
                        color={PDF.danger}
                        showZero
                      />
                    </View>
                    <View style={[pdfReportTable.tdNum, { width: W_SUMMARY.debit }]}>
                      <PdfReportMoney
                        amount={bg.totalDebit}
                        bold
                        color={PDF.success}
                        showZero
                      />
                    </View>
                    <Text style={[pdfReportTable.tdMuted, { width: W_SUMMARY.role }]}>{ar('')}</Text>
                    <Text style={[pdfReportTable.totalsRowLabel, { width: W_SUMMARY.name }]}>
                      {ar('مجموع القيد — متوازن')}
                    </Text>
                    <Text style={[pdfReportTable.tdMuted, { width: W_SUMMARY.code }]}>{ar('')}</Text>
                  </View>
                </View>
              );

              const renderItem = (it, idx) => {
                const isAlt = idx % 2 === 1;
                return (
                  <View
                    key={it.id || idx}
                    style={[pdfReportTable.tableRow, isAlt ? pdfReportTable.rowAlt : {}]}
                    wrap={false}
                  >
                    <View style={[pdfReportTable.tdNum, { width: W_DETAILED.amount }]}>
                      <PdfReportMoney amount={it.amount} bold color={PDF.primary} />
                    </View>

                    <Text
                      style={[pdfReportTable.tdAr, { width: W_DETAILED.desc, fontSize: 8 }]}
                      numberOfLines={2}
                    >
                      {ar(it.description || '—')}
                    </Text>

                    <View style={{ width: W_DETAILED.tenant, ...pdfReportTable.tdAr }}>
                      <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: PDF.text }}>
                        {ar(it.tenantName || 'عميل / جهة عامة')}
                      </Text>
                      {it.shopNumber ? (
                        <Text style={{ fontSize: 7, color: PDF.muted }}>
                          {ar(`محل رقم: ${it.shopNumber}`)}
                        </Text>
                      ) : null}
                    </View>

                    <View style={{ width: W_DETAILED.targetMonth, alignItems: 'center' }}>
                      {it.targetMonthStatus === 'PRIOR' ? (
                        <Text style={s.rentBadgePrior}>
                          {ar(`سابق: ${it.targetRentMonth || 'متأخر'}`)}
                        </Text>
                      ) : it.targetMonthStatus === 'FUTURE' ? (
                        <Text style={s.rentBadgeFuture}>
                          {ar(`مقدم: ${it.targetRentMonth || 'مستقبلي'}`)}
                        </Text>
                      ) : (
                        <Text style={s.rentBadgeCurrent}>
                          {ar(it.targetRentMonth || 'الشهر الحالي')}
                        </Text>
                      )}
                    </View>

                    <Text style={[pdfReportTable.tdMuted, { width: W_DETAILED.date }]}>
                      {ar(it.date ? it.date.slice(0, 10) : '—')}
                    </Text>

                    <Text
                      style={[
                        pdfReportTable.tdMuted,
                        { width: W_DETAILED.number, fontWeight: 'bold', color: PDF.primary },
                      ]}
                    >
                      {ar(`#${it.number}`)}
                    </Text>
                  </View>
                );
              };

              // ================= 3B: DETAILED (تفصيلي بكافة القيود) =================
              const detailTable = (
                <View style={pdfReportTable.tableWrap}>
                  <View style={pdfReportTable.tableHead} fixed>
                    <Text style={[pdfReportTable.th, { width: W_DETAILED.amount }]}>{ar('المبلغ')}</Text>
                    <Text style={[pdfReportTable.thAr, { width: W_DETAILED.desc }]}>{ar('البيان والتفاصيل')}</Text>
                    <Text style={[pdfReportTable.thAr, { width: W_DETAILED.tenant }]}>{ar('المستأجر / المحل')}</Text>
                    <Text style={[pdfReportTable.th, { width: W_DETAILED.targetMonth }]}>{ar('شهر الاستحقاق')}</Text>
                    <Text style={[pdfReportTable.th, { width: W_DETAILED.date }]}>{ar('تاريخ التسجيل')}</Text>
                    <Text style={[pdfReportTable.th, { width: W_DETAILED.number }]}>{ar('رقم السند')}</Text>
                  </View>

                  {bg.items.slice(0, -1).map(renderItem)}

                  {/* the last row travels with the subtotal row (and, for the last bank, with the grand total bar) */}
                  <View wrap={false} {...(isLastGroup ? { minPresenceAhead: CLOSING_AFTER_TABLE } : {})}>
                    {bg.items.length > 0 ? renderItem(bg.items[bg.items.length - 1], bg.items.length - 1) : null}
                    {/* Subtotal row */}
                    <View style={pdfReportTable.totalsRow} wrap={false}>
                      <View style={[pdfReportTable.tdNum, { width: W_DETAILED.amount }]}>
                        <PdfReportMoney amount={sectionAmount} bold color={PDF.primary} />
                      </View>
                      <Text style={[pdfReportTable.totalsRowLabel, { width: '84%', textAlign: 'right' }]}>
                        {ar(`مجموع حركات ${bg.name} (${bg.items.length} حركة)`)}
                      </Text>
                    </View>
                  </View>
                </View>
              );

              // the small summary groups are never split; the detailed ones flow, but their band keeps its table head with it
              if (!detailed) {
                return (
                  <View
                    key={bg.cashboxId}
                    style={{ marginBottom: 14 }}
                    wrap={false}
                    {...(isLastGroup ? { minPresenceAhead: CLOSING_AFTER_GROUP } : {})}
                  >
                    {band}
                    {summaryTable}
                  </View>
                );
              }

              return (
                <React.Fragment key={bg.cashboxId}>
                  {band}
                  {detailTable}
                </React.Fragment>
              );
            })
          )}

          {/* 4. Final Balanced Grand Total Bar — kept with the caption */}
          <View wrap={false}>
            <View style={pdfReportTable.totalBar}>
              <View style={pdfReportTable.totalCluster}>
                <View style={pdfReportTable.totalMini}>
                  <Text style={pdfReportTable.totalMiniLabel}>{ar('إجمالي المبلغ المعتمد')}</Text>
                  <PdfReportMoney amount={grandTotal} bold light />
                </View>
                <View style={pdfReportTable.totalMini}>
                  <Text style={pdfReportTable.totalMiniLabel}>{ar('عدد القيود والحركات')}</Text>
                  <Text style={{ fontSize: 9.5, fontWeight: 'bold', color: '#fff', textAlign: 'center' }}>
                    {ar(`${totalEntries} قيداً`)}
                  </Text>
                </View>
              </View>
              <Text style={pdfReportTable.totalLabel}>
                {ar(`الإجمالي العام لقيد الفترة — ${periodLabel}`)}
              </Text>
            </View>

            <PdfReportCaption />
          </View>
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
