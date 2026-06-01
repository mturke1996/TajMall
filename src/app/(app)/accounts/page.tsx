'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  FolderTree,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  BookMarked,
  Landmark,
} from 'lucide-react';
import { ledgerUrl, categoryMatchesTab, type AccountTab } from '@/lib/accounting-nav';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar } from '@/components/data/toolbar';
import { EmptyState } from '@/components/data/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCategories } from '@/lib/db/queries';
import { cn } from '@/lib/utils';
import { CategoryFormDialog } from '@/components/accounting/category-form-dialog';
import { AccountingPageBody } from '@/components/accounting/accounting-page-body';
import { usePermission } from '@/lib/supabase/use-permission';
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
  const { can } = usePermission();
  const { data, isLoading } = useCategories();
  const source = useMemo(() => data ?? [], [data]);

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
            <Button size="sm" className="gap-1.5 touch-manipulation" onClick={() => setDialogOpen(true)}>
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
                  ? 'border-sage-300 bg-sage-50 text-sage-700'
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
                ? 'طبّق هجرات Supabase (001 و013) أو أضف بنداً جديداً.'
                : 'جرّب كلمة بحث أخرى أو غيّر التبويب.'
            }
            action={
              can('account.manage')
                ? { label: 'بند جديد', onClick: () => setDialogOpen(true) }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((c: CategoryRow, i) => (
              <div
                key={c.id}
                className="surface animate-fade-up flex flex-col gap-3 p-4 transition-shadow duration-200 hover:shadow-whisper"
                style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-md border',
                        c.type === 'REVENUE' && 'border-pastel-greenInk/15 bg-pastel-green text-pastel-greenInk',
                        c.type === 'EXPENSE' && 'border-pastel-redInk/15 bg-pastel-red text-pastel-redInk',
                        ['ASSET', 'LIABILITY', 'EQUITY'].includes(c.type) &&
                          'border-sage-200 bg-sage-50 text-sage-800',
                      )}
                    >
                      {c.type === 'REVENUE' ? (
                        <ArrowDownToLine className="h-4 w-4 stroke-[1.6]" />
                      ) : c.type === 'EXPENSE' ? (
                        <ArrowUpFromLine className="h-4 w-4 stroke-[1.6]" />
                      ) : (
                        <Landmark className="h-4 w-4 stroke-[1.6]" />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[14px] font-semibold">{c.name_ar}</span>
                      <span className="truncate text-[11px] text-ink-mute">{c.name}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {TYPE_LABEL[c.type] ?? c.type}
                  </Badge>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3 text-[11px] font-mono text-ink-mute">
                  <span>{c.code}</span>
                  <Link
                    href={ledgerUrl(c.id)}
                    className="inline-flex items-center gap-1 text-sage-800 font-sans font-semibold hover:underline touch-manipulation"
                  >
                    <BookMarked className="h-3.5 w-3.5" />
                    كشف الحساب
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </AccountingPageBody>

      <CategoryFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
