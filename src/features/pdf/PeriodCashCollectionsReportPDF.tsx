// @ts-nocheck
/**
 * تقرير كشف الإيرادات والتحصيلات المسجلة خلال الفترة (بناءً على تاريخ التسجيل والقبض الفعلي)
 * يوضح الإيرادات المحصلة خلال شهر محدد (مثل شهر يوليو) وتفصيل ما إذا كانت تخص شهور سابقة (مثل إيجار شهر مايو) أو الشهر الحالي أو مقدماً.
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum, pdfFmtDate } from './pdfBrandKit';
import { PDF_TABLE_ROW } from './pdfTable';
import { BRAND } from '@/lib/brand';
import type { PeriodCashCollectionsSummary } from '@/lib/period-journal-entry';

const styles = StyleSheet.create({
  scopeStrip: {
    marginBottom: 10,
    backgroundColor: PDF.white,
    borderWidth: 0.8,
    borderColor: PDF.border,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scopeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scopeLabel: {
    fontSize: 7.5,
    color: PDF.muted,
    fontWeight: 'bold',
  },
  scopeValue: {
    fontSize: 8,
    fontWeight: 'bold',
    color: PDF.primary,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 12,
  },
  kpiCardPrimary: {
    flex: 1.3,
    backgroundColor: PDF.logoGreenSoft,
    borderWidth: 1,
    borderColor: PDF.primary,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 9,
    justifyContent: 'space-between',
  },
  kpiCard: {
    flex: 1,
    backgroundColor: PDF.white,
    borderWidth: 0.8,
    borderColor: PDF.border,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
    justifyContent: 'space-between',
  },
  kpiEyebrow: {
    fontSize: 7.2,
    fontWeight: 'bold',
    color: PDF.muted,
    textAlign: 'right',
    marginBottom: 3,
  },
  kpiEyebrowPrimary: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
    marginBottom: 3,
  },
  kpiValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
  },
  kpiValueUnit: {
    fontSize: 7.5,
    color: PDF.muted,
    marginRight: 2,
  },
  distGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  distBox: {
    flex: 1,
    borderWidth: 0.8,
    borderColor: PDF.border,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: PDF.white,
  },
  distHeader: {
    backgroundColor: PDF.primary,
    paddingVertical: 4.5,
    paddingHorizontal: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  distHeaderTitle: {
    fontSize: 7.8,
    fontWeight: 'bold',
    color: PDF.white,
    textAlign: 'right',
  },
  distHeaderHint: {
    fontSize: 6.8,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'left',
  },
  distTableHead: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.rowAlt,
    paddingVertical: 3.5,
    paddingHorizontal: 5,
    borderBottomWidth: 0.6,
    borderBottomColor: PDF.border,
  },
  distTh: {
    fontSize: 6.8,
    fontWeight: 'bold',
    color: PDF.muted,
  },
  distRow: {
    ...PDF_TABLE_ROW,
    paddingVertical: 3.8,
    paddingHorizontal: 5,
    borderBottomWidth: 0.4,
    borderBottomColor: PDF.border,
    alignItems: 'center',
  },
  distRowLast: {
    borderBottomWidth: 0,
  },
  distColName: { width: '38%' },
  distColCount: { width: '18%', textAlign: 'center' },
  distColPct: { width: '16%', textAlign: 'center' },
  distColAmt: { width: '28%' },
  distTdText: {
    fontSize: 7.2,
    color: PDF.text,
    textAlign: 'right',
  },
  distTdMuted: {
    fontSize: 7,
    color: PDF.muted,
    textAlign: 'center',
  },
  distDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    marginLeft: 3.5,
  },
  sectionHeaderWrap: {
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: PDF.white,
    borderRightWidth: 3.5,
    borderRightColor: PDF.primary,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
  },
  sectionBadge: {
    paddingVertical: 2.5,
    paddingHorizontal: 8,
    borderRadius: 3,
    borderWidth: 0.6,
    backgroundColor: PDF.logoGreenSoft,
    borderColor: PDF.primary,
  },
  sectionBadgeText: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: PDF.primary,
  },
  tableCard: {
    borderWidth: 0.8,
    borderColor: PDF.border,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: PDF.white,
    marginBottom: 12,
  },
  tableHead: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.headerBg,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  tableRow: {
    ...PDF_TABLE_ROW,
    paddingVertical: 4.5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.4,
    borderBottomColor: PDF.border,
    alignItems: 'center',
    minHeight: 21,
  },
  rowAlt: {
    backgroundColor: PDF.rowAlt,
  },
  th: {
    color: PDF.white,
    fontSize: 7.5,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  thAr: {
    color: PDF.white,
    fontSize: 7.5,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  td: {
    fontSize: 7.5,
    color: PDF.text,
    textAlign: 'right',
  },
  tdBold: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
  },
  tdMuted: {
    fontSize: 7,
    color: PDF.muted,
    textAlign: 'center',
  },
  statusBadgePrior: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 6.5,
    fontWeight: 'bold',
    paddingVertical: 1.5,
    paddingHorizontal: 4,
    borderRadius: 2,
    textAlign: 'center',
  },
  statusBadgeCurrent: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    fontSize: 6.5,
    fontWeight: 'bold',
    paddingVertical: 1.5,
    paddingHorizontal: 4,
    borderRadius: 2,
    textAlign: 'center',
  },
  statusBadgeFuture: {
    backgroundColor: '#e0e7ff',
    color: '#3730a3',
    fontSize: 6.5,
    fontWeight: 'bold',
    paddingVertical: 1.5,
    paddingHorizontal: 4,
    borderRadius: 2,
    textAlign: 'center',
  },

  // Columns Widths (RTL: Desc | Amount | Method & Bank | Tenant | Target Month | Date | No)
  colNum: { width: '7%' },
  colDate: { width: '10%' },
  colTargetMonth: { width: '15%' },
  colTenant: { width: '17%' },
  colBox: { width: '16%' },
  colAmt: { width: '14%' },
  colDesc: { flex: 1, paddingHorizontal: 3 },

  grandTotalWrap: {
    marginTop: 10,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: PDF.primary,
    borderRadius: 4,
    backgroundColor: PDF.logoGreenSoft,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  grandTotalLabelCol: {
    alignItems: 'flex-start',
  },
  grandTotalTitle: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
  },
  grandTotalSub: {
    fontSize: 7.2,
    color: PDF.muted,
    marginTop: 1.5,
    textAlign: 'right',
  },
  grandTotalValueCol: {
    alignItems: 'flex-end',
  },
  emptyState: {
    padding: 20,
    textAlign: 'center',
    fontSize: 9,
    color: PDF.muted,
    backgroundColor: PDF.rowAlt,
    borderWidth: 0.6,
    borderColor: PDF.border,
    borderRadius: 4,
    marginVertical: 12,
  },
});

export type PeriodCashCollectionsReportPdfProps = {
  summary: PeriodCashCollectionsSummary;
  documentTitle?: string;
};

export function PeriodCashCollectionsReportPDF({
  summary,
  documentTitle,
}: PeriodCashCollectionsReportPdfProps) {
  const {
    periodLabel,
    totalCollected,
    totalCount,
    priorPeriodAmount,
    priorPeriodCount,
    currentPeriodAmount,
    currentPeriodCount,
    futurePeriodAmount,
    futurePeriodCount,
    byMethod,
    byBank,
    byCategory,
    items,
  } = summary;

  return (
    <ReportShell
      title="كشف الإيرادات والتحصيلات المسجلة خلال الفترة"
      subtitle={`${periodLabel} · أساس تاريخ التسجيل والقبض الفعلي`}
      showSummary={false}
      documentTitle={documentTitle || `${BRAND.name} - كشف التحصيل الفعلي - ${periodLabel}`}
    >
      {/* 1. Scope Banner */}
      <View style={styles.scopeStrip} wrap={false}>
        <View style={styles.scopeItem}>
          <Text style={styles.scopeLabel}>{ar('الفترة المسجلة:')}</Text>
          <Text style={styles.scopeValue}>{ar(periodLabel)}</Text>
        </View>

        <View style={styles.scopeItem}>
          <Text style={styles.scopeLabel}>{ar('الأساس المحاسبي:')}</Text>
          <Text style={styles.scopeValue}>{ar('التحصيل الفعلي (تاريخ التسجيل بالدفاتر)')}</Text>
        </View>

        <View style={styles.scopeItem}>
          <Text style={styles.scopeLabel}>{ar('تاريخ التقرير:')}</Text>
          <Text style={styles.scopeValue}>{pdfFmtDate(new Date().toISOString())}</Text>
        </View>
      </View>

      {/* 2. KPI Cards */}
      <View style={styles.kpiGrid} wrap={false}>
        <View style={styles.kpiCardPrimary}>
          <Text style={styles.kpiEyebrowPrimary}>{ar('إجمالي المحصل في الفترة')}</Text>
          <PdfMoneyText
            amount={totalCollected}
            align="right"
            style={{ fontSize: 12, fontWeight: 'bold', color: PDF.primary }}
          />
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiEyebrow}>{ar('مستحقات شهور سابقة (متأخرات)')}</Text>
          <PdfMoneyText
            amount={priorPeriodAmount}
            align="right"
            style={{ fontSize: 11, fontWeight: 'bold', color: '#92400e' }}
          />
          <Text style={[styles.kpiEyebrow, { marginTop: 2 }]}>
            {pdfFmtNum(priorPeriodCount)} <Text style={styles.kpiValueUnit}>{ar('قيداً')}</Text>
          </Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiEyebrow}>{ar('تحصيلات الشهر الحالي')}</Text>
          <PdfMoneyText
            amount={currentPeriodAmount}
            align="right"
            style={{ fontSize: 11, fontWeight: 'bold', color: '#166534' }}
          />
          <Text style={[styles.kpiEyebrow, { marginTop: 2 }]}>
            {pdfFmtNum(currentPeriodCount)} <Text style={styles.kpiValueUnit}>{ar('قيداً')}</Text>
          </Text>
        </View>

        <View style={styles.kpiCard}>
          <Text style={styles.kpiEyebrow}>{ar('تحصيلات إيجار مقدم')}</Text>
          <PdfMoneyText
            amount={futurePeriodAmount}
            align="right"
            style={{ fontSize: 11, fontWeight: 'bold', color: '#3730a3' }}
          />
          <Text style={[styles.kpiEyebrow, { marginTop: 2 }]}>
            {pdfFmtNum(futurePeriodCount)} <Text style={styles.kpiValueUnit}>{ar('قيداً')}</Text>
          </Text>
        </View>
      </View>

      {/* 3. Distribution Tables */}
      <View style={styles.distGrid} wrap={false}>
        {/* Methods */}
        <View style={styles.distBox}>
          <View style={styles.distHeader}>
            <Text style={styles.distHeaderHint}>{ar('نوع الدفع')}</Text>
            <Text style={styles.distHeaderTitle}>{ar('توزيع طرق الدفع')}</Text>
          </View>
          <View style={styles.distTableHead}>
            <Text style={[styles.distTh, styles.distColAmt, { textAlign: 'left' }]}>{ar('المبلغ')}</Text>
            <Text style={[styles.distTh, styles.distColPct]}>{ar('النسبة')}</Text>
            <Text style={[styles.distTh, styles.distColCount]}>{ar('القيود')}</Text>
            <Text style={[styles.distTh, styles.distColName, { textAlign: 'right' }]}>{ar('الطريقة')}</Text>
          </View>
          {byMethod.map((m, idx) => {
            const pct = totalCollected > 0 ? ((m.total / totalCollected) * 100).toFixed(1) : '0';
            const isLast = idx === byMethod.length - 1;
            return (
              <View key={m.method} style={[styles.distRow, isLast ? styles.distRowLast : {}]} wrap={false}>
                <View style={styles.distColAmt}>
                  <PdfMoneyText amount={m.total} align="left" style={{ fontSize: 7, fontWeight: 'bold' }} />
                </View>
                <Text style={[styles.distTdMuted, styles.distColPct]}>{ar(`${pct}%`)}</Text>
                <Text style={[styles.distTdMuted, styles.distColCount]}>{pdfFmtNum(m.count)}</Text>
                <Text style={[styles.distTdText, styles.distColName]}>{ar(m.labelAr)}</Text>
              </View>
            );
          })}
        </View>

        {/* Banks & Cashboxes */}
        <View style={styles.distBox}>
          <View style={styles.distHeader}>
            <Text style={styles.distHeaderHint}>{ar('الخزائن والمصارف')}</Text>
            <Text style={styles.distHeaderTitle}>{ar('مجموع كل بنك / خزينة')}</Text>
          </View>
          <View style={styles.distTableHead}>
            <Text style={[styles.distTh, styles.distColAmt, { textAlign: 'left' }]}>{ar('المبلغ')}</Text>
            <Text style={[styles.distTh, styles.distColPct]}>{ar('النسبة')}</Text>
            <Text style={[styles.distTh, styles.distColCount]}>{ar('القيود')}</Text>
            <Text style={[styles.distTh, styles.distColName, { textAlign: 'right' }]}>{ar('المصرف/الخزينة')}</Text>
          </View>
          {byBank.slice(0, 4).map((b, idx) => {
            const pct = totalCollected > 0 ? ((b.total / totalCollected) * 100).toFixed(1) : '0';
            const isLast = idx === Math.min(byBank.length, 4) - 1;
            return (
              <View key={b.cashboxId} style={[styles.distRow, isLast ? styles.distRowLast : {}]} wrap={false}>
                <View style={styles.distColAmt}>
                  <PdfMoneyText amount={b.total} align="left" style={{ fontSize: 7, fontWeight: 'bold' }} />
                </View>
                <Text style={[styles.distTdMuted, styles.distColPct]}>{ar(`${pct}%`)}</Text>
                <Text style={[styles.distTdMuted, styles.distColCount]}>{pdfFmtNum(b.count)}</Text>
                <Text style={[styles.distTdText, styles.distColName]} numberOfLines={1}>{ar(b.name)}</Text>
              </View>
            );
          })}
        </View>

        {/* Categories */}
        <View style={styles.distBox}>
          <View style={styles.distHeader}>
            <Text style={styles.distHeaderHint}>{ar('البنود المحاسبية')}</Text>
            <Text style={styles.distHeaderTitle}>{ar('مجموع البنود')}</Text>
          </View>
          <View style={styles.distTableHead}>
            <Text style={[styles.distTh, styles.distColAmt, { textAlign: 'left' }]}>{ar('المبلغ')}</Text>
            <Text style={[styles.distTh, styles.distColPct]}>{ar('النسبة')}</Text>
            <Text style={[styles.distTh, styles.distColCount]}>{ar('القيود')}</Text>
            <Text style={[styles.distTh, styles.distColName, { textAlign: 'right' }]}>{ar('اسم البند')}</Text>
          </View>
          {byCategory.slice(0, 4).map((c, idx) => {
            const pct = totalCollected > 0 ? ((c.total / totalCollected) * 100).toFixed(1) : '0';
            const isLast = idx === Math.min(byCategory.length, 4) - 1;
            return (
              <View key={c.categoryId} style={[styles.distRow, isLast ? styles.distRowLast : {}]} wrap={false}>
                <View style={styles.distColAmt}>
                  <PdfMoneyText amount={c.total} align="left" style={{ fontSize: 7, fontWeight: 'bold' }} />
                </View>
                <Text style={[styles.distTdMuted, styles.distColPct]}>{ar(`${pct}%`)}</Text>
                <Text style={[styles.distTdMuted, styles.distColCount]}>{pdfFmtNum(c.count)}</Text>
                <Text style={[styles.distTdText, styles.distColName]} numberOfLines={1}>{ar(c.name)}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* 4. Detailed Transactions Table */}
      <View minPresenceAhead={55}>
        <View style={styles.sectionHeaderWrap} wrap={false}>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>{ar(`${pdfFmtNum(totalCount)} قيد تحصيل مسجل`)}</Text>
          </View>
          <Text style={styles.sectionTitle}>{ar('جدول حركة التحصيل الفعلي المودع في الحسابات')}</Text>
        </View>

        <View style={styles.tableCard}>
          <View style={styles.tableHead} wrap={false}>
            <Text style={[styles.thAr, styles.colDesc]}>{ar('البيان / الوصف')}</Text>
            <Text style={[styles.th, styles.colAmt]}>{ar('المبلغ المحصل')}</Text>
            <Text style={[styles.thAr, styles.colBox]}>{ar('طريقة الدفع والخزينة')}</Text>
            <Text style={[styles.thAr, styles.colTenant]}>{ar('المستأجر / المحل')}</Text>
            <Text style={[styles.th, styles.colTargetMonth]}>{ar('فترة الاستحقاق المستهدفة')}</Text>
            <Text style={[styles.th, styles.colDate]}>{ar('تاريخ التسجيل')}</Text>
            <Text style={[styles.th, styles.colNum]}>{ar('الرقم')}</Text>
          </View>

          {items.length === 0 ? (
            <Text style={styles.emptyState}>{ar('لا توجد تحصيلات مسجلة خلال هذه الفترة')}</Text>
          ) : (
            items.map((it, idx) => (
              <View
                key={it.transaction_id}
                style={[styles.tableRow, idx % 2 === 1 ? styles.rowAlt : {}]}
                wrap={false}
              >
                <Text style={[styles.td, styles.colDesc]} numberOfLines={1}>
                  {ar(it.description ?? '—')}
                </Text>
                <View style={styles.colAmt}>
                  <PdfMoneyText amount={it.amount} align="center" style={{ fontSize: 7.5, fontWeight: 'bold' }} />
                </View>
                <Text style={[styles.td, styles.colBox]} numberOfLines={1}>
                  {ar(`${it.cashbox_name}`)}
                </Text>
                <Text style={[styles.tdBold, styles.colTenant]} numberOfLines={1}>
                  {ar(it.contact_name ? `${it.contact_name}${it.shop_number ? ` (${it.shop_number})` : ''}` : '—')}
                </Text>
                <View style={[styles.colTargetMonth, { alignItems: 'center' }]}>
                  {it.target_month_status === 'PRIOR' ? (
                    <Text style={styles.statusBadgePrior}>
                      {ar(`⏳ ${it.target_rent_month || 'شهر سابق'}`)}
                    </Text>
                  ) : it.target_month_status === 'FUTURE' ? (
                    <Text style={styles.statusBadgeFuture}>
                      {ar(it.target_rent_month ? `مقدم: ${it.target_rent_month}` : 'مقدم')}
                    </Text>
                  ) : (
                    <Text style={styles.statusBadgeCurrent}>
                      {ar(it.target_rent_month || 'الشهر الحالي')}
                    </Text>
                  )}
                </View>
                <Text style={[styles.tdMuted, styles.colDate]}>{pdfFmtDate(it.tx_date)}</Text>
                <Text style={[styles.tdMuted, styles.colNum]}>{pdfFmtNum(it.number)}</Text>
              </View>
            ))
          )}
        </View>
      </View>

      {/* 5. Grand Total */}
      <View style={styles.grandTotalWrap} wrap={false}>
        <View style={styles.grandTotalLabelCol}>
          <Text style={styles.grandTotalTitle}>{ar('الإجمالي العام للإيرادات المحصلة في الفترة')}</Text>
          <Text style={styles.grandTotalSub}>
            {ar(
              `يشمل ${pdfFmtNum(priorPeriodCount)} تحصيل لشهور سابقة، و ${pdfFmtNum(currentPeriodCount)} تحصيل لنفس الشهر، و ${pdfFmtNum(futurePeriodCount)} تحصيل مقدم`
            )}
          </Text>
        </View>
        <View style={styles.grandTotalValueCol}>
          <PdfMoneyText
            amount={totalCollected}
            align="right"
            style={{ fontSize: 13, fontWeight: 'bold', color: PDF.primary }}
          />
        </View>
      </View>

      <Text style={pdfBase.caption}>
        {ar('وثيقة رسمية صادرة آلياً من منظومة تاج مول — كشف التحصيلات الفعلية')}
      </Text>
    </ReportShell>
  );
}
