'use client';

import { useMemo, useState } from 'react';
import { Coins, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { AccountingYearPicker } from '@/components/accounting/accounting-year-picker';
import { AccountingFilterCard } from '@/components/accounting/accounting-filter-card';
import { ExportCsvButton } from '@/components/data/export-csv-button';
import { useCategories } from '@/lib/db/queries';
import { useBudgetMap, useActualMap, useUpsertBudget } from '@/lib/db/budget-queries';
import { usePermission } from '@/lib/supabase/use-permission';
import { cn, formatMoney } from '@/lib/utils';

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export default function BudgetPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [periodType, setPeriodType] = useState<'YEAR' | 'MONTH'>('MONTH');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const { can } = usePermission();
  const canManage = can('budget.manage');

  const { data: categories = [], isLoading } = useCategories();
  const budgetMap = useBudgetMap(year);
  const actualMap = useActualMap(year);
  const upsertBudget = useUpsertBudget(year);

  const rows = useMemo(() => {
    const activeCats = categories.filter((c) => c.active !== false);
    return activeCats.map((cat) => {
      let budgeted = 0;
      let actual = 0;
      if (periodType === 'MONTH') {
        budgeted = budgetMap.get(`${cat.id}-${month}`) ?? 0;
        actual = actualMap.get(`${cat.id}-${month}`) ?? 0;
      } else {
        for (let m = 1; m <= 12; m++) {
          budgeted += budgetMap.get(`${cat.id}-${m}`) ?? 0;
          actual += actualMap.get(`${cat.id}-${m}`) ?? 0;
        }
      }
      const variance = actual - budgeted;
      const pct = budgeted > 0 ? (actual / budgeted) * 100 : null;
      return { cat, budgeted, actual, variance, pct };
    });
  }, [categories, budgetMap, actualMap, periodType, month]);

  const revenueRows = rows.filter((r) => r.cat.kind === 'REVENUE');
  const expenseRows = rows.filter((r) => r.cat.kind === 'EXPENSE');

  const totals = (list: typeof rows) =>
    list.reduce(
      (acc, r) => ({ budgeted: acc.budgeted + r.budgeted, actual: acc.actual + r.actual }),
      { budgeted: 0, actual: 0 },
    );

  function startEdit(categoryId: string, current: number) {
    setEditingId(categoryId);
    setEditValue(current > 0 ? String(current) : '');
  }

  function saveEdit(categoryId: string) {
    const amount = Number(editValue);
    if (!Number.isFinite(amount) || amount < 0) return;
    upsertBudget.mutate({ category_id: categoryId, month, amount });
    setEditingId(null);
  }

  function BudgetTable({ title, list, tone }: { title: string; list: typeof rows; tone: 'emerald' | 'red' }) {
    const t = totals(list);
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base font-bold">
            <span>{title}</span>
            <span className={cn('font-mono text-sm', tone === 'emerald' ? 'text-emerald-700' : 'text-red-700')}>
              فعلي {formatMoney(t.actual, 'LYD')} / موازنة {formatMoney(t.budgeted, 'LYD')}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد بنود</p>
          ) : (
            <>
            {/* Mobile: card list */}
            <ul className="flex flex-col gap-2.5 md:hidden">
              {list.map(({ cat, budgeted, actual, variance, pct }) => {
                const isOverBudget = tone === 'red' ? variance > 0 : variance < 0;
                return (
                  <li
                    key={cat.id}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold text-[14px]">
                        {cat.name_ar}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 font-mono text-[12px] font-semibold',
                          isOverBudget ? 'text-red-700' : 'text-emerald-700',
                        )}
                      >
                        {variance >= 0 ? '+' : ''}
                        {formatMoney(variance, '')}
                        {pct !== null && (
                          <span className="ml-1 text-ink-mute">· {pct.toFixed(0)}%</span>
                        )}
                      </span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-canvas-sunken/60 p-2">
                        <p className="text-[10px] text-ink-mute">الموازنة</p>
                        {periodType === 'MONTH' && canManage ? (
                          editingId === cat.id ? (
                            <div className="mt-1 flex items-center gap-1">
                              <Input
                                type="number"
                                inputMode="decimal"
                                dir="ltr"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && saveEdit(cat.id)}
                                autoFocus
                                className="h-10 w-full text-[13px]"
                              />
                              <Button
                                size="sm"
                                className="h-10 shrink-0 touch-manipulation"
                                onClick={() => saveEdit(cat.id)}
                              >
                                حفظ
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(cat.id, budgeted)}
                              className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[14px] font-semibold hover:text-sage-700 touch-manipulation"
                            >
                              {formatMoney(budgeted, '')}
                              <Pencil className="h-3.5 w-3.5 text-ink-mute" />
                            </button>
                          )
                        ) : (
                          <p className="mt-0.5 font-mono text-[14px] font-semibold">
                            {formatMoney(budgeted, '')}
                          </p>
                        )}
                      </div>
                      <div className="rounded-lg bg-canvas-sunken/60 p-2">
                        <p className="text-[10px] text-ink-mute">الفعلي</p>
                        <p className="mt-0.5 font-mono text-[14px] font-semibold">
                          {formatMoney(actual, '')}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-ink-mute">
                  <th className="py-2 text-right font-semibold">البند</th>
                  <th className="py-2 text-left font-semibold">الموازنة</th>
                  <th className="py-2 text-left font-semibold">الفعلي</th>
                  <th className="py-2 text-left font-semibold">الفارق</th>
                  <th className="py-2 text-left font-semibold">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ cat, budgeted, actual, variance, pct }) => {
                  const isOverBudget = tone === 'red' ? variance > 0 : variance < 0;
                  return (
                    <tr key={cat.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 font-medium">{cat.name_ar}</td>
                      <td className="py-2.5 text-left font-mono">
                        {periodType === 'MONTH' && canManage ? (
                          editingId === cat.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                inputMode="decimal"
                                dir="ltr"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && saveEdit(cat.id)}
                                autoFocus
                                className="h-8 w-24 text-[12px]"
                              />
                              <Button size="sm" className="h-9" onClick={() => saveEdit(cat.id)}>
                                حفظ
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(cat.id, budgeted)}
                              className="group inline-flex items-center gap-1 hover:text-sage-700"
                            >
                              {formatMoney(budgeted, '')}
                              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                            </button>
                          )
                        ) : (
                          formatMoney(budgeted, '')
                        )}
                      </td>
                      <td className="py-2.5 text-left font-mono">{formatMoney(actual, '')}</td>
                      <td
                        className={cn(
                          'py-2.5 text-left font-mono font-semibold',
                          isOverBudget ? 'text-red-700' : 'text-emerald-700',
                        )}
                      >
                        {variance >= 0 ? '+' : ''}
                        {formatMoney(variance, '')}
                      </td>
                      <td className="py-2.5 text-left font-mono text-ink-mute">
                        {pct !== null ? `${pct.toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="الموازنة مقابل الفعلي"
        description="مقارنة الأرقام المخطَّطة بالفعلي لكل بند — تحرير الموازنة الشهرية متاح لـ owner/admin/accountant"
        actions={
          <ExportCsvButton
            fileName={`الموازنة-${year}-${periodType === 'MONTH' ? month : 'سنوي'}`}
            disabled={rows.length === 0}
            headers={['البند', 'النوع', 'الموازنة', 'الفعلي', 'الفارق']}
            rows={rows.map((r) => [r.cat.name_ar, r.cat.kind === 'REVENUE' ? 'إيراد' : 'مصروف', r.budgeted, r.actual, r.variance])}
          />
        }
      />

      <AccountingPageBody>
        <AccountingFilterCard>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <AccountingYearPicker value={year} onChange={setYear} className="flex-1 min-w-0" />
            <div className="flex flex-wrap gap-1.5">
              {(['MONTH', 'YEAR'] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={periodType === p ? 'default' : 'outline'}
                  size="sm"
                  className={cn('min-h-10 touch-manipulation', periodType === p && 'bg-sage-700 hover:bg-sage-800')}
                  onClick={() => setPeriodType(p)}
                >
                  {p === 'MONTH' ? 'شهري' : 'سنوي'}
                </Button>
              ))}
            </div>
          </div>
          {periodType === 'MONTH' && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {MONTHS_AR.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setMonth(i + 1)}
                  className={cn(
                    'min-h-9 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors touch-manipulation',
                    month === i + 1
                      ? 'bg-sage-800 text-white'
                      : 'bg-canvas-sunken text-ink-mute hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </AccountingFilterCard>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : (
          <>
            <BudgetTable title="الإيرادات" list={revenueRows} tone="emerald" />
            <BudgetTable title="المصروفات" list={expenseRows} tone="red" />
          </>
        )}

        {!canManage && (
          <p className="flex items-center gap-2 text-[12px] text-ink-mute">
            <Coins className="h-3.5 w-3.5" />
            تعديل أرقام الموازنة متاح لـ owner أو admin أو accountant فقط.
          </p>
        )}
      </AccountingPageBody>
    </>
  );
}
