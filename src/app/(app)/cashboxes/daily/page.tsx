'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2, MessageCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { DailyStatementView } from '@/components/cashboxes/daily-statement-view';
import { ExportCsvButton } from '@/components/data/export-csv-button';
import { Button } from '@/components/ui/button';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { useDailyStatement } from '@/lib/db/daily-cashbox-queries';
import { buildDailyStatementMessage, buildShareLink } from '@/lib/daily-cashbox-text';
import { dayLabel, isDayKey, type DailyStatement } from '@/lib/daily-cashbox';
import { addDaysISO } from '@/lib/mall-dates';
import { friendlyError } from '@/lib/user-messages';
import { todayISODate } from '@/lib/utils';

const KIND_LABEL = { receipt: 'قبض', payment: 'صرف', transfer_in: 'تحويل وارد', transfer_out: 'تحويل صادر' } as const;

/** changes whenever a figure that appears in the PDF changes, so a cached file is never reused for different data */
const statementStamp = (s: DailyStatement) =>
  [s.date, s.movements, s.totals.opening, s.totals.receipts, s.totals.payments, s.totals.closing, s.boxes.map((b) => `${b.id}:${b.closing}:${b.lines.length}`).join(',')].join('|');

function csvRows(s: DailyStatement) {
  return s.boxes.flatMap((b) => [
    [b.name, s.date, 'الرصيد الافتتاحي', '', '', '', '', b.opening],
    ...b.lines.map((l) => [b.name, s.date, KIND_LABEL[l.kind], l.ref ?? '', l.description ?? '', l.kind === 'receipt' || l.kind === 'transfer_in' ? l.amount : '', l.kind === 'payment' || l.kind === 'transfer_out' ? l.amount : '', l.balanceAfter]),
    [b.name, s.date, 'الرصيد الختامي', '', '', '', '', b.closing],
  ]);
}

function DailyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = useMemo(() => todayISODate(), []);
  const param = searchParams.get('date');
  // a day that has not come yet has nothing to show
  const date = isDayKey(param) && param <= today ? param : today;
  const go = (d: string) => router.replace(`/cashboxes/daily?date=${d}`, { scroll: false });

  const { statement, loading, error, failedBox } = useDailyStatement(date);

  return (
    <>
      <PageHeader
        eyebrow="الخزينة"
        title="كشف الخزائن اليومي"
        description="رصيد كل خزينة أول اليوم وآخره وما دخلها وخرج منها، للتسليم والتوقيع أو للإرسال إلى المالك."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TajMallPdfToolbar
              fileName={`كشف-الخزائن-${date}`}
              shareTitle={`كشف الخزائن — ${dayLabel(date)}`}
              cacheKey={statement ? statementStamp(statement) : date}
              disabled={!statement}
              openLabel="الكشف PDF"
              render={async () => {
                const { DailyCashboxPDF } = await import('@/features/pdf/DailyCashboxPDF');
                return <DailyCashboxPDF statement={statement!} />;
              }}
            />
            <ExportCsvButton
              fileName={`كشف-الخزائن-${date}`}
              headers={['الخزينة', 'التاريخ', 'النوع', 'المرجع', 'البيان', 'وارد', 'صادر', 'الرصيد']}
              rows={statement ? csvRows(statement) : []}
              disabled={!statement}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 touch-manipulation gap-1.5 text-success-ink hover:bg-success-soft hover:text-success-ink sm:min-h-9"
              disabled={!statement}
              onClick={() => statement && window.open(buildShareLink(buildDailyStatementMessage(statement)), '_blank', 'noopener,noreferrer')}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              ملخص واتساب
            </Button>
          </div>
        }
      />

      <AccountingPageBody>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="اليوم السابق" onClick={() => go(addDaysISO(date, -1))}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          <input
            type="date"
            value={date}
            max={today}
            aria-label="التاريخ"
            onChange={(e) => {
              const v = e.target.value;
              if (isDayKey(v) && v <= today) go(v);
            }}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-[14px] font-medium text-foreground sm:max-w-56 sm:flex-none"
          />
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="اليوم التالي" disabled={date >= today} onClick={() => go(addDaysISO(date, 1))}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          {date !== today && (
            <Button type="button" variant="ghost" size="sm" onClick={() => go(today)}>
              اليوم
            </Button>
          )}
        </div>

        {error ? (
          <p className="py-12 text-center text-[13px] text-danger-ink">
            {friendlyError(error, failedBox ? `تعذّر تحميل حركة ${failedBox}. أعد المحاولة قبل طباعة الكشف.` : 'تعذّر تحميل الخزائن. أعد المحاولة.')}
          </p>
        ) : loading || !statement ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-ink-mute">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            جارٍ إعداد كشف {dayLabel(date)}…
          </div>
        ) : (
          <DailyStatementView statement={statement} />
        )}
      </AccountingPageBody>
    </>
  );
}

export default function DailyCashboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center gap-2 text-ink-mute">
          <Loader2 className="h-4 w-4 animate-spin" />
          جارٍ التحميل…
        </div>
      }
    >
      <DailyContent />
    </Suspense>
  );
}
