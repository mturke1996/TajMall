'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { MonthlyReportView } from '@/components/reports/monthly-report-view';
import { Button } from '@/components/ui/button';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { useMonthlyReport } from '@/lib/db/monthly-report-queries';
import { isMonthKey, shiftMonth, type MonthlyReport } from '@/lib/monthly-report';
import { friendlyError } from '@/lib/user-messages';
import { formatMonthKeyAr, todayISODate } from '@/lib/utils';

const MONTHS_BACK = 24;

/** changes whenever a figure that appears in the PDF changes, so a cached file is never reused for different data */
const reportStamp = (r: MonthlyReport) =>
  [
    r.month,
    r.cash.revenue,
    r.cash.expense,
    r.cash.draftCount,
    r.rent ? `${r.rent.due}/${r.rent.collected}/${r.rent.prev ? r.rent.prev.rate : 'x'}` : 'x',
    r.arrears ? `${r.arrears.total}/${r.arrears.tenants}` : 'x',
    r.cashboxes ? r.cashboxes.totals.closing : 'x',
    r.mall ? `${r.mall.rented}/${r.mall.vacant}/${r.mall.expiry.total}` : 'x',
  ].join(':');

function MonthlyReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const thisMonth = useMemo(() => todayISODate().slice(0, 7), []);
  const param = searchParams.get('month');
  // a month that has not begun has nothing to report
  const month = isMonthKey(param) && param <= thisMonth ? param : thisMonth;
  const go = (m: string) => router.replace(`/reports/monthly-report?month=${m}`, { scroll: false });

  const { report, loading, error, missing } = useMonthlyReport(month);
  const options = useMemo(() => Array.from({ length: MONTHS_BACK + 1 }, (_, i) => shiftMonth(thisMonth, -i)), [thisMonth]);
  const fileName = `التقرير-الشهري-${month}`;

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="التقرير الشهري"
        description="ملخص الشهر للمالك: النقد الداخل والخارج، تحصيل الإيجار، المتأخرات، المصروفات، الخزائن، وحالة المحلات والعقود."
        actions={
          <TajMallPdfToolbar
            fileName={fileName}
            shareTitle={`التقرير الشهري — ${formatMonthKeyAr(month)}`}
            cacheKey={report ? reportStamp(report) : month}
            disabled={!report}
            openLabel="التقرير PDF"
            render={async () => {
              const { MonthlyReportPDF } = await import('@/features/pdf/MonthlyReportPDF');
              return <MonthlyReportPDF report={report!} />;
            }}
          />
        }
      />

      <AccountingPageBody>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="الشهر السابق"
            disabled={month === options[options.length - 1]}
            onClick={() => go(shiftMonth(month, -1))}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          <select
            value={month}
            onChange={(e) => go(e.target.value)}
            aria-label="الشهر"
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-[14px] font-medium text-foreground sm:max-w-56 sm:flex-none"
          >
            {options.map((m) => (
              <option key={m} value={m}>
                {formatMonthKeyAr(m)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="الشهر التالي"
            disabled={month >= thisMonth}
            onClick={() => go(shiftMonth(month, 1))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        {error ? (
          <p className="py-12 text-center text-[13px] text-danger-ink">{friendlyError(error, 'تعذّر تحميل التقرير. أعد المحاولة.')}</p>
        ) : loading || !report ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-ink-mute">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            جارٍ إعداد تقرير {formatMonthKeyAr(month)}…
          </div>
        ) : (
          <MonthlyReportView report={report} rentPrevMissing={missing.rentPrev} />
        )}
      </AccountingPageBody>
    </>
  );
}

export default function MonthlyReportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center gap-2 text-ink-mute">
          <Loader2 className="h-4 w-4 animate-spin" />
          جارٍ التحميل…
        </div>
      }
    >
      <MonthlyReportContent />
    </Suspense>
  );
}
