// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arDateParts } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PdfMoneyText } from './pdfBrandKit';

const s = StyleSheet.create({
  grid: {
    direction: 'rtl',
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 4,
  },
  row: {
    direction: 'rtl',
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  label: { width: '35%', fontSize: 9, color: PDF.muted, textAlign: 'right' },
  value: { flex: 1, fontSize: 10, color: PDF.text, textAlign: 'right', fontWeight: 'bold' },
  amountBox: {
    marginTop: 16,
    padding: 14,
    backgroundColor: PDF.logoGreenSoft,
    borderTopWidth: 2,
    borderTopColor: PDF.primary,
    alignItems: 'center',
  },
  amountLabel: { fontSize: 9, color: PDF.muted, marginBottom: 4 },
  notes: { marginTop: 12, fontSize: 8.5, color: PDF.muted, lineHeight: 1.5 },
});

const TYPE_AR: Record<string, string> = {
  RENT: 'إيجار محل',
  SERVICE: 'خدمات وصيانة',
  FINE: 'غرامة مالية',
  OTHER: 'رسوم أخرى',
};

const STATUS_AR: Record<string, string> = {
  UNPAID: 'مستحق الدفع',
  PARTIAL: 'مسدد جزئياً',
  PAID: 'مسدد بالكامل',
};

export type TenantChargeInvoicePdfProps = {
  charge: {
    description: string;
    type: string;
    due_date: string;
    amount: number;
    total_paid: number;
    status: string;
    tenant_name: string;
    shop_number: string | null;
    unit_floor: string | null;
    phone: string | null;
  };
};

export function TenantChargeInvoicePDF({ charge }: TenantChargeInvoicePdfProps) {
  const remaining = Math.max(0, charge.amount - charge.total_paid);
  const dueParts = arDateParts(charge.due_date);

  return (
    <ReportShell
      title="فاتورة / مطالبة مالية"
      subtitle="مستند استحقاق للمستأجر — تاج مول"
      summaryPrimaryDateIso={`${charge.due_date}T12:00:00.000Z`}
      summaryPrimaryDateLabel="تاريخ الاستحقاق"
      metaCells={[
        { label: 'المستأجر', value: charge.tenant_name },
        { label: 'المحل', value: charge.shop_number ? `محل ${charge.shop_number}` : '—' },
        { label: 'الحالة', value: STATUS_AR[charge.status] || charge.status },
      ]}
    >
      <View style={s.grid}>
        <View style={s.row}>
          <Text style={s.label}>{ar('نوع الرسم')}</Text>
          <Text style={s.value}>{ar(TYPE_AR[charge.type] || charge.type)}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>{ar('البيان')}</Text>
          <Text style={s.value}>{ar(charge.description)}</Text>
        </View>
        {charge.phone ? (
          <View style={s.row}>
            <Text style={s.label}>{ar('الهاتف')}</Text>
            <Text style={[s.value, { direction: 'ltr' }]}>{charge.phone}</Text>
          </View>
        ) : null}
        {charge.unit_floor ? (
          <View style={s.row}>
            <Text style={s.label}>{ar('الطابق')}</Text>
            <Text style={s.value}>{ar(charge.unit_floor)}</Text>
          </View>
        ) : null}
        <View style={s.row}>
          <Text style={s.label}>{ar('تاريخ الاستحقاق')}</Text>
          <Text style={s.value}>
            {dueParts ? `${dueParts.day} ${dueParts.monthYear}` : charge.due_date}
          </Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>{ar('المبلغ المدفوع')}</Text>
          <View style={s.value}>
            <PdfMoneyText amount={charge.total_paid} />
          </View>
        </View>
      </View>

      <View style={s.amountBox}>
        <Text style={s.amountLabel}>{ar('المبلغ المستحق للسداد')}</Text>
        <PdfMoneyText amount={remaining > 0 ? remaining : charge.amount} style={{ fontSize: 18, fontWeight: 'bold' }} />
      </View>

      <Text style={s.notes}>
        {ar(
          'يرجى سداد المبلغ في موعد الاستحقاق. للاستفسار تواصل مع إدارة المول. هذا المستند مُولَّد من نظام تاج مول ولا يغني عن الإيصال الرسمي عند التحصيل.',
        )}
      </Text>
    </ReportShell>
  );
}
