// @ts-nocheck
import React from 'react';
import { Document, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReportPageFrame } from './ReportPageFrame';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { PDF_TABLE_ROW } from './pdfTable';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { accountTypeLabelAr } from '@/lib/accounting-labels';
import { BRAND } from '@/lib/brand';
import type {
  PeriodCashBankSection,
  PeriodJournalEntryModel,
  PeriodJournalLine,
} from '@/lib/period-journal-entry';
import {
  buildCashBankSeparatedSections,
  buildContraLinesForFocus,
  describePeriodJournalSectionDisplay,
  periodLineCashboxKindsLabel,
  PERIOD_JOURNAL_TYPE_EXPENSE,
  PERIOD_JOURNAL_TYPE_REVENUE,
} from '@/lib/period-journal-entry';

/**
 * قيد الفترة المحاسبي — PDF
 *
 * عند اختيار بند: يُفصل النقدي (جدول مدين/دائن بالمجموع) عن المصارف
 * (كل مصرف في ورقة مستقلة بجدول محاسبي مدين/دائن).
 * المصروف: البند مدين / الطرف دائن — الإيراد: البند دائن / الطرف مدين.
 * الوضع الشامل: مجاميع ثم مجموع كل بند.
 */

const W = {
  net: '12%',
  credit: '14%',
  debit: '14%',
  type: '12%',
  name: '36%',
  code: '12%',
} as const;

/** room needed after the summary table: its bottom margin, the grand total bar and the caption */
const SUMMARY_CLOSING_HEIGHT = 80;
/**
 * The summary table is drawn as one card in two seamless halves: the last rows and the totals row sit in the
 * second half, so they can travel to the next page together with the grand total bar (never a lone bar).
 */
const SUMMARY_TAIL_ROWS = 1;
const CARD_OPEN_BOTTOM = {
  borderBottomWidth: 0,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  marginBottom: 0,
};
const CARD_OPEN_TOP = {
  borderTopWidth: 0,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
};

const TYPE_ORDER: Record<string, number> = {
  ASSET: 1,
  LIABILITY: 2,
  EQUITY: 3,
  REVENUE: 4,
  EXPENSE: 5,
};

const s = StyleSheet.create({
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
  colDesc: { width: '28%', paddingHorizontal: 6 },
  colAccount: { width: '42%' },
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
  /** اسم البند المحدد — بارز جداً في جدول المدين */
  accountNameFocus: {
    fontSize: 12,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
    lineHeight: 1.4,
  },
  accountRoleTag: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: PDF.success,
    textAlign: 'right',
    marginBottom: 2,
  },
  accountRoleTagCredit: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: PDF.danger,
    textAlign: 'right',
    marginBottom: 2,
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
  descFocus: {
    fontSize: 10,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
    lineHeight: 1.35,
  },
  descSub: {
    fontSize: 7.5,
    color: PDF.muted,
    textAlign: 'right',
    marginTop: 2,
  },
});

function sortLines(lines: PeriodJournalLine[]): PeriodJournalLine[] {
  return [...lines].sort((a, b) => {
    const oA = TYPE_ORDER[a.category_type ?? ''] ?? 99;
    const oB = TYPE_ORDER[b.category_type ?? ''] ?? 99;
    if (oA !== oB) return oA - oB;
    const codeCmp = (a.category_code || 'zzzz').localeCompare(
      b.category_code || 'zzzz',
      'ar',
    );
    if (codeCmp !== 0) return codeCmp;
    const kindRank = (k: string | null | undefined) =>
      k === 'CASH' ? 0 : k === 'BANK' ? 1 : k ? 2 : 3;
    const kr = kindRank(a.cashbox_kind) - kindRank(b.cashbox_kind);
    if (kr !== 0) return kr;
    return (a.cashbox_name || '').localeCompare(b.cashbox_name || '', 'ar');
  });
}

function sectionBandStyle(kind: PeriodCashBankSection['sectionKind']) {
  if (kind === 'CASH') return [s.categoryBand, s.categoryBandCash];
  if (kind === 'BANK') return [s.categoryBand, s.categoryBandBank];
  return [s.categoryBand];
}

function contraAccountName(line: PeriodJournalLine, section?: PeriodCashBankSection): string {
  if (section?.sectionKind && section.sectionKind !== 'NONE') {
    return (
      line.cashbox_name?.trim() ||
      section.fundingLabel ||
      line.category_name
    );
  }
  return line.cashbox_name?.trim() || line.category_name;
}

/** صفحة 1 — مجاميع البنود فقط */
function UnifiedSummaryTable({ lines }: { lines: PeriodJournalLine[] }) {
  const sorted = sortLines(lines);
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

  const renderRow = (line: PeriodJournalLine, i: number) => (
    <View
      key={line.rowKey}
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
        {ar(periodLineCashboxKindsLabel(line))}
      </Text>
      <View style={{ width: W.name, ...pdfReportTable.tdAr }}>
        <Text style={pdfReportTable.tdAr}>
          {ar(line.cashbox_name || line.category_name)}
        </Text>
        <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right' }}>
          {ar(
            line.cashbox_name
              ? line.category_name
              : accountTypeLabelAr(line.category_type),
          )}
        </Text>
      </View>
      <Text style={[pdfReportTable.tdMuted, { width: W.code }]}>
        {ar(line.category_code || '—')}
      </Text>
    </View>
  );

  const totalsRow = (
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
  );

  const split = sorted.length > SUMMARY_TAIL_ROWS;
  const topRows = split ? sorted.slice(0, sorted.length - SUMMARY_TAIL_ROWS) : sorted;
  const tailRows = split ? sorted.slice(sorted.length - SUMMARY_TAIL_ROWS) : [];

  return (
    <>
      <View style={[pdfReportTable.tableWrap, split ? CARD_OPEN_BOTTOM : null]}>
        <View style={pdfReportTable.tableHead} fixed>
          <Text style={[pdfReportTable.th, { width: W.net }]}>{ar('الصافي')}</Text>
          <Text style={[pdfReportTable.th, { width: W.credit }]}>{ar('دائن')}</Text>
          <Text style={[pdfReportTable.th, { width: W.debit }]}>{ar('مدين')}</Text>
          <Text style={[pdfReportTable.th, { width: W.type }]}>{ar('الخزينة')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.name }]}>{ar('الحساب')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.code }]}>{ar('الرمز')}</Text>
        </View>

        {topRows.map((line, i) => renderRow(line, i))}
        {split ? null : totalsRow}
      </View>

      {/* the last rows and the totals row: one unit, kept with the grand total bar that follows */}
      {split ? (
        <View
          style={[pdfReportTable.tableWrap, CARD_OPEN_TOP]}
          wrap={false}
          minPresenceAhead={SUMMARY_CLOSING_HEIGHT}
        >
          {tailRows.map((line, k) => renderRow(line, topRows.length + k))}
          {totalsRow}
        </View>
      ) : null}
    </>
  );
}

/** صفحة قسم — جدول محاسبي بقطبية صحيحة (مصروف مدين / إيراد دائن) */
function CategoryTotalPage({
  focusLine,
  contraLines,
  totalDebit,
  totalCredit,
  balanced,
  indexLabel,
  periodLabel,
  section,
}: {
  focusLine: PeriodJournalLine;
  contraLines: PeriodJournalLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  indexLabel: string;
  periodLabel: string;
  section?: PeriodCashBankSection;
}) {
  const sectionKind = section?.sectionKind;
  const categoryName = focusLine.category_name;
  const categoryCode = focusLine.category_code || '—';
  const display = describePeriodJournalSectionDisplay(focusLine, contraLines, {
    fundingLabel: section?.fundingLabel,
    sectionKind,
    focusTitle: section?.title || categoryName,
  });
  const fundingLabel = display.contraLabel;
  const contraRoleLabel =
    sectionKind && sectionKind !== 'NONE'
      ? `${display.contraSideLabel} ${section?.fundingLabel || fundingLabel}`
      : `${display.contraSideLabel} ${fundingLabel}`;

  const focusLines =
    section?.focusDetailLines && section.focusDetailLines.length > 0
      ? section.focusDetailLines
      : [focusLine];

  const rows = [
    ...focusLines.map((line, idx) => ({
      key: line.rowKey || `focus-${idx}`,
      code: line.category_code || '—',
      name: line.category_name,
      roleTag:
        focusLines.length > 1
          ? `${display.focusSideLabel} — ${line.category_name}`
          : `${display.focusSideLabel} — البند المحدد`,
      desc: line.category_name,
      hint: `${display.focusSideLabel} · ${line.category_code || '—'}`,
      debit: line.debit,
      credit: line.credit,
      focus: true,
    })),
    ...contraLines.map((line) => {
      const contraName = contraAccountName(line, section);
      return {
        key: line.rowKey,
        code: line.category_code || '—',
        name: contraName,
        roleTag: contraRoleLabel,
        desc: contraName,
        hint:
          sectionKind && sectionKind !== 'NONE'
            ? `${display.contraSideLabel} · ${section?.fundingLabel || fundingLabel}`
            : line.cashbox_name
              ? line.category_name
              : accountTypeLabelAr(line.category_type),
        debit: line.debit,
        credit: line.credit,
        focus: false,
      };
    }),
  ];

  return (
    <View>
      <View style={sectionBandStyle(sectionKind ?? 'NONE')} wrap={false}>
        <View style={balanced ? s.badgeOk : s.badgeWarn}>
          <Text style={balanced ? s.badgeTextOk : s.badgeTextWarn}>
            {ar(balanced ? 'متوازن' : 'مراجعة')}
          </Text>
        </View>
        <View style={s.categoryBandTitle}>
          <Text style={s.categoryBandEyebrow}>
            {ar(
              focusLines.length > 1
                ? `${categoryName} · ${focusLines.length} بند · ${indexLabel}`
                : `البند المحدد · ${indexLabel}`,
            )}
          </Text>
          <Text style={s.categoryBandName}>{ar(categoryName)}</Text>
          <Text style={s.categoryBandMeta}>
            {ar(
              `${categoryCode} · ${display.focusSideLabel}: ${
                focusLines.length > 1
                  ? `${focusLines.length} بند بأسمائها`
                  : categoryName
              } · ${display.contraSideLabel}: ${fundingLabel} · ${periodLabel}`,
            )}
          </Text>
        </View>
      </View>

      <View style={pdfReportTable.docInfoStrip} wrap={false}>
        <View style={pdfReportTable.docInfoCell}>
          <Text style={pdfReportTable.docInfoLabel}>
            {ar(display.headerFocusLabel)}
          </Text>
          <Text
            style={{
              fontSize: 8,
              fontWeight: 'bold',
              color: PDF.primary,
              textAlign: 'right',
              marginBottom: 2,
            }}
          >
            {ar(
              focusLines.length > 1
                ? `${focusLines.length} بند`
                : categoryName,
            )}
          </Text>
          <PdfReportMoney
            amount={display.focusAmount}
            bold
            color={display.focusIsCredit ? PDF.danger : PDF.success}
            showZero
          />
        </View>
        <View style={pdfReportTable.docInfoCell}>
          <Text style={pdfReportTable.docInfoLabel}>{ar(contraRoleLabel)}</Text>
          <Text
            style={{
              fontSize: 8,
              fontWeight: 'bold',
              color: PDF.text,
              textAlign: 'right',
              marginBottom: 2,
            }}
          >
            {ar(fundingLabel)}
          </Text>
          <PdfReportMoney
            amount={display.contraAmount}
            bold
            color={display.focusIsCredit ? PDF.success : PDF.danger}
            showZero
          />
        </View>
        <View style={pdfReportTable.docInfoCell}>
          <Text style={pdfReportTable.docInfoLabel}>{ar('نوع العرض')}</Text>
          <Text style={pdfReportTable.docInfoValue}>{ar('مجموع فقط')}</Text>
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
              { paddingVertical: row.focus ? 10 : 6 },
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
              <Text style={row.focus ? s.descFocus : s.descMain}>
                {ar(row.desc)}
              </Text>
              <Text style={s.descSub}>{ar(row.hint)}</Text>
            </View>
            <View style={s.colAccount}>
              <Text
                style={row.focus ? s.accountRoleTag : s.accountRoleTagCredit}
              >
                {ar(row.roleTag)}
              </Text>
              <Text style={row.focus ? s.accountNameFocus : s.accountName}>
                {ar(row.name)}
              </Text>
              <Text style={s.accountCode}>{ar(row.code)}</Text>
            </View>
          </View>
        ))}

        <View style={pdfReportTable.totalsRow} wrap={false}>
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
                  ? `مجموع القيد — مدين «${categoryName}» = دائن «${fundingLabel}»`
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
  const grouped = model.typeGroupFilter?.mode === 'group';
  return (
    <>
      <Text style={pdfReportTable.sectionTitle}>
        {ar(
          grouped
            ? 'قيد الفترة — إيرادات معاً ومصاريف معاً'
            : 'قيد الفترة — مجاميع جميع البنود',
        )}
      </Text>
      <Text style={s.note}>
        {ar(
          grouped
            ? `${model.periodLabel} · ${model.lines.length} صف مجمّع · ${model.sourceEntryCount} قيد · ${model.balanced ? 'متوازن' : 'مراجعة'}`
            : `${model.periodLabel} · ${model.lines.length} بند · ${model.sourceEntryCount} قيد · كل بند في صفحة تالية · ${model.balanced ? 'متوازن' : 'مراجعة'}`,
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
              ? 'إجمالي قيد الفترة — متوازن'
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
  const grouped = model.typeGroupFilter?.mode === 'group';
  const sorted = sortLines(
    grouped
      ? model.lines.filter(
          (l) => l.category_type === 'REVENUE' || l.category_type === 'EXPENSE',
        )
      : model.lines,
  );

  return (
    <Document
      title={documentTitle ?? `${BRAND.name} — ${titleAr}`}
      author={BRAND.fullName}
    >
      <ReportPageFrame title={titleAr} subtitle={model.periodLabel} titleEn="JOURNAL">
        <ComprehensiveSummaryPage model={model} />
      </ReportPageFrame>

      {sorted.map((line, index) => {
        const focusLine = line;
        const contraLines = buildContraLinesForFocus(model, focusLine);
        const totalDebit =
          focusLine.debit + contraLines.reduce((sum, l) => sum + l.debit, 0);
        const totalCredit =
          focusLine.credit + contraLines.reduce((sum, l) => sum + l.credit, 0);
        const balanced = Math.abs(totalDebit - totalCredit) <= 0.005;

        return (
          <ReportPageFrame
            key={line.rowKey}
            title={titleAr}
            subtitle={`${line.category_code || '—'} — ${
              line.cashbox_name || line.category_name
            }`}
            titleEn="JOURNAL"
          >
            <CategoryTotalPage
              focusLine={focusLine}
              contraLines={contraLines}
              totalDebit={totalDebit}
              totalCredit={totalCredit}
              balanced={balanced}
              periodLabel={model.periodLabel}
              indexLabel={`بند ${index + 1} من ${sorted.length}`}
            />
          </ReportPageFrame>
        );
      })}
    </Document>
  );
}

/** بند واحد — النقدي ورقة، وكل مصرف ورقة مستقلة */
function SingleCategoryTotalsDocument({
  model,
  documentTitle,
  titleAr,
}: {
  model: PeriodJournalEntryModel;
  documentTitle?: string;
  titleAr: string;
}) {
  const focusId = model.categoryFilter!.id;
  const sections = buildCashBankSeparatedSections(model, focusId);

  if (sections.length === 0) {
    return (
      <Document
        title={documentTitle ?? `${BRAND.name} — ${titleAr}`}
        author={BRAND.fullName}
      >
        <ReportPageFrame title={titleAr} subtitle={model.periodLabel} titleEn="JOURNAL">
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={pdfReportTable.tdMuted}>
              {ar(
                `لا حركة على ${model.categoryFilter?.name_ar ?? 'هذا البند'} خلال الفترة`,
              )}
            </Text>
          </View>
          <PdfReportCaption />
        </ReportPageFrame>
      </Document>
    );
  }

  return (
    <Document
      title={documentTitle ?? `${BRAND.name} — ${titleAr}`}
      author={BRAND.fullName}
    >
      {sections.map((section, index) => {
        const polarity = describePeriodJournalSectionDisplay(
          section.focusLine,
          section.contraLines,
          {
            fundingLabel: section.fundingLabel,
            sectionKind: section.sectionKind,
            focusTitle: section.title,
          },
        );
        const kindLabel =
          section.sectionKind !== 'NONE'
            ? `بند ${section.title} · ${polarity.contraSideLabel} ${section.fundingLabel}`
            : `بند ${section.title}`;

        return (
          <ReportPageFrame
            key={section.sectionKey}
            title={titleAr}
            subtitle={`${model.categoryFilter?.code || '—'} — ${section.title}${
              section.fundingLabel && section.fundingLabel !== '—'
                ? ` · ${section.fundingLabel}`
                : ''
            }`}
            titleEn="JOURNAL"
          >
            <CategoryTotalPage
              focusLine={section.focusLine}
              contraLines={section.contraLines}
              totalDebit={section.totalDebit}
              totalCredit={section.totalCredit}
              balanced={section.balanced}
              periodLabel={model.periodLabel}
              indexLabel={
                sections.length > 1
                  ? `${kindLabel} · ${index + 1}/${sections.length}`
                  : kindLabel
              }
              section={section}
            />
            <PdfReportCaption />
          </ReportPageFrame>
        );
      })}
    </Document>
  );
}

/** إيرادات ومصاريف مجمّعة — أوراق نقدي/مصارف لكل نوع */
function GroupTypeCashBankDocument({
  model,
  documentTitle,
  titleAr,
}: {
  model: PeriodJournalEntryModel;
  documentTitle?: string;
  titleAr: string;
}) {
  const sections = [
    ...buildCashBankSeparatedSections(model, PERIOD_JOURNAL_TYPE_EXPENSE),
    ...buildCashBankSeparatedSections(model, PERIOD_JOURNAL_TYPE_REVENUE),
  ];

  if (sections.length === 0) {
    return (
      <Document
        title={documentTitle ?? `${BRAND.name} — ${titleAr}`}
        author={BRAND.fullName}
      >
        <ReportPageFrame title={titleAr} subtitle={model.periodLabel} titleEn="JOURNAL">
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={pdfReportTable.tdMuted}>
              {ar('لا حركة إيرادات أو مصاريف في هذه الفترة')}
            </Text>
          </View>
          <PdfReportCaption />
        </ReportPageFrame>
      </Document>
    );
  }

  return (
    <Document
      title={documentTitle ?? `${BRAND.name} — ${titleAr}`}
      author={BRAND.fullName}
    >
      <ReportPageFrame title={titleAr} subtitle={model.periodLabel} titleEn="JOURNAL">
        <ComprehensiveSummaryPage model={model} />
      </ReportPageFrame>
      {sections.map((section, index) => {
        const polarity = describePeriodJournalSectionDisplay(
          section.focusLine,
          section.contraLines,
          {
            fundingLabel: section.fundingLabel,
            sectionKind: section.sectionKind,
            focusTitle: section.title,
          },
        );
        const kindLabel =
          section.sectionKind !== 'NONE'
            ? `${section.title} · ${polarity.contraSideLabel} ${section.fundingLabel}`
            : section.title;
        return (
          <ReportPageFrame
            key={section.sectionKey}
            title={titleAr}
            subtitle={`${section.title}${
              section.fundingLabel && section.fundingLabel !== '—'
                ? ` · ${section.fundingLabel}`
                : ''
            }`}
            titleEn="JOURNAL"
          >
            <CategoryTotalPage
              focusLine={section.focusLine}
              contraLines={section.contraLines}
              totalDebit={section.totalDebit}
              totalCredit={section.totalCredit}
              balanced={section.balanced}
              periodLabel={model.periodLabel}
              indexLabel={`${kindLabel} · ${index + 1}/${sections.length}`}
              section={section}
            />
            <PdfReportCaption />
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
  const singleCategory = model.categoryFilter;
  const typeGroup = model.typeGroupFilter;

  const titleAr = singleCategory
    ? `كشف بند — ${singleCategory.name_ar}`
    : typeGroup?.mode === 'group'
      ? 'قيد الفترة — إيرادات ومصاريف مجمّعة'
      : typeGroup
        ? `كشف — ${typeGroup.name_ar}`
        : 'تقرير شامل — قيد الفترة المحاسبي';

  /** جميع المصاريف / جميع الإيرادات / بند واحد — أوراق نقدي + كل مصرف */
  if (singleCategory) {
    return (
      <SingleCategoryTotalsDocument
        model={model}
        documentTitle={documentTitle}
        titleAr={titleAr}
      />
    );
  }

  /** إيرادات معاً ومصاريف معاً — كل نوع بأوراق نقدي/مصارف */
  if (typeGroup?.mode === 'group' && model.lines.length > 0) {
    return (
      <GroupTypeCashBankDocument
        model={model}
        documentTitle={documentTitle}
        titleAr={titleAr}
      />
    );
  }

  if (!singleCategory && model.lines.length > 0) {
    return (
      <ComprehensivePeriodJournalDocument
        model={model}
        documentTitle={documentTitle}
        titleAr={titleAr}
      />
    );
  }

  return (
    <Document
      title={documentTitle ?? `${BRAND.name} — ${titleAr}`}
      author={BRAND.fullName}
    >
      <ReportPageFrame title={titleAr} subtitle={model.periodLabel} titleEn="JOURNAL">
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Text style={pdfReportTable.tdMuted}>
            {ar('لا حركة محاسبية في هذه الفترة')}
          </Text>
        </View>
        <PdfReportCaption />
      </ReportPageFrame>
    </Document>
  );
}
