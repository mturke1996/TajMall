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

function GeneralLedgerContent() {
  const searchParams = useSearchParams();
  const { data: categories = [], isLoading: isLoadingCats } = useCategories();

  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    const cat = searchParams.get('category');
    const year = searchParams.get('year');
    if (cat) setSelectedCatId(cat);
    if (year) {
      setStartDate(`${year}-01-01`);
      setEndDate(`${year}-12-31`);
    }
  }, [searchParams]);

  const { data: ledgerLines = [], isLoading: isLoadingLedger, isError, error } =
    useGeneralLedger(selectedCatId, startDate || undefined, endDate || undefined);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCatId),
    [categories, selectedCatId],
  );

  const { linesWithBalance, totalDebit, totalCredit, netBalance } = useMemo(() => {
    let currentBalance = 0;
    let deb = 0;
    let cred = 0;

    const lines = ledgerLines.map((line) => {
      const lineDebit = line.debit;
      const lineCredit = line.credit;

      deb += lineDebit;
      cred += lineCredit;

      const isDebitIncrease =
        selectedCategory?.type === 'ASSET' || selectedCategory?.type === 'EXPENSE';
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
      linesWithBalance: lines,
      totalDebit: deb,
      totalCredit: cred,
      netBalance: currentBalance,
    };
  }, [ledgerLines, selectedCategory]);

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedCatId('');
  };

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="دفتر الأستاذ العام"
        description="كشف حساب تفصيلي للبنود المحاسبية — الحركات المدينة والدائنة والرصيد التراكمي"
        actions={
          <Button variant="outline" size="sm" asChild className="touch-manipulation min-h-10">
            <Link href="/reports/trial-balance">ميزان المراجعة</Link>
          </Button>
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

        {selectedCategory && !isLoadingLedger && !isError && linesWithBalance.length > 0 && (
          <AccountingSummaryGrid
            stats={[
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
