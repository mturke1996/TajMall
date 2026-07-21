// @ts-nocheck
import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar, arDateMedium } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { PdfAccountingLetterhead } from './pdfBrandKit';
import { accountTypeLabelAr } from '@/lib/accounting-labels';
import type { PeriodJournalEntryModel, PeriodJournalLine } from '@/lib/period-journal-entry';
import { periodJournalGrossMovement } from '@/lib/period-journal-entry';

/**
 * قيد محاسبي ملخّص للفترة — تنسيق ميزان مراجعة:
 * - ترويسة: اسم المنشأة + عنوان الوثيقة + الفترة
 * - جدول: رمز | البند | النوع | مدين | دائن | الصافي
 * - إجماليات بخط مزدوج (معيار المحاسبة المزدوجة)
 *
 * ترتيب الأعمدة في JSX (LTR): صافي | دائن | مدين | النوع | البند | الرمز
 */
const W = {
  net: '12%',
  credit: '13%',
  debit: '13%',
  type: '11%',
  name: '38%',
  code: '13%',
} as const;

const ACCOUNT_SECTION_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;

const s = StyleSheet.create({
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
    marginTop: 24,
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
    padding: 28,
    alignItems: 'center',
  },
});

function groupLinesByAccountType(lines: PeriodJournalLine[]) {
  const groups = new Map<string, PeriodJournalLine[]>();
  for (const line of lines) {
    const key = line.category_type ?? 'OTHER';
    const bucket = groups.get(key) ?? [];
    bucket.push(line);
    groups.set(key, bucket);
  }
  return ACCOUNT_SECTION_ORDER.filter((t) => groups.has(t)).map((type) => ({
    type,
    label: accountTypeLabelAr(type),
    lines: groups.get(type) ?? [],
  }));
}

function PeriodJournalTable({
  lines,
  singleCategory,
}: {
  lines: PeriodJournalLine[];
  singleCategory: boolean;
}) {
  const sections = singleCategory
    ? [{ type: 'ONE', label: '', lines }]
    : groupLinesByAccountType(lines);

  return (
    <View style={pdfReportTable.tableWrap}>
      <View style={pdfReportTable.tableHead} wrap={false}>
        <Text style={[pdfReportTable.th, { width: W.net }]}>{ar('الصافي')}</Text>
        <Text style={[pdfReportTable.th, { width: W.credit }]}>{ar('دائن')}</Text>
        <Text style={[pdfReportTable.th, { width: W.debit }]}>{ar('مدين')}</Text>
        <Text style={[pdfReportTable.th, { width: W.type }]}>{ar('النوع')}</Text>
        <Text style={[pdfReportTable.thAr, { width: W.name }]}>{ar('البند المحاسبي')}</Text>
        <Text style={[pdfReportTable.thAr, { width: W.code }]}>{ar('الرمز')}</Text>
      </View>

      {lines.length === 0 ? (
        <View style={s.empty}>
          <Text style={pdfReportTable.tdMuted}>
            {ar('لا توجد حركة محاسبية مرحّلة في هذه الفترة')}
          </Text>
        </View>
      ) : (
        sections.map((section) => (
          <React.Fragment key={section.type}>
            {!singleCategory && section.label ? (
              <View style={pdfReportTable.sectionBand} wrap={false}>
                <Text style={pdfReportTable.sectionBandText}>
                  {ar(section.label)}
                </Text>
              </View>
            ) : null}
            {section.lines.map((line, i) => (
              <View
                key={line.category_id}
                style={[
                  pdfReportTable.tableRow,
                  i % 2 === 1 ? pdfReportTable.rowAlt : {},
                ]}
              >
                <View style={[pdfReportTable.tdNum, { width: W.net }]}>
                  <PdfReportMoney amount={Math.abs(line.net)} bold />
                </View>
                <View style={[pdfReportTable.tdNum, { width: W.credit }]}>
                  <PdfReportMoney amount={line.credit} color={PDF.danger} />
                </View>
                <View style={[pdfReportTable.tdNum, { width: W.debit }]}>
                  <PdfReportMoney amount={line.debit} color={PDF.success} />
                </View>
                <Text style={[pdfReportTable.tdMuted, { width: W.type, fontSize: 7.5 }]}>
                  {ar(accountTypeLabelAr(line.category_type))}
                </Text>
                <Text style={[pdfReportTable.tdAr, { width: W.name }]}>
                  {ar(line.category_name)}
                </Text>
                <Text style={[pdfReportTable.tdMuted, { width: W.code }]}>
                  {ar(line.category_code || '—')}
                </Text>
              </View>
            ))}
          </React.Fragment>
        ))
      )}

      {lines.length > 0 ? (
        <View style={pdfReportTable.totalsRow} wrap={false}>
          <View style={[pdfReportTable.tdNum, { width: W.net }]}>
            <PdfReportMoney
              amount={Math.abs(
                lines.reduce((sum, l) => sum + l.debit, 0) -
                  lines.reduce((sum, l) => sum + l.credit, 0),
              )}
              bold
            />
          </View>
          <View style={[pdfReportTable.tdNum, { width: W.credit }]}>
            <PdfReportMoney
              amount={lines.reduce((sum, l) => sum + l.credit, 0)}
              bold
              color={PDF.danger}
            />
          </View>
          <View style={[pdfReportTable.tdNum, { width: W.debit }]}>
            <PdfReportMoney
              amount={lines.reduce((sum, l) => sum + l.debit, 0)}
              bold
              color={PDF.success}
            />
          </View>
          <Text style={[pdfReportTable.tdMuted, { width: W.type }]}>{ar('')}</Text>
          <Text style={[pdfReportTable.totalsRowLabel, { width: W.name }]}>
            {ar('الإجمالي')}
          </Text>
          <Text style={[pdfReportTable.tdMuted, { width: W.code }]}>{ar('')}</Text>
        </View>
      ) : null}
    </View>
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
  const singleCategory = model.categoryFilter;
  const isFullPeriod = !singleCategory;
  const grossMovement = periodJournalGrossMovement(model.totalDebit, model.totalCredit);
  const statusLabel =
    model.statusFilter === 'POSTED'
      ? 'قيود مرحّلة'
      : model.statusFilter === 'ALL'
        ? 'كل الحالات'
        : model.statusFilter;

  const titleAr = singleCategory
    ? `كشف بند — ${singleCategory.name_ar}`
    : 'قيد محاسبي ملخّص للفترة';
  const titleEn = singleCategory
    ? 'Account Activity Summary'
    : 'Consolidated Period Journal Entry';

  return (
    <ReportShell
      title={titleAr}
      subtitle={model.periodLabel}
      documentTitle={documentTitle}
      showHeader={false}
      showSummary={false}
    >
      <PdfAccountingLetterhead
        titleAr={titleAr}
        titleEn={titleEn}
        subtitle={model.periodLabel}
        periodRange={`الفترة: ${periodRange} · العملة: د.ل`}
        refLine={`${model.sourceEntryCount} قيد مصدر · ${model.sourceLineCount} بند تفصيلي · ${statusLabel}`}
      />

      <View style={pdfReportTable.docInfoStrip} wrap={false}>
        <View style={pdfReportTable.docInfoCell}>
          <Text style={pdfReportTable.docInfoLabel}>{ar('إجمالي المدين')}</Text>
          <PdfReportMoney amount={model.totalDebit} bold />
        </View>
        <View style={pdfReportTable.docInfoCell}>
          <Text style={pdfReportTable.docInfoLabel}>{ar('إجمالي الدائن')}</Text>
          <PdfReportMoney amount={model.totalCredit} bold />
        </View>
        <View style={pdfReportTable.docInfoCell}>
          <Text style={pdfReportTable.docInfoLabel}>
            {ar(isFullPeriod ? 'حالة التوازن' : 'إجمالي الحركة')}
          </Text>
          <Text style={pdfReportTable.docInfoValue}>
            {ar(
              isFullPeriod
                ? model.balanced
                  ? 'متوازن (مدين = دائن)'
                  : 'غير متوازن — مراجعة'
                : grossMovement > 0
                  ? `${grossMovement.toLocaleString('en-US')} د.ل`
                  : 'لا حركة في الفترة',
            )}
          </Text>
        </View>
        <View style={pdfReportTable.docInfoCell}>
          <Text style={pdfReportTable.docInfoLabel}>{ar('عدد البنود')}</Text>
          <Text style={pdfReportTable.docInfoValue}>
            {ar(String(model.lines.length))}
          </Text>
        </View>
      </View>

      <Text style={pdfReportTable.sectionTitle}>
        {ar(
          singleCategory
            ? 'حركة البند خلال الفترة'
            : 'جدول البنود — ترتيب المعادلة المحاسبية',
        )}
      </Text>

      {model.lines.length > 0 ? (
        <>
          <PeriodJournalTable
            lines={model.lines}
            singleCategory={!!singleCategory}
          />

          <View
            style={[
              pdfReportTable.totalBar,
              isFullPeriod && !model.balanced ? pdfReportTable.totalBarWarn : {},
            ]}
            wrap={false}
          >
            <View style={pdfReportTable.totalCluster}>
              <View style={pdfReportTable.totalMini}>
                <Text style={pdfReportTable.totalMiniLabel}>{ar('دائن')}</Text>
                <PdfReportMoney amount={model.totalCredit} bold light />
              </View>
              <View style={pdfReportTable.totalMini}>
                <Text style={pdfReportTable.totalMiniLabel}>{ar('مدين')}</Text>
                <PdfReportMoney amount={model.totalDebit} bold light />
              </View>
            </View>
            <Text style={pdfReportTable.totalLabel}>
              {ar(
                singleCategory
                  ? `إجمالي حركة البند — ${grossMovement.toLocaleString('en-US')} د.ل`
                  : model.balanced
                    ? 'إجمالي القيد — متوازن'
                    : 'إجمالي القيد — يتطلب مراجعة',
              )}
            </Text>
          </View>
        </>
      ) : singleCategory ? (
        <View style={s.empty}>
          <Text style={pdfReportTable.tdMuted}>
            {ar(
              `لا توجد حركة على البند ${singleCategory.name_ar} (${singleCategory.code}) خلال الفترة المحددة.`,
            )}
          </Text>
        </View>
      ) : null}

      <View style={s.notes}>
        <Text style={s.notesText}>
          {ar(
            singleCategory
              ? `كشف حركة بند واحد (${singleCategory.code}): يُعرض إجمالي مدين ودائن البند خلال الفترة المحددة. لا يُعد قيداً مستقلاً — التوازن يُقاس على القيد الكامل للفترة.`
              : 'قيد ملخّص للفترة (Consolidated Journal): كل بند يظهر مرة واحدة بمجموع مدينه ودائنه. البنود مرتبة: أصول → خصوم → حقوق ملكية → إيرادات → مصروفات. يجب أن يتساوى إجمالي المدين مع إجمالي الدائن.',
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

      <PdfReportCaption />
    </ReportShell>
  );
}
