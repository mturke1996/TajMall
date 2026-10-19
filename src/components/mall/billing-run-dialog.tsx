'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronLeft, Loader2, Search } from 'lucide-react';
import type { UseMutationResult } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { matchesSearch } from '@/lib/arabic-search';
import {
  billingCountLine,
  billingEndedActiveNote,
  billingFollowUpDetail,
  billingFollowUpTitle,
  billingIsLate,
  billingLeftLine,
  billingMonthOptions,
  billingPostingRule,
  billingRunBreakdown,
  billingRunHeadline,
  buildBillingPreview,
  latestIncompleteMonth,
  type BillingMissingLine,
  type BillingMonthStatus,
  type BillingPreview,
  type BillingRunResult,
} from '@/lib/billing-preview';
import { useBillingSources, useRunMonthlyBilling } from '@/lib/db/billing-queries';
import { useFiscalPeriods } from '@/lib/db/mall-queries';
import { formatMonthLabelAr } from '@/lib/rent-months';
import { friendlyError } from '@/lib/user-messages';
import { arabicCount, cn, formatDate, formatMoney, todayISODate } from '@/lib/utils';

const CONTRACTS: [string, string, string, string] = ['عقد واحد', 'عقدان', 'عقود', 'عقداً'];

/** A list this short is shown open; a longer one starts folded so the counts stay in view on a phone. */
const OPEN_BELOW = 7;
/** Search appears once the list is long enough to need it. */
const SEARCH_ABOVE = 8;
const ROWS_STEP = 50;

// full-height sheet on a phone (thumb-reachable footer), a centred dialog from sm up
const SHEET =
  'flex flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-h-[min(90dvh,46rem)] sm:max-w-[30rem]';

type Run = UseMutationResult<BillingRunResult | null, Error, string>;

function MissingList({ lines }: { lines: BillingMissingLine[] }) {
  const [open, setOpen] = useState(lines.length < OPEN_BELOW);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(ROWS_STEP);

  const filtered = useMemo(
    () => (query.trim() ? lines.filter((l) => matchesSearch(query, [l.tenantName, l.unitNumber])) : lines),
    [lines, query],
  );
  const rows = filtered.slice(0, shown);

  return (
    <section aria-labelledby="billing-missing-heading" aria-live="off" className="surface overflow-hidden">
      <h3 id="billing-missing-heading" className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="billing-missing-list"
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-start text-[13.5px] font-semibold text-foreground hover:bg-canvas-sunken focus-visible:bg-canvas-sunken focus-visible:outline-hidden"
        >
          <span>
            العقود الناقصة <span className="font-normal tabular-nums text-ink-mute">({lines.length})</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 stroke-[1.6] text-ink-mute', open && 'rotate-180')} aria-hidden />
        </button>
      </h3>
      <div id="billing-missing-list" hidden={!open} className="border-t border-border">
        {lines.length > SEARCH_ABOVE && (
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute inset-s-5 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.6] text-ink-mute" aria-hidden />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(ROWS_STEP);
              }}
              placeholder="بحث باسم المستأجر أو رقم المحل…"
              aria-label="بحث في العقود الناقصة"
              className="h-11 ps-9 sm:h-10"
            />
          </div>
        )}
        {filtered.length === 0 ? (
          <p className="px-4 py-5 text-center text-[13px] text-ink-mute">لا عقد ناقص يطابق البحث.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((l) => (
              <li key={l.contractId}>
                <Link
                  href={`/contacts/${l.tenantId}`}
                  prefetch={false}
                  className="group flex min-h-11 items-start justify-between gap-3 px-4 py-2.5 hover:bg-canvas-sunken focus-visible:bg-canvas-sunken focus-visible:outline-hidden"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-foreground">{l.tenantName}</span>
                    <span className="block text-[12px] text-ink-mute">{l.unitNumber ? `محل ${l.unitNumber}` : 'بلا وحدة'}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-end text-[12.5px] tabular-nums text-foreground">
                      {l.missingRent != null && <span className="block">إيجار {formatMoney(l.missingRent, 'LYD')}</span>}
                      {l.missingService != null && <span className="block">خدمات {formatMoney(l.missingService, 'LYD')}</span>}
                    </span>
                    <ChevronLeft className="h-4 w-4 shrink-0 text-ink-mute group-hover:text-foreground" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {rows.length < filtered.length && (
          <div className="border-t border-border p-2">
            <Button type="button" variant="ghost" className="h-11 w-full text-[13px] sm:h-9" onClick={() => setShown((n) => n + ROWS_STEP)}>
              عرض المزيد · {arabicCount(filtered.length - rows.length, CONTRACTS)}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

const EXEMPT_NOTE: [string, string, string, string] = [
  'مستأجر واحد معفى من إيجار هذا الشهر، فلا يُحتسب إيجاره.',
  'مستأجران معفيان من إيجار هذا الشهر، فلا يُحتسب إيجارهما.',
  'مستأجرين معفين من إيجار هذا الشهر، فلا يُحتسب إيجارهم.',
  'مستأجراً معفى من إيجار هذا الشهر، فلا يُحتسب إيجارهم.',
];
const UNPRICED_NOTE: [string, string, string, string] = [
  'عقد واحد بلا إيجار ولا خدمات في بياناته، فلا يُحتسب هنا.',
  'عقدان بلا إيجار ولا خدمات في بياناتهما، فلا يُحتسبان هنا.',
  'عقود بلا إيجار ولا خدمات في بياناتها، فلا تُحتسب هنا.',
  'عقداً بلا إيجار ولا خدمات في بياناتها، فلا تُحتسب هنا.',
];

function Counts({ preview, month }: { preview: BillingPreview; month: string }) {
  const pct = preview.total > 0 ? Math.round((preview.generated / preview.total) * 100) : 0;
  const hasAside = preview.exemptTenants > 0 || preview.unpriced > 0 || preview.endedActive > 0;

  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-mute">{formatMonthLabelAr(month)}</p>
        {preview.total > 0 && preview.missing === 0 && <Badge variant="success">مكتمل</Badge>}
        {preview.future && preview.generated === 0 && <Badge variant="neutral">لم يبدأ بعد</Badge>}
      </div>
      <p className="mt-1 text-[17px] font-semibold tabular-nums text-foreground">{billingCountLine(preview)}</p>
      {preview.total > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas-sunken" aria-hidden>
          <div className={cn('h-full rounded-full', preview.missing === 0 ? 'bg-success' : 'bg-ink-mute')} style={{ width: `${pct}%` }} />
        </div>
      )}
      {preview.missing > 0 && (
        <div className="mt-3 space-y-1 text-[12.5px] text-ink-mute">
          {preview.missingAmount > 0 && <p className="tabular-nums">قيمة الناقص حسب العقود: {formatMoney(preview.missingAmount, 'LYD')}</p>}
          <p>قد يستثني النظام بعضها (مثل شهر معفى من الإيجار)، وسيُبلغك بما أنشأه فعلاً.</p>
        </div>
      )}
      {hasAside && (
        <div className="mt-3 space-y-1 border-t border-border pt-3 text-[12.5px] text-ink-mute">
          {preview.exemptTenants > 0 && <p>{arabicCount(preview.exemptTenants, EXEMPT_NOTE)}</p>}
          {preview.unpriced > 0 && <p>{arabicCount(preview.unpriced, UNPRICED_NOTE)}</p>}
          {preview.endedActive > 0 && <p>{billingEndedActiveNote(preview.endedActive)}</p>}
          {(preview.unpriced > 0 || preview.endedActive > 0) && (
            <p>
              <Link href="/mall?tab=contracts" className="text-foreground underline underline-offset-2">
                راجع العقود
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function EarlierMonths({
  months,
  selected,
  blocked,
  busy,
  onPick,
}: {
  months: BillingMonthStatus[];
  selected: string;
  blocked: Set<string>;
  /** a run is in flight: switching month now would drop its result */
  busy: boolean;
  onPick: (month: string) => void;
}) {
  // newest first; the month being previewed is already above
  const others = months.filter((m) => m.month !== selected).reverse();
  if (others.length === 0) return null;
  const incomplete = others.filter((m) => m.missing > 0);

  if (incomplete.length === 0) {
    return <p className="px-1 text-[12.5px] text-ink-mute">{others.length === months.length ? 'الأشهر الثلاثة الأخيرة مكتملة.' : 'بقية الأشهر الثلاثة الأخيرة مكتملة.'}</p>;
  }
  return (
    <section aria-labelledby="billing-earlier-heading" aria-live="off" className="space-y-2">
      <h3 id="billing-earlier-heading" className="px-1 text-[13px] font-semibold text-foreground">
        أشهر أخيرة ناقصة
      </h3>
      <ul className="surface divide-y divide-border overflow-hidden">
        {incomplete.map((m) => {
          const closed = blocked.has(m.month);
          return (
            <li key={m.month}>
              <button
                type="button"
                disabled={closed || busy}
                onClick={() => onPick(m.month)}
                className="group flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-start hover:bg-canvas-sunken focus-visible:bg-canvas-sunken focus-visible:outline-hidden disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-foreground">{formatMonthLabelAr(m.month)}</span>
                  <span className="block text-[12px] tabular-nums text-ink-mute">{closed ? 'الفترة مقفلة' : billingCountLine(m)}</span>
                </span>
                {!closed && <ChevronLeft className="h-4 w-4 shrink-0 text-ink-mute group-hover:text-foreground" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RunResult({ result, preview, refreshing, refreshFailed }: { result: { month: string; data: BillingRunResult | null }; preview: BillingPreview | null; refreshing: boolean; refreshFailed: boolean }) {
  const { data } = result;
  const created = data?.created ?? 0;
  const afterLine = refreshing
    ? 'جارٍ تحديث العدّ…'
    : refreshFailed || !preview
      ? 'تعذّر تحديث العدّ بعد التوليد؛ أعد فتح الصفحة لترى الناقص.'
      : preview.missing > 0
        ? `${billingLeftLine(preview.missing)}. النظام يتخطى المعفى من الإيجار ومن لم تبدأ مطالبته؛ راجع القائمة.`
        : 'الشهر مكتمل الآن.';

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3',
        data && created > 0 ? 'border-success-line bg-success-soft text-success-ink' : 'border-border bg-canvas-sunken text-foreground',
      )}
    >
      <p className="text-[14px] font-semibold">
        {data ? billingRunHeadline(data) : 'اكتمل التوليد'} · {formatMonthLabelAr(result.month)}
      </p>
      {data && billingRunBreakdown(data) && <p className="mt-0.5 text-[12.5px] tabular-nums">{billingRunBreakdown(data)}</p>}
      {data && created === 0 && <p className="mt-0.5 text-[12.5px]">الشهر مولَّد مسبقاً، أو معفى، أو لم تبدأ مطالبة المستأجرين فيه.</p>}
      {!data && <p className="mt-0.5 text-[12.5px]">لم يصل عدد المطالبات التي أُنشئت؛ راجع القائمة بعد التحديث.</p>}
      <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px]">
        {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        {afterLine}
      </p>
    </div>
  );
}

function BillingRunBody({ run, initialMonth, onClose }: { run: Run; initialMonth?: string; onClose: () => void }) {
  const [today] = useState(() => todayISODate());
  const currentMonth = today.slice(0, 7);
  // months the preview reads charges for; a link to any other month opens on the current one
  const options = useMemo(() => billingMonthOptions(today), [today]);
  const [month, setMonth] = useState(() => (initialMonth && options.includes(initialMonth) ? initialMonth : currentMonth));
  const [result, setResult] = useState<{ month: string; data: BillingRunResult | null } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const sources = useBillingSources(today);
  const periods = useFiscalPeriods();

  // months whose period (and today's) is closed: the server would refuse them, so they cannot be picked
  const blocked = useMemo(() => {
    const set = new Set<string>();
    if (!periods.data) return set;
    for (const m of options) if (billingPostingRule({ month: m, today, periods: periods.data }) === 'blocked') set.add(m);
    return set;
  }, [options, periods.data, today]);
  const rule = periods.data ? billingPostingRule({ month, today, periods: periods.data }) : 'open';

  const ready = sources.state === 'ready' ? sources : null;
  const contracts = ready?.contracts;
  const charges = ready?.charges;
  const exempt = ready?.exempt;
  const preview = useMemo(
    () => (contracts && charges ? buildBillingPreview({ contracts, charges, month, today, exemptMonths: exempt }) : null),
    [contracts, charges, exempt, month, today],
  );

  const degraded = sources.state === 'error';
  const nothingToDo = preview != null && preview.missing === 0;
  const canRun = !run.isPending && rule !== 'blocked' && (degraded || (preview != null && preview.missing > 0));

  function changeMonth(next: string) {
    setMonth(next);
    setResult(null);
    run.reset();
  }

  function start() {
    if (!canRun) return;
    run.mutate(month, {
      onSuccess: (data) => {
        setResult({ month, data });
        scroller.current?.scrollTo({ top: 0 });
      },
    });
  }

  const primaryLabel = run.isPending
    ? 'جارٍ التوليد…'
    : rule === 'blocked'
      ? 'الفترة مقفلة'
      : preview == null && !degraded
        ? 'ولِّد المطالبات الناقصة'
        : degraded
          ? 'ولِّد مطالبات الشهر'
          : preview && preview.total === 0
            ? 'لا شيء للتوليد'
            : nothingToDo
              ? 'الشهر مكتمل'
              : `ولِّد المطالبات الناقصة · ${arabicCount(preview?.missing ?? 0, CONTRACTS)}`;

  return (
    <>
      <div className="border-b border-border px-4 pb-3 pt-4 pe-12 sm:px-5 sm:pe-12">
        <DialogTitle>توليد مطالبات الشهر</DialogTitle>
        <DialogDescription className="mt-1">يُنشئ النظام ما ينقص من مطالبات الإيجار والخدمات للعقود النشطة، ولا يكرّر ما وُلِّد سابقاً.</DialogDescription>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        <div aria-live="polite">{result && <RunResult result={result} preview={preview} refreshing={ready?.refreshing ?? false} refreshFailed={ready?.refreshFailed ?? false} />}</div>

        {run.isError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-[13px] text-danger-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 stroke-[1.6]" aria-hidden />
            <p>
              {friendlyError(run.error, 'تعذّر توليد المطالبات الشهرية.')} أعد المحاولة؛ لا يتكرر ما وُلِّد سابقاً.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="billing-month">الشهر</Label>
          <Select value={month} onValueChange={changeMonth} disabled={run.isPending}>
            <SelectTrigger id="billing-month" className="h-11 sm:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((m) => (
                <SelectItem key={m} value={m} disabled={blocked.has(m)}>
                  {formatMonthLabelAr(m)}
                  {blocked.has(m) ? ' · الفترة مقفلة' : m === currentMonth ? ' · الحالي' : m > currentMonth ? ' · القادم' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rule === 'dated-today' && (
            <p className="text-[12.5px] text-ink-mute">فترة هذا الشهر مقفلة، فتُسجَّل مطالباته بتاريخ اليوم ({formatDate(today)}) لا بتاريخ الشهر.</p>
          )}
          {rule === 'blocked' && (
            <p role="alert" className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5 text-[13px] text-warning-ink">
              فترة هذا الشهر وفترة اليوم مقفلتان، فلا يمكن توليد مطالباته. أعد فتح إحداهما من{' '}
              <Link href="/reports/periods" className="underline underline-offset-2">
                الفترات المالية
              </Link>{' '}
              أو اختر شهراً آخر.
            </p>
          )}
        </div>

        <div aria-live="polite" aria-busy={sources.state === 'loading' || (ready?.refreshing ?? false)} className="space-y-4">
          {sources.state === 'loading' || sources.state === 'off' ? (
            <div className="surface space-y-3 p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-60" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ) : sources.state === 'error' ? (
            <div className="space-y-3">
              <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-danger-ink">
                <p className="text-[13.5px] font-semibold">تعذّر عرض المعاينة</p>
                <p className="mt-0.5 text-[12.5px]">{friendlyError(sources.error, 'تعذّر تحميل العقود والمطالبات.')}</p>
                <Button type="button" variant="outline" size="sm" className="mt-2 h-9" onClick={sources.retry}>
                  أعد المحاولة
                </Button>
              </div>
              <p className="px-1 text-[12.5px] text-ink-mute">يمكنك التوليد دون معاينة؛ لا يكرّر النظام ما وُلِّد سابقاً.</p>
            </div>
          ) : preview && ready ? (
            ready.refreshing && result ? (
              <div className="surface space-y-3 p-4" aria-hidden>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-60" />
                <Skeleton className="h-1.5 w-full" />
              </div>
            ) : (
              <>
                <Counts preview={preview} month={month} />
                {preview.missingLines.length > 0 && <MissingList key={month} lines={preview.missingLines} />}
                <EarlierMonths months={preview.recent} selected={month} blocked={blocked} busy={run.isPending} onPick={changeMonth} />
              </>
            )
          ) : null}
          {ready?.refreshFailed && !result && (
            <p className="px-1 text-[12.5px] text-warning-ink">تعذّر تحديث الأرقام؛ قد لا تعكس آخر تغيير. أعد فتح الصفحة.</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        {result ? (
          <Button type="button" className="h-11 flex-1 sm:h-9 sm:flex-none" onClick={onClose}>
            تم
          </Button>
        ) : (
          <>
            <Button type="button" className="h-auto min-h-11 flex-1 gap-2 whitespace-normal py-2 text-center leading-snug sm:h-9 sm:min-h-0 sm:flex-none sm:whitespace-nowrap sm:py-0" disabled={!canRun} onClick={start}>
              {run.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {primaryLabel}
            </Button>
            <Button type="button" variant="outline" className="h-11 shrink-0 sm:h-9" disabled={run.isPending} onClick={onClose}>
              إلغاء
            </Button>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Generate a month's rent and service charges: shows which active leases still lack them, runs the
 * server's generator, and reports what it really created.
 */
export function BillingRunDialog({ open, onOpenChange, initialMonth }: { open: boolean; onOpenChange: (open: boolean) => void; initialMonth?: string }) {
  const run = useRunMonthlyBilling();

  function handleOpenChange(next: boolean) {
    // a run in flight cannot be abandoned: closing would hide whether it succeeded
    if (!next) {
      if (run.isPending) return;
      run.reset();
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent dir="rtl" className={SHEET}>
        <BillingRunBody run={run} initialMonth={initialMonth} onClose={() => handleOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * One line above the charges list when a recent month is not fully billed, with the way to fix it.
 * Quiet (renders nothing) while loading, on a failed load and when every recent month is complete.
 */
export function BillingStatusStrip({ onReview }: { onReview: (month: string) => void }) {
  const [today] = useState(() => todayISODate());
  const sources = useBillingSources(today);

  const contracts = sources.state === 'ready' ? sources.contracts : undefined;
  const charges = sources.state === 'ready' ? sources.charges : undefined;
  const exempt = sources.state === 'ready' ? sources.exempt : undefined;
  const late = useMemo(() => {
    // without the exempt marks the count would include tenants who owe nothing, so the strip stays quiet
    if (!contracts || !charges || !exempt) return null;
    const { recent } = buildBillingPreview({ contracts, charges, month: today.slice(0, 7), today, exemptMonths: exempt });
    return latestIncompleteMonth(recent, today);
  }, [contracts, charges, exempt, today]);

  if (!late) return null;
  const { status, earlierMonths } = late;
  const urgent = billingIsLate(late, today);

  return (
    <section aria-label="اكتمال مطالبات الأشهر الأخيرة" className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', urgent ? 'bg-warning-ink' : 'bg-ink-mute')} aria-hidden />
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-foreground">{billingFollowUpTitle(status.month)}</p>
          <p className="text-[12.5px] tabular-nums text-ink-mute">
            {billingFollowUpDetail({ count: status.missing, amount: status.missingAmount > 0 ? status.missingAmount : null, billing: { total: status.total, earlierMonths } })}
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" className="h-11 shrink-0 touch-manipulation sm:h-9" onClick={() => onReview(status.month)}>
        راجع وولِّد
      </Button>
    </section>
  );
}
