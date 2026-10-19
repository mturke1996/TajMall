'use client';

/**
 * The option sections of a transactions report that are not the period: the filters (accounts, parties,
 * cashboxes, payment methods, status, amount range) and the layout (grouping, sorting, summary tables,
 * signature, title). Each filter is a folded row that says what it is set to, and «مسح» clears it without
 * opening it. They edit the plain objects of src/lib/report-options.ts and hold no report logic, so the
 * period journal dialog can pick the ones it needs.
 */
import { useId, type ElementType, type ReactNode } from 'react';
import { Banknote, CircleCheck, CreditCard, ListFilter as FilterIcon, Rows3 } from 'lucide-react';
import {
  GROUPING_OPTIONS,
  METHOD_LABEL_AR,
  PAYMENT_METHODS,
  SORT_OPTIONS,
  parseAmountRange,
  type FacetItem,
  type ReportLayout,
  type ReportMethod,
} from '@/lib/report-options';
import { arabicCount, formatMoney } from '@/lib/utils';
import type { Accent } from '@/components/dashboard/dashboard-ui';
import { ChipButton, ChoiceChips, Field, INPUT_CLASS, OptionDisclosure, OptionSection, SegmentedControl, ToggleRow, type Tone } from './option-ui';
import { SearchableMultiSelect } from './searchable-multi-select';

// ── the filters ──────────────────────────────────────────────────────────────

/** The card that holds the filter rows. `activeCount` filters restrict the report; «مسح الكل» clears every one. */
export function FiltersSection({ activeCount, onClearAll, children }: { activeCount: number; onClearAll: () => void; children: ReactNode }) {
  return (
    <OptionSection
      icon={FilterIcon}
      accent="amber"
      title="التصفية"
      description={activeCount > 0 ? arabicCount(activeCount, ['تصفية واحدة مفعّلة', 'تصفيتان مفعّلتان', 'تصفيات مفعّلة', 'تصفية مفعّلة']) : 'كلها اختيارية، وبدونها تدخل كل المعاملات'}
      action={
        activeCount > 0 ? (
          <button
            type="button"
            onClick={onClearAll}
            className="min-h-11 shrink-0 rounded-md px-2.5 text-[13px] font-medium text-info-ink hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8"
          >
            مسح الكل
          </button>
        ) : null
      }
      flush
    >
      {children}
    </OptionSection>
  );
}

/** A filter that picks from a long list (accounts, parties, cashboxes): search, select all, a count and a total per choice. */
export function ListFilter({
  idPrefix,
  icon,
  accent,
  title,
  allLabel,
  listLabel,
  searchPlaceholder,
  items,
  selected,
  onChange,
  defaultOpen,
  noneText,
}: {
  idPrefix: string;
  icon: ElementType;
  accent: Accent;
  title: string;
  /** what the row says while nothing is chosen: «كل البنود» */
  allLabel: string;
  /** names the list for screen readers */
  listLabel: string;
  searchPlaceholder: string;
  items: readonly FacetItem[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  defaultOpen?: boolean;
  noneText?: string;
}) {
  const active = selected.length > 0;
  return (
    <OptionDisclosure
      icon={icon}
      accent={accent}
      title={title}
      summary={active ? `${selected.length} من ${items.length}` : allLabel}
      active={active}
      onClear={() => onChange([])}
      defaultOpen={defaultOpen}
    >
      <SearchableMultiSelect idPrefix={idPrefix} label={listLabel} items={items} selected={selected} onChange={onChange} searchPlaceholder={searchPlaceholder} noneText={noneText} />
    </OptionDisclosure>
  );
}

/** Payment methods as chips, each with how many entries it would give under the other options. */
export function MethodsFilter({
  value,
  onChange,
  counts,
}: {
  value: ReportMethod[];
  onChange: (next: ReportMethod[]) => void;
  /** entries per method under the other options; a method that is not in the object has none */
  counts: Partial<Record<string, number>>;
}) {
  const active = value.length > 0;
  const toggle = (m: ReportMethod) => onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m]);
  return (
    <OptionDisclosure
      icon={CreditCard}
      accent="teal"
      title="طريقة الدفع"
      summary={active ? value.map((m) => METHOD_LABEL_AR[m]).join('، ') : 'كل الطرق'}
      active={active}
      onClear={() => onChange([])}
    >
      <div role="group" aria-label="طرق الدفع" className="flex flex-wrap gap-2">
        {PAYMENT_METHODS.map((m) => {
          const n = counts[m] ?? 0;
          return (
            <ChipButton key={m} selected={value.includes(m)} onClick={() => toggle(m)}>
              {METHOD_LABEL_AR[m]}
              <span className="tabular-nums text-ink-mute">{n}</span>
            </ChipButton>
          );
        })}
      </div>
    </OptionDisclosure>
  );
}

/**
 * What counts: posted and reconciled entries always; drafts only when this is on; voided entries never.
 * Show it only where drafts can exist (`draftCount` > 0), otherwise it would be a switch that does nothing.
 */
export function StatusFilter({ includeDrafts, onChange, draftCount }: { includeDrafts: boolean; onChange: (next: boolean) => void; draftCount: number }) {
  return (
    <OptionDisclosure
      icon={CircleCheck}
      accent="green"
      title="الحالة"
      summary={includeDrafts ? 'مع المسودات' : 'المعتمدة فقط'}
      active={includeDrafts}
      onClear={() => onChange(false)}
      clearLabel="المعتمدة فقط"
    >
      <ToggleRow
        checked={includeDrafts}
        onChange={onChange}
        title="تضمين المسودات"
        description={`في البيانات ${arabicCount(draftCount, ['مسودة', 'مسودتان', 'مسودات', 'مسودة'])} لم تُعتمد بعد. المعاملات الملغاة لا تدخل التقرير أبداً.`}
      />
    </OptionDisclosure>
  );
}

/** Minimum and maximum amount, as typed text so a half-typed number is never lost. The error comes from parseAmountRange. */
export function AmountFilter({ min, max, onChange }: { min: string; max: string; onChange: (next: { min: string; max: string }) => void }) {
  const id = useId();
  const { min: lo, max: hi, error } = parseAmountRange(min, max);
  const active = Boolean(min.trim() || max.trim());
  const summary = error
    ? 'تحقق من المبلغ'
    : lo != null && hi != null
      ? `من ${formatMoney(lo, 'LYD')} إلى ${formatMoney(hi, 'LYD')}`
      : lo != null
        ? `من ${formatMoney(lo, 'LYD')}`
        : hi != null
          ? `حتى ${formatMoney(hi, 'LYD')}`
          : 'بدون حد';
  return (
    <OptionDisclosure icon={Banknote} accent="blue" title="المبلغ" summary={summary} active={active} onClear={() => onChange({ min: '', max: '' })}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="من مبلغ" htmlFor={`${id}-min`} error={error}>
          <input
            id={`${id}-min`}
            inputMode="decimal"
            dir="ltr"
            value={min}
            onChange={(e) => onChange({ min: e.target.value, max })}
            placeholder="0"
            autoComplete="off"
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? `${id}-min-msg` : undefined}
            className={`${INPUT_CLASS} text-start`}
          />
        </Field>
        <Field label="إلى مبلغ" htmlFor={`${id}-max`}>
          <input
            id={`${id}-max`}
            inputMode="decimal"
            dir="ltr"
            value={max}
            onChange={(e) => onChange({ min, max: e.target.value })}
            placeholder="بدون حد"
            autoComplete="off"
            aria-invalid={Boolean(error) || undefined}
            className={`${INPUT_CLASS} text-start`}
          />
        </Field>
      </div>
    </OptionDisclosure>
  );
}

// ── the layout ───────────────────────────────────────────────────────────────

/**
 * How the report is laid out: grouping, sorting, the summary tables, the signature lines, and the title.
 * The tables themselves are not an option: they print as they always have.
 */
export function LayoutSection({
  layout,
  onChange,
  defaultTitle,
  tone = 'info',
}: {
  layout: ReportLayout;
  onChange: (patch: Partial<ReportLayout>) => void;
  /** the report's own title, shown as the placeholder of the title field */
  defaultTitle: string;
  tone?: Tone;
}) {
  const id = useId();
  return (
    <OptionSection icon={Rows3} accent="teal" title="شكل التقرير">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p aria-hidden className="text-[12.5px] font-medium text-ink-soft">
            تجميع الجداول
          </p>
          <ChoiceChips label="تجميع الجداول" value={layout.grouping} onChange={(grouping) => onChange({ grouping })} options={GROUPING_OPTIONS} tone={tone} />
        </div>

        <div className="flex flex-col gap-2">
          <p aria-hidden className="text-[12.5px] font-medium text-ink-soft">
            ترتيب المعاملات
          </p>
          <SegmentedControl label="ترتيب المعاملات" value={layout.sort} onChange={(sort) => onChange({ sort })} options={SORT_OPTIONS} />
        </div>

        <div className="flex flex-col gap-2">
          <ToggleRow checked={layout.includeSummaries} onChange={(includeSummaries) => onChange({ includeSummaries })} title="جداول الملخص" description="ملخص البنود والخزائن وطرق الدفع قبل الجداول" />
          <ToggleRow checked={layout.signature} onChange={(signature) => onChange({ signature })} title="خانتا التوقيع" description="سطران في آخر التقرير: أعدّه، اعتمده" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="عنوان التقرير" htmlFor={`${id}-title`}>
            <input
              id={`${id}-title`}
              value={layout.title}
              onChange={(e) => onChange({ title: e.target.value })}
              maxLength={120}
              placeholder={defaultTitle}
              autoComplete="off"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="عنوان فرعي (اختياري)" htmlFor={`${id}-subtitle`}>
            <input
              id={`${id}-subtitle`}
              value={layout.subtitle}
              onChange={(e) => onChange({ subtitle: e.target.value })}
              maxLength={160}
              placeholder="يُكتب تحت العنوان"
              autoComplete="off"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <p className="-mt-1 text-[12.5px] text-ink-mute">يُطبع في كل تقرير اسم من أصدره وتاريخ الطباعة.</p>
      </div>
    </OptionSection>
  );
}
