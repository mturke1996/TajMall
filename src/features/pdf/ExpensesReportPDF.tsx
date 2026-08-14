// @ts-nocheck
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportPageFrame } from './ReportPageFrame';
import { ar } from './arabicPDF';
import { PDF, pdfBase } from './pdfBase';
import { PDF_TABLE_ROW, PDF_AR_CELL, PDF_NUM_CELL } from './pdfTable';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { TajMallPdfFooter, PdfReportHeaderFlow } from './pdfBrandKit';
import { BRAND } from '@/lib/brand';
import type { TransactionWithRelations } from '@/lib/db/types';

const W_EXP = {
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
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRightWidth: 3.5,
    borderRightColor: PDF.danger,
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
    color: PDF.danger,
    textAlign: 'right',
  },
  categoryBand: {
    ...PDF_TABLE_ROW,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#334155',
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
  badgeDanger: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: '#fee2e2',
  },
  badgeTextDanger: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#991b1b',
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

export type ExpensesReportPdfProps = {
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
};

export function ExpensesReportPDF(props: ExpensesReportPdfProps) {
  const items = props.rows || props.transactions || [];
  const periodLabel = props.periodLabel || 'الفترة المحددة';
  const categoryLabel = props.categoryLabel || props.categoriesLabel || 'كافة بنود المصروفات';
  const titleAr = props.titleAr || 'تقرير المصروفات المعتمد';
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
            CASH: 'المدفوعات النقدية (CASH)',
            CARD: 'مدفوعات البطاقة المصرفية (POS)',
            TRANSFER: 'مدفوعات الحوالات المصرفية (TRANSFER)',
            CHEQUE: 'مدفوعات الصكوك المصرفية (CHEQUE)',
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

  const categoriesSummary =
    props.categoriesSummary && props.categoriesSummary.length > 0
      ? props.categoriesSummary
      : (() => {
          const map = new Map<
            string,
            { name: string; code: string; count: number; total: number }
          >();
          for (const it of items) {
            const name = it.category?.name_ar || 'مصروفات عامة';
            const code = it.category?.code || 'EXP';
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

  return (
    <Document title={docTitle} author={BRAND.fullName}>
      <Page size="A4" style={pdfBase.page} wrap>
        <View style={pdfBase.pageAccentBar} fixed />
        <View style={pdfBase.pageFlow}>
          <PdfReportHeaderFlow title={titleAr} subtitle={subtitle} titleEn="EXPENSES REPORT" />

          {/* 1. Scope & Meta Strip */}
          <View style={s.scopeStrip} wrap={false}>
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
              <Text style={s.scopeValue}>{ar(`${totalTransactionsCount} سند`)}</Text>
            </View>
            <View style={s.scopeItem}>
              <Text style={s.scopeLabel}>{ar('إجمالي المصروفات')}</Text>
              <PdfReportMoney amount={grandTotal} bold color={PDF.danger} />
            </View>
          </View>

          {/* 2. KPI Summary Cards */}
          <View style={s.kpiStrip} wrap={false}>
            <View style={s.kpiCell}>
              <Text style={s.kpiLabel}>{ar('إجمالي المصروفات المدفوعة')}</Text>
              <PdfReportMoney amount={grandTotal} bold color={PDF.danger} />
              <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right', marginTop: 2 }}>
                {ar(`${totalTransactionsCount} سند صرف`)}
              </Text>
            </View>

            <View style={s.kpiCell}>
              <Text style={s.kpiLabel}>{ar('طرق الدفع المستخدمة')}</Text>
              <Text style={[s.kpiValue, { color: PDF.primary }]}>
                {ar(`${paymentMethodGroups.length} طرق دفع`)}
              </Text>
              <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right', marginTop: 2 }}>
                {ar('نقدي، بطاقة، حوالة، صك')}
              </Text>
            </View>

            <View style={s.kpiCell}>
              <Text style={s.kpiLabel}>{ar('الحسابات والمصارف')}</Text>
              <Text style={[s.kpiValue, { color: PDF.primary }]}>
                {ar(`${banksSummary.length} حسابات`)}
              </Text>
              <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right', marginTop: 2 }}>
                {ar('خزائن ومصارف مدفوع منها')}
              </Text>
            </View>

            <View style={s.kpiCell}>
              <Text style={s.kpiLabel}>{ar('بنود المصروفات')}</Text>
              <Text style={[s.kpiValue, { color: PDF.primary }]}>
                {ar(`${categoriesSummary.length} بنود`)}
              </Text>
              <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right', marginTop: 2 }}>
                {ar('تشغيل وصيانة وعمومية')}
              </Text>
            </View>
          </View>

          {/* 3. Categories Summary (if multiple categories) */}
          {props.includeSummaries !== false && categoriesSummary.length > 1 && (
            <View style={{ marginBottom: 14 }} wrap={false}>
              <View style={s.summaryBand}>
                <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#fff', textAlign: 'right' }}>
                  {ar('ملخص إجمالي المصروفات حسب البنود المحاسبية')}
                </Text>
              </View>
              <View style={pdfReportTable.tableWrap}>
                <View style={pdfReportTable.tableHead}>
                  <Text style={[pdfReportTable.th, { width: W_CAT_SUMMARY.percent }]}>{ar('النسبة %')}</Text>
                  <Text style={[pdfReportTable.th, { width: W_CAT_SUMMARY.total }]}>{ar('إجمالي المدفوع')}</Text>
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
                    >
                      <Text style={[pdfReportTable.tdMuted, { width: W_CAT_SUMMARY.percent, direction: 'ltr' }]}>
                        {`${pct}%`}
                      </Text>
                      <View style={[pdfReportTable.tdNum, { width: W_CAT_SUMMARY.total }]}>
                        <PdfReportMoney amount={cat.total} bold color={PDF.danger} />
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
            </View>
          )}

          {/* 4. Payment Method Grouped Tables */}
          {paymentMethodGroups.length === 0 ? (
            <Text style={s.emptyBox}>{ar('لا توجد مصروفات مسجلة مطابقة للخيارات المحددة')}</Text>
          ) : (
            paymentMethodGroups.map((group) => {
              return (
                <View key={group.method} style={{ marginBottom: 14 }}>
                  {/* Category Band Bar */}
                  <View style={s.categoryBand} wrap={false}>
                    <View style={s.badgeDanger}>
                      <Text style={s.badgeTextDanger}>
                        {ar(`${group.count} سند · `)}
                        <PdfReportMoney
                          amount={group.totalAmount}
                          bold
                          style={{ fontSize: 7.5, color: '#991b1b' }}
                        />
                      </Text>
                    </View>
                    <View style={{ flex: 1, paddingLeft: 8 }}>
                      <Text style={{ fontSize: 7, color: 'rgba(255,255,255,0.75)', textAlign: 'right' }}>
                        {ar('جدول مصروفات طريقة الدفع')}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', textAlign: 'right' }}>
                        {ar(group.labelAr)}
                      </Text>
                    </View>
                  </View>

                  {/* Table */}
                  <View style={pdfReportTable.tableWrap}>
                    <View style={pdfReportTable.tableHead} fixed>
                      <Text style={[pdfReportTable.th, { width: W_EXP.amount }]}>{ar('المبلغ')}</Text>
                      <Text style={[pdfReportTable.thAr, { width: W_EXP.bank }]}>{ar('الخزينة / المصرف')}</Text>
                      <Text style={[pdfReportTable.thAr, { width: W_EXP.category }]}>{ar('البند المحاسبي')}</Text>
                      <Text style={[pdfReportTable.thAr, { width: W_EXP.contact }]}>{ar('المورد / المستفيد')}</Text>
                      <Text style={[pdfReportTable.th, { width: W_EXP.date }]}>{ar('التاريخ')}</Text>
                      <Text style={[pdfReportTable.th, { width: W_EXP.number }]}>{ar('رقم السند')}</Text>
                    </View>

                    {group.items.map((tx, idx) => {
                      const isAlt = idx % 2 === 1;
                      return (
                        <View
                          key={tx.id || idx}
                          style={[pdfReportTable.tableRow, isAlt ? pdfReportTable.rowAlt : {}]}
                          wrap={false}
                        >
                          <View style={[pdfReportTable.tdNum, { width: W_EXP.amount }]}>
                            <PdfReportMoney amount={Number(tx.amount || 0)} bold color={PDF.danger} />
                          </View>

                          <Text style={[pdfReportTable.tdAr, { width: W_EXP.bank, fontSize: 8 }]}>
                            {ar(tx.cashbox?.name_ar || '—')}
                          </Text>

                          <View style={{ width: W_EXP.category, ...pdfReportTable.tdAr }}>
                            <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: PDF.text }}>
                              {ar(tx.category?.name_ar || 'مصروف عام')}
                            </Text>
                            <Text style={{ fontSize: 7, color: PDF.muted, direction: 'ltr', textAlign: 'right' }}>
                              {tx.category?.code || '—'}
                            </Text>
                          </View>

                          <View style={{ width: W_EXP.contact, ...pdfReportTable.tdAr }}>
                            <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: PDF.text }}>
                              {ar(tx.contact?.name || 'مورد / مستفيد عام')}
                            </Text>
                            {tx.contact?.job_title ? (
                              <Text style={{ fontSize: 7, color: PDF.muted }}>
                                {ar(tx.contact.job_title)}
                              </Text>
                            ) : null}
                          </View>

                          <Text style={[pdfReportTable.tdMuted, { width: W_EXP.date, direction: 'ltr', textAlign: 'center' }]}>
                            {tx.tx_date ? tx.tx_date.slice(0, 10) : '—'}
                          </Text>

                          <Text
                            style={[
                              pdfReportTable.tdMuted,
                              { width: W_EXP.number, fontWeight: 'bold', color: PDF.danger, direction: 'ltr', textAlign: 'center' },
                            ]}
                          >
                            {`#${tx.number ?? '—'}`}
                          </Text>
                        </View>
                      );
                    })}

                    {/* Subtotal Row */}
                    <View style={pdfReportTable.totalsRow} wrap={false}>
                      <View style={[pdfReportTable.tdNum, { width: W_EXP.amount }]}>
                        <PdfReportMoney amount={group.totalAmount} bold color={PDF.danger} />
                      </View>
                      <Text style={[pdfReportTable.totalsRowLabel, { width: '84%', textAlign: 'right' }]}>
                        {ar(`مجموع ${group.labelAr} (${group.count} سند)`)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}

          {/* 5. Grand Total Bar */}
          <View style={pdfReportTable.totalBar} wrap={false}>
            <View style={pdfReportTable.totalCluster}>
              <View style={pdfReportTable.totalMini}>
                <Text style={pdfReportTable.totalMiniLabel}>{ar('إجمالي المصروفات المعتمد')}</Text>
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
              {ar(`الإجمالي العام للمصروفات — ${periodLabel}`)}
            </Text>
          </View>

          <PdfReportCaption />
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
