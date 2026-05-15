'use client';

import { useMemo, useState } from 'react';
import { Plus, FolderTree, ArrowDownToLine, ArrowUpFromLine, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar } from '@/components/data/toolbar';
import { EmptyState } from '@/components/data/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCategories } from '@/lib/db/queries';
import { cn } from '@/lib/utils';

export default function AccountsPage() {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'ALL' | 'REVENUE' | 'EXPENSE'>('ALL');
  const { data, isLoading } = useCategories();
  const source = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    return source.filter((c) => {
      if (tab === 'REVENUE' && c.kind !== 'REVENUE') return false;
      if (tab === 'EXPENSE' && c.kind !== 'EXPENSE') return false;
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

  const revenueCount = source.filter((c) => c.kind === 'REVENUE').length;
  const expenseCount = source.filter((c) => c.kind === 'EXPENSE').length;

  return (
    <>
      <PageHeader
        eyebrow="دليل الحسابات"
        title="البنود"
        description="كل بنود الإيرادات والمصروفات لمنظومتك. عدّل، أضف، أو احذف حسب احتياج عملك."
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="stroke-[1.6]" />
            بند جديد
          </Button>
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'REVENUE', 'EXPENSE'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors duration-150 press',
                tab === k
                  ? 'border-sage-300 bg-sage-50 text-sage-700'
                  : 'border-border bg-card text-ink-mute hover:text-foreground',
              )}
            >
              {k === 'ALL' && (
                <>
                  <FolderTree className="h-3.5 w-3.5 stroke-[1.6]" />
                  الكل ({source.length})
                </>
              )}
              {k === 'REVENUE' && (
                <>
                  <ArrowDownToLine className="h-3.5 w-3.5 stroke-[1.6]" />
                  إيرادات ({revenueCount})
                </>
              )}
              {k === 'EXPENSE' && (
                <>
                  <ArrowUpFromLine className="h-3.5 w-3.5 stroke-[1.6]" />
                  مصروفات ({expenseCount})
                </>
              )}
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
            title={
              source.length === 0
                ? 'لا توجد بنود — شغّل ملف SQL في Supabase'
                : 'لا توجد بنود مطابقة'
            }
            description={
              source.length === 0
                ? 'افتح Supabase Dashboard → SQL Editor والصق محتوى supabase/migrations/001_init.sql لتعبئة البنود الافتراضية.'
                : 'جرّب كلمة بحث أخرى أو غيّر التبويب.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((c, i) => (
              <div
                key={c.id}
                className="surface animate-fade-up flex flex-col gap-3 p-4 transition-shadow duration-200 hover:shadow-whisper"
                style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'grid h-9 w-9 place-items-center rounded-md border',
                        c.kind === 'REVENUE'
                          ? 'border-pastel-greenInk/15 bg-pastel-green text-pastel-greenInk'
                          : 'border-pastel-redInk/15 bg-pastel-red text-pastel-redInk',
                      )}
                    >
                      {c.kind === 'REVENUE' ? (
                        <ArrowDownToLine className="h-4 w-4 stroke-[1.6]" />
                      ) : (
                        <ArrowUpFromLine className="h-4 w-4 stroke-[1.6]" />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[14px] font-semibold">
                        {c.name_ar}
                      </span>
                      <span className="truncate text-[11px] text-ink-mute">
                        {c.name}
                      </span>
                    </div>
                  </div>
                  <Badge variant={c.kind === 'REVENUE' ? 'success' : 'danger'}>
                    {c.kind === 'REVENUE' ? 'إيراد' : 'مصروف'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3 text-[11px] font-mono text-ink-mute">
                  <span>{c.code}</span>
                  <span>{c.type}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
