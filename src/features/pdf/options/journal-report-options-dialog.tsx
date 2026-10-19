'use client';

/**
 * The options dialog of the accounting period entry (قيد الفترة المحاسبي) PDF. It edits a
 * `PeriodJournalOptions` (src/lib/period-journal-options.ts), shows the result while it changes, and builds
 * PeriodJournalExecutivePDF from it, one table per cashbox or bank.
 *
 * It is assembled from the same kit as the revenues and expenses dialog (shell, presets bar, period picker,
 * list filters, summary panel, output buttons) plus four journal pieces: choice cards for the basis and the
 * level, a single-account picker, and the layout section. All the rules are pure functions in
 * src/lib/period-journal-options.ts.
 */
import { useCallback, useMemo, useState } from 'react';
import { BookOpen, CalendarClock, HandCoins, Landmark, Layers, ListChecks, Scale, Sigma, Tags, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { CashboxRow, CategoryRow, TransactionWithRelations } from '@/lib/db/types';
import { CASHBOX_KIND_LABEL_AR } from '@/lib/cashbox-labels';
import { BRAND } from '@/lib/brand';
import {
  ALL_ACCOUNTS,
  BASIS_OPTIONS,
  JOURNAL_DEFAULT_TITLE,
  KIND_OPTIONS,
  LEVEL_OPTIONS,
  activeJournalFilterCount,
  applyJournalPreset,
  buildJournalData,
  buildJournalRowTest,
  buildJournalScopeNote,
  clearJournalFilters,
  defaultJournalOptions,
  describeJournalOptions,
  estimateJournalPages,
  isJournalPresetActive,
  journalBasisLabel,
  journalCategoryLabel,
  journalFileName,
  journalPeriodLabel,
  journalWarnings,
  pruneJournalChoices,
  selectJournalRows,
  type JournalBasis,
  type JournalFilters,
  type JournalKind,
  type JournalLayout,
  type JournalLevel,
  type JournalPreset,
  type PeriodJournalOptions,
} from '@/lib/period-journal-options';
import {
  availableYears,
  buildFacetCatalogs,
  facetItems,
  NO_PARTY,
  formatPrintStamp,
  resolvePeriod,
  summarizeRows,
  type FacetCatalogEntry,
  type PeriodSelection,
} from '@/lib/report-options';
import { useCurrentProfile } from '@/lib/supabase/use-profile';
import { arabicCount, formatMoney, todayISODate } from '@/lib/utils';
import { JournalAccountPicker } from './journal-account-picker';
import { JournalLayoutSection } from './journal-layout-section';
import { ChoiceCards, type ChoiceCardOption } from './journal-option-cards';
import { useJournalPresets } from './journal-presets';
import { OptionDisclosure, OptionSection, SegmentedControl } from './option-ui';
import { PeriodPicker } from './period-picker';
import { PresetsBar } from './presets-bar';
import { AmountFilter, FiltersSection, ListFilter, MethodsFilter } from './report-option-sections';
import { ReportOptionsDialogShell, ReportOutputBar } from './report-options-shell';
import { ReportSummaryBar, ReportSummaryPanel, type ReportSummaryData } from './report-summary';
import { useReportOutputs } from './use-report-outputs';

export type JournalReportOptionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** every account; the dialog offers the ones of the chosen type */
  categories: CategoryRow[];
  cashboxes: CashboxRow[];
  /** every transaction the page has; the dialog filters them itself */
  transactions: TransactionWithRelations[];
  /** an account the page has chosen; the dialog starts with it */
  defaultCategoryId?: string;
  /** what the page is showing: a month, or a whole year when `month` is missing */
  defaultPeriod?: { year: number; month?: number };
};

const BASIS_CARDS: ChoiceCardOption<JournalBasis>[] = [
  { ...BASIS_OPTIONS[0], icon: HandCoins, accent: 'green' },
  { ...BASIS_OPTIONS[1], icon: CalendarClock, accent: 'amber' },
  { ...BASIS_OPTIONS[2], icon: Scale, accent: 'violet' },
];
const LEVEL_CARDS: ChoiceCardOption<JournalLevel>[] = [
  { ...LEVEL_OPTIONS[0], icon: Sigma, accent: 'blue' },
  { ...LEVEL_OPTIONS[1], icon: ListChecks, accent: 'teal' },
];

const kindOfCategory = (c: Pick<CategoryRow, 'type'> | undefined): JournalKind | null => (c?.type === 'REVENUE' ? 'REVENUE' : c?.type === 'EXPENSE' ? 'EXPENSE' : null);

export function JournalReportOptionsDialog({ open, onOpenChange, categories, cashboxes, transactions, defaultCategoryId = ALL_ACCOUNTS, defaultPeriod }: JournalReportOptionsDialogProps) {
  const today = todayISODate();
  const { profile, user } = useCurrentProfile();

  const [options, setOptions] = useState<PeriodJournalOptions>(() => {
    const category = categories.find((c) => c.id === defaultCategoryId);
    return defaultJournalOptions(todayISODate(), {
      categoryId: category ? category.id : ALL_ACCOUNTS,
      kind: kindOfCategory(category) ?? undefined,
      period: defaultPeriod,
    });
  });
  const { basis, level, kind, categoryId, period, filters, layout } = options;
  const kindText = KIND_OPTIONS.find((k) => k.id === kind) ?? KIND_OPTIONS[0];
  const tone = kind === 'REVENUE' ? 'success' : 'danger';

  const setPeriod = (next: PeriodSelection) => setOptions((o) => ({ ...o, period: next }));
  const patchFilters = (patch: Partial<JournalFilters>) => setOptions((o) => ({ ...o, filters: { ...o.filters, ...patch } }));
  const patchLayout = (patch: Partial<JournalLayout>) => setOptions((o) => ({ ...o, layout: { ...o.layout, ...patch } }));
  // another type has other accounts and other parties (tenants pay, suppliers are paid): the account goes back to «all»
  // and the parties that do not appear under the new type are let go
  const setKind = (next: JournalKind) =>
    setOptions((o) => {
      if (o.kind === next) return o;
      const known = new Set<string>([NO_PARTY]);
      for (const t of transactions) if (t.kind === next && t.contact?.id) known.add(t.contact.id);
      return { ...o, kind: next, categoryId: ALL_ACCOUNTS, filters: { ...o.filters, partyIds: o.filters.partyIds.filter((id) => known.has(id)) } };
    });

  // the words typed in the title fields do not change what matches, so they stay out of the heavy work below
  const { sort, signature } = layout;
  const core = useMemo<PeriodJournalOptions>(
    () => ({ basis, level, kind, categoryId, period, filters, layout: { sort, signature, title: '', subtitle: '' } }),
    [basis, level, kind, categoryId, period, filters, sort, signature],
  );

  // ── what matches ───────────────────────────────────────────────────────────
  const selection = useMemo(() => selectJournalRows(transactions, core, today), [transactions, core, today]);
  const summary = useMemo(() => summarizeRows(selection.rows), [selection.rows]);

  // ── the lists, with what each choice would add under the other options ─────
  const kindRows = useMemo(() => transactions.filter((t) => t.kind === kind), [transactions, kind]);
  const catalogs = useMemo(() => {
    const accounts = categories.filter((c) => (c.type === kind || c.kind === kind) && c.active !== false);
    const built = buildFacetCatalogs(kindRows, accounts);
    // every cashbox and bank is offered, also one that has no entries yet
    const boxes = new Map<string, FacetCatalogEntry>();
    for (const b of cashboxes) boxes.set(b.id, { id: b.id, label: b.name_ar, hint: b.bank_name || CASHBOX_KIND_LABEL_AR[b.kind] });
    for (const b of built.cashbox) if (!boxes.has(b.id)) boxes.set(b.id, b);
    return { ...built, cashbox: [...boxes.values()].sort((a, b) => a.label.localeCompare(b.label, 'ar')) };
  }, [categories, kind, kindRows, cashboxes]);
  const facets = useMemo(() => {
    const rowsWithout = (skip: 'category' | 'party' | 'cashbox' | 'method') => transactions.filter(buildJournalRowTest(core, today, { skip }).test);
    const methodCounts: Record<string, number> = {};
    for (const m of summarizeRows(rowsWithout('method')).byMethod) methodCounts[m.method] = m.count;
    return {
      category: facetItems(rowsWithout('category'), 'category', catalogs.category),
      party: facetItems(rowsWithout('party'), 'party', catalogs.party),
      cashbox: facetItems(rowsWithout('cashbox'), 'cashbox', catalogs.cashbox),
      methodCounts,
    };
  }, [transactions, core, today, catalogs]);

  const names = useMemo(
    () => ({
      party: new Map(catalogs.party.map((c) => [c.id, c.label])),
      cashbox: new Map(catalogs.cashbox.map((c) => [c.id, c.label])),
    }),
    [catalogs],
  );

  // the account chosen, as the report names it
  const account = useMemo(() => {
    if (categoryId === ALL_ACCOUNTS) return null;
    const c = categories.find((x) => x.id === categoryId);
    if (c) return { name_ar: c.name_ar, code: c.code };
    const fromRow = transactions.find((t) => t.category_id === categoryId)?.category;
    return fromRow ? { name_ar: fromRow.name_ar, code: fromRow.code } : { name_ar: 'بند محدد', code: '—' };
  }, [categoryId, categories, transactions]);

  // ── the report ─────────────────────────────────────────────────────────────
  const data = useMemo(() => buildJournalData(selection.rows, account), [selection.rows, account]);
  const shownPeriod = useMemo(() => resolvePeriod(period, today, { min: summary.firstDate, max: summary.lastDate }), [period, today, summary.firstDate, summary.lastDate]);
  const pages = estimateJournalPages({ level, groups: data.bankGroups.length, rows: data.filteredCount, signature });
  const years = useMemo(() => {
    const list = new Set([...availableYears(transactions.map((t) => t.tx_date), today), period.year]);
    return [...list].sort((a, b) => b - a);
  }, [transactions, today, period.year]);
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

  const reportTitle = layout.title.trim() || JOURNAL_DEFAULT_TITLE;
  const periodLabel = journalPeriodLabel(period, selection.period);
  const categoryLabel = journalCategoryLabel(kind, account);
  const basisLabel = journalBasisLabel(basis);
  const fileName = journalFileName({ scope: account?.name_ar ?? kindText.label, level, periodSlug: selection.period.slug, today });
  const canOutput = selection.valid && data.filteredCount > 0;
  const printedBy = profile?.full_name_ar || profile?.full_name || user?.email || '';

  // ── outputs ────────────────────────────────────────────────────────────────
  const buildDocument = useCallback(async () => {
    const { JournalExecutiveDocument } = await import('./journal-executive-document');
    const scopeNote = buildJournalScopeNote({
      filters,
      layout: { sort },
      level,
      partyName: (id) => names.party.get(id),
      cashboxName: (id) => names.cashbox.get(id),
    });
    return (
      <JournalExecutiveDocument
        titleAr={reportTitle}
        subtitleAr={layout.subtitle.trim() || `${periodLabel} · ${categoryLabel} · ${basisLabel}`}
        documentTitle={`${BRAND.name} - قيد الفترة - ${periodLabel}`}
        periodLabel={periodLabel}
        categoryLabel={categoryLabel}
        basisLabel={basisLabel}
        viewLevel={level}
        grandTotal={data.grandTotal}
        totalEntries={data.filteredCount}
        priorPeriodTotal={data.priorPeriodTotal}
        priorPeriodCount={data.priorPeriodCount}
        currentPeriodTotal={data.currentPeriodTotal}
        currentPeriodCount={data.currentPeriodCount}
        futurePeriodTotal={data.futurePeriodTotal}
        futurePeriodCount={data.futurePeriodCount}
        bankGroups={data.bankGroups}
        categoriesSummary={data.categoriesSummary}
        paymentMethodsSummary={data.paymentMethodsSummary}
        extras={{ scopeNote, printedBy: printedBy || undefined, printedAt: formatPrintStamp(), signature }}
      />
    );
  }, [filters, sort, level, names, reportTitle, layout.subtitle, periodLabel, categoryLabel, basisLabel, data, printedBy, signature]);

  const outputs = useReportOutputs({ buildDocument, fileName, title: reportTitle, shareText: `${periodLabel} - ${categoryLabel}`, disabled: !canOutput });

  // ── presets ────────────────────────────────────────────────────────────────
  const presets = useJournalPresets(today);
  const activePresetId = useMemo(() => [...presets.builtIn, ...presets.saved].find((p) => isJournalPresetActive(options, p))?.id ?? null, [presets.builtIn, presets.saved, options]);

  const applyOne = (preset: JournalPreset) => {
    const parties = new Set<string>();
    const boxes = new Set<string>(cashboxes.map((b) => b.id));
    for (const t of transactions) {
      const p = t.contact?.id;
      if (p) parties.add(p);
      if (t.cashbox_id) boxes.add(t.cashbox_id);
    }
    const known = { categories: new Map(categories.map((c) => [c.id, kindOfCategory(c)])), parties, cashboxes: boxes };
    const { options: next, dropped } = pruneJournalChoices(applyJournalPreset(options, preset), known);
    setOptions(next);
    if (dropped > 0) toast.info(`${arabicCount(dropped, ['اختيار واحد', 'اختياران', 'اختيارات', 'اختياراً'])} من هذا الإعداد لم يعد موجوداً فتُرك.`);
  };
  const saveCurrent = (name: string) => {
    const error = presets.save(name, options);
    if (!error) toast.success('تم حفظ الإعداد');
    return error;
  };
  const deleteOne = (preset: JournalPreset) => void presets.remove(preset.id);

  // ── the summary ────────────────────────────────────────────────────────────
  const filtersActive = activeJournalFilterCount(filters);
  const summaryData: ReportSummaryData = {
    tone,
    count: data.filteredCount,
    total: data.grandTotal,
    totalLabel: account ? `إجمالي ${account.name_ar}` : kindText.totalLabel,
    // revenue is credited against the cashbox, an expense is debited against it: the entry always balances
    split: [
      { label: 'مدين', amount: data.grandTotal, tone: 'info' },
      { label: 'دائن', amount: data.grandTotal, tone: 'info' },
    ],
    range: basis === 'RENT_MONTH_TARGET' ? `${shownPeriod.words} (بحسب شهر الاستحقاق)` : shownPeriod.words,
    facts: [
      { label: 'البنود', value: summary.categories },
      { label: 'الخزائن والمصارف', value: data.bankGroups.length },
      { label: 'الجهات', value: summary.parties },
      { label: 'طرق الدفع', value: summary.methods },
    ],
    breakdown: summary.byMethod,
    pages,
    warnings: journalWarnings({
      count: data.filteredCount,
      pages,
      issues: selection.issues,
      inPeriod: selection.inPeriod,
      excluded: selection.excluded,
      priorTotal: data.priorPeriodTotal,
      priorCount: data.priorPeriodCount,
      formatMoney: (amount) => formatMoney(amount, 'LYD'),
    }),
    filtersActive,
    onClearFilters: () => patchFilters(clearJournalFilters()),
  };

  const accountLabel = account ? account.name_ar : kindText.allAccounts;

  return (
    <>
      <ReportOptionsDialogShell
        open={open}
        onOpenChange={onOpenChange}
        title="خيارات قيد الفترة المحاسبي"
        description="حدد الأساس والفترة ومستوى التفصيل"
        icon={BookOpen}
        accent={kind === 'REVENUE' ? 'green' : 'red'}
        summaryPanel={<ReportSummaryPanel data={summaryData} />}
        summaryBar={<ReportSummaryBar data={summaryData} />}
        footer={<ReportOutputBar outputs={outputs} disabled={!canOutput} onClose={() => onOpenChange(false)} />}
      >
        <PresetsBar<JournalPreset>
          builtIn={presets.builtIn}
          saved={presets.saved}
          activeId={activePresetId}
          persisted={presets.persisted}
          onApply={applyOne}
          onDelete={deleteOne}
          onRestore={presets.restore}
          onSave={saveCurrent}
          describe={(p) => describeJournalOptions(p.options, p.keepKind)}
        />

        <OptionSection icon={Scale} accent="violet" title="الأساس المحاسبي">
          <ChoiceCards label="الأساس المحاسبي" value={basis} onChange={(next) => setOptions((o) => ({ ...o, basis: next }))} options={BASIS_CARDS} />
        </OptionSection>

        <OptionSection icon={ListChecks} accent="teal" title="مستوى التفصيل">
          <ChoiceCards label="مستوى التفصيل" value={level} onChange={(next) => setOptions((o) => ({ ...o, level: next }))} options={LEVEL_CARDS} />
        </OptionSection>

        <OptionSection icon={Layers} accent={kind === 'REVENUE' ? 'green' : 'red'} title="النوع والحساب" flush>
          <div className="px-3.5 py-3.5 sm:px-4">
            <SegmentedControl label="نوع الحركات" value={kind} onChange={setKind} options={KIND_OPTIONS.map((k) => ({ id: k.id, label: k.label }))} />
          </div>
          <OptionDisclosure
            icon={Tags}
            accent="blue"
            title="الحساب"
            summary={accountLabel}
            active={categoryId !== ALL_ACCOUNTS}
            onClear={() => setOptions((o) => ({ ...o, categoryId: ALL_ACCOUNTS }))}
            clearLabel={kindText.allAccounts}
            defaultOpen={defaultCategoryId !== ALL_ACCOUNTS}
          >
            <JournalAccountPicker
              idPrefix={`journal-account-${kind}`}
              label={`حسابات ${kindText.plural}`}
              allLabel={kindText.allAccounts}
              items={facets.category}
              value={categoryId}
              onChange={(next) => setOptions((o) => ({ ...o, categoryId: next }))}
            />
          </OptionDisclosure>
        </OptionSection>

        <PeriodPicker value={period} onChange={setPeriod} resolved={shownPeriod} years={years} fallbackRange={dataSpan} />

        <FiltersSection activeCount={filtersActive} onClearAll={() => patchFilters(clearJournalFilters())}>
          {facets.party.length > 0 || filters.partyIds.length > 0 ? (
            <ListFilter
              idPrefix="journal-party"
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
              idPrefix="journal-cashbox"
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
          <AmountFilter min={filters.minAmount} max={filters.maxAmount} onChange={({ min, max }) => patchFilters({ minAmount: min, maxAmount: max })} />
        </FiltersSection>

        <JournalLayoutSection layout={layout} level={level} onChange={patchLayout} />
      </ReportOptionsDialogShell>

      {outputs.previewDialog}
    </>
  );
}
