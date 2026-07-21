// @ts-nocheck
/**
 * تقرير المستأجرين وإيجارات المحلات — عربي مع خط Tajawal والنص المنطقي.
 *
 * عند فلتر سنة/ربع/نصف + حالة دفع (مدفوع/جزئي/غير مدفوع):
 * تُعرض أرقام الشهور المطابقة بدل أعمدة المبالغ.
 */
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText, pdfFmtNum } from './pdfBrandKit';
import { PDF_TABLE_ROW } from './pdfTable';
import type { TenantRentSummary } from '@/lib/db/queries';
import {
  formatMonthNumbersList,
  tenantPeriodExpectedRent,
  tenantPeriodPaid,
  tenantsReportPeriodSummary,
  type TenantsReportPeriodContext,
} from '@/lib/tenant-rent-period';

const STATUS_AR: Record<string, string> = {
  paid_full: 'مدفوع',
  paid_partial: 'جزئي',
  unpaid: 'غير مدفوع',
  no_rent_set: 'بلا إيجار',
  exempt: 'بدون مطالبة',
};

const col = StyleSheet.create({
  row: {
    ...PDF_TABLE_ROW,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  rowAlt: { backgroundColor: PDF.rowAlt },
  head: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.headerBg,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  th: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold', textAlign: 'center' },
  thAr: { color: PDF.white, fontSize: 8.5, fontWeight: 'bold', textAlign: 'right' },
  td: { fontSize: 8.5, color: PDF.text, textAlign: 'right' },
  tdMuted: { fontSize: 8, color: PDF.muted, textAlign: 'center' },
  tdMonths: {
    fontSize: 10,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'center',
    lineHeight: 1.4,
  },
  shop: { width: '13%' },
  tenant: { flex: 1, paddingHorizontal: 4 },
  rent: { width: '14%', minWidth: 0 },
  paid: { width: '14%', minWidth: 0 },
  remaining: { width: '14%', minWidth: 0 },
  /** عمود أرقام الشهور بدل المبالغ الثلاثة */
  months: { width: '42%', minWidth: 0, paddingHorizontal: 4 },
  status: { width: '15%' },
  phone: { width: '15%' },
  foot: {
    ...PDF_TABLE_ROW,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
  },
  footHint: {
    fontSize: 7,
    color: PDF.muted,
    textAlign: 'center',
    marginBottom: 2,
  },
  footLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
  },
});

const kpi = StyleSheet.create({
  strip: {
    marginTop: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: PDF.white,
  },
  header: {
    backgroundColor: PDF.primary,
    paddingVertical: 7,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'right',
  },
  headerBadge: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: PDF.primary,
    backgroundColor: '#fff',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 2,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row-reverse',
    direction: 'ltr',
    borderTopWidth: 1,
    borderTopColor: PDF.border,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderLeftColor: PDF.border,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  cellFirst: {
    borderLeftWidth: 0,
  },
  label: {
    fontSize: 7,
    fontWeight: 'bold',
    color: PDF.muted,
    textAlign: 'right',
    marginBottom: 5,
  },
  valueText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
  },
});

export type TenantsReportPdfProps = {
  titleAr: string;
  subtitleAr?: string;
  rows: TenantRentSummary[];
  period: TenantsReportPeriodContext;
  /**
   * مستأجر → أرقام الشهور المطابقة لفلتر الحالة.
   * عند توفره مع showMonthNumbers يُعرض عمود الشهور بدل المبالغ.
   */
  monthNumbersByTenantId?: Record<string, number[]>;
};

function PeriodTotalsStrip({
  period,
  totalExpected,
  totalCollected,
  totalOutstanding,
  collectionRate,
  tenantCount,
  totalMatchingMonths,
}: {
  period: TenantsReportPeriodContext;
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
  tenantCount: number;
  totalMatchingMonths: number;
}) {
  const scopeLabel =
    period.monthCount > 1
      ? `مجموع ${period.monthCount} أشهر · ${period.periodRangeAr}`
      : period.periodRangeAr;

  if (period.showMonthNumbers) {
    return (
      <View style={kpi.strip} wrap={false}>
        <View style={kpi.header}>
          <Text style={kpi.headerTitle}>
            {ar(
              `ملخّص الشهور — ${period.statusFilterLabel ?? 'الحالة'} · ${scopeLabel}`,
            )}
          </Text>
          <Text style={kpi.headerBadge}>{ar(period.modeLabelAr)}</Text>
        </View>
        <View style={kpi.row}>
          <View style={[kpi.cell, kpi.cellFirst]}>
            <Text style={kpi.label}>{ar('عدد المستأجرين')}</Text>
            <Text style={kpi.valueText}>{pdfFmtNum(tenantCount)}</Text>
          </View>
          <View style={kpi.cell}>
            <Text style={kpi.label}>{ar('إجمالي الشهور المطابقة')}</Text>
            <Text style={kpi.valueText}>{pdfFmtNum(totalMatchingMonths)}</Text>
          </View>
          <View style={kpi.cell}>
            <Text style={kpi.label}>{ar('الحالة')}</Text>
            <Text style={kpi.valueText}>
              {ar(period.statusFilterLabel ?? '—')}
            </Text>
          </View>
          <View style={kpi.cell}>
            <Text style={kpi.label}>{ar('الفترة')}</Text>
            <Text style={kpi.valueText}>{ar(period.periodShortAr)}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={kpi.strip} wrap={false}>
      <View style={kpi.header}>
        <Text style={kpi.headerTitle}>{ar(`ملخّص مالي — ${scopeLabel}`)}</Text>
        <Text style={kpi.headerBadge}>{ar(period.modeLabelAr)}</Text>
      </View>
      <View style={kpi.row}>
        <View style={[kpi.cell, kpi.cellFirst]}>
          <Text style={kpi.label}>{ar('إجمالي المطالبات')}</Text>
          <PdfMoneyText
            amount={totalExpected}
            align="right"
            adaptive
            adaptiveBase={12}
            containerStyle={{ justifyContent: 'flex-start' }}
          />
        </View>
        <View style={kpi.cell}>
          <Text style={kpi.label}>{ar('إجمالي المحصل')}</Text>
          <PdfMoneyText
            amount={totalCollected}
            align="right"
            adaptive
            adaptiveBase={12}
            color={PDF.success}
            containerStyle={{ justifyContent: 'flex-start' }}
          />
        </View>
        <View style={kpi.cell}>
          <Text style={kpi.label}>{ar('المتبقي')}</Text>
          <PdfMoneyText
            amount={totalOutstanding}
            align="right"
            adaptive
            adaptiveBase={12}
            color={totalOutstanding > 0 ? PDF.danger : PDF.text}
            containerStyle={{ justifyContent: 'flex-start' }}
          />
        </View>
        <View style={kpi.cell}>
          <Text style={kpi.label}>{ar('معدل التحصيل')}</Text>
          <Text style={kpi.valueText}>{`${collectionRate.toFixed(1)}%`}</Text>
        </View>
      </View>
    </View>
  );
}

function TableMoney({
  amount,
  bold = false,
  color,
}: {
  amount: number;
  bold?: boolean;
  color?: string;
}) {
  return (
    <PdfMoneyText
      amount={amount}
      align="center"
      adaptive
      adaptiveBase={bold ? 10 : 8.5}
      color={color}
      style={bold ? { fontWeight: 'bold' } : undefined}
      containerStyle={{ justifyContent: 'center' }}
    />
  );
}

export function TenantsReportPDF({
  titleAr,
  subtitleAr,
  rows,
  period,
  monthNumbersByTenantId,
}: TenantsReportPdfProps) {
  const showMonths = !!period.showMonthNumbers && !!monthNumbersByTenantId;
  const totalExpected = rows.reduce((s, r) => s + tenantPeriodExpectedRent(r), 0);
  const totalCollected = rows.reduce((s, r) => s + tenantPeriodPaid(r), 0);
  const totalOutstanding = Math.max(0, totalExpected - totalCollected);
  const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;
  const periodSummary = tenantsReportPeriodSummary(period);
  const totalMatchingMonths = showMonths
    ? rows.reduce(
        (s, r) => s + (monthNumbersByTenantId?.[r.id]?.length ?? 0),
        0,
      )
    : 0;

  const rentColumnLabel =
    period.monthCount > 1 ? ar('إيجار الفترة') : ar('الإيجار');

  const monthsColumnLabel = period.statusFilterLabel
    ? ar(`شهور ${period.statusFilterLabel}`)
    : ar('أرقام الشهور');

  return (
    <ReportShell
      title={titleAr}
      subtitle={subtitleAr}
      periodSummary={periodSummary}
      metaCells={
        showMonths
          ? [
              { label: 'عدد المستأجرين', value: pdfFmtNum(rows.length) },
              {
                label: 'إجمالي الشهور',
                value: pdfFmtNum(totalMatchingMonths),
              },
              {
                label: 'الحالة',
                value: period.statusFilterLabel ?? '—',
              },
              {
                label: 'الفترة',
                value: period.periodLabelAr,
              },
            ]
          : [
              { label: 'عدد المستأجرين', value: pdfFmtNum(rows.length) },
              {
                label: 'إجمالي المطالبات',
                moneyAmount: totalExpected,
                adaptiveMoney: true,
              },
              {
                label: 'إجمالي المحصل',
                moneyAmount: totalCollected,
                adaptiveMoney: true,
              },
              {
                label: 'المتبقي',
                moneyAmount: totalOutstanding,
                adaptiveMoney: true,
              },
            ]
      }
    >
      <PeriodTotalsStrip
        period={period}
        totalExpected={totalExpected}
        totalCollected={totalCollected}
        totalOutstanding={totalOutstanding}
        collectionRate={collectionRate}
        tenantCount={rows.length}
        totalMatchingMonths={totalMatchingMonths}
      />

      <Text style={pdfBase.sectionTitle}>
        {ar(
          showMonths
            ? `تفاصيل الشهور — ${period.periodLabelAr} · ${period.statusFilterLabel ?? ''}`
            : period.monthCount > 1
              ? `تفاصيل المستأجرين — ${period.periodLabelAr}`
              : 'تفاصيل إيجارات المستأجرين',
        )}
      </Text>

      {showMonths ? (
        <>
          <View style={col.head} wrap={false}>
            <Text style={[col.th, col.phone]}>{ar('الهاتف')}</Text>
            <Text style={[col.th, col.status]}>{ar('الحالة')}</Text>
            <Text style={[col.th, col.months]}>{monthsColumnLabel}</Text>
            <Text style={[col.thAr, col.tenant]}>{ar('المستأجر')}</Text>
            <Text style={[col.th, col.shop]}>{ar('المحل')}</Text>
          </View>

          {rows.map((r, i) => {
            const months = monthNumbersByTenantId?.[r.id] ?? [];
            const shopLabel = r.shop_number
              ? r.floor
                ? `${r.shop_number} (ط ${r.floor})`
                : r.shop_number
              : '—';

            return (
              <View
                key={r.id}
                style={[col.row, i % 2 === 1 ? col.rowAlt : {}]}
                wrap={false}
              >
                <Text style={[col.tdMuted, col.phone]}>{ar(r.phone ?? '—')}</Text>
                <Text style={[col.tdMuted, col.status]}>
                  {ar(STATUS_AR[r.current_month_status] ?? r.current_month_status)}
                </Text>
                <Text style={[col.tdMonths, col.months]}>
                  {ar(formatMonthNumbersList(months))}
                </Text>
                <Text style={[col.td, col.tenant]}>{ar(r.name)}</Text>
                <Text style={[col.tdMuted, col.shop]}>{ar(shopLabel)}</Text>
              </View>
            );
          })}

          <View style={col.foot} wrap={false}>
            <Text style={col.phone} />
            <Text style={col.status} />
            <View style={col.months}>
              <Text style={col.footHint}>{ar('إجمالي الشهور')}</Text>
              <Text style={col.tdMonths}>{pdfFmtNum(totalMatchingMonths)}</Text>
            </View>
            <Text style={[col.footLabel, col.tenant]}>
              {ar(`إجمالي ${period.periodShortAr}`)}
            </Text>
            <Text style={[col.tdMuted, col.shop]}>{pdfFmtNum(rows.length)}</Text>
          </View>
        </>
      ) : (
        <>
          <View style={col.head} wrap={false}>
            <Text style={[col.th, col.phone]}>{ar('الهاتف')}</Text>
            <Text style={[col.th, col.status]}>{ar('الحالة')}</Text>
            <Text style={[col.th, col.remaining]}>{ar('المتبقي')}</Text>
            <Text style={[col.th, col.paid]}>{ar('المسدد')}</Text>
            <Text style={[col.th, col.rent]}>{rentColumnLabel}</Text>
            <Text style={[col.thAr, col.tenant]}>{ar('المستأجر')}</Text>
            <Text style={[col.th, col.shop]}>{ar('المحل')}</Text>
          </View>

          {rows.map((r, i) => {
            const rent = tenantPeriodExpectedRent(r);
            const paid = tenantPeriodPaid(r);
            const remaining = Math.max(0, rent - paid);
            const shopLabel = r.shop_number
              ? r.floor
                ? `${r.shop_number} (ط ${r.floor})`
                : r.shop_number
              : '—';

            return (
              <View
                key={r.id}
                style={[col.row, i % 2 === 1 ? col.rowAlt : {}]}
                wrap={false}
              >
                <Text style={[col.tdMuted, col.phone]}>{ar(r.phone ?? '—')}</Text>
                <Text style={[col.tdMuted, col.status]}>
                  {ar(STATUS_AR[r.current_month_status] ?? r.current_month_status)}
                </Text>
                <View style={col.remaining}>
                  <TableMoney amount={remaining} />
                </View>
                <View style={col.paid}>
                  <TableMoney amount={paid} />
                </View>
                <View style={col.rent}>
                  <TableMoney amount={rent} />
                </View>
                <Text style={[col.td, col.tenant]}>{ar(r.name)}</Text>
                <Text style={[col.tdMuted, col.shop]}>{ar(shopLabel)}</Text>
              </View>
            );
          })}

          <View style={col.foot} wrap={false}>
            <Text style={col.phone} />
            <Text style={col.status} />
            <View style={col.remaining}>
              <Text style={col.footHint}>{ar('متبقي')}</Text>
              <TableMoney amount={totalOutstanding} bold />
            </View>
            <View style={col.paid}>
              <Text style={col.footHint}>{ar('محصّل')}</Text>
              <TableMoney amount={totalCollected} bold color={PDF.success} />
            </View>
            <View style={col.rent}>
              <Text style={col.footHint}>{ar('مطلوب')}</Text>
              <TableMoney amount={totalExpected} bold />
            </View>
            <Text style={[col.footLabel, col.tenant]}>
              {ar(period.monthCount > 1 ? `إجمالي ${period.periodShortAr}` : 'إجمالي الفترة')}
            </Text>
            <Text style={[col.tdMuted, col.shop]}>{pdfFmtNum(rows.length)}</Text>
          </View>
        </>
      )}

      <Text style={pdfBase.caption}>
        {ar(
          showMonths
            ? `وثيقة مُولَّدة آلياً · ${period.periodLabelAr} · أرقام الشهور بحالة: ${period.statusFilterLabel ?? '—'}`
            : period.statusFilterLabel
              ? `وثيقة مُولَّدة آلياً · ${period.periodLabelAr} · عرض: ${period.statusFilterLabel} فقط`
              : `وثيقة مُولَّدة آلياً · ${period.periodLabelAr} (${period.periodRangeAr})`,
        )}
      </Text>
    </ReportShell>
  );
}
