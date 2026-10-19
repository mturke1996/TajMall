'use client';

/**
 * How the period journal is laid out: the order of the entries inside each table (detailed level only, the
 * summary tables have no entries to order), the signature lines, and the title. The tables themselves
 * (one per cashbox or bank, largest first) are not an option: they print as they always have.
 */
import { useId } from 'react';
import { Rows3 } from 'lucide-react';
import { JOURNAL_DEFAULT_TITLE, type JournalLayout, type JournalLevel } from '@/lib/period-journal-options';
import { SORT_OPTIONS } from '@/lib/report-options';
import { Field, INPUT_CLASS, OptionSection, SegmentedControl, ToggleRow } from './option-ui';

export function JournalLayoutSection({
  layout,
  level,
  onChange,
}: {
  layout: JournalLayout;
  level: JournalLevel;
  onChange: (patch: Partial<JournalLayout>) => void;
}) {
  const id = useId();
  return (
    <OptionSection icon={Rows3} accent="teal" title="شكل التقرير">
      <div className="flex flex-col gap-5">
        {level === 'DETAILED' ? (
          <div className="flex flex-col gap-2">
            <p aria-hidden className="text-[12.5px] font-medium text-ink-soft">
              ترتيب المعاملات داخل كل جدول
            </p>
            <SegmentedControl label="ترتيب المعاملات داخل كل جدول" value={layout.sort} onChange={(sort) => onChange({ sort })} options={SORT_OPTIONS} />
          </div>
        ) : null}

        <ToggleRow checked={layout.signature} onChange={(signature) => onChange({ signature })} title="خانتا التوقيع" description="سطران في آخر التقرير: أعدّه، اعتمده" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="عنوان التقرير" htmlFor={`${id}-title`}>
            <input
              id={`${id}-title`}
              value={layout.title}
              onChange={(e) => onChange({ title: e.target.value })}
              maxLength={120}
              placeholder={JOURNAL_DEFAULT_TITLE}
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
