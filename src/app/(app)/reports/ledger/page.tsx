'use client';

import { Suspense, useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BookMarked } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategories } from '@/lib/db/queries';
import { useGeneralLedger } from '@/lib/db/mall-queries';
import { ExportCsvButton } from '@/components/data/export-csv-button';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { AccountingBackfillBanner } from '@/components/accounting/accounting-backfill-banner';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { AccountingFilterCard } from '@/components/accounting/accounting-filter-card';
import { AccountingSummaryGrid } from '@/components/accounting/accounting-summary-grid';
import {
  AccountingEmpty,
  AccountingError,
  AccountingLoading,
} from '@/components/accounting/accounting-states';
import {
  LedgerDesktopTable,
  LedgerMobileList,
} from '@/components/accounting/ledger-mobile-list';
import { accountTypeLabelAr } from '@/lib/accounting-labels';
import {
  parseReportPeriod,
  reportPeriodDateRange,
} from '@/lib/report-period';
import { formatAccountingReportExportNames } from '@/lib/report-pdf-export';

function GeneralLedgerContent() {
  const searchParams = useSearchParams();
  const { data: categories = [], isLoading: isLoadingCats } = useCategories();

  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat) setSelectedCatId(cat);

    const hasPeriod =
      searchParams.has('year') ||
      searchParams.has('month') ||
      searchParams.has('mode');
    if (hasPeriod) {
      const range = reportPeriodDateRange(parseReportPeriod(searchParams));
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  }, [searchParams]);

  const { data: ledgerResult, isLoading: isLoadingLedger, isError, error } =
    useGeneralLedger(selectedCatId, startDate || undefined, endDate || undefined);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCatId),
    [categories, selectedCatId],
  );

  const { linesWithBalance, totalDebit, totalCredit, netBalance, openingBalance } = useMemo(() => {
    const isDebitIncrease =
      selectedCategory?.type === 'ASSET' || selectedCategory?.type === 'EXPENSE';
    const openingDebit = ledgerResult?.openingDebit ?? 0;
    const openingCredit = ledgerResult?.openingCredit ?? 0;
    const openingBalance = isDebitIncrease
      ? openingDebit - openingCredit
      : openingCredit - openingDebit;

    let currentBalance = openingBalance;
    let deb = 0;
    let cred = 0;

    // احسب الرصيد زمنياً (قديم → جديد) ثم اعرض الأحدث أولاً مثل صفحة المصروفات
    const chronological = (ledgerResult?.lines ?? []).map((line) => {
      const lineDebit = line.debit;
      const lineCredit = line.credit;

      deb += lineDebit;
      cred += lineCredit;

      if (isDebitIncrease) {
        currentBalance += lineDebit - lineCredit;
      } else {
        currentBalance += lineCredit - lineDebit;
      }

      return {
        ...line,
        runningBalance: currentBalance,
      };
    });

    return {
      linesWithBalance: [...chronological].reverse(),
      totalDebit: deb,
      totalCredit: cred,
      netBalance: currentBalance,
      openingBalance,
    };
  }, [ledgerResult, selectedCategory]);

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedCatId('');
  };

  const ledgerPeriodLabel =
    startDate || endDate
      ? `${startDate || '…'} — ${endDate || '…'}`
      : 'كل الفترات';

  const ledgerPeriodSlugEn =
    startDate || endDate
      ? `${startDate || 'start'}-to-${endDate || 'end'}`
      : 'all-periods';

  const pdfExport = useMemo(
    () =>
      formatAccountingReportExportNames({
        reportKindAr: 'دفتر الأستاذ',
        reportKindEn: 'general-ledger',
        periodLabel: ledgerPeriodLabel,
        periodSlugEn: ledgerPeriodSlugEn,
        extraFileSlug: selectedCategory?.code,
        statsLine: selectedCategory
          ? `${selectedCategory.name_ar} · ${linesWithBalance.length} حركة.`
          : undefined,
      }),
    [ledgerPeriodLabel, ledgerPeriodSlugEn, selectedCategory, linesWithBalance.length],
  );

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="دفتر الأستاذ العام"
        description="كشف حساب تفصيلي للبنود المحاسبية — الحركات المدينة والدائنة والرصيد التراكمي"
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportCsvButton
              fileName={pdfExport.fileName}
              disabled={linesWithBalance.length === 0 && openingBalance === 0}
              headers={['التاريخ', 'رقم القيد', 'المرجع', 'الوصف', 'مدين', 'دائن', 'الرصيد التراكمي']}
              rows={[
                ['—', '—', '', 'الرصيد الافتتاحي', '', '', openingBalance],
                ...linesWithBalance.map((l) => [
                  l.entry_date,
                  l.journal_number,
                  l.journal_reference ?? '',
                  l.description ?? '',
                  l.debit,
                  l.credit,
                  l.runningBalance,
                ]),
                ['—', '—', '', 'الرصيد الختامي', totalDebit, totalCredit, netBalance],
              ]}
            />
            <TajMallPdfToolbar
              fileName={pdfExport.fileName}
              shareTitle={pdfExport.shareTitle}
              shareText={pdfExport.shareText}
              disabled={linesWithBalance.length === 0 && openingBalance === 0}
              render={async () => {
                const { LedgerReportPDF } = await import('@/features/pdf/LedgerReportPDF');
                return (
                  <LedgerReportPDF
                    category={selectedCategory!}
                    startDate={startDate || undefined}
                    endDate={endDate || undefined}
                    openingBalance={openingBalance}
                    closingBalance={netBalance}
                    totalDebit={totalDebit}
                    totalCredit={totalCredit}
                    lines={[...linesWithBalance].reverse()}
                    documentTitle={pdfExport.documentTitle}
                  />
                );
              }}
            />
            <Button variant="outline" size="sm" asChild className="touch-manipulation min-h-10">
              <Link href="/reports/trial-balance">ميزان المراجعة</Link>
            </Button>
          </div>
        }
      />

      <AccountingPageBody>
        <AccountingFilterCard>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              <Label>الحساب / البند المحاسبي</Label>
              <Select value={selectedCatId} onValueChange={setSelectedCatId}>
                <SelectTrigger className="w-full min-h-11 touch-manipulation">
                  <SelectValue
                    placeholder={isLoadingCats ? 'جاري التحميل…' : 'اختر بنداً'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name_ar} ({accountTypeLabelAr(cat.type)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ledger-start">من تاريخ</Label>
              <Input
                id="ledger-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="min-h-11 touch-manipulation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ledger-end">إلى تاريخ</Label>
              <Input
                id="ledger-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="min-h-11 touch-manipulation"
              />
            </div>

            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-11 touch-manipulation"
                onClick={clearFilters}
              >
                مسح الفلاتر
              </Button>
            </div>
          </div>
        </AccountingFilterCard>

        {selectedCategory && !isLoadingLedger && !isError && (linesWithBalance.length > 0 || openingBalance !== 0) && (
          <AccountingSummaryGrid
            stats={[
              { label: 'الرصيد الافتتاحي', value: openingBalance, tone: 'default' },
              { label: 'إجمالي المدين', value: totalDebit, tone: 'default' },
              { label: 'إجمالي الدائن', value: totalCredit, tone: 'default' },
              { label: 'الرصيد الختامي', value: netBalance, tone: 'positive' },
            ]}
          />
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold sm:text-lg">حركات الأستاذ</CardTitle>
            {selectedCategory && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedCategory.name_ar} · {selectedCategory.code}
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-2 pb-4 sm:pb-5">
            {!selectedCatId ? (
              <AccountingEmpty
                icon={BookMarked}
                title="اختر بنداً محاسبياً"
                description="استخدم القائمة أعلاه لعرض كشف الحساب. يمكنك تحديد نطاق تاريخ اختياري."
              />
            ) : isLoadingLedger ? (
              <AccountingLoading />
            ) : isError ? (
              <AccountingError
                title="فشل تحميل دفتر الأستاذ"
                message={(error as Error)?.message}
                hint="طبّق هجرة 017_fix_journal_rpc_and_ledger.sql على Supabase ثم أعد تحميل الصفحة."
              />
            ) : linesWithBalance.length === 0 ? (
              <div className="space-y-4">
                <AccountingEmpty
                  icon={BookMarked}
                  title="لا توجد حركات مرحّلة"
                  description="لا توجد قيود لهذا الحساب خلال الفترة المحددة."
                />
                <AccountingBackfillBanner description="يُنشئ قيوداً يومية من المعاملات القديمة ثم تُحدَّث التقارير." />
                <Button variant="outline" size="sm" asChild className="w-full sm:w-auto min-h-11 touch-manipulation">
                  <Link href="/journals">فتح دفتر اليومية</Link>
                </Button>
              </div>
            ) : (
              <>
                <LedgerMobileList lines={linesWithBalance} />
                <LedgerDesktopTable lines={linesWithBalance} />
              </>
            )}
          </CardContent>
        </Card>
      </AccountingPageBody>
    </>
  );
}

export default function GeneralLedgerPage() {
  return (
    <Suspense
      fallback={
        <AccountingPageBody>
          <AccountingLoading />
        </AccountingPageBody>
      }
    >
      <GeneralLedgerContent />
    </Suspense>
  );
}
