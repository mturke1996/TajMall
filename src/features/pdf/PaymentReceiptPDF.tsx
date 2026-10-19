// @ts-nocheck
/**
 * إيصال دفعة — الورقة التي يحتفظ بها الدافع (مستأجر أو غيره) بعد ترحيل المعاملة.
 * ما يُكتب عليه يأتي كله من src/lib/payment-receipt.ts؛ هنا الرسم فقط.
 */
import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { PdfMoneyText } from './pdfBrandKit';
import { pdfReportTable, PdfReportMoney } from './pdfReportTable';
import type { PaymentReceipt, ReceiptLine } from '@/lib/payment-receipt';

/** كل نص عربي بالاتجاه الصريح: السطر الذي يبدأ برقم أو بحرف لاتيني (اسم محل، مرجع) لا يُعاد ترتيبه */
const RTL = { direction: 'rtl', textAlign: 'right' } as const;

const s = StyleSheet.create({
  hero: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
    backgroundColor: PDF.logoGreenSoft,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRightWidth: 3,
    borderRightColor: PDF.logoGreen,
    borderRadius: 3,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  heroPayer: { flex: 1.35, minWidth: 0, ...RTL },
  heroAmount: { flex: 1, minWidth: 0, ...RTL },
  heroLabel: { fontSize: 7.5, color: PDF.muted, fontWeight: 'bold', marginBottom: 4, ...RTL },
  heroPayerName: { fontSize: 13, fontWeight: 'bold', color: PDF.text, lineHeight: 1.3, ...RTL },
  heroPayerSub: { fontSize: 9, color: PDF.muted, marginTop: 3, ...RTL },

  facts: {
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 3,
    marginBottom: 12,
  },
  fact: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
  },
  factLast: { borderBottomWidth: 0 },
  factLabel: { width: '12%', fontSize: 8, color: PDF.muted, ...RTL },
  factValue: { flex: 1, fontSize: 9.5, fontWeight: 'bold', color: PDF.text, lineHeight: 1.4, ...RTL },

  balance: {
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 3,
    backgroundColor: PDF.mutedBg,
    marginBottom: 12,
  },
  balanceRow: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  balanceDivider: { borderTopWidth: 0.5, borderTopColor: PDF.border },
  balanceLabel: { fontSize: 9.5, fontWeight: 'bold', color: PDF.text, lineHeight: 1.4, ...RTL },
  balanceDetail: { fontSize: 8, color: PDF.muted, marginTop: 2, ...RTL },
  settled: { fontSize: 9.5, color: PDF.text, lineHeight: 1.4, ...RTL },
  balanceAmount: { width: '30%' },

  sign: { marginTop: 36, flexDirection: 'row-reverse', justifyContent: 'space-between' },
  signBox: { width: '38%', borderTopWidth: 0.8, borderTopColor: PDF.text, paddingTop: 5 },
  signText: { fontSize: 9, color: PDF.muted, textAlign: 'center', direction: 'rtl' },
  caption: { fontSize: 8, color: PDF.muted, textAlign: 'center', direction: 'rtl', marginTop: 16, lineHeight: 1.5 },
});

type ColumnKey = 'month' | 'status' | 'value' | 'before' | 'paid' | 'remaining';

/** the columns a receipt needs: a rebuilt-from-history one knows only the amount, a live one knows the whole month */
function columnsFor(lines: ReceiptLine[]): { key: ColumnKey; label: string; weight: number }[] {
  const hasValue = lines.some((l) => l.value != null);
  const hasBefore = lines.some((l) => l.paidBefore > 0);
  const hasRemaining = lines.some((l) => l.remaining != null);
  const cols: { key: ColumnKey; label: string; weight: number }[] = [
    { key: 'month', label: 'الشهر', weight: 28 },
    { key: 'status', label: 'الحالة', weight: 13 },
  ];
  if (hasValue) cols.push({ key: 'value', label: 'قيمة الإيجار', weight: 17 });
  if (hasBefore) cols.push({ key: 'before', label: 'سُدِّد سابقاً', weight: 17 });
  cols.push({ key: 'paid', label: hasValue || hasBefore || hasRemaining ? 'المدفوع الآن' : 'المبلغ', weight: 17 });
  if (hasRemaining) cols.push({ key: 'remaining', label: 'المتبقي', weight: 17 });
  const total = cols.reduce((sum, c) => sum + c.weight, 0);
  return cols.map((c) => ({ ...c, width: `${((c.weight / total) * 100).toFixed(2)}%` }));
}

/** the first column in the list is the right-most on paper; rows are laid out left to right, so they are reversed */
function MonthsTable({ receipt }: { receipt: PaymentReceipt }) {
  const cols = columnsFor(receipt.lines);
  const physical = [...cols].reverse();
  const totalRemaining = receipt.lines.some((l) => l.remaining != null)
    ? receipt.lines.reduce((sum, l) => sum + (l.remaining ?? 0), 0)
    : null;

  const cell = (col, line: ReceiptLine) => {
    const box = { width: col.width };
    switch (col.key) {
      case 'month':
        return <Text style={[pdfReportTable.tdAr, box, { fontWeight: 'bold' }]}>{ar(line.label)}</Text>;
      case 'status':
        return <Text style={[pdfReportTable.td, box, { textAlign: 'center', direction: 'rtl' }]}>{ar(line.statusLabel)}</Text>;
      case 'value':
        return <View style={[pdfReportTable.tdNum, box]}>{line.value != null ? <PdfReportMoney amount={line.value} /> : <PdfReportMoney amount={0} />}</View>;
      case 'before':
        return <View style={[pdfReportTable.tdNum, box]}><PdfReportMoney amount={line.paidBefore} /></View>;
      case 'paid':
        return <View style={[pdfReportTable.tdNum, box]}><PdfReportMoney amount={line.paid} bold /></View>;
      case 'remaining':
        return <View style={[pdfReportTable.tdNum, box]}><PdfReportMoney amount={line.remaining ?? 0} /></View>;
    }
  };

  return (
    <View style={pdfReportTable.tableWrap}>
      <View style={pdfReportTable.tableHead} wrap={false} fixed>
        {physical.map((c) => (
          <Text key={c.key} style={[c.key === 'month' ? pdfReportTable.thAr : pdfReportTable.th, { width: c.width, direction: 'rtl' }]}>
            {ar(c.label)}
          </Text>
        ))}
      </View>
      {receipt.lines.map((line, i) => (
        <View key={i} style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]} wrap={false}>
          {physical.map((c) => (
            <React.Fragment key={c.key}>{cell(c, line)}</React.Fragment>
          ))}
        </View>
      ))}
      <View style={pdfReportTable.totalsRow} wrap={false}>
        {physical.map((c) => (
          <View key={c.key} style={{ width: c.width }}>
            {c.key === 'month' ? (
              <Text style={[pdfReportTable.totalsRowLabel, RTL]}>{ar('الإجمالي')}</Text>
            ) : c.key === 'paid' ? (
              <PdfReportMoney amount={receipt.total} bold showZero />
            ) : c.key === 'remaining' && totalRemaining != null ? (
              <PdfReportMoney amount={totalRemaining} bold showZero />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function Balance({ receipt }: { receipt: PaymentReceipt }) {
  const { balance, otherOwed } = receipt;
  if (!balance && !otherOwed) return null;
  return (
    <View style={s.balance} wrap={false}>
      {balance?.kind === 'remaining' ? (
        <View style={s.balanceRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.balanceLabel}>{ar(balance.label)}</Text>
          </View>
          <View style={s.balanceAmount}>
            <PdfMoneyText amount={balance.amount} align="center" style={{ fontSize: 12, fontWeight: 'bold' }} />
          </View>
        </View>
      ) : balance?.kind === 'settled' ? (
        <View style={s.balanceRow}>
          <Text style={s.settled}>{ar(balance.text)}</Text>
        </View>
      ) : null}
      {otherOwed ? (
        <View style={[s.balanceRow, balance ? s.balanceDivider : {}]}>
          <View style={{ flex: 1 }}>
            <Text style={s.balanceLabel}>{ar(otherOwed.label)}</Text>
            <Text style={s.balanceDetail}>{ar(otherOwed.detail)}</Text>
          </View>
          <View style={s.balanceAmount}>
            <PdfMoneyText amount={otherOwed.amount} align="center" style={{ fontSize: 10.5, fontWeight: 'bold' }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function PaymentReceiptPDF({ receipt }: { receipt: PaymentReceipt }) {
  const isRent = receipt.kind === 'rent';
  const facts = [
    !isRent && receipt.category ? { label: 'البند', value: receipt.category } : null,
    receipt.purpose ? { label: 'البيان', value: receipt.purpose } : null,
    receipt.source ? { label: receipt.sourceLabel, value: receipt.source } : null,
    receipt.methodDetail ? { label: 'بيانات الصك', value: receipt.methodDetail } : null,
    receipt.reference ? { label: 'المرجع', value: receipt.reference } : null,
  ].filter(Boolean);

  return (
    <ReportShell
      title={receipt.title}
      subtitle={receipt.statusNote}
      documentTitle={[receipt.title, receipt.number].filter(Boolean).join(' ')}
      summaryPrimaryDateIso={receipt.date}
      summaryPrimaryDateLabel={isRent ? 'تاريخ التحصيل' : 'تاريخ الاستلام'}
      metaCells={[
        receipt.number ? { label: 'رقم الإيصال', value: receipt.number } : null,
        { label: 'طريقة الدفع', value: receipt.methodLabel },
      ].filter(Boolean)}
    >
      <View style={s.hero} wrap={false}>
        <View style={s.heroPayer}>
          <Text style={s.heroLabel}>{ar(isRent ? 'استلمنا من المستأجر' : 'استلمنا من')}</Text>
          <Text style={s.heroPayerName}>{ar(receipt.payer.name ?? '—')}</Text>
          {receipt.payer.shopNumber ? <Text style={s.heroPayerSub}>{ar(`محل ${receipt.payer.shopNumber}`)}</Text> : null}
        </View>
        <View style={s.heroAmount}>
          <Text style={s.heroLabel}>{ar('المبلغ المستلم')}</Text>
          <PdfMoneyText amount={receipt.total} align="left" adaptive adaptiveBase={20} style={{ fontSize: 20, fontWeight: 'bold' }} />
        </View>
      </View>

      {facts.length > 0 ? (
        <View style={s.facts} wrap={false}>
          {facts.map((f, i) => (
            <View key={f.label} style={[s.fact, i === facts.length - 1 ? s.factLast : {}]}>
              <Text style={s.factLabel}>{ar(f.label)}</Text>
              <Text style={s.factValue}>{ar(f.value)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {receipt.lines.length > 0 ? (
        <>
          <Text style={pdfReportTable.sectionTitle} minPresenceAhead={80}>
            {ar('الأشهر المسدَّدة')}
          </Text>
          <MonthsTable receipt={receipt} />
        </>
      ) : null}

      <Balance receipt={receipt} />

      {/* the signatures and the closing line move together, and never into the footer */}
      <View minPresenceAhead={120} />
      <View wrap={false}>
        <View style={s.sign}>
          <View style={s.signBox}>
            <Text style={s.signText}>{ar('المستلم')}</Text>
          </View>
          <View style={s.signBox}>
            <Text style={s.signText}>{ar('الدافع')}</Text>
          </View>
        </View>
        <Text style={s.caption}>
          {ar(
            receipt.txNumber
              ? `يُثبت هذا الإيصال استلام المبلغ المذكور وفق المعاملة المرحّلة رقم ${receipt.txNumber} في منظومة تاج مول.`
              : 'يُثبت هذا الإيصال استلام المبلغ المذكور وفق المعاملة المرحّلة في منظومة تاج مول.',
          )}
        </Text>
      </View>
    </ReportShell>
  );
}
