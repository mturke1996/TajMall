// @ts-nocheck
import React from 'react';
import { Document, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportShell, ReportPageFrame } from './ReportShell';
import { ar, arDateMedium } from './arabicPDF';
import { PDF } from './pdfBase';
import { PDF_TABLE_ROW } from './pdfTable';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { accountTypeLabelAr } from '@/lib/accounting-labels';
import { BRAND } from '@/lib/brand';
import type {
  PeriodJournalEntryModel,
  PeriodJournalLine,
  PeriodJournalMovement,
} from '@/lib/period-journal-entry';
import { applyPeriodJournalCategoryFilter } from '@/lib/period-journal-entry';

/**
 * قيد الفترة المحاسبي — PDF
 *
 * شامل: صفحة 1 = مجاميع الكل · ثم كل بند في صفحة بمجموعه فقط
 *        (جدول مزدوج: مدين البند + دائن الخزينة — بدون تفصيل القيود)
 * بند واحد: كشف مزدوج كامل (كل القيود)
 */

const W = {
  net: '12%',
  credit: '14%',
  debit: '14%',
  type: '12%',
  name: '36%',
  code: '12%',
} as const;

const LEDGER = {
  credit: '13%',
  debit: '13%',
  desc: '40%',
  account: '24%',
  meta: '10%',
} as const;

const TYPE_ORDER: Record<string, number> = {
  ASSET: 1,
  LIABILITY: 2,
  EQUITY: 3,
  REVENUE: 4,
  EXPENSE: 5,
};

const s = StyleSheet.create({
  focusRow: { backgroundColor: PDF.logoGreenSoft },
  accountFocus: { fontWeight: 'bold', color: PDF.primary },
  note: {
    fontSize: 8,
    color: PDF.muted,
    textAlign: 'right',
    marginBottom: 12,
    lineHeight: 1.45,
  },
  categoryBand: {
    ...PDF_TABLE_ROW,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: PDF.headerBg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 3,
    marginBottom: 10,
  },
  categoryBandTitle: {
    flex: 1,
    paddingLeft: 8,
  },
  categoryBandEyebrow: {
    fontSize: 7.5,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'right',
    marginBottom: 2,
  },
  categoryBandName: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: PDF.white,
    textAlign: 'right',
    lineHeight: 1.35,
  },
  categoryBandMeta: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'right',
    marginTop: 2,
  },
  badgeOk: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: '#dcfce7',
  },
  badgeWarn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: '#fee2e2',
  },
  badgeTextOk: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#166534',
    textAlign: 'center',
  },
  badgeTextWarn: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#991b1b',
    textAlign: 'center',
  },
  colCredit: { width: '15%' },
  colDebit: { width: '15%' },
  colDesc: { width: '32%', paddingHorizontal: 6 },
  colAccount: { width: '38%' },
  rowFocus: {
    backgroundColor: PDF.logoGreenSoft,
  },
  accountName: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
    lineHeight: 1.35,
  },
  accountCode: {
    fontSize: 7.5,
    color: PDF.muted,
    textAlign: 'right',
    marginTop: 2,
  },
  descMain: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
  },
  descSub: {
    fontSize: 7.5,
    color: PDF.muted,
    textAlign: 'right',
    marginTop: 2,
  },
});

type FlatRow = PeriodJournalMovement & {
  category_id: string;
  category_code: string;
  category_name: string;
  is_focus: boolean;
};

function sortLines(lines: PeriodJournalLine[]): PeriodJournalLine[] {
  return [...lines].sort((a, b) => {
    const oA = TYPE_ORDER[a.category_type ?? ''] ?? 99;
    const oB = TYPE_ORDER[b.category_type ?? ''] ?? 99;
    if (oA !== oB) return oA - oB;
    return (a.category_code || 'zzzz').localeCompare(b.category_code || 'zzzz', 'ar');
  });
}

function flattenLines(lines: PeriodJournalLine[], focusCategoryId: string): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const line of lines) {
    for (const m of line.movements) {
      rows.push({
        ...m,
        category_id: line.category_id,
        category_code: line.category_code,
        category_name: line.category_name,
        is_focus: line.category_id === focusCategoryId,
      });
    }
  }
  rows.sort((a, b) => {
    const d = a.entry_date.localeCompare(b.entry_date);
    if (d !== 0) return d;
    if (a.journal_number !== b.journal_number) return a.journal_number - b.journal_number;
    return a.is_focus === b.is_focus ? 0 : a.is_focus ? -1 : 1;
  });
  return rows;
}

function movementStatement(m: PeriodJournalMovement): string {
  const parts = [
    m.line_description,
    m.journal_description,
    m.contact_name ? `جهة: ${m.contact_name}` : null,
    m.cashbox_name ? `خزينة: ${m.cashbox_name}` : null,
    m.contra_label ? `مقابل: ${m.contra_label}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}

/** صفحة 1 — مجاميع البنود فقط */
function UnifiedSummaryTable({ lines }: { lines: PeriodJournalLine[] }) {
  const sorted = sortLines(lines);
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

  return (
    <View style={pdfReportTable.tableWrap}>
      <View style={pdfReportTable.tableHead} fixed>
        <Text style={[pdfReportTable.th, { width: W.net }]}>{ar('الصافي')}</Text>
        <Text style={[pdfReportTable.th, { width: W.credit }]}>{ar('دائن')}</Text>
        <Text style={[pdfReportTable.th, { width: W.debit }]}>{ar('مدين')}</Text>
        <Text style={[pdfReportTable.th, { width: W.type }]}>{ar('النوع')}</Text>
        <Text style={[pdfReportTable.thAr, { width: W.name }]}>{ar('الحساب')}</Text>
        <Text style={[pdfReportTable.thAr, { width: W.code }]}>{ar('الرمز')}</Text>
      </View>

      {sorted.map((line, i) => (
        <View
          key={line.category_id}
          style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]}
          wrap={false}
        >
          <View style={[pdfReportTable.tdNum, { width: W.net }]}>
            <PdfReportMoney amount={Math.abs(line.net)} showZero />
          </View>
          <View style={[pdfReportTable.tdNum, { width: W.credit }]}>
            <PdfReportMoney amount={line.credit} color={PDF.danger} showZero />
          </View>
          <View style={[pdfReportTable.tdNum, { width: W.debit }]}>
            <PdfReportMoney amount={line.debit} color={PDF.success} showZero />
          </View>
          <Text style={[pdfReportTable.tdMuted, { width: W.type, fontSize: 7.5 }]}>
            {ar(accountTypeLabelAr(line.category_type))}
          </Text>
          <Text style={[pdfReportTable.tdAr, { width: W.name }]}>{ar(line.category_name)}</Text>
          <Text style={[pdfReportTable.tdMuted, { width: W.code }]}>
            {ar(line.category_code || '—')}
          </Text>
        </View>
      ))}

      <View style={pdfReportTable.totalsRow} wrap={false}>
        <View style={[pdfReportTable.tdNum, { width: W.net }]}>
          <PdfReportMoney amount={Math.abs(totalDebit - totalCredit)} bold showZero />
        </View>
        <View style={[pdfReportTable.tdNum, { width: W.credit }]}>
          <PdfReportMoney amount={totalCredit} bold color={PDF.danger} showZero />
        </View>
        <View style={[pdfReportTable.tdNum, { width: W.debit }]}>
          <PdfReportMoney amount={totalDebit} bold color={PDF.success} showZero />
        </View>
        <Text style={[pdfReportTable.tdMuted, { width: W.type }]}>{ar('')}</Text>
        <Text style={[pdfReportTable.totalsRowLabel, { width: W.name }]}>
          {ar(`الإجمالي — ${sorted.length} بند`)}
        </Text>
        <Text style={[pdfReportTable.tdMuted, { width: W.code }]}>{ar('')}</Text>
      </View>
    </View>
  );
}

/** كشف بند — قيد مزدوج كامل (مدين + دائن + الطرف المقابل) */
function SingleCategoryLedger({
  lines,
  focusCategoryId,
  focusName,
  focusCode,
  totalDebit,
  totalCredit,
  balanced,
  sectionLabel,
}: {
  lines: PeriodJournalLine[];
  focusCategoryId: string;
  focusName: string;
  focusCode: string;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  sectionLabel?: string;
}) {
  const rows = flattenLines(lines, focusCategoryId);
  const focusLine = lines.find((l) => l.category_id === focusCategoryId);

  return (
    <>
      <Text style={pdfReportTable.sectionTitle}>
        {ar(sectionLabel ?? `كشف البند — ${focusCode} — ${focusName}`)}
      </Text>
      <Text style={s.note}>
        {ar(
          'جدول قيد مزدوج: مدين البند ★ ودائن الخزينة (الطرف المقابل) في نفس القيود.',
        )}
      </Text>

      {focusLine ? (
        <View style={[pdfReportTable.hero, { marginBottom: 10 }]} wrap={false}>
          <View style={pdfReportTable.heroCell}>
            <Text style={pdfReportTable.heroLabel}>{ar('مدين البند')}</Text>
            <PdfReportMoney amount={focusLine.debit} bold color={PDF.success} showZero />
          </View>
          <View style={pdfReportTable.heroCell}>
            <Text style={pdfReportTable.heroLabel}>{ar('دائن البند')}</Text>
            <PdfReportMoney amount={focusLine.credit} bold color={PDF.danger} showZero />
          </View>
          <View style={pdfReportTable.heroCell}>
            <Text style={pdfReportTable.heroLabel}>{ar('الحركات')}</Text>
            <Text style={pdfReportTable.heroValue}>
              {ar(String(focusLine.movements.length))}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={pdfReportTable.tableWrap}>
        <View style={pdfReportTable.tableHead} fixed>
          <Text style={[pdfReportTable.th, { width: LEDGER.credit }]}>{ar('دائن')}</Text>
          <Text style={[pdfReportTable.th, { width: LEDGER.debit }]}>{ar('مدين')}</Text>
          <Text style={[pdfReportTable.thAr, { width: LEDGER.desc }]}>{ar('البيان')}</Text>
          <Text style={[pdfReportTable.thAr, { width: LEDGER.account }]}>{ar('الحساب')}</Text>
          <Text style={[pdfReportTable.th, { width: LEDGER.meta }]}>{ar('قيد')}</Text>
        </View>

        {rows.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={pdfReportTable.tdMuted}>{ar('لا حركات')}</Text>
          </View>
        ) : (
          rows.map((row, i) => (
            <View
              key={`${row.journal_id}-${row.category_id}-${i}`}
              style={[
                pdfReportTable.tableRow,
                row.is_focus ? s.focusRow : i % 2 === 1 ? pdfReportTable.rowAlt : {},
              ]}
              wrap={false}
            >
              <View style={[pdfReportTable.tdNum, { width: LEDGER.credit }]}>
                <PdfReportMoney amount={row.credit} color={PDF.danger} showZero />
              </View>
              <View style={[pdfReportTable.tdNum, { width: LEDGER.debit }]}>
                <PdfReportMoney amount={row.debit} color={PDF.success} showZero />
              </View>
              <View style={{ width: LEDGER.desc, ...pdfReportTable.tdAr }}>
                <Text style={pdfReportTable.tdAr}>{ar(movementStatement(row))}</Text>
              </View>
              <View style={{ width: LEDGER.account, ...pdfReportTable.tdAr }}>
                <Text
                  style={[pdfReportTable.tdAr, row.is_focus ? s.accountFocus : {}]}
                >
                  {ar(row.category_name)}
                </Text>
                <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right' }}>
                  {ar(row.category_code || '—')}
                </Text>
              </View>
              <View style={{ width: LEDGER.meta, alignItems: 'center' }}>
                <Text style={{ fontSize: 7.5, color: PDF.muted, textAlign: 'center' }}>
                  #{row.journal_number}
                </Text>
              </View>
            </View>
          ))
        )}

        <View style={pdfReportTable.totalsRow} wrap={false}>
          <View style={[pdfReportTable.tdNum, { width: LEDGER.credit }]}>
            <PdfReportMoney amount={totalCredit} bold color={PDF.danger} showZero />
          </View>
          <View style={[pdfReportTable.tdNum, { width: LEDGER.debit }]}>
            <PdfReportMoney amount={totalDebit} bold color={PDF.success} showZero />
          </View>
          <Text style={[pdfReportTable.totalsRowLabel, { width: LEDGER.desc }]}>
            {ar(balanced ? 'إجمالي القيود — متوازن' : 'إجمالي القيود — مراجعة')}
          </Text>
          <Text style={[pdfReportTable.tdMuted, { width: LEDGER.account }]}>{ar('')}</Text>
          <Text style={[pdfReportTable.tdMuted, { width: LEDGER.meta }]}>{ar('')}</Text>
        </View>
      </View>

      <View
        style={[
          pdfReportTable.totalBar,
          !balanced ? pdfReportTable.totalBarWarn : {},
          { marginTop: 8 },
        ]}
        wrap={false}
      >
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('دائن')}</Text>
            <PdfReportMoney amount={totalCredit} bold light showZero />
          </View>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('مدين')}</Text>
            <PdfReportMoney amount={totalDebit} bold light showZero />
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>{ar('إجمالي كشف البند')}</Text>
      </View>
    </>
  );
}

/** صفحة بند — مجموع مدين + دائن الخزينة (جدول محاسبي واحد) */
function CategoryTotalPage({
  focusLine,
  contraLines,
  totalDebit,
  totalCredit,
  balanced,
  indexLabel,
  movementCount,
  periodLabel,
}: {
  focusLine: PeriodJournalLine;
  contraLines: PeriodJournalLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  indexLabel: string;
  movementCount: number;
  periodLabel: string;
}) {
  const cashboxCredit = contraLines.reduce((sum, l) => sum + l.credit, 0);
  const rows = [
    {
      key: focusLine.category_id,
      code: focusLine.category_code || '—',
      name: focusLine.category_name,
      desc: 'مدين البند',
      hint: 'مجموع الفترة',
      debit: focusLine.debit,
      credit: focusLine.credit,
      focus: true,
    },
    ...contraLines.map((line) => ({
      key: line.category_id,
      code: line.category_code || '—',
      name: line.category_name,
      desc: line.credit > 0 ? 'دائن الخزينة' : 'طرف مقابل',
      hint: accountTypeLabelAr(line.category_type),
      debit: line.debit,
      credit: line.credit,
      focus: false,
    })),
  ];

  return (
    <View>
      <View style={s.categoryBand}>
        <View style={balanced ? s.badgeOk : s.badgeWarn}>
          <Text style={balanced ? s.badgeTextOk : s.badgeTextWarn}>
            {ar(balanced ? 'متوازن' : 'مراجعة')}
          </Text>
        </View>
        <View style={s.categoryBandTitle}>
          <Text style={s.categoryBandEyebrow}>{ar(indexLabel)}</Text>
          <Text style={s.categoryBandName}>{ar(focusLine.category_name)}</Text>
          <Text style={s.categoryBandMeta}>
            {ar(
              `${focusLine.category_code || '—'} · ${accountTypeLabelAr(focusLine.category_type)} · ${periodLabel}`,
            )}
          </Text>
        </View>
      </View>

      <View style={pdfReportTable.docInfoStrip}>
        <View style={pdfReportTable.docInfoCell}>
          <Text style={pdfReportTable.docInfoLabel}>{ar('مدين البند')}</Text>
          <PdfReportMoney amount={focusLine.debit} bold color={PDF.success} showZero />
        </View>
        <View style={pdfReportTable.docInfoCell}>
          <Text style={pdfReportTable.docInfoLabel}>{ar('دائن الخزينة')}</Text>
          <PdfReportMoney amount={cashboxCredit} bold color={PDF.danger} showZero />
        </View>
        <View style={pdfReportTable.docInfoCell}>
          <Text style={pdfReportTable.docInfoLabel}>{ar('حركات المصدر')}</Text>
          <Text style={pdfReportTable.docInfoValue}>{ar(String(movementCount))}</Text>
        </View>
      </View>

      <View style={pdfReportTable.tableWrap}>
        <View style={pdfReportTable.tableHead} fixed>
          <Text style={[pdfReportTable.th, s.colCredit]}>{ar('دائن')}</Text>
          <Text style={[pdfReportTable.th, s.colDebit]}>{ar('مدين')}</Text>
          <Text style={[pdfReportTable.thAr, s.colDesc]}>{ar('البيان')}</Text>
          <Text style={[pdfReportTable.thAr, s.colAccount]}>{ar('الحساب')}</Text>
        </View>

        {rows.map((row, i) => (
          <View
            key={row.key}
            style={[
              pdfReportTable.tableRow,
              row.focus ? s.rowFocus : i % 2 === 1 ? pdfReportTable.rowAlt : {},
            ]}
            wrap={false}
          >
            <View style={[pdfReportTable.tdNum, s.colCredit]}>
              <PdfReportMoney amount={row.credit} color={PDF.danger} />
            </View>
            <View style={[pdfReportTable.tdNum, s.colDebit]}>
              <PdfReportMoney amount={row.debit} color={PDF.success} />
            </View>
            <View style={s.colDesc}>
              <Text style={s.descMain}>{ar(row.desc)}</Text>
              <Text style={s.descSub}>{ar(row.hint)}</Text>
            </View>
            <View style={s.colAccount}>
              <Text style={[s.accountName, row.focus ? s.accountFocus : {}]}>
                {ar(row.name)}
              </Text>
              <Text style={s.accountCode}>{ar(row.code)}</Text>
            </View>
          </View>
        ))}

        <View style={pdfReportTable.totalsRow}>
          <View style={[pdfReportTable.tdNum, s.colCredit]}>
            <PdfReportMoney amount={totalCredit} bold color={PDF.danger} showZero />
          </View>
          <View style={[pdfReportTable.tdNum, s.colDebit]}>
            <PdfReportMoney amount={totalDebit} bold color={PDF.success} showZero />
          </View>
          <View style={{ width: '70%' }}>
            <Text style={pdfReportTable.totalsRowLabel}>
              {ar(
                balanced
                  ? 'مجموع القيد — المدين = الدائن'
                  : 'مجموع القيد — فرق يحتاج مراجعة',
              )}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** صفحة 1 — مجاميع كل البنود */
function ComprehensiveSummaryPage({ model }: { model: PeriodJournalEntryModel }) {
  return (
    <>
      <Text style={pdfReportTable.sectionTitle}>
        {ar('قيد الفترة — مجاميع جميع البنود')}
      </Text>
      <Text style={s.note}>
        {ar(
          `${model.periodLabel} · ${model.lines.length} بند · ${model.sourceEntryCount} قيد · كل بند في صفحة تالية · ${model.balanced ? 'متوازن' : 'مراجعة'}`,
        )}
      </Text>

      <UnifiedSummaryTable lines={model.lines} />

      <View
        style={[
          pdfReportTable.totalBar,
          !model.balanced ? pdfReportTable.totalBarWarn : {},
          { marginTop: 14 },
        ]}
        wrap={false}
      >
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('دائن')}</Text>
            <PdfReportMoney amount={model.totalCredit} bold light showZero />
          </View>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar('مدين')}</Text>
            <PdfReportMoney amount={model.totalDebit} bold light showZero />
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>
          {ar(
            model.balanced
              ? 'إجمالي قيد الفترة — متوازن ✓'
              : 'إجمالي قيد الفترة — مراجعة',
          )}
        </Text>
      </View>

      <PdfReportCaption />
    </>
  );
}

/** تقرير شامل — Document متعدد الصفحات: مجاميع + بند/صفحة */
function ComprehensivePeriodJournalDocument({
  model,
  documentTitle,
  titleAr,
}: {
  model: PeriodJournalEntryModel;
  documentTitle?: string;
  titleAr: string;
}) {
  const sorted = sortLines(model.lines);

  return (
    <Document
      title={documentTitle ?? `${BRAND.name} — ${titleAr}`}
      author={BRAND.fullName}
    >
      <ReportPageFrame title={titleAr} subtitle={model.periodLabel} titleEn="JOURNAL">
        <ComprehensiveSummaryPage model={model} />
      </ReportPageFrame>

      {sorted.map((line, index) => {
        const catModel = applyPeriodJournalCategoryFilter(model, line.category_id, {
          id: line.category_id,
          code: line.category_code,
          name_ar: line.category_name,
          type: line.category_type,
        });
        const focusLine =
          catModel.lines.find((l) => l.category_id === line.category_id) ?? line;
        const contraLines = catModel.lines.filter(
          (l) => l.category_id !== line.category_id,
        );

        return (
          <ReportPageFrame
            key={line.category_id}
            title={titleAr}
            subtitle={`${line.category_code || '—'} — ${line.category_name}`}
            titleEn="JOURNAL"
          >
            <CategoryTotalPage
              focusLine={focusLine}
              contraLines={contraLines}
              totalDebit={catModel.totalDebit}
              totalCredit={catModel.totalCredit}
              balanced={catModel.balanced}
              movementCount={focusLine.movements.length}
              periodLabel={model.periodLabel}
              indexLabel={`بند ${index + 1} من ${sorted.length}`}
            />
          </ReportPageFrame>
        );
      })}
    </Document>
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
  const isComprehensive = !singleCategory;

  const titleAr = singleCategory
    ? `كشف بند — ${singleCategory.name_ar}`
    : 'تقرير شامل — قيد الفترة المحاسبي';

  if (isComprehensive && model.lines.length > 0) {
    return (
      <ComprehensivePeriodJournalDocument
        model={model}
        documentTitle={documentTitle}
        titleAr={titleAr}
      />
    );
  }

  return (
    <ReportShell
      title={titleAr}
      subtitle={model.periodLabel}
      documentTitle={documentTitle}
      showSummary={!isComprehensive}
      periodSummary={
        isComprehensive
          ? undefined
          : {
              eyebrow: 'Account Statement',
              title: model.periodLabel,
              subtitle: `${singleCategory.code} · ${model.vouchers.length} قيد`,
              hint: model.balanced
                ? 'المدين = الدائن — متوازن'
                : 'فرق بين المدين والدائن',
              badge: model.balanced ? 'متوازن' : 'مراجعة',
            }
      }
      metaCells={
        isComprehensive
          ? []
          : [
              { label: 'الفترة', value: periodRange },
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
            ]
      }
    >
      {model.lines.length === 0 ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={pdfReportTable.tdMuted}>
            {ar(
              singleCategory
                ? `لا حركة على ${singleCategory.name_ar} خلال الفترة`
                : 'لا حركة محاسبية في هذه الفترة',
            )}
          </Text>
        </View>
      ) : (
        <SingleCategoryLedger
          lines={model.lines}
          focusCategoryId={singleCategory.id}
          focusName={singleCategory.name_ar}
          focusCode={singleCategory.code}
          totalDebit={model.totalDebit}
          totalCredit={model.totalCredit}
          balanced={model.balanced}
        />
      )}

      <PdfReportCaption />
    </ReportShell>
  );
}
