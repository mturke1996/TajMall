'use client';

import { Suspense, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BookOpen,
  BookMarked,
  Scale,
  Landmark,
  TrendingUp,
  Wallet,
  Users,
  Coins,
  CalendarRange,
  FileSpreadsheet,
  ArrowLeft,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { AccountingFilterCard } from '@/components/accounting/accounting-filter-card';
import { ReportPeriodFilter } from '@/components/accounting/report-period-filter';
import { AccountingSummaryGrid } from '@/components/accounting/accounting-summary-grid';
import {
  AccountingError,
  AccountingLoading,
} from '@/components/accounting/accounting-states';
import { useJournalEntriesForPeriod } from '@/lib/db/journal-queries';
import {
  formatReportPeriodLabelAr,
  parseReportPeriod,
  reportPeriodDateRange,
  reportPeriodToSearchParams,
  reportsHref,
  type ReportPeriod,
} from '@/lib/report-period';
import { cn } from '@/lib/utils';

type ReportCard = {
  href: string;
  titleAr: string;
  description: string;
  icon: typeof BookOpen;
  featured?: boolean;
  permissionNote?: string;
};

const REPORT_CARDS: ReportCard[] = [
  {
    href: '/reports/journal-month',
    titleAr: 'قيد الفترة المحاسبي',
    description: 'قيد واحد للشهر/السنة: كل بند بإجمالي حركته — PDF احترافي',
    icon: FileSpreadsheet,
    featured: true,
  },
  {
    href: '/journals',
    titleAr: 'دفتر اليومية',
    description: 'إنشاء وترحيل وعكس القيود المزدوجة',
    icon: BookOpen,
  },
  {
    href: '/reports/ledger',
    titleAr: 'دفتر الأستاذ العام',
    description: 'كشف حركة تفصيلي لكل بند محاسبي',
    icon: BookMarked,
  },
  {
    href: '/reports/trial-balance',
    titleAr: 'ميزان المراجعة',
    description: 'توازن إجمالي المدين والدائن',
    icon: Scale,
  },
  {
    href: '/reports/balance-sheet',
    titleAr: 'الميزانية العمومية',
    description: 'الأصول والخصوم وحقوق الملكية',
    icon: Landmark,
  },
  {
    href: '/reports/profit-loss',
    titleAr: 'الأرباح والخسائر',
    description: 'الإيرادات مقابل المصروفات للفترة',
    icon: TrendingUp,
  },
  {
    href: '/reports/cash-flow',
    titleAr: 'التدفقات النقدية',
    description: 'حركة النقد الداخل والخارج',
    icon: Wallet,
  },
  {
    href: '/reports/ar-aging',
    titleAr: 'أعمار ذمم المستأجرين',
    description: 'تحليل المتأخرات حسب الأعمار',
    icon: Users,
  },
  {
    href: '/reports/budget',
    titleAr: 'الموازنة مقابل الفعلي',
    description: 'مقارنة المخطط بالمحقق',
    icon: Coins,
  },
  {
    href: '/reports/periods',
    titleAr: 'الفترات المالية',
    description: 'إغلاق الفترات والترحيل السنوي',
    icon: CalendarRange,
  },
];

function ReportsHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const period = useMemo(
    () => parseReportPeriod(searchParams),
    [searchParams],
  );

  const setPeriod = useCallback(
    (next: ReportPeriod) => {
      const params = reportPeriodToSearchParams(next);
      router.replace(`/reports?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  const { startDate, endDate } = reportPeriodDateRange(period);
  const periodLabel = formatReportPeriodLabelAr(period);

  const { data: entries = [], isLoading, isError, error } = useJournalEntriesForPeriod({
    startDate,
    endDate,
    status: 'POSTED',
  });

  const summary = useMemo(() => {
    let debit = 0;
    let credit = 0;
    let unbalanced = 0;
    for (const e of entries) {
      const d = Number(e.total_debit);
      const c = Number(e.total_credit);
      debit += d;
      credit += c;
      if (Math.abs(d - c) > 0.005) unbalanced += 1;
    }
    return {
      count: entries.length,
      debit,
      credit,
      unbalanced,
      balanced: Math.abs(debit - credit) <= 0.005,
    };
  }, [entries]);

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="مركز التقارير"
        description={`اختر الفترة ثم افتح التقرير المناسب — الفترة الحالية: ${periodLabel}`}
        actions={
          <Button size="sm" className="gap-1.5" asChild>
            <Link href={reportsHref('/reports/journal-month', period)}>
              <FileSpreadsheet className="h-4 w-4" />
              قيد الفترة PDF
            </Link>
          </Button>
        }
      />

      <AccountingPageBody>
        <AccountingFilterCard>
          <ReportPeriodFilter value={period} onChange={setPeriod} />
        </AccountingFilterCard>

        {isLoading ? (
          <AccountingLoading />
        ) : isError ? (
          <AccountingError
            title="تعذّر تحميل ملخص الفترة"
            message={error instanceof Error ? error.message : undefined}
          />
        ) : (
          <AccountingSummaryGrid
            stats={[
              { label: 'قيود مرحّلة', value: summary.count, currency: '' },
              { label: 'إجمالي المدين', value: summary.debit, tone: 'positive' },
              { label: 'إجمالي الدائن', value: summary.credit, tone: 'negative' },
              {
                label: 'فرق التوازن',
                value: Math.abs(summary.debit - summary.credit),
                tone: summary.balanced ? 'positive' : 'negative',
              },
            ]}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {REPORT_CARDS.map((card) => {
            const Icon = card.icon;
            const href = reportsHref(card.href, period);
            return (
              <Link key={card.href} href={href} className="group block h-full">
                <Card
                  className={cn(
                    'h-full transition-colors hover:border-sage-600/40 hover:bg-sage-50/40',
                    card.featured && 'border-sage-600/50 bg-sage-50/30 shadow-sm',
                  )}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-lg',
                          card.featured
                            ? 'bg-sage-700 text-white'
                            : 'bg-secondary text-foreground',
                        )}
                      >
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <ArrowLeft className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <CardTitle className="pt-2 text-base">{card.titleAr}</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                      {card.description}
                    </CardDescription>
                  </CardHeader>
                  {card.featured ? (
                    <CardContent className="pt-0">
                      <p className="text-[11px] font-medium text-sage-800">
                        التقرير الرئيسي — قيد ملخّص بكل بند وإجماله
                      </p>
                    </CardContent>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
      </AccountingPageBody>
    </>
  );
}

export default function ReportsHubPage() {
  return (
    <Suspense
      fallback={
        <AccountingPageBody>
          <AccountingLoading />
        </AccountingPageBody>
      }
    >
      <ReportsHubContent />
    </Suspense>
  );
}
