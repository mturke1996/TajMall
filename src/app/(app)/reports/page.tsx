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
  Store,
  Briefcase,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
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

type ReportGroup = 'statements' | 'books' | 'analysis';

const GROUPS: { id: ReportGroup; title: string }[] = [
  { id: 'statements', title: 'القوائم المالية' },
  { id: 'books', title: 'الدفاتر والقيود' },
  { id: 'analysis', title: 'التحليلات' },
];

type ReportCard = {
  href: string;
  group: ReportGroup;
  titleAr: string;
  description: string;
  icon: typeof BookOpen;
};

const REPORT_CARDS: ReportCard[] = [
  {
    href: '/reports/journal-month',
    group: 'books',
    titleAr: 'قيد الفترة المحاسبي',
    description:
      'قيد ملخّص للفترة — مع تجميع الإيرادات معاً والمصاريف معاً',
    icon: FileSpreadsheet,
  },
  {
    href: '/journals',
    group: 'books',
    titleAr: 'دفتر اليومية',
    description: 'إنشاء وترحيل وعكس القيود المزدوجة',
    icon: BookOpen,
  },
  {
    href: '/reports/ledger',
    group: 'books',
    titleAr: 'دفتر الأستاذ العام',
    description: 'كشف حركة تفصيلي لكل بند محاسبي',
    icon: BookMarked,
  },
  {
    href: '/reports/trial-balance',
    group: 'statements',
    titleAr: 'ميزان المراجعة',
    description: 'توازن إجمالي المدين والدائن',
    icon: Scale,
  },
  {
    href: '/reports/balance-sheet',
    group: 'statements',
    titleAr: 'الميزانية العمومية',
    description: 'الأصول والخصوم وحقوق الملكية',
    icon: Landmark,
  },
  {
    href: '/reports/profit-loss',
    group: 'statements',
    titleAr: 'الأرباح والخسائر',
    description: 'الإيرادات مقابل المصروفات للفترة',
    icon: TrendingUp,
  },
  {
    href: '/reports/cash-flow',
    group: 'statements',
    titleAr: 'التدفقات النقدية',
    description: 'حركة النقد الداخل والخارج',
    icon: Wallet,
  },
  {
    href: '/reports/ar-aging',
    group: 'analysis',
    titleAr: 'أعمار ذمم المستأجرين',
    description: 'تحليل المتأخرات حسب الأعمار',
    icon: Users,
  },
  {
    href: '/reports/vendor-spend',
    group: 'analysis',
    titleAr: 'إنفاق الموردين',
    description: 'مصروفات مجمّعة حسب المورد المرتبط',
    icon: Landmark,
  },
  {
    href: '/reports/customer-revenue',
    group: 'analysis',
    titleAr: 'إيراد العملاء',
    description: 'إيرادات خدمات/مواقف مربوطة بعملاء',
    icon: Store,
  },
  {
    href: '/reports/employee-spend',
    group: 'analysis',
    titleAr: 'إنفاق الموظفين',
    description: 'مرتبات ومصروفات مربوطة بموظفين',
    icon: Briefcase,
  },
  {
    href: '/reports/budget',
    group: 'analysis',
    titleAr: 'الموازنة مقابل الفعلي',
    description: 'مقارنة المخطط بالمحقق',
    icon: Coins,
  },
  {
    href: '/reports/periods',
    group: 'books',
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
              { label: 'إجمالي المدين', value: summary.debit },
              { label: 'إجمالي الدائن', value: summary.credit },
              {
                label: 'فرق التوازن',
                value: Math.abs(summary.debit - summary.credit),
                tone: summary.balanced ? 'default' : 'negative',
              },
            ]}
          />
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          {GROUPS.map((group) => (
            <section key={group.id} className="flex flex-col gap-2" aria-labelledby={`reports-${group.id}`}>
              <h2 id={`reports-${group.id}`} className="px-1 text-[12.5px] font-medium text-ink-mute">
                {group.title}
              </h2>
              <ul className="surface divide-y divide-border overflow-hidden">
                {REPORT_CARDS.filter((card) => card.group === group.id).map((card) => {
                  const Icon = card.icon;
                  return (
                    <li key={card.href}>
                      <Link
                        href={reportsHref(card.href, period)}
                        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-canvas-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium text-foreground">{card.titleAr}</span>
                          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-mute">{card.description}</span>
                        </span>
                        <ArrowLeft className="mt-1 h-4 w-4 shrink-0 text-ink-mute" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
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
