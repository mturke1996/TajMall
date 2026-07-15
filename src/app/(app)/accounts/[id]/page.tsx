'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Landmark,
  Loader2,
  BookMarked,
  FileText,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useCategories,
  useCategoryTransactionsForMonth,
} from '@/lib/db/queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { accountTypeLabelAr } from '@/lib/accounting-labels';
import { currentMonthKey, currentYear, monthKey, monthNameAr } from '@/lib/rent-months';
import { cn, formatMoney } from '@/lib/utils';

const METHOD_AR: Record<string, string> = {
  CASH: 'نقدي',
  CHEQUE: 'صك',
  TRANSFER: 'حوالة',
  CARD: 'بطاقة',
};

const STATUS_AR: Record<string, string> = {
  POSTED: 'مرحّل',
  DRAFT: 'مسودة',
  VOIDED: 'ملغى',
  RECONCILED: 'مُسوّى',
};

export default function CategoryDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const categoryId = params.id;

  const { data: categories = [], isLoading: catsLoading } = useCategories();
  const category = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId],
  );

  const [selectedMonthKey, setSelectedMonthKey] = useState(() => currentMonthKey());
  const [searchQuery, setSearchQuery] = useState('');
  const year = currentYear();

  const { data: txs = [], isLoading: txLoading } =
    useCategoryTransactionsForMonth(categoryId, selectedMonthKey);

  const isRevenue =
    category?.type === 'REVENUE' || category?.kind === 'REVENUE';
  const kindLabel = isRevenue ? 'إيراد' : 'مصروف';

  const yearMonths = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const key = monthKey(year, i + 1);
        return { key, label: monthNameAr(key) };
      }),
    [year],
  );

  const filteredTxs = useMemo(() => {
    if (!searchQuery) return txs;
    const q = searchQuery.toLowerCase();
    return txs.filter(
      (t) =>
        t.description?.toLowerCase().includes(q) ||
        String(t.number).includes(q) ||
        t.reference?.toLowerCase().includes(q) ||
        t.contact?.name?.toLowerCase().includes(q),
    );
  }, [txs, searchQuery]);

  const posted = filteredTxs.filter((t) => t.status === 'POSTED');
  const total = posted.reduce((s, t) => s + Number(t.amount || 0), 0);
  const draftCount = filteredTxs.filter((t) => t.status === 'DRAFT').length;

  const monthName = monthNameAr(selectedMonthKey);

  if (catsLoading) {
    return (
      <AccountingPageBody>
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-ink-mute">
          <Loader2 className="h-5 w-5 animate-spin" />
          جارٍ التحميل…
        </div>
      </AccountingPageBody>
    );
  }

  if (!category) {
    return (
      <AccountingPageBody>
        <Card className="p-8 text-center">
          <BookMarked className="mx-auto h-8 w-8 text-ink-mute" />
          <p className="mt-2 text-ink-mute">لم يتم العثور على البند</p>
          <Button className="mt-4" size="sm" asChild>
            <Link href="/accounts">العودة للبنود</Link>
          </Button>
        </Card>
      </AccountingPageBody>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="البنود المحاسبية"
        title={category.name_ar}
        description={`${kindLabel} · ${category.code} · ${accountTypeLabelAr(category.type)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <TajMallPdfToolbar
              fileName={`${category.code}-${selectedMonthKey}`}
              disabled={filteredTxs.length === 0}
              render={async () => {
                const { CategoryMonthReportPDF } = await import(
                  '@/features/pdf/CategoryMonthReportPDF'
                );
                return (
                  <CategoryMonthReportPDF
                    category={category}
                    monthKey={selectedMonthKey}
                    monthNameAr={monthName}
                    rows={filteredTxs}
                  />
                );
              }}
            />
            <Button
              variant="outline"
              size="sm"
              asChild
              className="min-h-11 touch-manipulation sm:min-h-9"
            >
              <Link href="/accounts">
                <ArrowRight className="h-4 w-4 stroke-[1.6]" />
                البنود
              </Link>
            </Button>
          </div>
        }
      />

      <AccountingPageBody className="gap-4 md:gap-5">
        {/* بطاقة تعريف البند */}
        <div className="surface flex items-start gap-3 p-4">
          <span
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-md border',
              isRevenue
                ? 'border-pastel-greenInk/15 bg-pastel-green text-pastel-greenInk'
                : 'border-pastel-redInk/15 bg-pastel-red text-pastel-redInk',
            )}
          >
            {isRevenue ? (
              <ArrowDownToLine className="h-5 w-5 stroke-[1.6]" />
            ) : (
              <ArrowUpFromLine className="h-5 w-5 stroke-[1.6]" />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-bold">{category.name_ar}</h2>
              <Badge variant="outline" className="text-[10px]">
                {kindLabel}
              </Badge>
            </div>
            <p className="text-[12px] text-ink-mute">
              {category.name} · كود {category.code}
            </p>
          </div>
        </div>

        {/* شريط الأشهر */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 no-scrollbar snap-x snap-mandatory">
          {yearMonths.map((m) => {
            const active = selectedMonthKey === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setSelectedMonthKey(m.key)}
                className={cn(
                  'inline-flex shrink-0 snap-center items-center justify-center rounded-lg border px-3 py-2 text-[12.5px] font-semibold touch-manipulation min-w-[3.5rem]',
                  active
                    ? 'border-sage-700 bg-sage-700 text-white'
                    : 'border-border bg-card text-ink hover:bg-secondary',
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* بطاقات الملخص */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard
            label={`${kindLabel} ${monthName}`}
            value={formatMoney(total, 'LYD')}
            tone={isRevenue ? 'positive' : 'negative'}
          />
          <SummaryCard
            label="عدد المعاملات"
            value={String(filteredTxs.length)}
            tone="default"
          />
          <SummaryCard
            label="معاملات مرحّلة"
            value={String(posted.length)}
            tone="default"
          />
          <SummaryCard
            label="مسودات"
            value={String(draftCount)}
            tone={draftCount > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* بحث */}
        <div className="relative">
          <Input
            placeholder="بحث في البيان، الرقم، المرجع، الجهة…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 text-base md:h-10 md:text-sm"
          />
        </div>

        {/* جدول المعاملات */}
        {txLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-[12.5px] text-ink-mute">
            <Loader2 className="h-4 w-4 animate-spin" />
            جارٍ تحميل المعاملات…
          </div>
        ) : filteredTxs.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-ink-mute" />
            <p className="mt-2 text-ink-mute">
              لا توجد معاملات لهذا البند خلال {monthName} {year}
            </p>
          </Card>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-canvas-sunken/80 text-right text-[12px] text-ink-mute">
                    <th className="px-4 py-3 font-semibold">البيان</th>
                    <th className="px-4 py-3 font-semibold">الجهة</th>
                    <th className="px-4 py-3 font-semibold">الخزينة</th>
                    <th className="px-4 py-3 font-semibold">الطريقة</th>
                    <th className="px-4 py-3 font-semibold">الحالة</th>
                    <th className="px-4 py-3 font-semibold">التاريخ</th>
                    <th className="px-4 py-3 font-semibold text-left">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxs.map((t, i) => (
                    <tr
                      key={t.id}
                      className={cn(
                        'border-b border-border/60',
                        i % 2 === 1 && 'bg-canvas-sunken/20',
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium">{t.description ?? '—'}</span>
                        <p className="text-[11px] text-ink-mute">
                          رقم {t.number}
                          {t.reference ? ` · ${t.reference}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-ink-mute">
                        {t.contact?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-ink-mute">
                        {t.cashbox?.name_ar ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[12.5px]">
                        {METHOD_AR[t.method] ?? t.method}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px]',
                            t.status === 'POSTED' && 'border-emerald-300 text-emerald-800',
                            t.status === 'DRAFT' && 'border-amber-300 text-amber-800',
                            t.status === 'VOIDED' && 'border-red-300 text-red-800',
                          )}
                        >
                          {STATUS_AR[t.status] ?? t.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] tabular-nums text-ink-mute">
                        {t.tx_date}
                      </td>
                      <td className="px-4 py-3 text-left font-semibold tabular-nums">
                        {formatMoney(Number(t.amount), 'LYD')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-sage-600 bg-sage-50">
                    <td className="px-4 py-3 font-bold" colSpan={6}>
                      إجمالي {kindLabel} — {monthName} {year}
                    </td>
                    <td className="px-4 py-3 text-left font-bold tabular-nums">
                      {formatMoney(total, 'LYD')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* بطاقات الجوال */}
            <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
              {filteredTxs.map((t) => (
                <Card key={t.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-[14px]">
                      {t.description ?? '—'}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-[10px]',
                        t.status === 'POSTED' && 'border-emerald-300 text-emerald-800',
                        t.status === 'DRAFT' && 'border-amber-300 text-amber-800',
                      )}
                    >
                      {STATUS_AR[t.status] ?? t.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-mute">
                    رقم {t.number} · {t.tx_date}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-mute">
                    {t.contact?.name ?? '—'} · {t.cashbox?.name_ar ?? '—'}
                  </p>
                  <p className="mt-2 text-[15px] font-bold tabular-nums">
                    {formatMoney(Number(t.amount), 'LYD')}
                  </p>
                </Card>
              ))}
            </div>
          </>
        )}
      </AccountingPageBody>
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'default' | 'positive' | 'negative' | 'warning';
}) {
  return (
    <div
      className={cn(
        'surface flex flex-col gap-1 p-4',
        tone === 'positive' && 'border-emerald-200 bg-emerald-50/50',
        tone === 'negative' && 'border-red-200 bg-red-50/50',
        tone === 'warning' && 'border-amber-200 bg-amber-50/50',
      )}
    >
      <span className="text-[11px] text-ink-mute">{label}</span>
      <span
        className={cn(
          'text-[16px] font-bold tabular-nums',
          tone === 'positive' && 'text-emerald-800',
          tone === 'negative' && 'text-red-800',
          tone === 'warning' && 'text-amber-800',
        )}
      >
        {value}
      </span>
    </div>
  );
}
