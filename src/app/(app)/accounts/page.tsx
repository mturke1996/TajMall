'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  FolderTree,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Landmark,
  BookMarked,
  Pencil,
  Power,
} from 'lucide-react';
import { categoryMatchesTab, ledgerUrl, type AccountTab } from '@/lib/accounting-nav';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar } from '@/components/data/toolbar';
import { EmptyState } from '@/components/data/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCategories, useUpdateCategory } from '@/lib/db/queries';
import { cn } from '@/lib/utils';
import { CategoryFormDialog } from '@/components/accounting/category-form-dialog';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { usePermission } from '@/lib/supabase/use-permission';
import { currentYear } from '@/lib/rent-months';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { CategoryRow } from '@/lib/db/types';

const TYPE_LABEL: Record<string, string> = {
  REVENUE: 'إيراد',
  EXPENSE: 'مصروف',
  ASSET: 'أصل',
  LIABILITY: 'خصم',
  EQUITY: 'حقوق ملكية',
};

export default function AccountsPage() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<AccountTab>('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<CategoryRow | null>(null);
  const { can } = usePermission();
  const canManage = can('account.manage');
  const { data, isLoading } = useCategories(undefined, { includeInactive: true });
  const updateCategory = useUpdateCategory();
  const confirm = useConfirm();
  const source = useMemo(() => data ?? [], [data]);
  const year = currentYear();

  const handleToggleActive = async (c: CategoryRow) => {
    const activate = c.active === false;
    const ok = await confirm({
      title: activate ? 'تفعيل البند' : 'تعطيل البند',
      description: activate
        ? 'يعود البند للظهور في قوائم الاختيار.'
        : 'يختفي البند من قوائم الاختيار، وتبقى حركاته وقيوده السابقة كما هي.',
      details: [{ label: 'البند', value: `${c.code} — ${c.name_ar}` }],
      confirmLabel: activate ? 'فعّل البند' : 'عطّل البند',
      tone: activate ? 'default' : 'danger',
    });
    if (!ok) return;
    updateCategory.mutate({ id: c.id, active: c.active === false });
  };

  const filtered = useMemo(() => {
    return source.filter((c) => {
      if (!categoryMatchesTab(c.type, tab)) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          c.code.toLowerCase().includes(q) ||
          c.name_ar.includes(query) ||
          c.name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [query, tab, source]);

  const counts = useMemo(
    () => ({
      all: source.length,
      revenue: source.filter((c) => c.type === 'REVENUE').length,
      expense: source.filter((c) => c.type === 'EXPENSE').length,
      balance: source.filter((c) =>
        ['ASSET', 'LIABILITY', 'EQUITY'].includes(c.type),
      ).length,
    }),
    [source],
  );

  const tabs: { key: AccountTab; label: string; icon: typeof FolderTree; count: number }[] = [
    { key: 'ALL', label: 'الكل', icon: FolderTree, count: counts.all },
    { key: 'REVENUE', label: 'إيرادات', icon: ArrowDownToLine, count: counts.revenue },
    { key: 'EXPENSE', label: 'مصروفات', icon: ArrowUpFromLine, count: counts.expense },
    { key: 'BALANCE', label: 'ميزانية', icon: Landmark, count: counts.balance },
  ];

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="البنود المحاسبية"
        description="دليل الحسابات — كل بند مرتبط بدفتر الأستاذ والميزانية وميزان المراجعة."
        actions={
          can('account.manage') ? (
            <Button
              size="sm"
              className="gap-1.5 touch-manipulation"
              onClick={() => {
                setEditingRow(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="stroke-[1.6]" />
              بند جديد
            </Button>
          ) : undefined
        }
      />

      <AccountingPageBody className="gap-5">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 scroll-smooth-touch scrollbar-none snap-x snap-mandatory">
          {tabs.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'snap-center shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors touch-manipulation min-h-10',
                tab === key
                  ? 'border-border bg-canvas-sunken text-foreground'
                  : 'border-border bg-card text-ink-mute hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5 stroke-[1.6]" />
              {label} ({count})
            </button>
          ))}
        </div>

        <DataToolbar
          searchPlaceholder="ابحث في البنود…"
          count={filtered.length}
          onSearch={setQuery}
        />

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-[12.5px] text-ink-mute">
            <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
            جارٍ التحميل…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title={source.length === 0 ? 'لا توجد بنود' : 'لا توجد بنود مطابقة'}
            description={
              source.length === 0
                ? 'أضف أول بند محاسبي، أو اطلب من مسؤول النظام تهيئة دليل الحسابات.'
                : 'جرّب كلمة بحث أخرى أو غيّر التبويب.'
            }
            action={
              can('account.manage')
                ? {
                    label: 'بند جديد',
                    onClick: () => {
                      setEditingRow(null);
                      setDialogOpen(true);
                    },
                  }
                : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-canvas-sunken text-[12.5px] text-ink-mute">
                  <th scope="col" className="w-28 px-4 py-2.5 text-start font-medium">الرمز</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">البند</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-start font-medium sm:table-cell">النوع</th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium">
                    <span className="sr-only">إجراءات</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c: CategoryRow) => {
                  const inactive = c.active === false;
                  return (
                    <tr key={c.id} className={cn('hover:bg-canvas-sunken/50', inactive && 'text-ink-mute')}>
                      <td className="px-4 py-2.5 font-mono text-[12.5px] text-ink-mute" dir="ltr">
                        {c.code}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/accounts/${c.id}`} className="font-medium text-foreground hover:underline">
                          {c.name_ar}
                        </Link>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-mute">
                          <span className="sm:hidden">{TYPE_LABEL[c.type] ?? c.type}</span>
                          {inactive && <Badge variant="neutral">معطّل</Badge>}
                        </span>
                      </td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-ink-soft">
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              c.type === 'REVENUE' ? 'bg-success' : c.type === 'EXPENSE' ? 'bg-danger' : 'bg-info',
                            )}
                            aria-hidden
                          />
                          {TYPE_LABEL[c.type] ?? c.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild size="sm" variant="ghost" className="h-8 gap-1 px-2 text-[12.5px]">
                            <Link href={ledgerUrl(c.id, year)}>
                              <BookMarked className="h-3.5 w-3.5" aria-hidden />
                              <span className="hidden md:inline">دفتر الأستاذ</span>
                              <span className="sr-only md:hidden">دفتر الأستاذ</span>
                            </Link>
                          </Button>
                          {canManage && (
                            <>
                              <Button
                                aria-label={`تعديل البند ${c.name_ar}`}
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-ink-mute hover:text-foreground"
                                onClick={() => {
                                  setEditingRow(c);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                aria-label={`${inactive ? 'تفعيل' : 'تعطيل'} البند ${c.name_ar}`}
                                title={inactive ? 'تفعيل' : 'تعطيل'}
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-ink-mute hover:text-foreground"
                                onClick={() => handleToggleActive(c)}
                              >
                                <Power className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AccountingPageBody>

      <CategoryFormDialog
        key={editingRow?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditingRow(null);
        }}
        editRow={editingRow}
      />
    </>
  );
}
