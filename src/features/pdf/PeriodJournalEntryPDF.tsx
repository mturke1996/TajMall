// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arDateMedium } from './arabicPDF';
import { pdfBase, PDF } from './pdfBase';
import { PDF_TABLE_ROW, PDF_AR_CELL, PDF_NUM_CELL } from './pdfTable';
import { PdfMoneyText } from './pdfBrandKit';
import type { PeriodJournalEntryModel } from '@/lib/period-journal-entry';

/**
 * قيد محاسبي ملخّص للفترة — تخطيط نظيف:
 * رأس واحد (بدون تكرار TajMallPdfHeader) + ملخص مكثّف + جدول بنسب ثابتة.
 *
 * ترتيب الأعمدة في JSX (LTR): دائن | مدين | البند | الرمز
 * → القراءة العربية من اليمين: الرمز · البند · مدين · دائن
 */
const COL = {
  code: '11%',
  debit: '14%',
  credit: '14%',
  account: '61%',
} as const;

const s = StyleSheet.create({
  hero: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 8,
    backgroundColor: PDF.logoGreenSoft,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRightWidth: 3,
    borderRightColor: PDF.logoGreen,
    borderRadius: 3,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  heroCell: {
    direction: 'rtl',
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  heroLabel: {
    fontSize: 7.5,
    color: PDF.muted,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'right',
  },
  heroValue: {
    fontSize: 10,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
    lineHeight: 1.35,
  },
  heroValueMuted: {
    fontSize: 8.5,
    color: PDF.muted,
    textAlign: 'right',
    lineHeight: 1.4,
    marginTop: 2,
  },

  tableWrap: {
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tableHead: {
    ...PDF_TABLE_ROW,
    backgroundColor: PDF.headerBg,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  th: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: PDF.white,
  },
  tableRow: {
    ...PDF_TABLE_ROW,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
    alignItems: 'flex-start',
    minHeight: 28,
  },
  rowAlt: {
    backgroundColor: PDF.rowAlt,
  },
  tdAccount: {
    ...PDF_AR_CELL,
    width: COL.account,
    paddingHorizontal: 4,
    paddingTop: 1,
  },
  tdCode: {
    ...PDF_AR_CELL,
    width: COL.code,
    fontSize: 8,
    color: PDF.muted,
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  tdMoney: {
    ...PDF_NUM_CELL,
    paddingTop: 2,
  },
  tdDebit: {
    ...PDF_NUM_CELL,
    width: COL.debit,
    paddingTop: 2,
  },
  tdCredit: {
    ...PDF_NUM_CELL,
    width: COL.credit,
    paddingTop: 2,
  },
  accountName: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
    lineHeight: 1.4,
  },
  accountHint: {
    fontSize: 7,
    color: PDF.muted,
    textAlign: 'right',
    marginTop: 2,
  },
  dash: {
    fontSize: 9,
    color: PDF.muted,
    textAlign: 'center',
  },

  totalBar: {
    direction: 'ltr',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: PDF.primary,
    borderRadius: 3,
  },
  totalBarUnbalanced: {
    backgroundColor: '#991b1b',
  },
  totalLabel: {
    direction: 'rtl',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FBF8F1',
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '52%',
    paddingLeft: 10,
  },
  totalCluster: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    gap: 16,
    flexShrink: 0,
  },
  totalMini: {
    direction: 'rtl',
    alignItems: 'center',
    minWidth: 72,
  },
  totalMiniLabel: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 2,
    textAlign: 'center',
  },

  notes: {
    direction: 'rtl',
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: PDF.border,
    backgroundColor: PDF.mutedBg,
    borderRadius: 3,
  },
  notesText: {
    fontSize: 8,
    color: PDF.muted,
    textAlign: 'right',
    lineHeight: 1.55,
  },

  signRow: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: 28,
    paddingTop: 8,
  },
  signBox: {
    direction: 'rtl',
    width: '30%',
    alignItems: 'center',
  },
  signLabel: {
    fontSize: 8,
    color: PDF.muted,
    marginBottom: 28,
    textAlign: 'center',
  },
  signLine: {
    borderTopWidth: 1,
    borderTopColor: PDF.text,
    width: '100%',
    paddingTop: 4,
  },
  signName: {
    fontSize: 8,
    color: PDF.text,
    textAlign: 'center',
  },

  empty: {
    padding: 32,
    alignItems: 'center',
  },
});

function MoneyCell({
  amount,
  color,
}: {
  amount: number;
  color?: string;
}) {
  if (!amount || amount <= 0) {
    return <Text style={s.dash}>{ar('—')}</Text>;
  }
  return (
    <PdfMoneyText
      amount={amount}
      align="center"
      adaptive
      adaptiveBase={9}
      color={color}
      style={{ fontSize: 9, fontWeight: 'bold', textAlign: 'center' }}
      containerStyle={{ justifyContent: 'center', width: '100%' }}
    />
  );
}

export function PeriodJournalEntryPDF({
  model,
  documentTitle,
}: {
  model: PeriodJournalEntryModel;
  documentTitle?: string;
}) {
  const periodRange = `${arDateMedium(model.startDate)} — ${arDateMedium(model.endDate)}`;

  return (
    <ReportShell
      title="قيد محاسبي للفترة"
      subtitle={model.periodLabel}
      documentTitle={documentTitle}
      periodSummary={{
        eyebrow: 'Period Journal Entry',
        title: model.periodLabel,
        subtitle: `${model.lines.length} بند · ${model.sourceEntryCount} قيد مصدر`,
        hint: model.balanced
          ? 'إجمالي المدين = إجمالي الدائن'
          : 'تنبيه: القيد غير متوازن',
        badge: model.balanced ? 'متوازن' : 'مراجعة',
      }}
      metaCells={[
        {
          label: 'إجمالي المدين',
          moneyAmount: model.totalDebit,
          adaptiveMoney: true,
        },
        {
          label: 'إجمالي الدائن',
          moneyAmount: model.totalCredit,
          adaptiveMoney: true,
        },
      ]}
    >
      <View style={s.hero} wrap={false}>
        <View style={s.heroCell}>
          <Text style={s.heroLabel}>{ar('البنود في القيد')}</Text>
          <Text style={s.heroValue}>{ar(String(model.lines.length))}</Text>
          <Text style={s.heroValueMuted}>
            {ar(`من ${model.sourceLineCount} بند تفصيلي`)}
          </Text>
        </View>
        <View style={s.heroCell}>
          <Text style={s.heroLabel}>{ar('قيود المصدر')}</Text>
          <Text style={s.heroValue}>{ar(String(model.sourceEntryCount))}</Text>
          <Text style={s.heroValueMuted}>{ar('مرحّلة في الفترة')}</Text>
        </View>
        <View style={s.heroCell}>
          <Text style={s.heroLabel}>{ar('نطاق الفترة')}</Text>
          <Text style={s.heroValue}>{periodRange}</Text>
          <Text style={s.heroValueMuted}>{ar(model.description)}</Text>
        </View>
      </View>

      <View style={s.tableWrap}>
        <View style={s.tableHead} wrap={false}>
          <Text style={[s.th, s.tdCredit, { textAlign: 'center' }]}>{ar('دائن')}</Text>
          <Text style={[s.th, s.tdDebit, { textAlign: 'center' }]}>{ar('مدين')}</Text>
          <Text style={[s.th, s.tdAccount]}>{ar('البند المحاسبي')}</Text>
          <Text style={[s.th, s.tdCode]}>{ar('الرمز')}</Text>
        </View>

        {model.lines.length === 0 ? (
          <View style={s.empty}>
            <Text style={pdfBase.tdMuted}>
              {ar('لا توجد حركة محاسبية مرحّلة في هذه الفترة')}
            </Text>
          </View>
        ) : (
          model.lines.map((line, i) => (
            <View
              key={line.category_id}
              style={[s.tableRow, i % 2 !== 0 ? s.rowAlt : {}]}
            >
              <View style={[s.tdMoney, s.tdCredit]}>
                <MoneyCell amount={line.credit} color={PDF.danger} />
              </View>
              <View style={[s.tdMoney, s.tdDebit]}>
                <MoneyCell amount={line.debit} color={PDF.success} />
              </View>
              <View style={s.tdAccount}>
                <Text style={s.accountName}>{ar(line.category_name)}</Text>
                <Text style={s.accountHint}>{ar('إجمالي حركة الفترة')}</Text>
              </View>
              <Text style={s.tdCode}>{ar(line.category_code || '—')}</Text>
            </View>
          ))
        )}
      </View>

      {model.lines.length > 0 ? (
        <View
          style={[s.totalBar, !model.balanced ? s.totalBarUnbalanced : {}]}
          wrap={false}
        >
          <View style={s.totalCluster}>
            <View style={s.totalMini}>
              <Text style={s.totalMiniLabel}>{ar('دائن')}</Text>
              <PdfMoneyText
                amount={model.totalCredit}
                light
                adaptive
                adaptiveBase={11}
                align="center"
                style={{ fontSize: 11, fontWeight: 'bold', color: '#FBF8F1' }}
                currStyle={{ fontSize: 8, color: 'rgba(255,255,255,0.9)' }}
              />
            </View>
            <View style={s.totalMini}>
              <Text style={s.totalMiniLabel}>{ar('مدين')}</Text>
              <PdfMoneyText
                amount={model.totalDebit}
                light
                adaptive
                adaptiveBase={11}
                align="center"
                style={{ fontSize: 11, fontWeight: 'bold', color: '#FBF8F1' }}
                currStyle={{ fontSize: 8, color: 'rgba(255,255,255,0.9)' }}
              />
            </View>
          </View>
          <Text style={s.totalLabel}>
            {ar(
              model.balanced
                ? 'إجمالي القيد المحاسبي (متوازن)'
                : 'إجمالي القيد المحاسبي (غير متوازن)',
            )}
          </Text>
        </View>
      ) : null}

      <View style={s.notes}>
        <Text style={s.notesText}>
          {ar(
            'قيد ملخّص للفترة: كل بند محاسبي يظهر مرة واحدة بمجموع مدينه ودائنه. لا يُسرد القيود الفردية.',
          )}
        </Text>
      </View>

      <View style={s.signRow} wrap={false}>
        <View style={s.signBox}>
          <Text style={s.signLabel}>{ar('المحاسب')}</Text>
          <View style={s.signLine}>
            <Text style={s.signName}>{ar('الاسم والتوقيع')}</Text>
          </View>
        </View>
        <View style={s.signBox}>
          <Text style={s.signLabel}>{ar('المراجع')}</Text>
          <View style={s.signLine}>
            <Text style={s.signName}>{ar('الاسم والتوقيع')}</Text>
          </View>
        </View>
        <View style={s.signBox}>
          <Text style={s.signLabel}>{ar('المدير المالي')}</Text>
          <View style={s.signLine}>
            <Text style={s.signName}>{ar('الاسم والتوقيع')}</Text>
          </View>
        </View>
      </View>
    </ReportShell>
  );
}
