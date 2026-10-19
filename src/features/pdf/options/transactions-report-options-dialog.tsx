'use client';

/**
 * The options dialog of the revenues report and of the expenses report (one component, `kind` picks the
 * words and the colour). It edits a `TransactionReportOptions` (src/lib/report-options.ts), shows the result
 * while it changes, and builds the PDF from it.
 *
 * Pieces from this folder, so another report can assemble its own dialog the same way:
 *  - ReportOptionsDialogShell: the sheet (phone) / two panes (desktop), the footer, focus return;
 *  - PresetsBar + useReportPresets, PeriodPicker, FiltersSection with ListFilter / MethodsFilter /
 *    StatusFilter / AmountFilter, LayoutSection;
 *  - ReportSummaryPanel + ReportSummaryBar, ReportOutputBar + useReportOutputs.
 * All the rules (period, filters, status, sorting, grouping, subtotals, page estimate, file name, presets)
 * are pure functions in src/lib/report-options.ts.
 */
import { useCallback, useMemo, useState } from 'react';
import { Landmark, Tags, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentProfile } from '@/lib/supabase/use-profile';
import type { CategoryRow, TransactionWithRelations } from '@/lib/db/types';
import {
  REPORT_KIND_TEXT,
  activeFilterCount,
  applyPreset,
  availableYears,
  buildFacetCatalogs,
  buildRowTest,
  buildScopeNote,
  categoriesLabel as scopeCategoriesLabel,
  clearFilters,
  defaultReportOptions,
  estimatePages,
  facetItems,
  formatPrintStamp,
  groupCaption,
  groupTransactions,
  pruneUnknownChoices,
  reportFileName,
  reportWarnings,
  resolvePeriod,
  sameOptions,
  selectReportRows,
  summarizeRows,
  toPdfGroups,
  type PeriodSelection,
  type ReportFilters,
  type ReportKind,
  type ReportLayout,
  type ReportPreset,
  type TransactionReportOptions,
} from '@/lib/report-options';
import { arabicCount, todayISODate } from '@/lib/utils';
import { PeriodPicker } from './period-picker';
import { PresetsBar } from './presets-bar';
import { AmountFilter, FiltersSection, LayoutSection, ListFilter, MethodsFilter, StatusFilter } from './report-option-sections';
import { ReportOptionsDialogShell, ReportOutputBar } from './report-options-shell';
import { ReportSummaryBar, ReportSummaryPanel, type ReportSummaryData } from './report-summary';
import { useReportOutputs } from './use-report-outputs';
import { useReportPresets } from './use-report-presets';

export type TransactionsReportOptionsDialogProps = {
  kind: ReportKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the accounts the person can choose (active ones of this kind) */
  categories: CategoryRow[];
  /** every row of this kind the page has; the dialog filters them itself */
  transactions: TransactionWithRelations[];
  /** an account the page has chosen; the accounts filter starts with it */
  defaultCategoryId?: string;
};

export function TransactionsReportOptionsDialog({ kind, open, onOpenChange, categories, transactions, defaultCategoryId = 'ALL' }: TransactionsReportOptionsDialogProps) {
  const text = REPORT_KIND_TEXT[kind];
  const tone = kind === 'REVENUE' ? 'success' : 'danger';
  const today = todayISODate();
  const { profile, user } = useCurrentProfile();

  const [options, setOptions] = useState<TransactionReportOptions>(() => {
    const base = defaultReportOptions(todayISODate());
    if (defaultCategoryId !== 'ALL') base.filters.categoryIds = [defaultCategoryId];
    return base;
  });
  const { period, filters, layout } = options;
  const setPeriod = (next: PeriodSelection) => setOptions((o) => ({ ...o, period: next }));
  const patchFilters = (patch: Partial<ReportFilters>) => setOptions((o) => ({ ...o, filters: { ...o.filters, ...patch } }));
  const patchLayout = (patch: Partial<ReportLayout>) => setOptions((o) => ({ ...o, layout: { ...o.layout, ...patch } }));

  // ── what matches ───────────────────────────────────────────────────────────
  const selection = useMemo(() => selectReportRows(transactions, options, today), [transactions, options, today]);
  const summary = useMemo(() => summarizeRows(selection.rows), [selection.rows]);
  const groups = useMemo(() => groupTransactions(selection.rows, layout.grouping, layout.sort), [selection.rows, layout.grouping, layout.sort]);
  const pages = estimatePages({ rows: summary.count, groups: groups.length, includeSummaries: layout.includeSummaries, summaryRows: summary.categories, signature: layout.signature });
  // «كل المدة» is put into words with the first and last day of what is printed
  const shownPeriod = useMemo(() => resolvePeriod(period, today, { min: summary.firstDate, max: summary.lastDate }), [period, today, summary.firstDate, summary.lastDate]);

  // ── the lists, with what each choice would add under the other options ─────
  const catalogs = useMemo(() => buildFacetCatalogs(transactions, categories), [transactions, categories]);
  const facets = useMemo(() => {
    const rowsWithout = (skip: 'category' | 'party' | 'cashbox' | 'method') => {
      const t = buildRowTest({ period, filters }, today, { skip });
      return transactions.filter(t.test);
    };
    const methodCounts: Record<string, number> = {};
    for (const m of summarizeRows(rowsWithout('method')).byMethod) methodCounts[m.method] = m.count;
    return {
      category: facetItems(rowsWithout('category'), 'category', catalogs.category),
      party: facetItems(rowsWithout('party'), 'party', catalogs.party),
      cashbox: facetItems(rowsWithout('cashbox'), 'cashbox', catalogs.cashbox),
      methodCounts,
    };
  }, [transactions, period, filters, today, catalogs]);

  const draftCount = useMemo(() => transactions.filter((t) => t.status === 'DRAFT').length, [transactions]);
  const dataSpan = useMemo(() => {
    let from: string | null = null;
    let to: string | null = null;
    for (const t of transactions) {
      const d = (t.tx_date ?? '').slice(0, 10);
      if (!d) continue;
      if (from == null || d < from) from = d;
      if (to == null || d > to) to = d;
    }
    return { from, to };
  }, [transactions]);
  const years = useMemo(() => availableYears(transactions.map((t) => t.tx_date), today), [transactions, today]);

  const names = useMemo(() => {
    const category = new Map(catalogs.category.map((c) => [c.id, c.label]));
    const party = new Map(catalogs.party.map((c) => [c.id, c.label]));
    const cashbox = new Map(catalogs.cashbox.map((c) => [c.id, c.label]));
    return { category, party, cashbox };
  }, [catalogs]);

  // ── the words of the report ────────────────────────────────────────────────
  const reportTitle = layout.title.trim() || text.defaultTitle;
  const scopeLabel = scopeCategoriesLabel(filters.categoryIds, (id) => names.category.get(id), text.allCategories);
  const periodLabel = selection.period.label;
  const fileName = reportFileName({ kindAr: text.kindAr, scope: scopeLabel, periodSlug: selection.period.slug, today });
  const canOutput = selection.valid && summary.count > 0;
  const printedBy = profile?.full_name_ar || profile?.full_name || user?.email || '';

  // ── outputs ────────────────────────────────────────────────────────────────
  const buildDocument = useCallback(async () => {
    const scopeNote = buildScopeNote({
      filters,
      layout,
      partyName: (id) => names.party.get(id),
      cashboxName: (id) => names.cashbox.get(id),
    });
    const props = {
      titleAr: reportTitle,
      subtitleAr: layout.subtitle.trim() || `${periodLabel} · ${scopeLabel}`,
      rows: selection.rows,
      grandTotal: summary.total,
      totalTransactionsCount: summary.count,
      groupByPaymentMethod: true,
      includeSummaries: layout.includeSummaries,
      periodLabel,
      categoriesLabel: scopeLabel,
      // grouping by payment method is the report's own grouping, with its own names
      paymentMethodGroups: layout.grouping === 'METHOD' ? undefined : toPdfGroups(groups),
      groupCaptionAr: groupCaption(kind, layout.grouping),
      groupSubtotals: layout.grouping !== 'NONE',
      scopeNote: scopeNote || undefined,
      printedBy: printedBy || undefined,
      printedAt: formatPrintStamp(),
      signature: layout.signature,
    };
    if (kind === 'REVENUE') {
      const { RevenuesReportPDF } = await import('../RevenuesReportPDF');
      return <RevenuesReportPDF {...props} />;
    }
    const { ExpensesReportPDF } = await import('../ExpensesReportPDF');
    return <ExpensesReportPDF {...props} />;
  }, [kind, filters, layout, names, reportTitle, periodLabel, scopeLabel, selection.rows, summary.total, summary.count, groups, printedBy]);

  const outputs = useReportOutputs({ buildDocument, fileName, title: reportTitle, shareText: `${periodLabel} - ${scopeLabel}`, disabled: !canOutput });

  // ── presets ────────────────────────────────────────────────────────────────
  const presets = useReportPresets(text.storageKey, today);
  const activePresetId = useMemo(() => [...presets.builtIn, ...presets.saved].find((p) => sameOptions(p.options, options))?.id ?? null, [presets.builtIn, presets.saved, options]);

  const applyOne = (preset: ReportPreset) => {
    const known = {
      categories: new Set(catalogs.category.map((c) => c.id)),
      parties: new Set(catalogs.party.map((c) => c.id)),
      cashboxes: new Set(catalogs.cashbox.map((c) => c.id)),
    };
    const { options: next, dropped } = pruneUnknownChoices(applyPreset(options, preset), known);
    setOptions(next);
    if (dropped > 0) toast.info(`${arabicCount(dropped, ['اختيار واحد', 'اختياران', 'اختيارات', 'اختياراً'])} من هذا الإعداد لم يعد موجوداً فتُرك.`);
  };
  const saveCurrent = (name: string) => {
    const error = presets.save(name, options);
    if (!error) toast.success('تم حفظ الإعداد');
    return error;
  };
  const deleteOne = (preset: ReportPreset) => void presets.remove(preset.id);

  // ── the summary ────────────────────────────────────────────────────────────
  const filtersActive = activeFilterCount(filters);
  const summaryData: ReportSummaryData = {
    tone,
    count: summary.count,
    total: summary.total,
    totalLabel: text.totalLabel,
    range: shownPeriod.words,
    facts: [
      { label: 'البنود', value: summary.categories },
      { label: 'الجهات', value: summary.parties },
      { label: 'الخزائن', value: summary.cashboxes },
      { label: 'طرق الدفع', value: summary.methods },
    ],
    breakdown: summary.byMethod,
    pages,
    warnings: reportWarnings({ count: summary.count, pages, issues: selection.issues, inPeriod: selection.inPeriod, excluded: selection.excluded }),
    filtersActive,
    onClearFilters: () => patchFilters(clearFilters()),
  };

  const categoryOpen = defaultCategoryId !== 'ALL';

  return (
    <>
      <ReportOptionsDialogShell
        open={open}
        onOpenChange={onOpenChange}
        title={`خيارات تقرير ${text.plural}`}
        description="حدد الفترة والتصفية وشكل الجداول"
        icon={kind === 'REVENUE' ? TrendingUp : TrendingDown}
        accent={kind === 'REVENUE' ? 'green' : 'red'}
        summaryPanel={<ReportSummaryPanel data={summaryData} />}
        summaryBar={<ReportSummaryBar data={summaryData} />}
        footer={<ReportOutputBar outputs={outputs} disabled={!canOutput} onClose={() => onOpenChange(false)} />}
      >
        <PresetsBar builtIn={presets.builtIn} saved={presets.saved} activeId={activePresetId} persisted={presets.persisted} onApply={applyOne} onDelete={deleteOne} onRestore={presets.restore} onSave={saveCurrent} />

        <PeriodPicker value={period} onChange={setPeriod} resolved={shownPeriod} years={years} fallbackRange={dataSpan} />

        <FiltersSection activeCount={filtersActive} onClearAll={() => patchFilters(clearFilters())}>
          <ListFilter
            idPrefix={`${kind}-category`}
            icon={Tags}
            accent="blue"
            title="البنود"
            allLabel="كل البنود"
            listLabel="البنود"
            searchPlaceholder="ابحث عن بند"
            items={facets.category}
            selected={filters.categoryIds}
            onChange={(categoryIds) => patchFilters({ categoryIds })}
            defaultOpen={categoryOpen}
            noneText="لا توجد بنود."
          />
          {facets.party.length > 0 || filters.partyIds.length > 0 ? (
            <ListFilter
              idPrefix={`${kind}-party`}
              icon={Users}
              accent="violet"
              title="الجهات"
              allLabel="كل الجهات"
              listLabel="الجهات"
              searchPlaceholder="ابحث عن جهة"
              items={facets.party}
              selected={filters.partyIds}
              onChange={(partyIds) => patchFilters({ partyIds })}
            />
          ) : null}
          {facets.cashbox.length > 1 || filters.cashboxIds.length > 0 ? (
            <ListFilter
              idPrefix={`${kind}-cashbox`}
              icon={Landmark}
              accent="amber"
              title="الخزائن والمصارف"
              allLabel="كل الخزائن"
              listLabel="الخزائن والمصارف"
              searchPlaceholder="ابحث عن خزينة"
              items={facets.cashbox}
              selected={filters.cashboxIds}
              onChange={(cashboxIds) => patchFilters({ cashboxIds })}
            />
          ) : null}
          <MethodsFilter value={filters.methods} onChange={(methods) => patchFilters({ methods })} counts={facets.methodCounts} />
          {draftCount > 0 ? <StatusFilter includeDrafts={filters.includeDrafts} onChange={(includeDrafts) => patchFilters({ includeDrafts })} draftCount={draftCount} /> : null}
          <AmountFilter min={filters.minAmount} max={filters.maxAmount} onChange={({ min, max }) => patchFilters({ minAmount: min, maxAmount: max })} />
        </FiltersSection>

        <LayoutSection layout={layout} onChange={patchLayout} defaultTitle={text.defaultTitle} />
      </ReportOptionsDialogShell>

      {outputs.previewDialog}
    </>
  );
}
