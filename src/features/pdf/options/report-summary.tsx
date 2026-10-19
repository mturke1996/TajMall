'use client';

/**
 * The live summary of a report while its options change: how many entries match, the exact total, the
 * range in words, how many accounts and parties are involved, a page estimate, and calm notes when
 * something needs a look (nothing matches, a very large report, entries left out).
 *
 * Two shapes of the same content: `ReportSummaryPanel` is the side column of the desktop dialog;
 * `ReportSummaryBar` sits above the footer on a phone and opens to the same details.
 */
import { useId, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronUp, Info } from 'lucide-react';
import { entriesLabel, METHOD_LABEL_AR, type ReportMethod, type ReportWarning } from '@/lib/report-options';
import { arabicCount, cn } from '@/lib/utils';
import { Money, type Tone } from './option-ui';

export type ReportSummaryData = {
  tone: Tone;
  count: number;
  total: number;
  /** «إجمالي الإيرادات» */
  totalLabel: string;
  /** an extra figure beside the total when the report has two sides (money in and out), e.g. the journal */
  split?: { label: string; amount: number; tone: Tone }[];
  /** the range in words */
  range: string;
  facts: { label: string; value: ReactNode }[];
  breakdown?: { method: string; count: number; total: number }[];
  pages: number;
  warnings: ReportWarning[];
  /** how many filters restrict the report now */
  filtersActive: number;
  onClearFilters?: () => void;
};

const HEAD_TONE: Record<Tone, string> = {
  info: 'border-info-line bg-info-soft text-info-ink',
  success: 'border-success-line bg-success-soft text-success-ink',
  danger: 'border-danger-line bg-danger-soft text-danger-ink',
};
const BAR_TONE: Record<Tone, string> = { info: 'bg-chart-blue', success: 'bg-chart-green', danger: 'bg-chart-red' };

// the dual is genitive («نحو صفحتين») because it follows «نحو»
const PAGE_FORMS: [string, string, string, string] = ['صفحة واحدة', 'صفحتين', 'صفحات', 'صفحة'];
export const pagesLabel = (n: number) => `نحو ${arabicCount(n, PAGE_FORMS)}`;

function Warnings({ warnings }: { warnings: ReportWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {warnings.map((w) => (
        <li
          key={w.text}
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed',
            w.tone === 'warning' ? 'border-warning-line bg-warning-soft text-warning-ink' : 'border-info-line bg-info-soft text-info-ink',
          )}
        >
          {w.tone === 'warning' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <span>{w.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Headline({ data, compact }: { data: ReportSummaryData; compact?: boolean }) {
  return (
    <div className={cn('rounded-xl border', HEAD_TONE[data.tone], compact ? 'px-3 py-2.5' : 'px-4 py-3.5')}>
      <p className="text-[12.5px] font-medium">{entriesLabel(data.count)}</p>
      <p className={cn('mt-1 font-semibold leading-tight', compact ? 'text-[17px]' : 'text-[22px]')}>
        <Money value={data.total} />
      </p>
      <p className="mt-0.5 text-[12.5px]">{data.totalLabel}</p>
      {data.split?.length ? (
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-current/15 pt-2 text-[12.5px]">
          {data.split.map((s) => (
            <div key={s.label} className="flex items-baseline gap-1.5">
              <dt>{s.label}</dt>
              <dd className="font-medium">
                <Money value={s.amount} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function Details({ data }: { data: ReportSummaryData }) {
  const maxTotal = Math.max(...(data.breakdown ?? []).map((b) => b.total), 0);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[12.5px] text-ink-mute">الفترة</p>
        <p className="mt-0.5 text-[13.5px] font-medium leading-relaxed text-foreground">{data.range}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
        {data.facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-[12.5px] text-ink-mute">{f.label}</dt>
            <dd className="mt-0.5 truncate text-[13.5px] font-medium text-foreground">{f.value}</dd>
          </div>
        ))}
        <div className="min-w-0">
          <dt className="text-[12.5px] text-ink-mute">حجم التقرير</dt>
          <dd className="mt-0.5 text-[13.5px] font-medium text-foreground">{pagesLabel(data.pages)}</dd>
        </div>
      </dl>
      {data.breakdown && data.breakdown.length > 1 ? (
        <div>
          <p className="text-[12.5px] text-ink-mute">حسب طريقة الدفع</p>
          <ul className="mt-1.5 flex flex-col gap-2">
            {data.breakdown.map((b) => (
              <li key={b.method}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="text-foreground">{METHOD_LABEL_AR[b.method as ReportMethod] ?? b.method}</span>
                  <span className="text-ink-soft">
                    <Money value={b.total} />
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
                  <div className={cn('h-full rounded-full', BAR_TONE[data.tone])} style={{ width: `${maxTotal > 0 ? Math.max(3, Math.round((b.total / maxTotal) * 100)) : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.filtersActive > 0 && data.onClearFilters ? (
        <button
          type="button"
          onClick={data.onClearFilters}
          className="min-h-11 w-fit rounded-md px-2 text-[13px] font-medium text-info-ink hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8"
        >
          مسح كل التصفيات ({data.filtersActive})
        </button>
      ) : null}
    </div>
  );
}

/** The desktop column: the figures, then the details, then the notes. */
export function ReportSummaryPanel({ data }: { data: ReportSummaryData }) {
  return (
    <div className="flex flex-col gap-4" aria-label="ملخص التقرير" role="region">
      <h3 className="text-[13.5px] font-semibold text-foreground">ملخص التقرير</h3>
      <Headline data={data} />
      <Warnings warnings={data.warnings} />
      <Details data={data} />
    </div>
  );
}

/** The phone / tablet strip above the footer: the figures in one row, the details one tap away. */
export function ReportSummaryBar({ data }: { data: ReportSummaryData }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div role="region" aria-label="ملخص التقرير" className="border-t border-border bg-canvas-sunken/60">
      {open ? (
        <div id={panelId} className="max-h-[45dvh] overflow-y-auto overscroll-contain px-4 pb-1 pt-3">
          <Details data={data} />
        </div>
      ) : null}
      <div className="flex flex-col gap-2 px-4 py-2.5">
        {data.warnings.length > 0 ? <Warnings warnings={data.warnings.slice(0, open ? data.warnings.length : 1)} /> : null}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] text-ink-mute">{entriesLabel(data.count)}</span>
            <span className="block truncate text-[16px] font-semibold leading-snug text-foreground">
              <Money value={data.total} />
            </span>
          </span>
          <span className="shrink-0 text-[12.5px] text-ink-mute">{open ? 'إخفاء التفاصيل' : 'التفاصيل'}</span>
          <ChevronUp className={cn('size-4 shrink-0 text-ink-mute transition-transform', !open && 'rotate-180')} aria-hidden />
        </button>
      </div>
    </div>
  );
}
